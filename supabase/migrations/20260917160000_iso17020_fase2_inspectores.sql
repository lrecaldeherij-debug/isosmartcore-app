-- =============================================================================
-- ISO/IEC 17020:2026 — Fase 2: inspectores autorizados
--
-- ISO 9001 pide competencia y formación. La 17020 pide bastante más, y es
-- justo lo que el evaluador del organismo de acreditación va a mirar primero:
--
--   6.1.2 b, d  selección y AUTORIZACIÓN formal del personal, por método
--   6.1.3       conocimiento del ítem, sus defectos posibles y la significancia
--               de las desviaciones encontradas
--   6.1.4       inducción y período de trabajo mentorizado antes de autorizar
--   6.1.5–6.1.7 programa de monitoreo con observación EN CAMPO de cada inspector
--   6.1.8       las necesidades de formación salen del monitoreo
--   6.1.9       evidencia documentada de la competencia
--
-- Tres tablas:
--   1. inspector_certifications — SNT-TC-1A / ISO 9712 / CWI / API, por método
--      y nivel, con vencimiento y examen de agudeza visual (que vence al año).
--   2. inspector_authorizations — qué método puede ejecutar cada persona, quién
--      lo autorizó y hasta cuándo, con su período mentorizado.
--   3. inspector_monitoring — observaciones en campo y revisiones de informe,
--      con el efecto sobre la autorización.
--
-- Automatismos que evitan el hallazgo clásico ("inspector trabajando con
-- certificación vencida"):
--   - Una autorización no se puede activar si su certificación está vencida.
--   - Un monitoreo con efecto "Suspende" suspende la autorización en el acto.
-- =============================================================================

BEGIN;

-- ─── 1. Certificaciones del inspector ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspector_certifications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  person_id          UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,

  scheme             TEXT NOT NULL,            -- SNT-TC-1A, ISO 9712, AWS CWI, API 510/570/653
  method             TEXT,                     -- UT, PAUT, PT, MT, VT, RT… (vacío en esquemas no END)
  level              TEXT,                     -- I, II, III, CWI, Inspector
  certifying_body    TEXT,                     -- empleador (SNT-TC-1A) u organismo (ISO 9712)
  certificate_number TEXT,
  issue_date         DATE,
  expiry_date        DATE,

  -- SNT-TC-1A exige agudeza visual anual (cercana y percepción de contraste).
  -- Sin examen vigente, la certificación no habilita a ejecutar el ensayo.
  vision_exam_date   DATE,
  vision_exam_result TEXT CHECK (vision_exam_result IN ('Apto', 'Apto con corrección', 'No apto')),

  practical_exam_date DATE,
  training_hours     NUMERIC,
  experience_hours   NUMERIC,
  evidence_url       TEXT,
  notes              TEXT,

  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspector_cert_person ON inspector_certifications(person_id);
CREATE INDEX IF NOT EXISTS idx_inspector_cert_expiry ON inspector_certifications(org_id, expiry_date);

-- ─── 2. Autorización por método (6.1.2 d) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS inspector_authorizations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  person_id          UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,

  method_id          UUID REFERENCES inspection_methods(id) ON DELETE CASCADE,
  scope_id           UUID REFERENCES inspection_scopes(id) ON DELETE SET NULL,
  certification_id   UUID REFERENCES inspector_certifications(id) ON DELETE SET NULL,

  -- Qué puede hacer: ejecutar el ensayo, interpretar/evaluar, o firmar el informe
  authorization_kind TEXT NOT NULL DEFAULT 'Ejecutar e interpretar'
                       CHECK (authorization_kind IN ('Ejecutar', 'Ejecutar e interpretar', 'Interpretar y firmar', 'Solo firmar')),
  restrictions       TEXT,                     -- límites: espesores, materiales, sedes

  -- 6.1.3: conocimiento del ítem, defectos posibles y significancia de desvíos
  item_knowledge     TEXT,

  -- 6.1.4: inducción y período mentorizado antes de autorizar
  mentoring_required BOOLEAN NOT NULL DEFAULT true,
  mentor_person_id   UUID REFERENCES personnel(id) ON DELETE SET NULL,
  mentoring_start    DATE,
  mentoring_end      DATE,
  mentoring_inspections INT DEFAULT 0,
  mentoring_notes    TEXT,

  authorized_by      TEXT,
  authorized_role    TEXT,
  authorized_at      DATE,
  valid_until        DATE,

  status             TEXT NOT NULL DEFAULT 'En mentoría'
                       CHECK (status IN ('En mentoría', 'Activa', 'Suspendida', 'Revocada', 'Vencida')),
  suspension_reason  TEXT,

  -- 6.1.5: frecuencia de monitoreo según riesgo de la actividad
  monitoring_frequency_months INT DEFAULT 12,
  notes              TEXT,
  change_log         JSONB DEFAULT '[]'::jsonb,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspector_auth_person ON inspector_authorizations(person_id, status);
CREATE INDEX IF NOT EXISTS idx_inspector_auth_method ON inspector_authorizations(method_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inspector_auth
  ON inspector_authorizations(person_id, method_id, authorization_kind)
  WHERE method_id IS NOT NULL AND status <> 'Revocada';

-- Una autorización no se activa con la certificación o la visión vencidas.
CREATE OR REPLACE FUNCTION enforce_authorization_validity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cert inspector_certifications%ROWTYPE;
BEGIN
  IF NEW.status = 'Activa' AND NEW.certification_id IS NOT NULL THEN
    SELECT * INTO v_cert FROM inspector_certifications WHERE id = NEW.certification_id;
    IF v_cert.expiry_date IS NOT NULL AND v_cert.expiry_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'La certificación % venció el %: no se puede activar la autorización (ISO/IEC 17020 6.1.2)',
        COALESCE(v_cert.certificate_number, v_cert.scheme), v_cert.expiry_date
        USING ERRCODE = 'check_violation';
    END IF;
    -- La agudeza visual de SNT-TC-1A / ISO 9712 vence al año
    IF v_cert.vision_exam_date IS NOT NULL AND v_cert.vision_exam_date < CURRENT_DATE - INTERVAL '1 year' THEN
      RAISE EXCEPTION 'El examen de agudeza visual (%) tiene más de un año: renovalo antes de activar la autorización',
        v_cert.vision_exam_date
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_cert.vision_exam_result = 'No apto' THEN
      RAISE EXCEPTION 'El examen de agudeza visual dio "No apto": no se puede activar la autorización'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- La mentoría tiene que estar cerrada antes de activar (6.1.4)
  IF NEW.status = 'Activa' AND NEW.mentoring_required AND NEW.mentoring_end IS NULL THEN
    RAISE EXCEPTION 'Falta cerrar el período mentorizado antes de autorizar (ISO/IEC 17020 6.1.4)'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_authorization_validity ON inspector_authorizations;
CREATE TRIGGER tr_enforce_authorization_validity
  BEFORE INSERT OR UPDATE ON inspector_authorizations
  FOR EACH ROW EXECUTE FUNCTION enforce_authorization_validity();

-- ─── 3. Monitoreo del inspector (6.1.5–6.1.7) ───────────────────────────────
CREATE TABLE IF NOT EXISTS inspector_monitoring (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  person_id          UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  authorization_id   UUID REFERENCES inspector_authorizations(id) ON DELETE SET NULL,
  method_id          UUID REFERENCES inspection_methods(id) ON DELETE SET NULL,

  activity_type      TEXT NOT NULL DEFAULT 'Observación en campo'
                       CHECK (activity_type IN ('Observación en campo', 'Revisión de informe', 'Reinspección', 'Comparación entre inspectores', 'Entrevista técnica')),
  performed_at       DATE NOT NULL DEFAULT CURRENT_DATE,
  observer_name      TEXT,
  observer_person_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
  item_reference     TEXT,                     -- ítem o informe observado

  result             TEXT NOT NULL DEFAULT 'Satisfactorio'
                       CHECK (result IN ('Satisfactorio', 'Con observaciones', 'No satisfactorio')),
  findings           TEXT,
  actions_required   TEXT,
  training_need      TEXT,                     -- 6.1.8: alimenta el plan de formación

  -- 6.1.7: el monitoreo tiene consecuencias sobre la autorización
  effect             TEXT NOT NULL DEFAULT 'Mantiene'
                       CHECK (effect IN ('Mantiene', 'Restringe', 'Suspende')),
  next_due_date      DATE,
  evidence_url       TEXT,

  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspector_monitoring_person ON inspector_monitoring(person_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspector_monitoring_auth ON inspector_monitoring(authorization_id);

-- Un monitoreo "Suspende" suspende la autorización en el acto: si no, el
-- hallazgo queda escrito pero el inspector sigue habilitado.
CREATE OR REPLACE FUNCTION apply_monitoring_effect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.effect = 'Suspende' AND NEW.authorization_id IS NOT NULL THEN
    UPDATE inspector_authorizations
       SET status = 'Suspendida',
           suspension_reason = COALESCE(NEW.findings, 'Resultado no satisfactorio en monitoreo ' || NEW.performed_at::TEXT),
           updated_at = NOW()
     WHERE id = NEW.authorization_id
       AND org_id = NEW.org_id
       AND status <> 'Revocada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_apply_monitoring_effect ON inspector_monitoring;
CREATE TRIGGER tr_apply_monitoring_effect
  AFTER INSERT ON inspector_monitoring
  FOR EACH ROW EXECUTE FUNCTION apply_monitoring_effect();

-- ─── Vista: estado real de cada autorización ────────────────────────────────
-- Junta autorización + certificación + último monitoreo y dice si el inspector
-- está realmente habilitado hoy o por qué no.
CREATE OR REPLACE VIEW inspector_authorization_status AS
SELECT
  a.id,
  a.org_id,
  a.person_id,
  p.full_name           AS person_name,
  a.method_id,
  m.name                AS method_name,
  m.code                AS method_code,
  a.authorization_kind,
  a.status,
  a.valid_until,
  a.monitoring_frequency_months,
  c.scheme,
  c.method              AS cert_method,
  c.level               AS cert_level,
  c.certificate_number,
  c.expiry_date         AS cert_expiry,
  c.vision_exam_date,
  c.vision_exam_result,
  mon.last_monitoring_at,
  mon.last_result,
  CASE
    WHEN a.status IN ('Revocada', 'Suspendida') THEN a.status
    WHEN a.status = 'En mentoría' THEN 'En mentoría'
    WHEN a.valid_until IS NOT NULL AND a.valid_until < CURRENT_DATE THEN 'Autorización vencida'
    WHEN c.expiry_date IS NOT NULL AND c.expiry_date < CURRENT_DATE THEN 'Certificación vencida'
    WHEN c.vision_exam_date IS NOT NULL AND c.vision_exam_date < CURRENT_DATE - INTERVAL '1 year' THEN 'Visión vencida'
    WHEN mon.last_monitoring_at IS NULL THEN 'Sin monitoreo registrado'
    WHEN mon.last_monitoring_at < CURRENT_DATE - (COALESCE(a.monitoring_frequency_months, 12) || ' months')::INTERVAL
      THEN 'Monitoreo vencido'
    ELSE 'Habilitado'
  END AS effective_status
FROM inspector_authorizations a
LEFT JOIN personnel p ON p.id = a.person_id
LEFT JOIN inspection_methods m ON m.id = a.method_id
LEFT JOIN inspector_certifications c ON c.id = a.certification_id
LEFT JOIN LATERAL (
  SELECT MAX(im.performed_at) AS last_monitoring_at,
         (ARRAY_AGG(im.result ORDER BY im.performed_at DESC))[1] AS last_result
  FROM inspector_monitoring im
  WHERE im.authorization_id = a.id
) mon ON true;

DO $$
BEGIN
  IF current_setting('server_version_num')::INT >= 150000 THEN
    EXECUTE 'ALTER VIEW inspector_authorization_status SET (security_invoker = on)';
  END IF;
END $$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['inspector_certifications', 'inspector_authorizations', 'inspector_monitoring'] LOOP
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

DROP TRIGGER IF EXISTS tr_touch_inspector_certifications ON inspector_certifications;
CREATE TRIGGER tr_touch_inspector_certifications BEFORE UPDATE ON inspector_certifications
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMENT ON TABLE inspector_certifications IS 'ISO/IEC 17020 6.1.2 — certificaciones por método y nivel, con vencimiento y agudeza visual.';
COMMENT ON TABLE inspector_authorizations IS 'ISO/IEC 17020 6.1.2 d / 6.1.4 — autorización formal por método, con período mentorizado.';
COMMENT ON TABLE inspector_monitoring IS 'ISO/IEC 17020 6.1.5–6.1.8 — monitoreo del inspector y su efecto sobre la autorización.';
COMMENT ON VIEW inspector_authorization_status IS 'Estado efectivo de cada autorización: vencimientos de certificación, visión y monitoreo.';

NOTIFY pgrst, 'reload schema';

COMMIT;
