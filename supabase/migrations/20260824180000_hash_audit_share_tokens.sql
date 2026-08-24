-- =============================================================================
-- Hash audit_share_tokens + max_uses opcional
--
-- Contexto (auditoría 21-ago-2026): la tabla guardaba el token en texto plano.
-- Riesgos activos:
--   1. Cualquier owner con SELECT sobre la tabla podía leer los links de
--      TODOS los auditores externos vinculados a su org — no había show-once.
--   2. Si alguna vez la BD leakea (backup viejo, dump inseguro, dev que abre
--      la Table Editor con screen-share), TODOS los tokens quedan revelados
--      y siguen válidos hasta expires_at.
--   3. No había límite de usos: un auditor podía reusar el link infinitas
--      veces (o compartirlo), y cualquiera con el link accedía al SGC.
--
-- Fix (patrón estándar para tokens tipo "password reset" / "API key"):
--   - En BD guardamos solo sha256(token) → nadie con acceso a la tabla puede
--     reconstruir el plaintext. El plaintext lo genera el cliente (crypto
--     random 32 bytes), se muestra 1 sola vez al owner al crear, y no vuelve
--     a persistirse en ningún lado.
--   - El RPC auditor_snapshot ahora hashea el input y busca por hash.
--   - max_uses (nullable): si NULL, sin límite. Si N, después de N usos el
--     token queda inutilizable aunque no haya expirado ni sido revocado.
--
-- Decisión de migración: los tokens plaintext preexistentes se HASHEAN al
-- aplicar (backfill). Esto significa que el owner ya no puede releer los
-- links viejos. Es el trade-off correcto — si los perdió, regenera. Es un
-- cambio único de un solo lado, no un rollback rehacible.
-- =============================================================================

BEGIN;

-- pgcrypto para digest(). Idempotente.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. Columna token_hash + backfill ──────────────────────────────────────
ALTER TABLE audit_share_tokens ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE audit_share_tokens ADD COLUMN IF NOT EXISTS max_uses   INT;

-- Backfill: para filas con token plaintext, generamos el hash correspondiente.
-- Si token_hash ya existe (rerun), no lo pisamos.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_share_tokens'
      AND column_name = 'token'
  ) THEN
    UPDATE audit_share_tokens
    SET token_hash = encode(digest(token, 'sha256'), 'hex')
    WHERE token_hash IS NULL AND token IS NOT NULL;
  END IF;
END $$;

-- Ahora token_hash debe existir para toda fila. Constraint NOT NULL + UNIQUE.
ALTER TABLE audit_share_tokens ALTER COLUMN token_hash SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_share_tokens_token_hash_key'
  ) THEN
    ALTER TABLE audit_share_tokens
      ADD CONSTRAINT audit_share_tokens_token_hash_key UNIQUE (token_hash);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_share_tokens_hash ON audit_share_tokens(token_hash);

-- Constraint razonable para max_uses (si viene, entre 1 y 10000).
DO $$
BEGIN
  ALTER TABLE audit_share_tokens DROP CONSTRAINT IF EXISTS audit_share_tokens_max_uses_check;
  ALTER TABLE audit_share_tokens ADD CONSTRAINT audit_share_tokens_max_uses_check
    CHECK (max_uses IS NULL OR (max_uses > 0 AND max_uses <= 10000));
END $$;

-- ─── 2. Drop columna token plaintext ───────────────────────────────────────
-- Punto de no retorno: después de esto, el plaintext queda solo en el link
-- que el owner haya copiado. Si lo perdió, regenerar.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_share_tokens'
      AND column_name = 'token'
  ) THEN
    ALTER TABLE audit_share_tokens DROP COLUMN token;
    RAISE NOTICE 'Columna token plaintext eliminada. Solo queda token_hash.';
  END IF;
END $$;

-- ─── 3. auditor_snapshot: buscar por hash + chequear max_uses ─────────────
-- Reemplazo completo del RPC v63. Mantiene errores opacos y allowlist.
CREATE OR REPLACE FUNCTION auditor_snapshot(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_row audit_share_tokens%ROWTYPE;
  v_org organizations%ROWTYPE;
  v_hash TEXT;
  v_result JSONB;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN jsonb_build_object('error', 'invalid_or_inactive_token');
  END IF;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_token_row FROM audit_share_tokens WHERE token_hash = v_hash;

  IF NOT FOUND
     OR v_token_row.revoked_at IS NOT NULL
     OR v_token_row.expires_at < now()
     OR (v_token_row.max_uses IS NOT NULL AND v_token_row.use_count >= v_token_row.max_uses)
  THEN
    RETURN jsonb_build_object('error', 'invalid_or_inactive_token');
  END IF;

  UPDATE audit_share_tokens
  SET use_count = use_count + 1, last_used_at = now()
  WHERE id = v_token_row.id;

  SELECT * INTO v_org FROM organizations WHERE id = v_token_row.org_id;

  v_result := jsonb_build_object(
    'token_info', jsonb_build_object(
      'label',       v_token_row.label,
      'expires_at',  v_token_row.expires_at,
      'created_at',  v_token_row.created_at,
      'uses_left',   CASE WHEN v_token_row.max_uses IS NULL THEN NULL
                          ELSE v_token_row.max_uses - v_token_row.use_count - 1 END
    ),
    'org', jsonb_build_object(
      'name',     v_org.name,
      'industry', v_org.industry,
      'address',  v_org.address
    ),
    'company_profile',           safe_jsonb_company_profile(v_token_row.org_id),
    'quality_policy',            safe_jsonb_quality_policy(v_token_row.org_id),
    'scope_declaration',         safe_jsonb_scope(v_token_row.org_id),
    'context_analysis',          safe_jsonb_context(v_token_row.org_id),
    'stakeholders',              safe_jsonb_stakeholders(v_token_row.org_id),
    'processes',                 safe_jsonb_processes(v_token_row.org_id),
    'risk_matrix',               safe_jsonb_risks(v_token_row.org_id),
    'quality_objectives',        safe_jsonb_objectives(v_token_row.org_id),
    'non_conformities',          safe_jsonb_ncs(v_token_row.org_id),
    'internal_audits',           safe_jsonb_audits(v_token_row.org_id),
    'improvement_opportunities', safe_jsonb_opps(v_token_row.org_id),
    'management_review',         safe_jsonb_reviews(v_token_row.org_id)
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION auditor_snapshot(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── Verificación ─────────────────────────────────────────────────────────
-- Después de correr, esperado:
-- 1. La columna 'token' NO existe. Solo 'token_hash'.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'audit_share_tokens'
  AND column_name IN ('token', 'token_hash', 'max_uses')
ORDER BY column_name;

-- 2. Constraint UNIQUE aplicada
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'public.audit_share_tokens'::regclass
  AND conname LIKE '%token_hash%';
