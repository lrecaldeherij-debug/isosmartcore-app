-- =============================================================================
-- Campañas de encuesta públicas (QR + link para todos).
--
-- Extiende survey_campaigns con:
--   - public_slug TEXT UNIQUE  → parte de la URL /e/<slug>
--   - is_public   BOOLEAN      → si acepta respuestas anónimas
--   - anonymous_count INT      → contador denormalizado (ver dashboard sin
--                                COUNT(*) cada refresh)
--
-- Extiende climate_surveys para aceptar respuestas anónimas:
--   - employee_id ahora NULLABLE (en el modelo por token era NOT NULL porque
--     cada respuesta identificaba al respondiente por persona)
--   - campaign_id UUID          → link a la campaña que la generó
--   - is_anonymous BOOLEAN      → flag explícito de origen anónimo
--   - respondent_fingerprint TEXT → hash del dispositivo/navegador para
--     evitar la MISMA persona respondiendo múltiples veces desde el mismo
--     celular. No identifica a la persona, solo al dispositivo.
--
-- Dos RPCs públicas (SECURITY DEFINER, GRANT anon):
--   - get_public_survey_by_slug(slug)          → obtiene campaña + estado
--   - submit_public_survey_response(slug, responses, fingerprint, notes)
--     → inserta la respuesta sin autenticación
--
-- Seguridad:
--   - SECURITY DEFINER hace bypass de RLS. El acceso solo pega en la campaña
--     que matchee el slug + is_public=true + status='active' + no expirada
--   - El fingerprint es opcional pero recomendado: si se pasa, la 2da
--     respuesta desde el mismo dispositivo se rechaza con 'already_responded'
-- =============================================================================

BEGIN;

-- 1. Extender survey_campaigns
ALTER TABLE survey_campaigns ADD COLUMN IF NOT EXISTS public_slug     TEXT UNIQUE;
ALTER TABLE survey_campaigns ADD COLUMN IF NOT EXISTS is_public       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE survey_campaigns ADD COLUMN IF NOT EXISTS anonymous_count INT     NOT NULL DEFAULT 0;

-- Índice para búsqueda por slug (queries frecuentes)
CREATE INDEX IF NOT EXISTS idx_survey_campaigns_slug ON survey_campaigns(public_slug)
  WHERE public_slug IS NOT NULL;

-- 2. Extender climate_surveys para respuestas anónimas
ALTER TABLE climate_surveys ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE climate_surveys ADD COLUMN IF NOT EXISTS campaign_id            UUID REFERENCES survey_campaigns(id) ON DELETE SET NULL;
ALTER TABLE climate_surveys ADD COLUMN IF NOT EXISTS is_anonymous           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE climate_surveys ADD COLUMN IF NOT EXISTS respondent_fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_climate_surveys_campaign ON climate_surveys(campaign_id)
  WHERE campaign_id IS NOT NULL;

-- 3. RPC pública: leer datos de la campaña por slug
CREATE OR REPLACE FUNCTION get_public_survey_by_slug(p_slug TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_camp RECORD;
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

GRANT EXECUTE ON FUNCTION get_public_survey_by_slug(TEXT) TO anon, authenticated;

-- 4. RPC pública: guardar respuesta anónima
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
  v_camp      RECORD;
  v_total     NUMERIC := 0;
  v_key       TEXT;
  v_val       JSONB;
  v_survey_id UUID;
  v_dup_count INT;
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

  -- Sumar total numérico
  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_responses)
  LOOP
    v_total := v_total + COALESCE(NULLIF(v_val::text, 'null')::numeric, 0);
  END LOOP;

  -- Insertar respuesta anónima (employee_id NULL, campaign_id apuntando a
  -- la campaña, flag is_anonymous=true, fingerprint del dispositivo)
  INSERT INTO climate_surveys (
    org_id, employee_id, campaign_id, is_anonymous,
    respondent_fingerprint, responses_json, total_score, survey_date, notes
  ) VALUES (
    v_camp.org_id, NULL, v_camp.id, true,
    p_fingerprint, p_responses, v_total, CURRENT_DATE, p_notes
  ) RETURNING id INTO v_survey_id;

  -- Contador denormalizado
  UPDATE survey_campaigns
  SET anonymous_count = anonymous_count + 1
  WHERE id = v_camp.id;

  RETURN jsonb_build_object('ok', true, 'survey_id', v_survey_id);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_public_survey_response(TEXT, JSONB, TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación
SELECT
  column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'survey_campaigns'
  AND column_name IN ('public_slug', 'is_public', 'anonymous_count')
ORDER BY column_name;
