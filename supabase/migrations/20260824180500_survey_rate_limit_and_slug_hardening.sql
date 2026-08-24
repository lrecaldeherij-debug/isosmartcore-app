-- =============================================================================
-- Rate limit + slug hardening para encuestas públicas por QR.
--
-- Contexto (auditoría 21-ago-2026):
--   1. Slugs actuales = base_name + 4 chars random (36^4 = 1.6M combinaciones).
--      Un atacante que sepa el patrón "clima-q3-YYYY-XXXX" enumera en pocas
--      horas y encuentra campañas activas. Bajo, pero real.
--   2. submit_public_survey_response NO tiene rate limit. Un cliente puede
--      inundar la campaña con miles de respuestas anónimas usando fingerprints
--      distintos (fáciles de rotar en headless), envenenando el análisis y
--      llenando climate_surveys de basura.
--   3. get_public_survey_by_slug tampoco limita enumeration attempts — con
--      slugs de 4 chars random se puede scan.
--
-- Fixes:
--   A. Rate limit por campaña: max 500 respuestas exitosas por hora. Freno
--      duro, retorna 'rate_limit_exceeded'. Umbral generoso para PyMEs (≤500
--      empleados es lo típico); si se supera, algo raro pasa.
--   B. Constraint en public_slug: length >= 8 (rechaza slugs antiguos cortos
--      si alguien intenta reusarlos vía cliente hackeado). Slugs nuevos ya
--      son ≥12 desde el frontend.
--   C. Índice funcional para lookup rápido del contador horario.
-- =============================================================================

BEGIN;

-- ─── A. Rate limit en submit_public_survey_response ───────────────────────
CREATE OR REPLACE FUNCTION submit_public_survey_response(
  p_slug        TEXT,
  p_responses   JSONB,
  p_fingerprint TEXT DEFAULT NULL,
  p_notes       TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_camp       RECORD;
  v_total      NUMERIC := 0;
  v_key        TEXT;
  v_val        JSONB;
  v_survey_id  UUID;
  v_dup_count  INT;
  v_hour_count INT;
  -- Cap por hora — protege contra floods automatizados con fingerprints rotativos.
  -- 500 es holgado para PyMEs (≤500 empleados). Si legítimamente hay más, dividir
  -- en múltiples campañas.
  v_hour_cap   CONSTANT INT := 500;
BEGIN
  SELECT * INTO v_camp
  FROM survey_campaigns
  WHERE public_slug = p_slug AND is_public = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'campaign_not_found');
  END IF;

  IF v_camp.status <> 'active' THEN
    RETURN jsonb_build_object('error', 'campaign_closed');
  END IF;

  IF v_camp.expires_at IS NOT NULL AND v_camp.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'campaign_expired');
  END IF;

  -- Rate limit por campaña (antes del dedup por fingerprint, para que un
  -- attacker con fingerprints rotativos también choque contra este freno).
  SELECT COUNT(*) INTO v_hour_count
  FROM climate_surveys
  WHERE campaign_id = v_camp.id
    AND created_at > now() - interval '1 hour';
  IF v_hour_count >= v_hour_cap THEN
    RAISE WARNING 'submit_public_survey_response: cap horario alcanzado campaign=% count=%',
      v_camp.id, v_hour_count;
    RETURN jsonb_build_object('error', 'rate_limit_exceeded');
  END IF;

  -- Anti doble-respuesta simple: si viene fingerprint y ya hay uno igual
  -- para esta campaña, rechazar. No es infalible (se puede limpiar navegador
  -- o cambiar de dispositivo), pero corta el 90% de casos.
  IF p_fingerprint IS NOT NULL AND length(p_fingerprint) > 0 THEN
    SELECT COUNT(*) INTO v_dup_count
    FROM climate_surveys
    WHERE campaign_id = v_camp.id AND respondent_fingerprint = p_fingerprint;
    IF v_dup_count > 0 THEN
      RETURN jsonb_build_object('error', 'already_responded');
    END IF;
  END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_responses)
  LOOP
    v_total := v_total + COALESCE(NULLIF(v_val::text, 'null')::numeric, 0);
  END LOOP;

  INSERT INTO climate_surveys (
    org_id, employee_id, campaign_id, is_anonymous,
    respondent_fingerprint, responses_json, total_score, survey_date, notes
  ) VALUES (
    v_camp.org_id, NULL, v_camp.id, true,
    p_fingerprint, p_responses, v_total, CURRENT_DATE, p_notes
  ) RETURNING id INTO v_survey_id;

  UPDATE survey_campaigns
  SET anonymous_count = anonymous_count + 1
  WHERE id = v_camp.id;

  RETURN jsonb_build_object('ok', true, 'survey_id', v_survey_id);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_public_survey_response(TEXT, JSONB, TEXT, TEXT) TO anon, authenticated;

-- ─── B. Constraint de longitud mínima en public_slug ──────────────────────
-- Nuevos slugs desde el frontend son ≥ 12 chars random hex + base name.
-- Este constraint rechaza inserts con slugs cortos (patrones antiguos o
-- clientes manipulados).
DO $$
BEGIN
  ALTER TABLE survey_campaigns DROP CONSTRAINT IF EXISTS survey_campaigns_public_slug_length;
  ALTER TABLE survey_campaigns ADD CONSTRAINT survey_campaigns_public_slug_length
    CHECK (public_slug IS NULL OR length(public_slug) >= 8);
END $$;

-- ─── C. Índice para el count horario del rate limit ───────────────────────
-- Sin este índice, el COUNT(*) del rate check hace seq scan a climate_surveys.
CREATE INDEX IF NOT EXISTS idx_climate_surveys_campaign_created
  ON climate_surveys(campaign_id, created_at DESC)
  WHERE campaign_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.survey_campaigns'::regclass
  AND conname = 'survey_campaigns_public_slug_length';
