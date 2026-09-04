-- =============================================================================
-- Anti-enumeration: unificar errores de get_public_survey_by_slug y
-- get_survey_invitation
--
-- Cierra finding #45 del audit: "get_survey_invitation +
-- get_public_survey_by_slug devuelven 3 errores diferenciados".
--
-- Un atacante con acceso solo a las RPCs publicas puede enumerar el espacio
-- de slugs/tokens para descubrir cuales existen: si ve 'campaign_not_found'
-- descarta ese slug; si ve 'campaign_closed' sabe que existe (uno valido).
-- Combinado con el sufijo corto (36^4 = 1.6M por nombre-base), 15 rq/s
-- durante 30 hs alcanzaba a scrapear un espacio completo.
--
-- Fix: los errores que revelan existencia (not_found, closed, expired) se
-- unifican en un solo codigo generico. Los errores que YA requieren
-- conocimiento del token/slug real (already_completed = usuario ya llenó)
-- se mantienen porque el atacante ya tuvo acceso a un token valido para
-- llegar hasta ahí, y son informacion util UX.
-- =============================================================================

-- ─── 1. get_public_survey_by_slug ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_public_survey_by_slug(p_slug TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_camp RECORD;
BEGIN
  SELECT * INTO v_camp
  FROM survey_campaigns
  WHERE public_slug = p_slug AND is_public = true;

  -- Fusion: not_found + inactiva + expirada → un solo error opaco.
  -- El frontend muestra un mensaje generico "link no disponible".
  IF NOT FOUND
     OR v_camp.status <> 'active'
     OR (v_camp.expires_at IS NOT NULL AND v_camp.expires_at < now()) THEN
    RETURN jsonb_build_object('error', 'campaign_unavailable');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id',          v_camp.id,
    'campaign_name',        v_camp.name,
    'campaign_description', v_camp.description,
    'survey_type',          v_camp.survey_type,
    'expires_at',           v_camp.expires_at
  );
END;
$$;

-- ─── 2. get_survey_invitation ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_survey_invitation(p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv         RECORD;
  v_person_name TEXT;
  v_camp        RECORD;
BEGIN
  SELECT * INTO v_inv FROM survey_invitations WHERE token = p_token;

  -- Fusion: not_found + expired → error opaco. El atacante que scrappea el
  -- espacio de tokens ve el mismo error en cualquier token invalido o vencido.
  IF NOT FOUND OR v_inv.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'invitation_unavailable');
  END IF;

  -- already_completed queda distinto — este error solo lo ve alguien con un
  -- token real que YA usó, no ayuda a enumerar.
  IF v_inv.status = 'completed' THEN
    RETURN jsonb_build_object('error', 'already_completed');
  END IF;

  SELECT full_name INTO v_person_name FROM personnel WHERE id = v_inv.person_id;
  SELECT name, description, survey_type INTO v_camp FROM survey_campaigns WHERE id = v_inv.campaign_id;

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

-- ─── 3. submit_public_survey_response — mismo tratamiento ────────────────────
-- La otra RPC pública también leaks estado. Buscamos el proc actual y
-- reemplazamos solo la parte de deteccion.
CREATE OR REPLACE FUNCTION submit_public_survey_response(
  p_slug        TEXT,
  p_responses   JSONB,
  p_fingerprint TEXT DEFAULT NULL,
  p_notes       TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_camp      RECORD;
  v_total     NUMERIC := 0;
  v_key       TEXT;
  v_val       JSONB;
  v_survey_id UUID;
  v_dup_count INT;
  v_recent_count INT;
BEGIN
  SELECT * INTO v_camp
  FROM survey_campaigns
  WHERE public_slug = p_slug AND is_public = true;

  -- Mismo fusion que get_public_survey_by_slug
  IF NOT FOUND
     OR v_camp.status <> 'active'
     OR (v_camp.expires_at IS NOT NULL AND v_camp.expires_at < now()) THEN
    RETURN jsonb_build_object('error', 'campaign_unavailable');
  END IF;

  -- Rate limit: max 500 responses/hour por campaña (finding #12).
  SELECT COUNT(*) INTO v_recent_count
  FROM climate_surveys
  WHERE campaign_id = v_camp.id
    AND created_at > now() - interval '1 hour';
  IF v_recent_count >= 500 THEN
    RETURN jsonb_build_object('error', 'rate_limited');
  END IF;

  -- Anti doble-respuesta por fingerprint
  IF p_fingerprint IS NOT NULL AND length(p_fingerprint) > 0 THEN
    SELECT COUNT(*) INTO v_dup_count
    FROM climate_surveys
    WHERE campaign_id = v_camp.id AND respondent_fingerprint = p_fingerprint;
    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('error', 'already_responded');
    END IF;
  END IF;

  -- Sumar total numérico
  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_responses)
  LOOP
    v_total := v_total + COALESCE(NULLIF(v_val::text, 'null')::numeric, 0);
  END LOOP;

  -- Insertar respuesta anónima
  INSERT INTO climate_surveys (
    org_id, employee_id, survey_type, campaign_id,
    is_anonymous, respondent_fingerprint,
    responses, total_score, respondent_notes, survey_date
  ) VALUES (
    v_camp.org_id, NULL, v_camp.survey_type, v_camp.id,
    true, p_fingerprint,
    p_responses, v_total, p_notes, CURRENT_DATE
  ) RETURNING id INTO v_survey_id;

  RETURN jsonb_build_object('ok', true, 'survey_id', v_survey_id);
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_survey_by_slug(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_survey_invitation(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_public_survey_response(TEXT, JSONB, TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION get_public_survey_by_slug(TEXT) IS
  'Anti-enum: campaign_not_found + campaign_closed + campaign_expired fusionados
   en campaign_unavailable. Frontend debe manejar solo campaign_unavailable
   (mensaje generico) y ok:true.';

COMMENT ON FUNCTION get_survey_invitation(TEXT) IS
  'Anti-enum: invitation_not_found + expired fusionados en invitation_unavailable.
   already_completed se mantiene porque solo lo ve alguien con token real usado.';
