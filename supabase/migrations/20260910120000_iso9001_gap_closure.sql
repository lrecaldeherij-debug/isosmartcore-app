-- =============================================================================
-- Cierre de gaps ISO 9001:2015 — 6 cláusulas sin cobertura de software
--
-- Contexto: el AUDIT_REPORT_ISO9001.md declaraba 100% de cumplimiento, pero
-- la revisión cláusula por cláusula encontró 6 requisitos sin módulo real.
-- Esta migración crea las tablas para cerrarlos antes de escalar a ISO 17020
-- (que reusa el SGC 9001 como base vía su Opción B, cláusula 8).
--
-- Gaps cubiertos:
--   1. 9.1.2  Satisfacción del cliente        → customer_satisfaction_surveys
--   2. 8.2.1  Comunicación con el cliente     → customer_feedback
--   3. 7.1.3  Infraestructura                 → infrastructure_assets
--                                              + maintenance_records
--   4. 7.3    Toma de conciencia              → awareness_records
--   5. 7.1.6  Conocimientos de la organización→ organizational_knowledge
--   6. 9.1.3  Análisis y evaluación de datos  → data_analysis_reports
--
-- Todas las tablas siguen el patrón estándar del proyecto:
--   org_id con DEFAULT auth_org_id() + RLS por org + soporte impersonate.
-- =============================================================================

BEGIN;

-- =============================================================================
-- GAP 1 — 9.1.2 SATISFACCIÓN DEL CLIENTE
--
-- La norma exige "hacer seguimiento de las percepciones de los clientes del
-- grado en que se cumplen sus necesidades y expectativas". No basta con no
-- tener quejas: hay que MEDIR activamente y analizar tendencia.
--
-- Diseño: 6 dimensiones puntuadas 1-5 + NPS 0-10. Las respuestas pueden ser
-- identificadas (se sabe qué cliente) o anónimas (link público). Reusa el
-- patrón de survey_campaigns que ya existe para clima laboral.
-- =============================================================================

CREATE TABLE IF NOT EXISTS customer_satisfaction_surveys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identidad del cliente. Puede quedar NULL en respuestas anónimas por link.
  customer_name     TEXT,
  customer_contact  TEXT,
  -- Link opcional al pedido concreto que se está evaluando (trazabilidad
  -- entre la percepción y la entrega real que la generó).
  order_id          UUID,

  -- Las 6 dimensiones, escala 1-5. NULL = el cliente no respondió esa.
  score_quality       SMALLINT CHECK (score_quality       BETWEEN 1 AND 5),
  score_delivery      SMALLINT CHECK (score_delivery      BETWEEN 1 AND 5),
  score_communication SMALLINT CHECK (score_communication BETWEEN 1 AND 5),
  score_value         SMALLINT CHECK (score_value         BETWEEN 1 AND 5),
  score_responsiveness SMALLINT CHECK (score_responsiveness BETWEEN 1 AND 5),
  score_technical     SMALLINT CHECK (score_technical     BETWEEN 1 AND 5),

  -- Net Promoter Score: "¿Qué tan probable es que nos recomiende?" 0-10.
  -- Promotores 9-10, Pasivos 7-8, Detractores 0-6. NPS = %prom - %detr.
  nps_score         SMALLINT CHECK (nps_score BETWEEN 0 AND 10),

  -- Promedio calculado de las dimensiones respondidas (trigger lo llena).
  overall_score     NUMERIC(3,2),

  comments          TEXT,
  survey_date       DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Origen: 'manual' (lo carga el equipo tras llamar al cliente),
  -- 'email' (invitación por token), 'public_link' (QR / link abierto).
  source            TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'email', 'public_link')),
  campaign_id       UUID REFERENCES survey_campaigns(id) ON DELETE SET NULL,
  is_anonymous      BOOLEAN NOT NULL DEFAULT false,
  respondent_fingerprint TEXT,

  -- Si el resultado dispara una acción (score bajo → NC o mejora).
  triggered_action  TEXT,

  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_css_org_date
  ON customer_satisfaction_surveys(org_id, survey_date DESC);
CREATE INDEX IF NOT EXISTS idx_css_campaign
  ON customer_satisfaction_surveys(campaign_id) WHERE campaign_id IS NOT NULL;

-- Trigger: calcular overall_score como promedio de las dimensiones no nulas.
-- Se hace en BD y no en el frontend para que las respuestas por link público
-- (que no pasan por el frontend autenticado) también queden con el promedio.
CREATE OR REPLACE FUNCTION calc_satisfaction_overall()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sum   NUMERIC := 0;
  v_count INT     := 0;
BEGIN
  IF NEW.score_quality        IS NOT NULL THEN v_sum := v_sum + NEW.score_quality;        v_count := v_count + 1; END IF;
  IF NEW.score_delivery       IS NOT NULL THEN v_sum := v_sum + NEW.score_delivery;       v_count := v_count + 1; END IF;
  IF NEW.score_communication  IS NOT NULL THEN v_sum := v_sum + NEW.score_communication;  v_count := v_count + 1; END IF;
  IF NEW.score_value          IS NOT NULL THEN v_sum := v_sum + NEW.score_value;          v_count := v_count + 1; END IF;
  IF NEW.score_responsiveness IS NOT NULL THEN v_sum := v_sum + NEW.score_responsiveness; v_count := v_count + 1; END IF;
  IF NEW.score_technical      IS NOT NULL THEN v_sum := v_sum + NEW.score_technical;      v_count := v_count + 1; END IF;

  IF v_count > 0 THEN
    NEW.overall_score := ROUND(v_sum / v_count, 2);
  ELSE
    NEW.overall_score := NULL;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calc_satisfaction_overall ON customer_satisfaction_surveys;
CREATE TRIGGER trg_calc_satisfaction_overall
  BEFORE INSERT OR UPDATE ON customer_satisfaction_surveys
  FOR EACH ROW EXECUTE FUNCTION calc_satisfaction_overall();

ALTER TABLE customer_satisfaction_surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS css_select ON customer_satisfaction_surveys;
CREATE POLICY css_select ON customer_satisfaction_surveys FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );

DROP POLICY IF EXISTS css_insert ON customer_satisfaction_surveys;
CREATE POLICY css_insert ON customer_satisfaction_surveys FOR INSERT
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS css_update ON customer_satisfaction_surveys;
CREATE POLICY css_update ON customer_satisfaction_surveys FOR UPDATE
  USING (org_id = auth_org_id()) WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS css_delete ON customer_satisfaction_surveys;
CREATE POLICY css_delete ON customer_satisfaction_surveys FOR DELETE
  USING (org_id = auth_org_id());

-- ─── RPC pública: responder encuesta de satisfacción por link ────────────────
-- Mismo patrón anti-enumeración que las encuestas de clima: error genérico
-- para no revelar si un slug existe.
CREATE OR REPLACE FUNCTION submit_customer_satisfaction(
  p_slug        TEXT,
  p_scores      JSONB,
  p_nps         INT     DEFAULT NULL,
  p_comments    TEXT    DEFAULT NULL,
  p_customer    TEXT    DEFAULT NULL,
  p_fingerprint TEXT    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_camp      RECORD;
  v_id        UUID;
  v_dup       INT;
  v_recent    INT;
BEGIN
  SELECT * INTO v_camp
  FROM survey_campaigns
  WHERE public_slug = p_slug AND is_public = true;

  IF NOT FOUND
     OR v_camp.status <> 'active'
     OR (v_camp.expires_at IS NOT NULL AND v_camp.expires_at < now()) THEN
    RETURN jsonb_build_object('error', 'campaign_unavailable');
  END IF;

  -- Rate limit por campaña (mismo umbral que las encuestas de clima).
  SELECT COUNT(*) INTO v_recent
  FROM customer_satisfaction_surveys
  WHERE campaign_id = v_camp.id AND created_at > now() - interval '1 hour';
  IF v_recent >= 500 THEN
    RETURN jsonb_build_object('error', 'rate_limited');
  END IF;

  -- Anti doble respuesta desde el mismo dispositivo.
  IF p_fingerprint IS NOT NULL AND length(p_fingerprint) > 0 THEN
    SELECT COUNT(*) INTO v_dup
    FROM customer_satisfaction_surveys
    WHERE campaign_id = v_camp.id AND respondent_fingerprint = p_fingerprint;
    IF v_dup > 0 THEN
      RETURN jsonb_build_object('error', 'already_responded');
    END IF;
  END IF;

  INSERT INTO customer_satisfaction_surveys (
    org_id, customer_name, campaign_id, source, is_anonymous,
    respondent_fingerprint, nps_score, comments,
    score_quality, score_delivery, score_communication,
    score_value, score_responsiveness, score_technical
  ) VALUES (
    v_camp.org_id, p_customer, v_camp.id, 'public_link',
    (p_customer IS NULL OR length(trim(p_customer)) = 0),
    p_fingerprint, p_nps, p_comments,
    NULLIF(p_scores->>'quality',        '')::SMALLINT,
    NULLIF(p_scores->>'delivery',       '')::SMALLINT,
    NULLIF(p_scores->>'communication',  '')::SMALLINT,
    NULLIF(p_scores->>'value',          '')::SMALLINT,
    NULLIF(p_scores->>'responsiveness', '')::SMALLINT,
    NULLIF(p_scores->>'technical',      '')::SMALLINT
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'survey_id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_customer_satisfaction(TEXT, JSONB, INT, TEXT, TEXT, TEXT)
  TO anon, authenticated;


-- =============================================================================
-- GAP 2 — 8.2.1 COMUNICACIÓN CON EL CLIENTE (quejas, consultas, retroalim.)
--
-- La norma exige comunicar con clientes sobre: información del producto,
-- consultas/contratos/pedidos, retroalimentación INCLUYENDO QUEJAS, manejo
-- de propiedad del cliente y requisitos de contingencia.
--
-- El auditor siempre pide el registro de quejas y cómo se cierran. Sin esto
-- se abre no conformidad casi segura.
-- =============================================================================

CREATE TABLE IF NOT EXISTS customer_feedback (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  -- Código correlativo legible tipo "QJ-2026-001" (lo arma el frontend).
  code             TEXT,

  feedback_type    TEXT NOT NULL DEFAULT 'complaint' CHECK (feedback_type IN (
                     'complaint',      -- queja / reclamo
                     'inquiry',        -- consulta
                     'suggestion',     -- sugerencia de mejora
                     'compliment',     -- felicitación
                     'claim',          -- reclamo formal con impacto económico
                     'return'          -- devolución de producto
                   )),

  -- Canal por el que llegó — evidencia de que hay múltiples vías abiertas.
  channel          TEXT CHECK (channel IN (
                     'email', 'phone', 'in_person', 'web_form',
                     'whatsapp', 'social_media', 'letter', 'other'
                   )),

  customer_name    TEXT NOT NULL,
  customer_contact TEXT,
  order_id         UUID,     -- pedido relacionado si aplica

  received_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  description      TEXT NOT NULL,

  -- Severidad para priorizar: una queja crítica debe escalar a NC.
  severity         TEXT NOT NULL DEFAULT 'medium'
                     CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  status           TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
                     'received',    -- recibida, sin analizar
                     'in_analysis', -- en análisis interno
                     'responded',   -- se respondió al cliente
                     'closed',      -- cerrada con conformidad del cliente
                     'escalated'    -- escaló a no conformidad formal
                   )),

  assigned_to      TEXT,     -- responsable del seguimiento
  response         TEXT,     -- qué se le respondió al cliente
  response_date    DATE,
  closed_date      DATE,

  -- ¿El cliente quedó conforme con cómo se manejó? 1-5. Cierra el ciclo.
  customer_satisfied SMALLINT CHECK (customer_satisfied BETWEEN 1 AND 5),

  -- Si escaló, link a la no conformidad formal (10.2). Sin FK dura porque
  -- non_conformities puede no existir en instalaciones parciales.
  nc_id            UUID,
  root_cause       TEXT,
  corrective_action TEXT,

  evidence_url     TEXT,
  notes            TEXT,

  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cf_org_date
  ON customer_feedback(org_id, received_date DESC);
CREATE INDEX IF NOT EXISTS idx_cf_org_status
  ON customer_feedback(org_id, status, received_date DESC);

ALTER TABLE customer_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cf_select ON customer_feedback;
CREATE POLICY cf_select ON customer_feedback FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );

DROP POLICY IF EXISTS cf_insert ON customer_feedback;
CREATE POLICY cf_insert ON customer_feedback FOR INSERT
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS cf_update ON customer_feedback;
CREATE POLICY cf_update ON customer_feedback FOR UPDATE
  USING (org_id = auth_org_id()) WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS cf_delete ON customer_feedback;
CREATE POLICY cf_delete ON customer_feedback FOR DELETE
  USING (org_id = auth_org_id());


-- =============================================================================
-- GAP 3 — 7.1.3 INFRAESTRUCTURA
--
-- "La organización debe determinar, proporcionar y mantener la infraestructura
-- necesaria para la operación de sus procesos": edificios, equipos (hardware
-- y software), transporte, TIC.
--
-- Ojo: equipment_calibration ya cubre los equipos DE MEDICIÓN (7.1.5). Esto
-- es distinto: cubre el resto de activos y — clave para el auditor — su plan
-- de mantenimiento preventivo con historial.
-- =============================================================================

CREATE TABLE IF NOT EXISTS infrastructure_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  code              TEXT,             -- "INF-001", placa interna
  name              TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'equipment' CHECK (category IN (
                      'building',      -- edificios, instalaciones, plantas
                      'equipment',     -- maquinaria y equipos productivos
                      'vehicle',       -- transporte
                      'it_hardware',   -- servidores, PCs, redes
                      'it_software',   -- licencias, sistemas
                      'utility',       -- servicios de apoyo (aire, agua, energía)
                      'tool',          -- herramientas
                      'other'
                    )),

  description       TEXT,
  location          TEXT,
  responsible       TEXT,

  -- Qué proceso del SGC depende de este activo. Conecta 7.1.3 con 4.4.
  used_in_process   TEXT,
  -- Si falla, ¿para la operación? Prioriza el mantenimiento.
  criticality       TEXT NOT NULL DEFAULT 'medium'
                      CHECK (criticality IN ('low', 'medium', 'high', 'critical')),

  brand             TEXT,
  model             TEXT,
  serial_number     TEXT,
  acquisition_date  DATE,
  acquisition_cost  NUMERIC,

  status            TEXT NOT NULL DEFAULT 'operational' CHECK (status IN (
                      'operational',   -- en servicio
                      'maintenance',   -- fuera por mantenimiento
                      'faulty',        -- averiado
                      'retired'        -- dado de baja
                    )),

  -- Plan de mantenimiento preventivo. NULL = no requiere.
  maintenance_frequency_months INT,
  last_maintenance_date        DATE,
  next_maintenance_date        DATE,

  evidence_url      TEXT,
  notes             TEXT,

  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ia_org_status
  ON infrastructure_assets(org_id, status);
CREATE INDEX IF NOT EXISTS idx_ia_org_next_maint
  ON infrastructure_assets(org_id, next_maintenance_date)
  WHERE next_maintenance_date IS NOT NULL;

ALTER TABLE infrastructure_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_select ON infrastructure_assets;
CREATE POLICY ia_select ON infrastructure_assets FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );

DROP POLICY IF EXISTS ia_insert ON infrastructure_assets;
CREATE POLICY ia_insert ON infrastructure_assets FOR INSERT
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS ia_update ON infrastructure_assets;
CREATE POLICY ia_update ON infrastructure_assets FOR UPDATE
  USING (org_id = auth_org_id()) WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS ia_delete ON infrastructure_assets;
CREATE POLICY ia_delete ON infrastructure_assets FOR DELETE
  USING (org_id = auth_org_id());

-- ─── Historial de mantenimientos ─────────────────────────────────────────────
-- El auditor no pregunta "¿tenés plan?", pregunta "mostrame los últimos 3
-- mantenimientos del equipo X". Sin historial no hay evidencia.
CREATE TABLE IF NOT EXISTS maintenance_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id         UUID NOT NULL REFERENCES infrastructure_assets(id) ON DELETE CASCADE,

  maintenance_type TEXT NOT NULL DEFAULT 'preventive' CHECK (maintenance_type IN (
                     'preventive',   -- programado
                     'corrective',   -- por falla
                     'predictive',   -- por condición
                     'inspection'    -- verificación sin intervención
                   )),

  performed_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  performed_by     TEXT,          -- técnico interno o proveedor externo
  is_external      BOOLEAN NOT NULL DEFAULT false,
  supplier_name    TEXT,

  description      TEXT NOT NULL,
  findings         TEXT,          -- qué se encontró
  actions_taken    TEXT,
  parts_replaced   TEXT,
  cost             NUMERIC,
  downtime_hours   NUMERIC,

  -- ¿El activo quedó operativo tras la intervención?
  result           TEXT NOT NULL DEFAULT 'ok'
                     CHECK (result IN ('ok', 'partial', 'failed', 'requires_followup')),
  next_due_date    DATE,

  evidence_url     TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mr_asset
  ON maintenance_records(asset_id, performed_date DESC);
CREATE INDEX IF NOT EXISTS idx_mr_org_date
  ON maintenance_records(org_id, performed_date DESC);

ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mr_select ON maintenance_records;
CREATE POLICY mr_select ON maintenance_records FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );

DROP POLICY IF EXISTS mr_insert ON maintenance_records;
CREATE POLICY mr_insert ON maintenance_records FOR INSERT
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS mr_update ON maintenance_records;
CREATE POLICY mr_update ON maintenance_records FOR UPDATE
  USING (org_id = auth_org_id()) WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS mr_delete ON maintenance_records;
CREATE POLICY mr_delete ON maintenance_records FOR DELETE
  USING (org_id = auth_org_id());

-- Al registrar un mantenimiento, adelantar la fecha del próximo en el activo.
-- Evita que el owner tenga que actualizar dos lugares y que el calendario
-- quede desincronizado del historial real.
CREATE OR REPLACE FUNCTION sync_asset_maintenance_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_freq INT;
BEGIN
  SELECT maintenance_frequency_months INTO v_freq
  FROM infrastructure_assets WHERE id = NEW.asset_id;

  UPDATE infrastructure_assets
  SET last_maintenance_date = NEW.performed_date,
      next_maintenance_date = COALESCE(
        NEW.next_due_date,
        CASE WHEN v_freq IS NOT NULL AND v_freq > 0
             THEN NEW.performed_date + (v_freq || ' months')::interval
             ELSE next_maintenance_date
        END::date
      ),
      updated_at = NOW()
  WHERE id = NEW.asset_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_asset_maintenance ON maintenance_records;
CREATE TRIGGER trg_sync_asset_maintenance
  AFTER INSERT ON maintenance_records
  FOR EACH ROW EXECUTE FUNCTION sync_asset_maintenance_dates();


-- =============================================================================
-- GAP 4 — 7.3 TOMA DE CONCIENCIA
--
-- "La organización debe asegurarse de que las personas que realizan el trabajo
-- bajo su control tomen conciencia de: la política de calidad, los objetivos
-- pertinentes, su contribución a la eficacia del SGC y las implicaciones del
-- incumplimiento."
--
-- Esto NO es lo mismo que competencia (7.2 = sabe hacer el trabajo). Es:
-- ¿entiende por qué existe el SGC y cuál es su rol en él? El auditor lo
-- verifica entrevistando personal al azar, y pide el registro firmado.
-- =============================================================================

CREATE TABLE IF NOT EXISTS awareness_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  -- A quién. person_id apunta a personnel; sin FK dura porque algunas orgs
  -- registran gente que todavía no está en la nómina formal.
  person_id         UUID,
  person_name       TEXT NOT NULL,
  person_position   TEXT,

  session_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Tipo de instancia: inducción a un ingresante, refuerzo anual, o
  -- re-inducción tras un cambio relevante en política/objetivos.
  session_type      TEXT NOT NULL DEFAULT 'induction' CHECK (session_type IN (
                      'induction',      -- ingreso de personal nuevo
                      'annual_refresh', -- refuerzo periódico
                      'policy_change',  -- cambió la política u objetivos
                      'post_nc',        -- tras una no conformidad
                      'other'
                    )),

  -- Los 4 puntos que exige textualmente la cláusula 7.3. Cada uno se marca
  -- cuando se cubrió y el trabajador lo confirmó. El auditor los busca uno
  -- por uno, por eso van como columnas y no como texto libre.
  covered_policy       BOOLEAN NOT NULL DEFAULT false,
  covered_objectives   BOOLEAN NOT NULL DEFAULT false,
  covered_contribution BOOLEAN NOT NULL DEFAULT false,
  covered_implications BOOLEAN NOT NULL DEFAULT false,

  -- Verificación de que realmente entendió, no solo que asistió.
  comprehension_verified BOOLEAN NOT NULL DEFAULT false,
  verification_method  TEXT,     -- 'entrevista' | 'cuestionario' | 'observación'
  quiz_score           SMALLINT CHECK (quiz_score BETWEEN 0 AND 100),

  delivered_by      TEXT,       -- quién dio la inducción
  -- Constancia de aceptación. Al confirmar en la app queda el hash + fecha.
  acknowledged_at   TIMESTAMPTZ,
  acknowledgment_hash TEXT,

  evidence_url      TEXT,       -- acta firmada escaneada, si la hay
  notes             TEXT,
  next_refresh_date DATE,

  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ar_org_date
  ON awareness_records(org_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_ar_person
  ON awareness_records(person_id) WHERE person_id IS NOT NULL;

ALTER TABLE awareness_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ar_select ON awareness_records;
CREATE POLICY ar_select ON awareness_records FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );

DROP POLICY IF EXISTS ar_insert ON awareness_records;
CREATE POLICY ar_insert ON awareness_records FOR INSERT
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS ar_update ON awareness_records;
CREATE POLICY ar_update ON awareness_records FOR UPDATE
  USING (org_id = auth_org_id()) WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS ar_delete ON awareness_records;
CREATE POLICY ar_delete ON awareness_records FOR DELETE
  USING (org_id = auth_org_id());


-- =============================================================================
-- GAP 5 — 7.1.6 CONOCIMIENTOS DE LA ORGANIZACIÓN
--
-- Requisito nuevo de la versión 2015. "La organización debe determinar los
-- conocimientos necesarios para la operación de sus procesos... mantenerlos
-- y ponerlos a disposición."
--
-- El riesgo que la norma quiere cubrir: el know-how que vive solo en la
-- cabeza de una persona. Si esa persona se va, el proceso se cae. Por eso
-- las columnas de retención (holder + riesgo de pérdida + plan de respaldo).
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizational_knowledge (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  title            TEXT NOT NULL,
  description      TEXT,

  knowledge_type   TEXT NOT NULL DEFAULT 'technical' CHECK (knowledge_type IN (
                     'technical',      -- know-how técnico del proceso
                     'regulatory',     -- normativa aplicable
                     'customer',       -- particularidades de clientes clave
                     'supplier',       -- know-how de proveedores
                     'lesson_learned', -- lección aprendida de un problema
                     'best_practice',  -- buena práctica interna
                     'institutional'   -- histórico / cultura organizacional
                   )),

  -- De dónde viene: interna (experiencia propia) o externa (norma, curso,
  -- consultor). La norma pide distinguirlo explícitamente.
  source           TEXT NOT NULL DEFAULT 'internal'
                     CHECK (source IN ('internal', 'external')),
  source_detail    TEXT,

  used_in_process  TEXT,
  -- Quién lo tiene hoy. Aquí está el riesgo si es una sola persona.
  knowledge_holder TEXT,
  -- Riesgo de que el conocimiento se pierda (persona única, sin documentar).
  loss_risk        TEXT NOT NULL DEFAULT 'medium'
                     CHECK (loss_risk IN ('low', 'medium', 'high', 'critical')),
  -- Cómo se está resguardando: documentado, backup de persona, capacitación.
  retention_method TEXT,
  backup_holder    TEXT,

  -- Cómo se pone a disposición de quien lo necesita.
  availability     TEXT,
  document_id      UUID,      -- si está formalizado en Documentos (7.5)
  evidence_url     TEXT,

  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'obsolete', 'in_transfer')),
  last_review_date DATE,
  next_review_date DATE,
  notes            TEXT,

  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ok_org_status
  ON organizational_knowledge(org_id, status);
CREATE INDEX IF NOT EXISTS idx_ok_org_risk
  ON organizational_knowledge(org_id, loss_risk);

ALTER TABLE organizational_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ok_select ON organizational_knowledge;
CREATE POLICY ok_select ON organizational_knowledge FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );

DROP POLICY IF EXISTS ok_insert ON organizational_knowledge;
CREATE POLICY ok_insert ON organizational_knowledge FOR INSERT
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS ok_update ON organizational_knowledge;
CREATE POLICY ok_update ON organizational_knowledge FOR UPDATE
  USING (org_id = auth_org_id()) WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS ok_delete ON organizational_knowledge;
CREATE POLICY ok_delete ON organizational_knowledge FOR DELETE
  USING (org_id = auth_org_id());


-- =============================================================================
-- GAP 6 — 9.1.3 ANÁLISIS Y EVALUACIÓN
--
-- "La organización debe analizar y evaluar los datos y la información
-- apropiados que surgen del seguimiento y la medición."
--
-- El Dashboard muestra números en vivo, pero la norma pide el ANÁLISIS: qué
-- conclusión sacó la organización de esos números, en un registro fechado que
-- alimenta la revisión por la dirección (9.3). Esta tabla guarda ese informe
-- periódico con conclusiones y recomendaciones.
-- =============================================================================

CREATE TABLE IF NOT EXISTS data_analysis_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  title             TEXT NOT NULL,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,

  -- Los 6 ejes que la cláusula 9.1.3 pide analizar, uno por columna para que
  -- el auditor pueda ir directo al que le interesa.
  analysis_conformity     TEXT,  -- a) conformidad de productos y servicios
  analysis_satisfaction   TEXT,  -- b) grado de satisfacción del cliente
  analysis_qms_performance TEXT, -- c) desempeño y eficacia del SGC
  analysis_planning       TEXT,  -- d) eficacia de lo planificado
  analysis_risks          TEXT,  -- e) eficacia de acciones sobre riesgos
  analysis_suppliers      TEXT,  -- f) desempeño de proveedores externos
  analysis_improvement    TEXT,  -- necesidad de mejoras en el SGC

  -- Snapshot de los indicadores al momento del análisis. Congela los números
  -- para que el informe siga siendo verificable aunque los datos cambien.
  metrics_snapshot  JSONB,

  conclusions       TEXT,
  recommendations   TEXT,

  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'in_review', 'approved', 'archived')),

  prepared_by       TEXT,
  reviewed_by       TEXT,
  approved_by       TEXT,
  approved_date     DATE,

  -- Link a la revisión por dirección que consumió este informe (9.3).
  management_review_id UUID,

  evidence_url      TEXT,
  notes             TEXT,

  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dar_org_period
  ON data_analysis_reports(org_id, period_end DESC);

ALTER TABLE data_analysis_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dar_select ON data_analysis_reports;
CREATE POLICY dar_select ON data_analysis_reports FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );

DROP POLICY IF EXISTS dar_insert ON data_analysis_reports;
CREATE POLICY dar_insert ON data_analysis_reports FOR INSERT
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS dar_update ON data_analysis_reports;
CREATE POLICY dar_update ON data_analysis_reports FOR UPDATE
  USING (org_id = auth_org_id()) WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS dar_delete ON data_analysis_reports;
CREATE POLICY dar_delete ON data_analysis_reports FOR DELETE
  USING (org_id = auth_org_id());


-- =============================================================================
-- Vistas de apoyo para los dashboards
-- =============================================================================

-- KPIs de satisfacción del cliente de los últimos 12 meses.
-- El NPS se calcula acá y no en el frontend para que sea el mismo número en
-- el módulo, en el informe 9.1.3 y en la revisión por dirección.
CREATE OR REPLACE VIEW customer_satisfaction_kpis AS
SELECT
  org_id,
  COUNT(*)                                            AS total_responses,
  ROUND(AVG(overall_score), 2)                        AS avg_overall,
  ROUND(AVG(score_quality), 2)                        AS avg_quality,
  ROUND(AVG(score_delivery), 2)                       AS avg_delivery,
  ROUND(AVG(score_communication), 2)                  AS avg_communication,
  ROUND(AVG(score_value), 2)                          AS avg_value,
  ROUND(AVG(score_responsiveness), 2)                 AS avg_responsiveness,
  ROUND(AVG(score_technical), 2)                      AS avg_technical,
  COUNT(*) FILTER (WHERE nps_score >= 9)              AS promoters,
  COUNT(*) FILTER (WHERE nps_score BETWEEN 7 AND 8)   AS passives,
  COUNT(*) FILTER (WHERE nps_score <= 6
                     AND nps_score IS NOT NULL)       AS detractors,
  CASE WHEN COUNT(*) FILTER (WHERE nps_score IS NOT NULL) > 0
       THEN ROUND(
         (COUNT(*) FILTER (WHERE nps_score >= 9)::numeric
          - COUNT(*) FILTER (WHERE nps_score <= 6 AND nps_score IS NOT NULL)::numeric)
         * 100.0 / COUNT(*) FILTER (WHERE nps_score IS NOT NULL), 1)
       ELSE NULL
  END                                                 AS nps
FROM customer_satisfaction_surveys
WHERE survey_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY org_id;

-- Estado de quejas: cuántas abiertas, vencidas y tiempo medio de cierre.
-- "Vencida" = más de 30 días sin cerrar, umbral típico de compromiso al cliente.
CREATE OR REPLACE VIEW customer_feedback_kpis AS
SELECT
  org_id,
  COUNT(*)                                                   AS total,
  COUNT(*) FILTER (WHERE status IN ('received','in_analysis')) AS open_count,
  COUNT(*) FILTER (WHERE status = 'closed')                  AS closed_count,
  COUNT(*) FILTER (WHERE status = 'escalated')               AS escalated_count,
  COUNT(*) FILTER (WHERE feedback_type = 'complaint')        AS complaints,
  COUNT(*) FILTER (WHERE severity IN ('high','critical')
                     AND status <> 'closed')                 AS critical_open,
  COUNT(*) FILTER (WHERE status <> 'closed'
                     AND received_date < CURRENT_DATE - 30)  AS overdue,
  ROUND(AVG(closed_date - received_date) FILTER (
    WHERE closed_date IS NOT NULL), 1)                       AS avg_days_to_close
FROM customer_feedback
GROUP BY org_id;

-- Salud de la infraestructura: activos por estado y mantenimientos vencidos.
CREATE OR REPLACE VIEW infrastructure_kpis AS
SELECT
  org_id,
  COUNT(*)                                                     AS total_assets,
  COUNT(*) FILTER (WHERE status = 'operational')               AS operational,
  COUNT(*) FILTER (WHERE status = 'faulty')                    AS faulty,
  COUNT(*) FILTER (WHERE status = 'maintenance')               AS in_maintenance,
  COUNT(*) FILTER (WHERE criticality IN ('high','critical'))   AS critical_assets,
  COUNT(*) FILTER (WHERE next_maintenance_date IS NOT NULL
                     AND next_maintenance_date < CURRENT_DATE) AS maintenance_overdue,
  COUNT(*) FILTER (WHERE next_maintenance_date IS NOT NULL
                     AND next_maintenance_date
                         BETWEEN CURRENT_DATE AND CURRENT_DATE + 30) AS maintenance_due_30d
FROM infrastructure_assets
WHERE status <> 'retired'
GROUP BY org_id;


-- =============================================================================
-- Documentación de tablas
-- =============================================================================

COMMENT ON TABLE customer_satisfaction_surveys IS
  'ISO 9001:2015 cláusula 9.1.2 — Satisfacción del cliente. 6 dimensiones 1-5
   + NPS 0-10. Acepta carga manual, invitación por email o link público anónimo.';

COMMENT ON TABLE customer_feedback IS
  'ISO 9001:2015 cláusula 8.2.1 — Comunicación con el cliente. Registro de
   quejas, consultas, sugerencias y felicitaciones con flujo de cierre y
   escalamiento a no conformidad (10.2) cuando corresponde.';

COMMENT ON TABLE infrastructure_assets IS
  'ISO 9001:2015 cláusula 7.1.3 — Infraestructura. Edificios, equipos, TIC y
   servicios de apoyo con plan de mantenimiento. Distinto de
   equipment_calibration (7.1.5) que cubre solo equipos de medición.';

COMMENT ON TABLE maintenance_records IS
  'Historial de mantenimientos por activo. Evidencia para auditoría de que el
   plan preventivo de 7.1.3 se ejecuta realmente.';

COMMENT ON TABLE awareness_records IS
  'ISO 9001:2015 cláusula 7.3 — Toma de conciencia. Registra los 4 puntos que
   exige la norma (política, objetivos, contribución, implicaciones) con
   verificación de comprensión y constancia de aceptación.';

COMMENT ON TABLE organizational_knowledge IS
  'ISO 9001:2015 cláusula 7.1.6 — Conocimientos de la organización. Mapea el
   know-how crítico, quién lo tiene y el riesgo de perderlo si esa persona sale.';

COMMENT ON TABLE data_analysis_reports IS
  'ISO 9001:2015 cláusula 9.1.3 — Análisis y evaluación. Informe periódico con
   los 6 ejes que pide la norma + snapshot de indicadores. Alimenta la revisión
   por la dirección (9.3).';

COMMIT;

-- Refrescar el cache de PostgREST para que el API exponga las tablas nuevas
-- inmediatamente en vez de esperar el reload automático.
NOTIFY pgrst, 'reload schema';
