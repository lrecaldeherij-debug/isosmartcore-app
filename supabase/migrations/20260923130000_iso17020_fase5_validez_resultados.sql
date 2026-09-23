-- =============================================================================
-- ISO/IEC 17020 — Fase 5: validez de los resultados y validación
--
-- Lo que falta después de tener alcance, métodos, inspectores, informes e
-- imparcialidad:
--   6.2.9–6.2.10  verificación intermedia de equipos entre calibraciones y
--                 qué hacer cuando un equipo aparece fuera de tolerancia.
--   7.2.6         expediente de validación del método propio o modificado.
--   7.5           control de la validez de los resultados: reinspecciones,
--                 comparaciones entre inspectores, ensayos de aptitud.
--   7.5.1         el sistema que registra y reporta inspecciones se valida,
--                 y cada cambio se autoriza antes de implementarse.
--
-- Tres tablas:
--   1. result_quality_controls  — cada control de la validez y su conclusión
--   2. method_validations       — el expediente de validación por método
--   3. system_validation_records— validación de IsoSmartCore por versión
--
-- La regla que evita el hallazgo caro: un control con resultado NO satisfactorio
-- obliga a evaluar el impacto sobre los informes ya emitidos antes de cerrarlo.
-- Un equipo fuera de tolerancia o un inspector que falla una comparación
-- ponen en duda todo lo que firmaron desde el último control bueno.
-- =============================================================================

BEGIN;

-- ─── 1. Control de la validez de los resultados (7.5) ───────────────────────
CREATE TABLE IF NOT EXISTS result_quality_controls (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  code               TEXT,
  control_type       TEXT NOT NULL DEFAULT 'Reinspección interna'
                       CHECK (control_type IN ('Reinspección interna',
                                               'Comparación entre inspectores',
                                               'Ensayo de aptitud',
                                               'Comparación interlaboratorio',
                                               'Probeta o patrón de referencia',
                                               'Verificación intermedia de equipo',
                                               'Revisión técnica de informes')),
  performed_at       DATE NOT NULL DEFAULT CURRENT_DATE,
  method_id          UUID REFERENCES inspection_methods(id) ON DELETE SET NULL,
  scope_id           UUID REFERENCES inspection_scopes(id) ON DELETE SET NULL,
  inspection_id      UUID REFERENCES inspections(id) ON DELETE SET NULL,
  item_id            UUID REFERENCES inspection_items(id) ON DELETE SET NULL,

  person_id          UUID REFERENCES personnel(id) ON DELETE SET NULL,  -- inspector evaluado
  second_person_id   UUID REFERENCES personnel(id) ON DELETE SET NULL,  -- con quién se compara
  equipment_ref      TEXT,                     -- equipo verificado, con su serie
  provider           TEXT,                     -- organizador del ensayo de aptitud

  reference_value    TEXT,                     -- valor conocido, defecto patrón o resultado esperado
  obtained_value     TEXT,
  deviation          TEXT,
  acceptance_criteria TEXT,                    -- contra qué se juzga el desvío

  result             TEXT NOT NULL DEFAULT 'Satisfactorio'
                       CHECK (result IN ('Satisfactorio', 'Cuestionable', 'No satisfactorio')),
  analysis           TEXT,
  actions_taken      TEXT,

  -- 7.5 / trabajo no conforme: si el control falla, hay que mirar hacia atrás
  impact_evaluated   BOOLEAN NOT NULL DEFAULT false,
  impact_note        TEXT,                     -- qué informes quedan en duda y qué se hizo
  clients_notified   BOOLEAN NOT NULL DEFAULT false,
  nonconformity_ref  TEXT,

  next_due_date      DATE,
  evidence_url       TEXT,
  status             TEXT NOT NULL DEFAULT 'Abierto'
                       CHECK (status IN ('Abierto', 'En análisis', 'Cerrado')),
  notes              TEXT,

  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_result_qc_org ON result_quality_controls(org_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_result_qc_method ON result_quality_controls(method_id);

CREATE OR REPLACE FUNCTION enforce_result_control_followup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.result IN ('No satisfactorio', 'Cuestionable') AND NEW.status = 'Cerrado' THEN
    IF COALESCE(TRIM(NEW.actions_taken), '') = '' THEN
      RAISE EXCEPTION 'Un control con resultado "%" no se cierra sin registrar qué se hizo', NEW.result
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT NEW.impact_evaluated THEN
      RAISE EXCEPTION 'Antes de cerrar hay que evaluar el impacto sobre los informes ya emitidos: un resultado "%" los pone en duda (ISO/IEC 17020 7.5)', NEW.result
        USING ERRCODE = 'check_violation';
    END IF;
    IF COALESCE(TRIM(NEW.impact_note), '') = '' THEN
      RAISE EXCEPTION 'Escribí qué informes quedaron alcanzados por este resultado y qué se resolvió con ellos'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_result_control_followup ON result_quality_controls;
CREATE TRIGGER tr_enforce_result_control_followup
  BEFORE INSERT OR UPDATE ON result_quality_controls
  FOR EACH ROW EXECUTE FUNCTION enforce_result_control_followup();

-- ─── 2. Expediente de validación del método (7.2.6) ─────────────────────────
CREATE TABLE IF NOT EXISTS method_validations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  method_id          UUID NOT NULL REFERENCES inspection_methods(id) ON DELETE CASCADE,

  validation_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  reason             TEXT,                     -- método propio, desviación de la norma, cambio de equipo
  approach           TEXT,                     -- cómo se validó: probetas con defectos conocidos, comparación
  samples_used       TEXT,                     -- probetas, defectos y sus dimensiones reales
  acceptance_criteria TEXT,                    -- qué tenía que cumplir para considerarse válido
  results            TEXT,
  detection_capability TEXT,                   -- defecto mínimo detectable demostrado
  limitations        TEXT,
  performed_by       TEXT,
  reviewed_by        TEXT,
  conclusion         TEXT NOT NULL DEFAULT 'Válido'
                       CHECK (conclusion IN ('Válido', 'Válido con limitaciones', 'No válido')),
  evidence_url       TEXT,
  next_review        DATE,
  notes              TEXT,

  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_method_validations_method ON method_validations(method_id, validation_date DESC);

-- Una validación sin evidencia ni criterio no es una validación.
-- Si concluye válida, el método queda marcado como validado: no hay que
-- acordarse de actualizarlo a mano en la otra pantalla.
CREATE OR REPLACE FUNCTION apply_method_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(TRIM(NEW.acceptance_criteria), '') = '' THEN
    RAISE EXCEPTION 'La validación necesita decir contra qué criterio se juzga el método (ISO/IEC 17020 7.2.6)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.conclusion <> 'No válido' AND COALESCE(TRIM(NEW.results), '') = '' THEN
    RAISE EXCEPTION 'Registrá los resultados obtenidos: sin ellos la validación no demuestra nada'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE inspection_methods
     SET validation_status = CASE WHEN NEW.conclusion = 'No válido' THEN 'No validado' ELSE 'Validado' END,
         validated_at = NEW.validation_date,
         validated_by = COALESCE(NULLIF(TRIM(NEW.reviewed_by), ''), NEW.performed_by, validated_by),
         validation_evidence = COALESCE(NULLIF(TRIM(NEW.evidence_url), ''), validation_evidence),
         -- Un método que se declara no válido no puede seguir vigente
         status = CASE WHEN NEW.conclusion = 'No válido' AND status = 'Vigente' THEN 'Borrador' ELSE status END,
         updated_at = NOW()
   WHERE id = NEW.method_id
     AND org_id = NEW.org_id;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_apply_method_validation ON method_validations;
CREATE TRIGGER tr_apply_method_validation
  BEFORE INSERT OR UPDATE ON method_validations
  FOR EACH ROW EXECUTE FUNCTION apply_method_validation();

-- ─── 3. Validación del sistema por versión (7.5.1) ──────────────────────────
CREATE TABLE IF NOT EXISTS system_validation_records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  system_name        TEXT NOT NULL DEFAULT 'IsoSmartCore',
  version_ref        TEXT NOT NULL,            -- versión o fecha del cambio validado
  change_description TEXT,                     -- qué cambió respecto de la versión anterior
  validation_date    DATE NOT NULL DEFAULT CURRENT_DATE,

  tests_performed    TEXT,                     -- qué se probó: cálculos, bloqueos, informes
  expected_behaviour TEXT,
  observed_behaviour TEXT,
  result             TEXT NOT NULL DEFAULT 'Conforme'
                       CHECK (result IN ('Conforme', 'Conforme con observaciones', 'No conforme')),
  restrictions       TEXT,

  authorized_by      TEXT,                     -- quién autoriza el uso (antes de implementarlo)
  authorized_at      DATE,
  backup_verified    BOOLEAN NOT NULL DEFAULT false,   -- respaldo y recuperación probados
  access_reviewed    BOOLEAN NOT NULL DEFAULT false,   -- permisos revisados
  evidence_url       TEXT,
  notes              TEXT,

  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_validation_version
  ON system_validation_records(org_id, lower(system_name), lower(version_ref));

CREATE OR REPLACE FUNCTION enforce_system_validation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- La norma pide que el cambio se autorice ANTES de usarlo
  IF NEW.result <> 'No conforme'
     AND (COALESCE(TRIM(NEW.authorized_by), '') = '' OR NEW.authorized_at IS NULL) THEN
    RAISE EXCEPTION 'El uso de esta versión tiene que estar autorizado por alguien y con fecha, antes de implementarla (ISO/IEC 17020 7.5.1)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(TRIM(NEW.tests_performed), '') = '' THEN
    RAISE EXCEPTION 'Registrá qué se probó en esta versión: sin pruebas no hay validación'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_system_validation ON system_validation_records;
CREATE TRIGGER tr_enforce_system_validation
  BEFORE INSERT OR UPDATE ON system_validation_records
  FOR EACH ROW EXECUTE FUNCTION enforce_system_validation();

-- ─── Vista: estado del control de resultados por método ─────────────────────
CREATE OR REPLACE VIEW method_quality_control_status AS
SELECT
  m.id            AS method_id,
  m.org_id,
  m.code          AS method_code,
  m.name          AS method_name,
  m.status        AS method_status,
  m.method_source,
  m.validation_status,
  v.last_validation,
  v.last_conclusion,
  q.last_control_at,
  q.last_result,
  q.controls_12m,
  CASE
    WHEN m.method_source IN ('modificado', 'no_normalizado')
     AND COALESCE(m.validation_status, 'No aplica') <> 'Validado' THEN 'Falta validación'
    WHEN q.last_control_at IS NULL THEN 'Sin control de resultados'
    WHEN q.last_result = 'No satisfactorio' THEN 'Último control no satisfactorio'
    WHEN q.last_control_at < CURRENT_DATE - INTERVAL '12 months' THEN 'Control vencido'
    ELSE 'Al día'
  END AS control_status
FROM inspection_methods m
LEFT JOIN LATERAL (
  SELECT MAX(mv.validation_date) AS last_validation,
         (ARRAY_AGG(mv.conclusion ORDER BY mv.validation_date DESC))[1] AS last_conclusion
  FROM method_validations mv WHERE mv.method_id = m.id
) v ON true
LEFT JOIN LATERAL (
  SELECT MAX(rq.performed_at) AS last_control_at,
         (ARRAY_AGG(rq.result ORDER BY rq.performed_at DESC))[1] AS last_result,
         COUNT(*) FILTER (WHERE rq.performed_at >= CURRENT_DATE - INTERVAL '12 months')::INT AS controls_12m
  FROM result_quality_controls rq WHERE rq.method_id = m.id
) q ON true;

DO $$
BEGIN
  IF current_setting('server_version_num')::INT >= 150000 THEN
    EXECUTE 'ALTER VIEW method_quality_control_status SET (security_invoker = on)';
  END IF;
END $$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['result_quality_controls', 'method_validations', 'system_validation_records'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format($f$CREATE POLICY %I ON %I FOR SELECT USING (
        org_id = auth_org_id()
        OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
      )$f$, t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (org_id = auth_org_id())', t || '_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (org_id = auth_org_id()) WITH CHECK (org_id = auth_org_id())', t || '_update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (org_id = auth_org_id())', t || '_delete', t);
  END LOOP;
END $$;

COMMENT ON TABLE result_quality_controls IS 'ISO/IEC 17020 7.5 — control de la validez de los resultados: reinspecciones, comparaciones, ensayos de aptitud y verificación intermedia de equipos.';
COMMENT ON TABLE method_validations IS 'ISO/IEC 17020 7.2.6 — expediente de validación del método, con criterio, probetas y capacidad de detección demostrada.';
COMMENT ON TABLE system_validation_records IS 'ISO/IEC 17020 7.5.1 — validación del sistema que registra y reporta inspecciones, versión por versión.';
COMMENT ON VIEW method_quality_control_status IS 'Por método: última validación, último control de resultados y si está al día.';

NOTIFY pgrst, 'reload schema';

COMMIT;
