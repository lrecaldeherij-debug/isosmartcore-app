-- =============================================================================
-- v61 — Modo auditor read-only con link compartible
--
-- Permite que el owner genere tokens públicos para que un auditor externo
-- (certificadora ISO 9001, cliente, regulador) acceda al SGC en modo solo
-- lectura sin necesidad de crear cuenta.
--
-- Seguridad:
-- - El token es opaco (random 32 bytes hex)
-- - Validación verifica expires_at + revoked_at
-- - RPC `auditor_snapshot` corre como SECURITY DEFINER y devuelve solo lectura
-- =============================================================================

-- ─── 1. Tabla de tokens ───
CREATE TABLE IF NOT EXISTS audit_share_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL DEFAULT 'Acceso auditor',
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  use_count    INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_audit_share_tokens_token ON audit_share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_audit_share_tokens_org ON audit_share_tokens(org_id);

-- RLS: solo el owner de la org ve/gestiona sus tokens
ALTER TABLE audit_share_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "share_tokens_select" ON audit_share_tokens;
CREATE POLICY "share_tokens_select" ON audit_share_tokens
  FOR SELECT USING (org_id = auth_org_id() AND auth_is_owner());

DROP POLICY IF EXISTS "share_tokens_insert" ON audit_share_tokens;
CREATE POLICY "share_tokens_insert" ON audit_share_tokens
  FOR INSERT WITH CHECK (org_id = auth_org_id() AND auth_is_owner());

DROP POLICY IF EXISTS "share_tokens_update" ON audit_share_tokens;
CREATE POLICY "share_tokens_update" ON audit_share_tokens
  FOR UPDATE USING (org_id = auth_org_id() AND auth_is_owner());

DROP POLICY IF EXISTS "share_tokens_delete" ON audit_share_tokens;
CREATE POLICY "share_tokens_delete" ON audit_share_tokens
  FOR DELETE USING (org_id = auth_org_id() AND auth_is_owner());

-- ─── 2. RPC: snapshot completo del SGC para el auditor ───
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
  -- Validar token
  SELECT * INTO v_token_row FROM audit_share_tokens WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;
  IF v_token_row.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'revoked');
  END IF;
  IF v_token_row.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  -- Marcar uso
  UPDATE audit_share_tokens
  SET use_count = use_count + 1, last_used_at = now()
  WHERE id = v_token_row.id;

  -- Cargar org
  SELECT * INTO v_org FROM organizations WHERE id = v_token_row.org_id;

  -- Armar snapshot
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
    'company_profile', (
      SELECT to_jsonb(cp.*) FROM company_profile cp WHERE cp.org_id = v_token_row.org_id LIMIT 1
    ),
    'quality_policy', (
      SELECT to_jsonb(p.*) FROM quality_policy p WHERE p.org_id = v_token_row.org_id LIMIT 1
    ),
    'scope_declaration', (
      SELECT to_jsonb(s.*) FROM scope_declaration s WHERE s.org_id = v_token_row.org_id LIMIT 1
    ),
    'context_analysis', (
      SELECT COALESCE(jsonb_agg(to_jsonb(c.*) ORDER BY c.category), '[]'::jsonb)
      FROM context_analysis c WHERE c.org_id = v_token_row.org_id
    ),
    'stakeholders', (
      SELECT COALESCE(jsonb_agg(to_jsonb(s.*) ORDER BY s.name), '[]'::jsonb)
      FROM stakeholders s WHERE s.org_id = v_token_row.org_id
    ),
    'processes', (
      SELECT COALESCE(jsonb_agg(to_jsonb(p.*) ORDER BY p.name), '[]'::jsonb)
      FROM processes p WHERE p.org_id = v_token_row.org_id
    ),
    'risk_matrix', (
      SELECT COALESCE(jsonb_agg(to_jsonb(r.*) ORDER BY r.score_initial DESC NULLS LAST), '[]'::jsonb)
      FROM risk_matrix r WHERE r.org_id = v_token_row.org_id
    ),
    'quality_objectives', (
      SELECT COALESCE(jsonb_agg(to_jsonb(o.*) ORDER BY o.created_at), '[]'::jsonb)
      FROM quality_objectives o WHERE o.org_id = v_token_row.org_id
    ),
    'non_conformities', (
      SELECT COALESCE(jsonb_agg(to_jsonb(n.*) ORDER BY n.created_at DESC), '[]'::jsonb)
      FROM non_conformities n WHERE n.org_id = v_token_row.org_id
    ),
    'internal_audits', (
      SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.planned_date DESC NULLS LAST), '[]'::jsonb)
      FROM internal_audits a WHERE a.org_id = v_token_row.org_id
    ),
    'improvement_opportunities', (
      SELECT COALESCE(jsonb_agg(to_jsonb(i.*) ORDER BY i.created_at DESC), '[]'::jsonb)
      FROM improvement_opportunities i WHERE i.org_id = v_token_row.org_id
    ),
    'management_review', (
      SELECT COALESCE(jsonb_agg(to_jsonb(m.*) ORDER BY m.review_date DESC NULLS LAST), '[]'::jsonb)
      FROM management_review m WHERE m.org_id = v_token_row.org_id
    )
  );

  RETURN v_result;
END;
$$;

-- Permitir invocar la RPC sin estar autenticado (rol anon)
GRANT EXECUTE ON FUNCTION auditor_snapshot(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
