-- =============================================================================
-- ISO/IEC 17020 — Fase 4: imparcialidad, quejas y apelaciones
--
-- Lo que pide la norma y ISO 9001 no cubre:
--   4.1.3–4.1.6  identificar de forma continua los riesgos a la imparcialidad,
--                incluidos los que vienen de relaciones, y eliminarlos o
--                minimizarlos con salvaguardas concretas.
--   4.1.7        el personal se compromete por escrito con la imparcialidad y
--                la confidencialidad, y declara sus conflictos.
--   4.2          confidencialidad de la información del cliente.
--   7.5 / 7.6    (7.7 / 7.8 en la edición anterior) quejas y apelaciones: acuse
--                de recibo, tratamiento y decisión tomada o revisada por
--                personas que NO participaron en la inspección cuestionada.
--
-- Tres tablas:
--   1. impartiality_risks       — amenazas a la imparcialidad y sus salvaguardas
--   2. impartiality_commitments — compromiso firmado y conflictos declarados
--   3. inspection_complaints    — quejas y apelaciones, con revisión independiente
--
-- Las reglas van como triggers: "la decisión la toma alguien que no participó"
-- es un requisito que se verifica en la evaluación leyendo nombres, no
-- intenciones.
-- =============================================================================

BEGIN;

-- ─── 1. Riesgos a la imparcialidad (4.1.3–4.1.6) ────────────────────────────
CREATE TABLE IF NOT EXISTS impartiality_risks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  source             TEXT NOT NULL DEFAULT 'Actividades relacionadas'
                       CHECK (source IN ('Propiedad', 'Gobernanza', 'Gestión', 'Personal',
                                         'Recursos compartidos', 'Finanzas', 'Contratos',
                                         'Marketing y ventas', 'Comisiones o incentivos',
                                         'Actividades relacionadas', 'Relación con el cliente',
                                         'Familiaridad', 'Intimidación', 'Otro')),
  description        TEXT NOT NULL,
  scope_id           UUID REFERENCES inspection_scopes(id) ON DELETE SET NULL,
  person_id          UUID REFERENCES personnel(id) ON DELETE SET NULL,
  client_name        TEXT,

  -- Mismo criterio que la matriz de riesgos del SGC: P e I de 1 a 10
  probability        INT CHECK (probability BETWEEN 1 AND 10),
  impact             INT CHECK (impact BETWEEN 1 AND 10),

  safeguards         TEXT,                     -- qué se hace para eliminarlo o minimizarlo
  responsible        TEXT,
  evidence           TEXT,
  status             TEXT NOT NULL DEFAULT 'Identificado'
                       CHECK (status IN ('Identificado', 'En tratamiento', 'Tratado', 'Aceptado', 'Cerrado')),
  acceptance_note    TEXT,                     -- por qué la dirección lo acepta como está
  reviewed_at        DATE,
  next_review        DATE,

  notes              TEXT,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impartiality_risks_org ON impartiality_risks(org_id, status);

-- Un riesgo alto o crítico no se declara tratado sin decir con qué salvaguarda.
CREATE OR REPLACE FUNCTION enforce_impartiality_safeguard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_score INT := COALESCE(NEW.probability, 0) * COALESCE(NEW.impact, 0);
BEGIN
  IF NEW.status IN ('Tratado', 'Cerrado')
     AND v_score >= 36
     AND COALESCE(TRIM(NEW.safeguards), '') = '' THEN
    RAISE EXCEPTION 'Un riesgo a la imparcialidad de nivel alto o crítico no se puede dar por tratado sin describir la salvaguarda aplicada (ISO/IEC 17020 4.1.4)'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'Aceptado' AND COALESCE(TRIM(NEW.acceptance_note), '') = '' THEN
    RAISE EXCEPTION 'Aceptar un riesgo a la imparcialidad exige dejar por escrito quién lo acepta y con qué justificación'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_impartiality_safeguard ON impartiality_risks;
CREATE TRIGGER tr_enforce_impartiality_safeguard
  BEFORE INSERT OR UPDATE ON impartiality_risks
  FOR EACH ROW EXECUTE FUNCTION enforce_impartiality_safeguard();

-- ─── 2. Compromiso del personal (4.1.7 / 4.2) ───────────────────────────────
CREATE TABLE IF NOT EXISTS impartiality_commitments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  person_id          UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,

  signed_at          DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until        DATE,
  covers_impartiality BOOLEAN NOT NULL DEFAULT true,
  covers_confidentiality BOOLEAN NOT NULL DEFAULT true,
  free_of_pressure   BOOLEAN NOT NULL DEFAULT true,   -- declara no estar sujeto a presión comercial

  -- 4.1.7: conflictos que la persona declara (empleos previos, parentescos,
  -- participación en obras que después inspecciona)
  declared_conflicts TEXT,
  conflict_treatment TEXT,                    -- cómo se maneja el conflicto declarado
  document_url       TEXT,
  notes              TEXT,

  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impartiality_commitments_person
  ON impartiality_commitments(person_id, signed_at DESC);

-- Si declara un conflicto, tiene que decir cómo se trata: si no, es una
-- declaración que no protege nada.
CREATE OR REPLACE FUNCTION enforce_conflict_treatment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(TRIM(NEW.declared_conflicts), '') <> ''
     AND COALESCE(TRIM(NEW.conflict_treatment), '') = '' THEN
    RAISE EXCEPTION 'El conflicto declarado necesita decir cómo se trata (por ejemplo: no asignar a esa persona a ese cliente o a ese ítem)'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_conflict_treatment ON impartiality_commitments;
CREATE TRIGGER tr_enforce_conflict_treatment
  BEFORE INSERT OR UPDATE ON impartiality_commitments
  FOR EACH ROW EXECUTE FUNCTION enforce_conflict_treatment();

-- ─── 3. Quejas y apelaciones ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspection_complaints (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  code               TEXT NOT NULL,            -- QA-2026-003
  kind               TEXT NOT NULL DEFAULT 'Queja'
                       CHECK (kind IN ('Queja', 'Apelación')),

  -- La apelación siempre es contra un resultado: sin informe no hay apelación
  report_id          UUID REFERENCES inspection_reports(id) ON DELETE SET NULL,
  inspection_id      UUID REFERENCES inspections(id) ON DELETE SET NULL,

  received_at        DATE NOT NULL DEFAULT CURRENT_DATE,
  channel            TEXT,                     -- correo, teléfono, visita, formulario
  claimant_name      TEXT,
  claimant_contact   TEXT,
  claimant_type      TEXT DEFAULT 'Cliente'
                       CHECK (claimant_type IN ('Cliente', 'Dueño del activo', 'Autoridad', 'Personal propio', 'Otro')),
  description        TEXT NOT NULL,

  acknowledged_at    DATE,                     -- acuse de recibo al reclamante
  admissible         BOOLEAN,                  -- ¿corresponde a nuestra actividad de inspección?
  admissibility_note TEXT,

  -- Quien investiga y quien decide NO pueden haber participado en la
  -- inspección cuestionada (revisión independiente).
  handler_person_id  UUID REFERENCES personnel(id) ON DELETE SET NULL,
  investigation      TEXT,
  root_cause         TEXT,
  decision           TEXT,
  decision_by_person_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
  decision_at        DATE,
  outcome            TEXT
                       CHECK (outcome IN ('Procedente', 'Parcialmente procedente', 'No procedente', 'Desistida')),
  report_amended     BOOLEAN NOT NULL DEFAULT false,   -- ¿hubo que enmendar el informe?
  amended_report_id  UUID REFERENCES inspection_reports(id) ON DELETE SET NULL,
  nonconformity_id   UUID,                     -- no conformidad abierta, si aplica

  notified_at        DATE,                     -- comunicación formal del resultado
  closed_at          DATE,
  status             TEXT NOT NULL DEFAULT 'Recibida'
                       CHECK (status IN ('Recibida', 'En análisis', 'En investigación', 'Resuelta', 'Cerrada', 'Rechazada')),

  notes              TEXT,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inspection_complaints_code
  ON inspection_complaints(org_id, lower(code));
CREATE INDEX IF NOT EXISTS idx_inspection_complaints_status
  ON inspection_complaints(org_id, status, received_at DESC);

-- La regla central: independencia de quien investiga y decide.
CREATE OR REPLACE FUNCTION enforce_complaint_independence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inspection_id UUID;
  v_lead          UUID;
  v_signer        UUID;
  v_name          TEXT;
BEGIN
  -- La inspección cuestionada sale del informe si no vino directa
  v_inspection_id := NEW.inspection_id;
  IF NEW.report_id IS NOT NULL THEN
    SELECT r.inspection_id, r.signed_by_person_id
      INTO v_inspection_id, v_signer
      FROM inspection_reports r
     WHERE r.id = NEW.report_id AND r.org_id = NEW.org_id;
    NEW.inspection_id := COALESCE(NEW.inspection_id, v_inspection_id);
  END IF;

  IF v_inspection_id IS NOT NULL THEN
    SELECT i.lead_inspector_id INTO v_lead
      FROM inspections i
     WHERE i.id = v_inspection_id AND i.org_id = NEW.org_id;
  END IF;

  -- Ni el que ejecutó ni el que firmó pueden investigar ni decidir
  IF NEW.handler_person_id IS NOT NULL
     AND NEW.handler_person_id IN (COALESCE(v_lead, '00000000-0000-0000-0000-000000000000'::uuid),
                                   COALESCE(v_signer, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
    SELECT full_name INTO v_name FROM personnel WHERE id = NEW.handler_person_id;
    RAISE EXCEPTION '% participó en la inspección cuestionada: no puede investigar esta % (revisión independiente)',
      COALESCE(v_name, 'Esa persona'), lower(NEW.kind)
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.decision_by_person_id IS NOT NULL
     AND NEW.decision_by_person_id IN (COALESCE(v_lead, '00000000-0000-0000-0000-000000000000'::uuid),
                                       COALESCE(v_signer, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
    SELECT full_name INTO v_name FROM personnel WHERE id = NEW.decision_by_person_id;
    RAISE EXCEPTION '% participó en la inspección cuestionada: no puede decidir sobre esta % (ISO/IEC 17020)',
      COALESCE(v_name, 'Esa persona'), lower(NEW.kind)
      USING ERRCODE = 'check_violation';
  END IF;

  -- Una apelación es contra un resultado: necesita el informe apelado
  IF NEW.kind = 'Apelación' AND NEW.report_id IS NULL THEN
    RAISE EXCEPTION 'Una apelación se presenta contra un informe: indicá cuál se apela'
      USING ERRCODE = 'check_violation';
  END IF;

  -- No se cierra sin decisión, sin quién la tomó y sin haber comunicado
  IF NEW.status IN ('Resuelta', 'Cerrada') THEN
    IF COALESCE(TRIM(NEW.decision), '') = '' THEN
      RAISE EXCEPTION 'No se puede cerrar sin registrar la decisión tomada'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.decision_by_person_id IS NULL THEN
      RAISE EXCEPTION 'La decisión tiene que estar firmada por una persona que no participó en la inspección'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.outcome IS NULL THEN
      RAISE EXCEPTION 'Indicá el resultado: procedente, parcialmente procedente, no procedente o desistida'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'Cerrada' AND NEW.notified_at IS NULL THEN
    RAISE EXCEPTION 'Antes de cerrar hay que comunicar formalmente el resultado al reclamante (fecha de notificación)'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'Cerrada' AND NEW.closed_at IS NULL THEN
    NEW.closed_at := CURRENT_DATE;
  END IF;
  IF NEW.decision_at IS NULL AND COALESCE(TRIM(NEW.decision), '') <> '' THEN
    NEW.decision_at := CURRENT_DATE;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_complaint_independence ON inspection_complaints;
CREATE TRIGGER tr_enforce_complaint_independence
  BEFORE INSERT OR UPDATE ON inspection_complaints
  FOR EACH ROW EXECUTE FUNCTION enforce_complaint_independence();

-- ─── Vista: quién puede tratar cada queja ───────────────────────────────────
-- Responde, por queja, qué personas quedan excluidas por haber participado.
CREATE OR REPLACE VIEW complaint_independence_conflicts AS
SELECT
  c.id            AS complaint_id,
  c.org_id,
  p.id            AS person_id,
  p.full_name     AS person_name,
  CASE
    WHEN p.id = i.lead_inspector_id AND p.id = r.signed_by_person_id THEN 'Ejecutó y firmó'
    WHEN p.id = i.lead_inspector_id THEN 'Ejecutó la inspección'
    ELSE 'Firmó el informe'
  END AS reason
FROM inspection_complaints c
LEFT JOIN inspection_reports r ON r.id = c.report_id
LEFT JOIN inspections i ON i.id = COALESCE(c.inspection_id, r.inspection_id)
JOIN personnel p ON p.org_id = c.org_id
 AND (p.id = i.lead_inspector_id OR p.id = r.signed_by_person_id);

DO $$
BEGIN
  IF current_setting('server_version_num')::INT >= 150000 THEN
    EXECUTE 'ALTER VIEW complaint_independence_conflicts SET (security_invoker = on)';
  END IF;
END $$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['impartiality_risks', 'impartiality_commitments', 'inspection_complaints'] LOOP
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

COMMENT ON TABLE impartiality_risks IS 'ISO/IEC 17020 4.1.3–4.1.6 — amenazas a la imparcialidad y las salvaguardas aplicadas.';
COMMENT ON TABLE impartiality_commitments IS 'ISO/IEC 17020 4.1.7 / 4.2 — compromiso de imparcialidad y confidencialidad, con conflictos declarados.';
COMMENT ON TABLE inspection_complaints IS 'Quejas y apelaciones sobre inspecciones, con investigación y decisión de personas que no participaron.';
COMMENT ON VIEW complaint_independence_conflicts IS 'Por queja, qué personas quedan excluidas de investigarla o decidirla.';

NOTIFY pgrst, 'reload schema';

COMMIT;
