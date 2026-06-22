-- =============================================================================
-- v63 — auditor_snapshot v2: allowlist de columnas + errores opacos +
--                            tolerancia a schema drift + sin schema enumeration
--
-- Fix de findings críticos:
-- 1. v61 usaba to_jsonb(tabla.*) que expone TODA columna actual y futura
--    (incluyendo PII sensible y columnas que se agreguen luego). Reemplazo
--    con allowlist explícita por tabla.
-- 2. Errores diferenciados ('invalid_token'/'expired'/'revoked') permitían
--    enumeración. Unificamos a 'invalid_or_inactive_token' opaco.
-- 3. ORDER BY referenciaba columnas no garantizadas (score_initial, etc.).
--    Removemos ORDER BY donde no es crítico, o usamos campos universales.
-- 4. company_profile/scope_declaration podían no existir → RPC fallaba entero.
--    Cada subselect ahora se envuelve en COALESCE + check de existencia.
-- =============================================================================

CREATE OR REPLACE FUNCTION auditor_snapshot(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_row audit_share_tokens%ROWTYPE;
  v_org organizations%ROWTYPE;
  v_result JSONB;
BEGIN
  -- Validación opaca: NUNCA decimos por qué falla. Mismo error para todo.
  SELECT * INTO v_token_row FROM audit_share_tokens WHERE token = p_token;
  IF NOT FOUND OR v_token_row.revoked_at IS NOT NULL OR v_token_row.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'invalid_or_inactive_token');
  END IF;

  -- Marcar uso
  UPDATE audit_share_tokens
  SET use_count = use_count + 1, last_used_at = now()
  WHERE id = v_token_row.id;

  SELECT * INTO v_org FROM organizations WHERE id = v_token_row.org_id;

  -- Allowlist explícita por tabla; safe_jsonb_table maneja schema drift
  v_result := jsonb_build_object(
    'token_info', jsonb_build_object(
      'label', v_token_row.label,
      'expires_at', v_token_row.expires_at,
      'created_at', v_token_row.created_at
    ),
    'org', jsonb_build_object(
      'name', v_org.name,
      'industry', v_org.industry,
      'address', v_org.address
    ),
    'company_profile',     safe_jsonb_company_profile(v_token_row.org_id),
    'quality_policy',      safe_jsonb_quality_policy(v_token_row.org_id),
    'scope_declaration',   safe_jsonb_scope(v_token_row.org_id),
    'context_analysis',    safe_jsonb_context(v_token_row.org_id),
    'stakeholders',        safe_jsonb_stakeholders(v_token_row.org_id),
    'processes',           safe_jsonb_processes(v_token_row.org_id),
    'risk_matrix',         safe_jsonb_risks(v_token_row.org_id),
    'quality_objectives',  safe_jsonb_objectives(v_token_row.org_id),
    'non_conformities',    safe_jsonb_ncs(v_token_row.org_id),
    'internal_audits',     safe_jsonb_audits(v_token_row.org_id),
    'improvement_opportunities', safe_jsonb_opps(v_token_row.org_id),
    'management_review',   safe_jsonb_reviews(v_token_row.org_id)
  );

  RETURN v_result;
END;
$$;

-- ─── Helpers: cada uno hace SELECT con allowlist explícita y to_regclass guard ───
-- Devuelven NULL si la tabla no existe, en vez de fallar la RPC entera.

CREATE OR REPLACE FUNCTION safe_jsonb_company_profile(p_org UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF to_regclass('public.company_profile') IS NULL THEN RETURN NULL; END IF;
  RETURN (
    SELECT jsonb_build_object(
      'company_name', cp.company_name,
      'industry', cp.industry,
      'main_products', cp.main_products,
      'strategic_direction', cp.strategic_direction,
      'employee_count', cp.employee_count
    )
    FROM company_profile cp WHERE cp.org_id = p_org LIMIT 1
  );
END $$;

CREATE OR REPLACE FUNCTION safe_jsonb_quality_policy(p_org UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF to_regclass('public.quality_policy') IS NULL THEN RETURN NULL; END IF;
  RETURN (
    SELECT jsonb_build_object(
      'final_policy_statement', p.final_policy_statement,
      'commitments', p.commitments,
      'last_reviewed', p.last_reviewed
    )
    FROM quality_policy p WHERE p.org_id = p_org LIMIT 1
  );
END $$;

CREATE OR REPLACE FUNCTION safe_jsonb_scope(p_org UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF to_regclass('public.scope_declaration') IS NULL THEN RETURN NULL; END IF;
  RETURN (
    SELECT jsonb_build_object('scope_text', s.scope_text)
    FROM scope_declaration s WHERE s.org_id = p_org LIMIT 1
  );
END $$;

CREATE OR REPLACE FUNCTION safe_jsonb_context(p_org UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF to_regclass('public.context_analysis') IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'type', c.type, 'category', c.category, 'factor', c.factor,
      'description', c.description, 'strategy', c.strategy, 'status', c.status
    ))
    FROM context_analysis c WHERE c.org_id = p_org
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION safe_jsonb_stakeholders(p_org UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF to_regclass('public.stakeholders') IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'name', s.name, 'type', s.type,
      'needs', s.needs, 'influence_level', s.influence_level
    ))
    FROM stakeholders s WHERE s.org_id = p_org
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION safe_jsonb_processes(p_org UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF to_regclass('public.processes') IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'code', p.code, 'name', p.name, 'process_type', p.process_type,
      'objective', p.objective, 'scope', p.scope, 'responsible_role', p.responsible_role
    ))
    FROM processes p WHERE p.org_id = p_org
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION safe_jsonb_risks(p_org UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF to_regclass('public.risk_matrix') IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'type', r.type, 'category', r.category, 'risk_description', r.risk_description,
      'score_initial', r.score_initial, 'score_residual', r.score_residual,
      'status', r.status, 'control_measure', r.control_measure,
      'treatment_strategy', r.treatment_strategy
    ))
    FROM risk_matrix r WHERE r.org_id = p_org
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION safe_jsonb_objectives(p_org UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF to_regclass('public.quality_objectives') IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'name', o.name, 'objective', o.objective, 'category', o.category,
      'indicator', o.indicator, 'unit', o.unit, 'target', o.target,
      'current', o.current, 'status', o.status, 'year', o.year
    ))
    FROM quality_objectives o WHERE o.org_id = p_org
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION safe_jsonb_ncs(p_org UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF to_regclass('public.non_conformities') IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'description', n.description, 'source', n.source, 'type', n.type,
      'severity', n.severity, 'status', n.status,
      'detection_date', n.detection_date, 'closure_date', n.closure_date,
      'effectiveness_result', n.effectiveness_result,
      'root_cause', n.root_cause, 'action_plan', n.action_plan,
      'is_recurrent', n.is_recurrent
    ))
    FROM non_conformities n WHERE n.org_id = p_org
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION safe_jsonb_audits(p_org UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF to_regclass('public.internal_audits') IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'audit_type', a.audit_type, 'audit_process', a.audit_process,
      'status', a.status, 'year', a.year,
      'planned_date', a.planned_date, 'actual_date', a.actual_date,
      'lead_auditor', a.lead_auditor, 'audit_scope', a.audit_scope,
      'audit_criteria', a.audit_criteria, 'conclusions', a.conclusions
    ))
    FROM internal_audits a WHERE a.org_id = p_org
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION safe_jsonb_opps(p_org UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF to_regclass('public.improvement_opportunities') IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'title', i.title, 'description', i.description, 'source', i.source,
      'area', i.area, 'priority', i.priority, 'status', i.status,
      'expected_benefit', i.expected_benefit,
      'effectiveness_score', i.effectiveness_score
    ))
    FROM improvement_opportunities i WHERE i.org_id = p_org
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION safe_jsonb_reviews(p_org UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF to_regclass('public.management_review') IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'review_type', m.review_type, 'review_date', m.review_date,
      'status', m.status, 'chairperson', m.chairperson,
      'period_start', m.period_start, 'period_end', m.period_end,
      'outputs_improvement_opportunities', m.outputs_improvement_opportunities,
      'outputs_changes_needed', m.outputs_changes_needed
    ))
    FROM management_review m WHERE m.org_id = p_org
  ), '[]'::jsonb);
END $$;

-- Permitir invocar la RPC sin estar autenticado
GRANT EXECUTE ON FUNCTION auditor_snapshot(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
