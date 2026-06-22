-- =============================================================================
-- v62 — Security hardening: WITH CHECK en UPDATEs + expires_at constraint +
--                          search_path en helpers + dropear policies legacy
--
-- Fix de findings de code-review pre-lanzamiento:
-- 1. UPDATE policies de v59 solo tenían USING — un writer podía mover org_id
--    a otra organización (cross-tenant leak). Agregamos WITH CHECK.
-- 2. audit_share_tokens no tenía CHECK de expires_at razonable — un atacante
--    con sesión de owner podía mintar tokens de 100 años.
-- 3. Helper functions (auth_can_write_*) no tenían SET search_path,
--    vulnerable a search_path hijack en contextos SECURITY DEFINER.
-- 4. v59 dropea policies por convención de naming, pero policies históricas
--    con otros nombres ('*_all', 'enable_*') sobreviven y se unen con OR
--    permisivo. Dropeamos todas las policies de las tablas hardeneadas
--    y las recreamos limpias.
-- =============================================================================

-- ─── 1. Helpers con search_path ───
CREATE OR REPLACE FUNCTION auth_can_write_full()
RETURNS BOOLEAN LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public AS $$
  SELECT auth_role() IN ('owner', 'quality_manager')
$$;

CREATE OR REPLACE FUNCTION auth_can_write_audit()
RETURNS BOOLEAN LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public AS $$
  SELECT auth_role() IN ('owner', 'quality_manager', 'auditor')
$$;

CREATE OR REPLACE FUNCTION auth_is_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public AS $$
  SELECT auth_role() = 'owner'
$$;

-- ─── 2. Macro mejorado: dropea TODAS las policies + WITH CHECK en UPDATE ───
CREATE OR REPLACE FUNCTION _apply_role_policies_v2(
  tbl TEXT,
  write_func TEXT DEFAULT 'auth_can_write_full',
  delete_func TEXT DEFAULT 'auth_can_write_full'
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  pol RECORD;
  prefix TEXT;
BEGIN
  IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
    RAISE NOTICE 'Tabla % no existe, skip', tbl;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'org_id'
  ) THEN
    RAISE NOTICE 'Tabla % no tiene org_id, skip', tbl;
    RETURN;
  END IF;

  prefix := replace(tbl, '_', '');

  -- Drop UNIVERSAL: barre TODAS las policies actuales de la tabla, sin importar el nombre.
  -- Esto resuelve el bug de v59 donde policies legacy con nombres '*_all' sobrevivían y
  -- se unían con OR permisivo, bypassando el hardening.
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = tbl
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, tbl);
  END LOOP;

  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

  -- SELECT
  EXECUTE format(
    'CREATE POLICY "%s_select" ON %I FOR SELECT USING (org_id = auth_org_id())',
    prefix, tbl
  );

  -- INSERT (WITH CHECK incluye org_id + rol)
  EXECUTE format(
    'CREATE POLICY "%s_insert" ON %I FOR INSERT WITH CHECK (org_id = auth_org_id() AND %s())',
    prefix, tbl, write_func
  );

  -- UPDATE — AHORA con WITH CHECK que valida también el NUEVO org_id.
  -- Esto previene cross-tenant move: un writer con USING válido no puede
  -- cambiar org_id porque WITH CHECK valida la fila resultante.
  EXECUTE format(
    'CREATE POLICY "%s_update" ON %I FOR UPDATE USING (org_id = auth_org_id() AND %s()) WITH CHECK (org_id = auth_org_id() AND %s())',
    prefix, tbl, write_func, write_func
  );

  -- DELETE
  EXECUTE format(
    'CREATE POLICY "%s_delete" ON %I FOR DELETE USING (org_id = auth_org_id() AND %s())',
    prefix, tbl, delete_func
  );
END;
$$;

-- ─── 3. Reaplicar a las mismas 23 tablas ───
SELECT _apply_role_policies_v2('context_analysis');
SELECT _apply_role_policies_v2('stakeholders');
SELECT _apply_role_policies_v2('processes');
SELECT _apply_role_policies_v2('job_descriptions');
SELECT _apply_role_policies_v2('risk_matrix');
SELECT _apply_role_policies_v2('quality_objectives');
SELECT _apply_role_policies_v2('objective_measurements');
SELECT _apply_role_policies_v2('strategic_actions');
SELECT _apply_role_policies_v2('training_records');
SELECT _apply_role_policies_v2('personnel');
SELECT _apply_role_policies_v2('suppliers');
SELECT _apply_role_policies_v2('customer_requirements');
SELECT _apply_role_policies_v2('documents');
SELECT _apply_role_policies_v2('communication_matrix');
SELECT _apply_role_policies_v2('production_orders');
SELECT _apply_role_policies_v2('qc_release');
SELECT _apply_role_policies_v2('operational_incidents');
SELECT _apply_role_policies_v2('scope_declaration', 'auth_can_write_full', 'auth_is_owner');
SELECT _apply_role_policies_v2('quality_policy', 'auth_can_write_full', 'auth_is_owner');
SELECT _apply_role_policies_v2('management_review', 'auth_can_write_full', 'auth_is_owner');
SELECT _apply_role_policies_v2('non_conformities', 'auth_can_write_audit', 'auth_can_write_full');
SELECT _apply_role_policies_v2('internal_audits', 'auth_can_write_audit', 'auth_can_write_full');
SELECT _apply_role_policies_v2('improvement_opportunities', 'auth_can_write_audit', 'auth_can_write_full');

-- ─── 4. CHECK constraints en audit_share_tokens.expires_at + label ───
-- Solo si la tabla ya existe (creada por v61). Si v61 no corrió, esta
-- sección se skipea y el usuario debe correr v61 antes para activarlos.
DO $$
BEGIN
  IF to_regclass('public.audit_share_tokens') IS NOT NULL THEN
    ALTER TABLE audit_share_tokens DROP CONSTRAINT IF EXISTS audit_share_tokens_expires_check;
    ALTER TABLE audit_share_tokens ADD CONSTRAINT audit_share_tokens_expires_check
      CHECK (expires_at > created_at AND expires_at <= created_at + interval '1 year');

    ALTER TABLE audit_share_tokens DROP CONSTRAINT IF EXISTS audit_share_tokens_label_check;
    ALTER TABLE audit_share_tokens ADD CONSTRAINT audit_share_tokens_label_check
      CHECK (length(label) BETWEEN 1 AND 200);
    RAISE NOTICE 'audit_share_tokens constraints aplicados';
  ELSE
    RAISE NOTICE 'audit_share_tokens no existe (corré v61 primero); skip constraints';
  END IF;
END $$;

-- ─── 5. Garantizar ≥1 owner en cada org (constraint defensivo) ───
-- Un trigger que previene demote del último owner.
CREATE OR REPLACE FUNCTION enforce_min_one_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  owner_count INT;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner')
     OR (TG_OP = 'DELETE' AND OLD.role = 'owner') THEN
    SELECT COUNT(*) INTO owner_count
    FROM user_profiles
    WHERE org_id = OLD.org_id AND role = 'owner' AND user_id <> OLD.user_id;
    IF owner_count = 0 THEN
      RAISE EXCEPTION 'La organización debe tener al menos un propietario (owner). No podés demote/eliminar el último.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_min_one_owner ON user_profiles;
CREATE TRIGGER tr_enforce_min_one_owner
  BEFORE UPDATE OR DELETE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_min_one_owner();

-- ─── 6. Limpieza ───
DROP FUNCTION IF EXISTS _apply_role_policies_v2(TEXT, TEXT, TEXT);

NOTIFY pgrst, 'reload schema';
