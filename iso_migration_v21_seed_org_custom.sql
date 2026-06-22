-- =============================================================================
-- v21 — Siembra personalizada con data generada por IA desde el ADN de la empresa.
--
-- A diferencia de seed_organization (v19) que tiene los textos hardcodeados,
-- esta función RECIBE la data ya personalizada desde el frontend (que la generó
-- llamando a Gemini con el perfil de la empresa como contexto).
--
-- El frontend arma este JSON:
--   {
--     "context":     [ {type,category,factor,description,strategy}, ... ],
--     "stakeholders":[ {name,expectations,influence_level,...}, ... ],
--     "policy":      { what_we_do, who_is_customer, ... },
--     "risks":       [ {process_area,risk_description,...}, ... ]
--   }
--
-- Reglas:
--   - Solo siembra módulos que estén VACÍOS para esa org (no pisa data existente).
--   - Si el JSON no incluye un módulo (p.ej. solo manda "policy"), los demás no se tocan.
--   - Validación de owner como en seed_organization.
-- =============================================================================

CREATE OR REPLACE FUNCTION seed_org_custom(target_org_id UUID, custom_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role org_role;
  v_caller_org UUID;
  v_inserted JSONB := '{}'::jsonb;
  v_count INT;
  v_item JSONB;
BEGIN
  SELECT org_id, role INTO v_caller_org, v_caller_role
  FROM user_profiles WHERE user_id = auth.uid();

  IF v_caller_org IS NULL OR v_caller_org <> target_org_id THEN
    RAISE EXCEPTION 'No tienes acceso a esta organización';
  END IF;

  IF v_caller_role <> 'owner'::org_role THEN
    RAISE EXCEPTION 'Solo el owner puede cargar plantillas';
  END IF;

  -- 4.1 CONTEXTO (FODA)
  SELECT COUNT(*) INTO v_count FROM context_analysis WHERE org_id = target_org_id;
  IF v_count = 0 AND custom_data ? 'context' AND jsonb_typeof(custom_data->'context') = 'array' THEN
    FOR v_item IN SELECT jsonb_array_elements(custom_data->'context') LOOP
      INSERT INTO context_analysis (org_id, type, category, factor, description, strategy) VALUES (
        target_org_id,
        COALESCE(v_item->>'type', 'Interno'),
        COALESCE(v_item->>'category', 'Fortaleza'),
        COALESCE(v_item->>'factor', '[Sin factor]'),
        v_item->>'description',
        v_item->>'strategy'
      );
    END LOOP;
    v_inserted := jsonb_set(v_inserted, '{context}', to_jsonb(jsonb_array_length(custom_data->'context')));
  END IF;

  -- 4.2 STAKEHOLDERS
  SELECT COUNT(*) INTO v_count FROM stakeholders WHERE org_id = target_org_id;
  IF v_count = 0 AND custom_data ? 'stakeholders' AND jsonb_typeof(custom_data->'stakeholders') = 'array' THEN
    FOR v_item IN SELECT jsonb_array_elements(custom_data->'stakeholders') LOOP
      INSERT INTO stakeholders (
        org_id, name, expectations, influence_level, is_sgc_requirement,
        follow_up_frequency, planning_in_sgc, evaluation_method, responsible, status
      ) VALUES (
        target_org_id,
        COALESCE(v_item->>'name', '[Sin nombre]'),
        v_item->>'expectations',
        COALESCE(v_item->>'influence_level', 'Medio'),
        COALESCE((v_item->>'is_sgc_requirement')::boolean, true),
        COALESCE(v_item->>'follow_up_frequency', 'Trimestral'),
        v_item->>'planning_in_sgc',
        v_item->>'evaluation_method',
        v_item->>'responsible',
        COALESCE(v_item->>'status', 'Pendiente')
      );
    END LOOP;
    v_inserted := jsonb_set(v_inserted, '{stakeholders}', to_jsonb(jsonb_array_length(custom_data->'stakeholders')));
  END IF;

  -- 5.2 POLÍTICA (singleton)
  SELECT COUNT(*) INTO v_count FROM quality_policy WHERE org_id = target_org_id;
  IF v_count = 0 AND custom_data ? 'policy' AND jsonb_typeof(custom_data->'policy') = 'object' THEN
    INSERT INTO quality_policy (
      org_id, what_we_do, who_is_customer, value_proposition, commitments, final_policy_statement
    ) VALUES (
      target_org_id,
      COALESCE(custom_data->'policy'->>'what_we_do',          '[Completar]'),
      COALESCE(custom_data->'policy'->>'who_is_customer',     '[Completar]'),
      COALESCE(custom_data->'policy'->>'value_proposition',   '[Completar]'),
      COALESCE(custom_data->'policy'->>'commitments',         '[Completar]'),
      COALESCE(custom_data->'policy'->>'final_policy_statement', '[Completar]')
    );
    v_inserted := jsonb_set(v_inserted, '{policy}', '1');
  END IF;

  -- 6.1 RIESGOS
  SELECT COUNT(*) INTO v_count FROM risk_matrix WHERE org_id = target_org_id;
  IF v_count = 0 AND custom_data ? 'risks' AND jsonb_typeof(custom_data->'risks') = 'array' THEN
    FOR v_item IN SELECT jsonb_array_elements(custom_data->'risks') LOOP
      INSERT INTO risk_matrix (
        org_id, process_area, risk_description, probability_initial, impact_initial,
        control_measure, responsible, status
      ) VALUES (
        target_org_id,
        v_item->>'process_area',
        COALESCE(v_item->>'risk_description', '[Sin descripción]'),
        COALESCE((v_item->>'probability_initial')::int, 5),
        COALESCE((v_item->>'impact_initial')::int, 5),
        v_item->>'control_measure',
        v_item->>'responsible',
        COALESCE(v_item->>'status', 'En proceso')
      );
    END LOOP;
    v_inserted := jsonb_set(v_inserted, '{risks}', to_jsonb(jsonb_array_length(custom_data->'risks')));
  END IF;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_org_custom(UUID, JSONB) TO authenticated;
