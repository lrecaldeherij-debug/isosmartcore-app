-- =============================================================================
-- v30 — Campañas de encuestas distribuidas
--
-- Permite seleccionar empleados, enviarles un email con un link único (token)
-- y que respondan SIN necesidad de cuenta en el SaaS. Al enviar la respuesta,
-- se crea automáticamente la fila en climate_surveys.
--
-- Tablas:
--   survey_campaigns    — el "ciclo" (ej: "Clima Q2 2026")
--   survey_invitations  — una por persona invitada, con token único
--
-- RPCs públicas (SECURITY DEFINER, llamables por anon):
--   get_survey_invitation(token)            — valida token y devuelve datos
--   submit_survey_response(token, json, notes) — registra la respuesta
-- =============================================================================

-- 1. Campañas
CREATE TABLE IF NOT EXISTS survey_campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  survey_type  TEXT NOT NULL DEFAULT 'climate',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  expires_at   TIMESTAMPTZ,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_campaigns_org ON survey_campaigns(org_id);

ALTER TABLE survey_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sc_select" ON survey_campaigns;
CREATE POLICY "sc_select" ON survey_campaigns FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "sc_insert" ON survey_campaigns;
CREATE POLICY "sc_insert" ON survey_campaigns FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "sc_update" ON survey_campaigns;
CREATE POLICY "sc_update" ON survey_campaigns FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "sc_delete" ON survey_campaigns;
CREATE POLICY "sc_delete" ON survey_campaigns FOR DELETE USING (org_id = auth_org_id());


-- 2. Invitaciones (una por persona)
CREATE TABLE IF NOT EXISTS survey_invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id   UUID NOT NULL REFERENCES survey_campaigns(id) ON DELETE CASCADE,
  person_id     UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  token         TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','opened','completed','failed')),
  sent_at       TIMESTAMPTZ,
  opened_at     TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  survey_id     UUID REFERENCES climate_surveys(id) ON DELETE SET NULL,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_survey_invitations_campaign ON survey_invitations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_survey_invitations_token    ON survey_invitations(token);
CREATE INDEX IF NOT EXISTS idx_survey_invitations_org      ON survey_invitations(org_id);

ALTER TABLE survey_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "si_select" ON survey_invitations;
CREATE POLICY "si_select" ON survey_invitations FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "si_insert" ON survey_invitations;
CREATE POLICY "si_insert" ON survey_invitations FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "si_update" ON survey_invitations;
CREATE POLICY "si_update" ON survey_invitations FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "si_delete" ON survey_invitations;
CREATE POLICY "si_delete" ON survey_invitations FOR DELETE USING (org_id = auth_org_id());


-- 3. RPC pública: validar token y devolver datos para el formulario
CREATE OR REPLACE FUNCTION get_survey_invitation(p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv  RECORD;
  v_person_name TEXT;
  v_camp RECORD;
BEGIN
  SELECT * INTO v_inv FROM survey_invitations WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invitation_not_found');
  END IF;

  IF v_inv.status = 'completed' THEN
    RETURN jsonb_build_object('error', 'already_completed');
  END IF;

  IF v_inv.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  SELECT full_name INTO v_person_name FROM personnel WHERE id = v_inv.person_id;
  SELECT name, description, survey_type INTO v_camp FROM survey_campaigns WHERE id = v_inv.campaign_id;

  -- Marcar como abierta si todavía no lo estaba
  IF v_inv.status IN ('pending','sent') THEN
    UPDATE survey_invitations
    SET status = 'opened', opened_at = COALESCE(opened_at, now())
    WHERE id = v_inv.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'invitation_id', v_inv.id,
    'campaign_id',   v_inv.campaign_id,
    'campaign_name', v_camp.name,
    'campaign_description', v_camp.description,
    'survey_type',   v_camp.survey_type,
    'person_name',   v_person_name,
    'expires_at',    v_inv.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_survey_invitation(TEXT) TO anon, authenticated;


-- 4. RPC pública: guardar la respuesta
CREATE OR REPLACE FUNCTION submit_survey_response(
  p_token     TEXT,
  p_responses JSONB,
  p_notes     TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv       RECORD;
  v_total     NUMERIC := 0;
  v_key       TEXT;
  v_val       JSONB;
  v_survey_id UUID;
BEGIN
  SELECT * INTO v_inv FROM survey_invitations WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invitation_not_found');
  END IF;

  IF v_inv.status = 'completed' THEN
    RETURN jsonb_build_object('error', 'already_completed');
  END IF;

  IF v_inv.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  -- Sumar el total de los valores numéricos
  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_responses)
  LOOP
    v_total := v_total + COALESCE(NULLIF(v_val::text, 'null')::numeric, 0);
  END LOOP;

  -- Crear la encuesta en climate_surveys (bypass RLS porque SECURITY DEFINER)
  INSERT INTO climate_surveys (org_id, employee_id, responses_json, total_score, survey_date, notes)
  VALUES (v_inv.org_id, v_inv.person_id, p_responses, v_total, CURRENT_DATE, p_notes)
  RETURNING id INTO v_survey_id;

  -- Cerrar la invitación
  UPDATE survey_invitations
  SET status = 'completed',
      completed_at = now(),
      survey_id = v_survey_id
  WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'survey_id', v_survey_id);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_survey_response(TEXT, JSONB, TEXT) TO anon, authenticated;
