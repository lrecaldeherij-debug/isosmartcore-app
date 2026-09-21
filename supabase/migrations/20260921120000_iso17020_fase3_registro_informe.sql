-- =============================================================================
-- ISO/IEC 17020:2026 — Fase 3: registro de inspección e informe con dictamen
--
-- Lo que la norma pide y el SGC ISO 9001 no cubre:
--   7.4.1–7.4.2  registro de la inspección: qué se inspeccionó, cuándo, quién,
--                con qué método y equipos, condiciones y desviaciones.
--   7.4.3        el registro identifica al inspector que ejecutó.
--   7.5 / 7.6    informe o certificado con los resultados y el DICTAMEN, con
--                identificación única, firma de persona autorizada y la
--                regla de que una corrección se emite como enmienda trazable.
--   6.2.4        solo personal autorizado ejecuta y firma.
--   Anexo A.2 b) quien intervino el ítem no puede inspeccionarlo (tipo no A).
--
-- Tres tablas: inspections (el registro), inspection_findings (indicaciones
-- encontradas) e inspection_reports (el informe emitido, con revisiones).
--
-- Las reglas están como triggers, no solo en la interfaz: un informe firmado
-- por alguien sin autorización vigente es el hallazgo más caro de una
-- evaluación, y no puede depender de que la pantalla se use bien.
-- =============================================================================

BEGIN;

-- ─── 1. Registro de inspección (7.4.1) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  code               TEXT NOT NULL,            -- folio interno: INS-2026-014
  item_id            UUID REFERENCES inspection_items(id) ON DELETE SET NULL,
  scope_id           UUID REFERENCES inspection_scopes(id) ON DELETE SET NULL,
  method_id          UUID REFERENCES inspection_methods(id) ON DELETE SET NULL,

  client_name        TEXT,
  purchase_order_ref TEXT,                     -- contrato u OC del cliente (5.2.5)
  location           TEXT,
  planned_date       DATE,
  performed_at       DATE,
  performed_from     TIMESTAMPTZ,
  performed_to       TIMESTAMPTZ,

  -- 7.4.3: quién ejecutó. El asistente no firma ni interpreta.
  lead_inspector_id  UUID REFERENCES personnel(id) ON DELETE SET NULL,
  assistants         TEXT,
  supervised_by_id   UUID REFERENCES personnel(id) ON DELETE SET NULL,  -- mentoría en curso

  -- Condiciones reales del ensayo: lo primero que pide el evaluador
  equipment_used     TEXT,                     -- equipos y sus números de serie
  calibration_ref    TEXT,                     -- certificados de calibración aplicables
  consumables        TEXT,                     -- lote de penetrante, partículas, acoplante
  surface_condition  TEXT,
  ambient_conditions TEXT,                     -- temperatura, iluminación, humedad
  coverage           TEXT,                     -- extensión inspeccionada: % de juntas, zonas
  sampling_applied   TEXT,                     -- muestreo aplicado (7.2.5)
  acceptance_criteria_ref TEXT,                -- criterio usado: norma, edición, clase

  client_info_received BOOLEAN NOT NULL DEFAULT false,
  item_ready_confirmed BOOLEAN NOT NULL DEFAULT false,

  -- 7.4.1: desviaciones respecto del método y su justificación
  method_deviations  TEXT,
  limitations        TEXT,                     -- zonas no accesibles, restricciones

  results_summary    TEXT,
  raw_data_ref       TEXT,                     -- dónde quedan los datos crudos (7.5)

  status             TEXT NOT NULL DEFAULT 'Planificada'
                       CHECK (status IN ('Planificada', 'En ejecución', 'Ejecutada', 'Informe emitido', 'Cancelada')),
  cancel_reason      TEXT,
  notes              TEXT,
  change_log         JSONB DEFAULT '[]'::jsonb,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inspections_code ON inspections(org_id, lower(code));
CREATE INDEX IF NOT EXISTS idx_inspections_item ON inspections(org_id, item_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(org_id, status, performed_at DESC);

-- ─── 2. Indicaciones encontradas ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspection_findings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  inspection_id      UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,

  reference          TEXT,                     -- junta, zona, progresiva: J-12, 3 m desde brida
  indication_type    TEXT,                     -- falta de fusión, poro, corrosión, grieta
  position           TEXT,                     -- profundidad, cuadrante, cara
  dimensions         TEXT,                     -- longitud, altura, área
  measured_value     NUMERIC,
  unit               TEXT,
  evaluation         TEXT NOT NULL DEFAULT 'Aceptable'
                       CHECK (evaluation IN ('Aceptable', 'Rechazable', 'Registrar', 'Reevaluar')),
  criteria_ref       TEXT,                     -- cláusula del criterio aplicado
  action_required    TEXT,
  photo_url          TEXT,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspection_findings_insp ON inspection_findings(inspection_id);

-- ─── 3. Informe con dictamen (7.4 / 7.6) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspection_reports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  inspection_id      UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,

  report_number      TEXT NOT NULL,            -- identificación única (7.4.2)
  revision           INT NOT NULL DEFAULT 1,
  amends_report_id   UUID REFERENCES inspection_reports(id) ON DELETE SET NULL,
  amendment_reason   TEXT,                     -- 7.6: por qué se corrige

  -- El dictamen: la declaración de conformidad que firma el organismo
  conclusion         TEXT NOT NULL DEFAULT 'Conforme'
                       CHECK (conclusion IN ('Conforme', 'Conforme con observaciones', 'No conforme', 'No concluyente')),
  conclusion_basis   TEXT,                     -- norma, edición y cláusula del criterio
  decision_rule      TEXT,                     -- tratamiento de la incertidumbre
  summary            TEXT,
  recommendations    TEXT,
  exclusions         TEXT,                     -- qué NO cubre el informe

  issue_date         DATE,
  signed_by_person_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
  signed_by_name     TEXT,
  signed_role        TEXT,
  signed_at          TIMESTAMPTZ,
  authorization_id   UUID REFERENCES inspector_authorizations(id) ON DELETE SET NULL,

  delivered_to       TEXT,
  delivery_date      DATE,
  delivery_channel   TEXT,

  status             TEXT NOT NULL DEFAULT 'Borrador'
                       CHECK (status IN ('Borrador', 'Emitido', 'Reemplazado', 'Anulado')),
  void_reason        TEXT,
  document_id        UUID REFERENCES documents_versions(id) ON DELETE SET NULL,
  notes              TEXT,
  change_log         JSONB DEFAULT '[]'::jsonb,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inspection_reports_number
  ON inspection_reports(org_id, lower(report_number), revision);
CREATE INDEX IF NOT EXISTS idx_inspection_reports_insp ON inspection_reports(inspection_id);

-- ─── Regla 1: a quién se puede asignar la inspección ────────────────────────
-- Anexo A.2 b) + 6.2.4: ni el que intervino el ítem, ni alguien sin
-- autorización vigente para ese método.
CREATE OR REPLACE FUNCTION enforce_inspection_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restriction TEXT;
  v_person      TEXT;
  v_method      inspection_methods%ROWTYPE;
  v_auth_state  TEXT;
  v_ready       BOOLEAN;
BEGIN
  -- Quien diseñó, fabricó, instaló, reparó o mantuvo el ítem no lo inspecciona
  IF NEW.lead_inspector_id IS NOT NULL AND NEW.item_id IS NOT NULL THEN
    SELECT r.interventions, r.person_name INTO v_restriction, v_person
      FROM item_inspection_restrictions r
     WHERE r.org_id = NEW.org_id
       AND r.item_id = NEW.item_id
       AND r.person_id = NEW.lead_inspector_id
     LIMIT 1;
    IF v_restriction IS NOT NULL THEN
      RAISE EXCEPTION '% intervino este ítem (%): no puede inspeccionarlo (ISO/IEC 17020 Anexo A.2 b)',
        COALESCE(v_person, 'El inspector'), v_restriction
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- De "En ejecución" en adelante, las condiciones técnicas tienen que estar dadas
  IF NEW.status IN ('En ejecución', 'Ejecutada', 'Informe emitido') THEN
    IF NEW.method_id IS NULL THEN
      RAISE EXCEPTION 'Elegí el método de inspección antes de ejecutarla (ISO/IEC 17020 7.2)'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_method FROM inspection_methods WHERE id = NEW.method_id AND org_id = NEW.org_id;
    IF v_method.status IS DISTINCT FROM 'Vigente' THEN
      RAISE EXCEPTION 'El método "%" no está vigente (%): no se puede ejecutar con él',
        v_method.name, COALESCE(v_method.status, 'sin estado')
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.lead_inspector_id IS NULL THEN
      RAISE EXCEPTION 'Indicá qué inspector ejecuta (ISO/IEC 17020 7.4.3)'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Autorización vigente para ESE método, salvo que trabaje supervisado
    -- durante su período mentorizado (6.1.4).
    IF NEW.supervised_by_id IS NULL THEN
      SELECT s.effective_status INTO v_auth_state
        FROM inspector_authorization_status s
       WHERE s.org_id = NEW.org_id
         AND s.person_id = NEW.lead_inspector_id
         AND s.method_id = NEW.method_id
         AND s.authorization_kind IN ('Ejecutar', 'Ejecutar e interpretar')
       ORDER BY (s.effective_status = 'Habilitado') DESC
       LIMIT 1;

      IF v_auth_state IS NULL THEN
        RAISE EXCEPTION 'El inspector no tiene autorización para ejecutar este método (ISO/IEC 17020 6.1.2 d). Autorizalo en Inspectores, o registrá quién lo supervisa.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_auth_state <> 'Habilitado' THEN
        RAISE EXCEPTION 'La autorización del inspector para este método está en estado "%": no puede ejecutar la inspección.', v_auth_state
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- 7.3: el ítem tiene que estar verificado como listo
    IF NEW.item_id IS NOT NULL THEN
      SELECT readiness_verified INTO v_ready FROM inspection_items WHERE id = NEW.item_id AND org_id = NEW.org_id;
      IF NOT COALESCE(v_ready, false) AND NOT NEW.item_ready_confirmed THEN
        RAISE EXCEPTION 'El ítem no está verificado como listo para inspección (ISO/IEC 17020 7.3)'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'Ejecutada' AND NEW.performed_at IS NULL THEN
    NEW.performed_at := CURRENT_DATE;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_inspection_assignment ON inspections;
CREATE TRIGGER tr_enforce_inspection_assignment
  BEFORE INSERT OR UPDATE ON inspections
  FOR EACH ROW EXECUTE FUNCTION enforce_inspection_assignment();

-- ─── Regla 2: quién firma el informe y qué pasa después de emitirlo ─────────
CREATE OR REPLACE FUNCTION enforce_report_signature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_state  TEXT;
  v_insp_status TEXT;
  v_person      TEXT;
BEGIN
  IF NEW.status = 'Emitido' THEN
    SELECT status INTO v_insp_status FROM inspections WHERE id = NEW.inspection_id AND org_id = NEW.org_id;
    IF v_insp_status IS NULL OR v_insp_status NOT IN ('Ejecutada', 'Informe emitido') THEN
      RAISE EXCEPTION 'No se puede emitir el informe: la inspección está en "%". Cerrala como Ejecutada primero.',
        COALESCE(v_insp_status, 'sin registro')
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.signed_by_person_id IS NULL THEN
      RAISE EXCEPTION 'El informe necesita la firma de una persona autorizada (ISO/IEC 17020 7.4.2 / 6.2.4)'
        USING ERRCODE = 'check_violation';
    END IF;

    IF COALESCE(TRIM(NEW.conclusion_basis), '') = '' THEN
      RAISE EXCEPTION 'Indicá contra qué criterio se dictamina (norma, edición y cláusula)'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Firma: autorización vigente que incluya interpretar/firmar, del método
    -- de la inspección.
    SELECT s.effective_status, s.person_name INTO v_auth_state, v_person
      FROM inspector_authorization_status s
      JOIN inspections i ON i.id = NEW.inspection_id
     WHERE s.org_id = NEW.org_id
       AND i.org_id = NEW.org_id
       AND s.person_id = NEW.signed_by_person_id
       AND (s.method_id = i.method_id OR s.authorization_kind = 'Solo firmar')
       AND s.authorization_kind IN ('Ejecutar e interpretar', 'Interpretar y firmar', 'Solo firmar')
     ORDER BY (s.effective_status = 'Habilitado') DESC
     LIMIT 1;

    IF v_auth_state IS NULL THEN
      RAISE EXCEPTION 'Quien firma no está autorizado a interpretar ni firmar este método (ISO/IEC 17020 6.1.2 d)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_auth_state <> 'Habilitado' THEN
      RAISE EXCEPTION 'La autorización de % está en estado "%": no puede firmar el informe.',
        COALESCE(v_person, 'quien firma'), v_auth_state
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.issue_date IS NULL THEN NEW.issue_date := CURRENT_DATE; END IF;
    IF NEW.signed_at IS NULL THEN NEW.signed_at := NOW(); END IF;
  END IF;

  -- 7.6: un informe emitido no se edita. Se corrige con una enmienda, que es
  -- una revisión nueva que referencia a la anterior.
  IF TG_OP = 'UPDATE' AND OLD.status = 'Emitido' THEN
    IF NEW.status = 'Emitido' AND (
         NEW.conclusion       IS DISTINCT FROM OLD.conclusion
      OR NEW.conclusion_basis IS DISTINCT FROM OLD.conclusion_basis
      OR NEW.summary          IS DISTINCT FROM OLD.summary
      OR NEW.recommendations  IS DISTINCT FROM OLD.recommendations
      OR NEW.exclusions       IS DISTINCT FROM OLD.exclusions
      OR NEW.decision_rule    IS DISTINCT FROM OLD.decision_rule
      OR NEW.signed_by_person_id IS DISTINCT FROM OLD.signed_by_person_id
      OR NEW.report_number    IS DISTINCT FROM OLD.report_number
      OR NEW.inspection_id    IS DISTINCT FROM OLD.inspection_id
    ) THEN
      RAISE EXCEPTION 'El informe % ya fue emitido: los cambios se hacen con una enmienda (revisión nueva), no editando el emitido (ISO/IEC 17020 7.6)',
        OLD.report_number
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'Anulado' AND COALESCE(TRIM(NEW.void_reason), '') = '' THEN
      RAISE EXCEPTION 'Para anular un informe emitido hay que decir por qué'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Una enmienda declara qué corrige
  IF NEW.amends_report_id IS NOT NULL AND COALESCE(TRIM(NEW.amendment_reason), '') = '' THEN
    RAISE EXCEPTION 'La enmienda tiene que decir qué corrige respecto del informe anterior (ISO/IEC 17020 7.6)'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_report_signature ON inspection_reports;
CREATE TRIGGER tr_enforce_report_signature
  BEFORE INSERT OR UPDATE ON inspection_reports
  FOR EACH ROW EXECUTE FUNCTION enforce_report_signature();

-- Al emitir: la inspección pasa a "Informe emitido" y la revisión anterior
-- queda marcada como reemplazada, para que nunca circulen dos vigentes.
CREATE OR REPLACE FUNCTION apply_report_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'Emitido' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Emitido') THEN
    UPDATE inspections
       SET status = 'Informe emitido', updated_at = NOW()
     WHERE id = NEW.inspection_id
       AND org_id = NEW.org_id
       AND status = 'Ejecutada';

    IF NEW.amends_report_id IS NOT NULL THEN
      UPDATE inspection_reports
         SET status = 'Reemplazado', updated_at = NOW()
       WHERE id = NEW.amends_report_id
         AND org_id = NEW.org_id
         AND status = 'Emitido';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_apply_report_issue ON inspection_reports;
CREATE TRIGGER tr_apply_report_issue
  AFTER INSERT OR UPDATE ON inspection_reports
  FOR EACH ROW EXECUTE FUNCTION apply_report_issue();

-- ─── Vista: registro de informes emitidos ───────────────────────────────────
CREATE OR REPLACE VIEW inspection_report_register AS
SELECT
  r.id,
  r.org_id,
  r.report_number,
  r.revision,
  r.status,
  r.conclusion,
  r.issue_date,
  r.delivered_to,
  r.amends_report_id,
  i.id           AS inspection_id,
  i.code         AS inspection_code,
  i.performed_at,
  i.client_name,
  it.tag         AS item_tag,
  it.name        AS item_name,
  m.name         AS method_name,
  m.code         AS method_code,
  lead.full_name AS inspector_name,
  signer.full_name AS signed_by,
  (SELECT COUNT(*) FROM inspection_findings f
    WHERE f.inspection_id = i.id AND f.evaluation = 'Rechazable') AS rejectable_findings
FROM inspection_reports r
JOIN inspections i ON i.id = r.inspection_id
LEFT JOIN inspection_items it ON it.id = i.item_id
LEFT JOIN inspection_methods m ON m.id = i.method_id
LEFT JOIN personnel lead ON lead.id = i.lead_inspector_id
LEFT JOIN personnel signer ON signer.id = r.signed_by_person_id;

DO $$
BEGIN
  IF current_setting('server_version_num')::INT >= 150000 THEN
    EXECUTE 'ALTER VIEW inspection_report_register SET (security_invoker = on)';
  END IF;
END $$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['inspections', 'inspection_findings', 'inspection_reports'] LOOP
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

COMMENT ON TABLE inspections IS 'ISO/IEC 17020 7.4.1 — registro de la inspección ejecutada: método, equipos, condiciones, desviaciones e inspector.';
COMMENT ON TABLE inspection_findings IS 'Indicaciones encontradas y su evaluación contra el criterio de aceptación.';
COMMENT ON TABLE inspection_reports IS 'ISO/IEC 17020 7.4 / 7.6 — informe con dictamen, firmado por persona autorizada; las correcciones son enmiendas.';
COMMENT ON VIEW inspection_report_register IS 'Registro de informes con su inspección, ítem, método, inspector y dictamen.';

NOTIFY pgrst, 'reload schema';

COMMIT;
