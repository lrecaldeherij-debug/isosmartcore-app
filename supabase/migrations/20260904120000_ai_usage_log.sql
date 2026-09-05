-- =============================================================================
-- ai_usage_log — contabilidad de consumo IA por org, user y funcion
--
-- Cierra finding #14 del audit: "Cero contabilidad de tokens/costo — no hay
-- ai_usage_log, se ignora usageMetadata".
--
-- Cada llamada a una edge function IA (copilot-chat, gemini-proxy,
-- embed-and-index, rag-backfill) parsea usageMetadata de la respuesta de
-- Gemini y hace un fire-and-forget insert aca. Con esto:
--   - Cuando entre Stripe, podemos cobrar por consumo real
--   - Cada owner ve cuanto le esta costando su IA
--   - Detectamos abusos (un user quemando quota vs muchos users normales)
--   - Analitica de que modelos usa mas la app (informa quota-tuning)
--
-- No enforcea la quota — el increment_ai_usage() existente sigue siendo el
-- gate. Este log es tracking + costos, independiente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  function_name  TEXT NOT NULL CHECK (function_name IN (
                   'copilot-chat',
                   'gemini-proxy',
                   'embed-and-index',
                   'rag-backfill'
                 )),
  model          TEXT,                       -- 'gemini-3.6-flash' | 'gemini-embedding-001' | etc.
  prompt_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  total_tokens   INTEGER NOT NULL DEFAULT 0,
  -- Costo en USD, calculado en el edge function segun pricing hardcoded.
  -- Precision de 6 decimales aguanta hasta $9999.999999 por evento (mas que
  -- suficiente — la llamada mas cara real ronda $0.01).
  cost_usd       NUMERIC(10, 6) NOT NULL DEFAULT 0,
  latency_ms     INTEGER,
  -- Contexto opcional para debugging (ej. si fue impersonate, sanitizacion aplicada, etc.)
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_time
  ON ai_usage_log(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_function
  ON ai_usage_log(org_id, function_name, created_at DESC);

-- Nota: no creamos indice sobre date_trunc('month', created_at) porque
-- date_trunc con timestamptz no es IMMUTABLE (depende del TimeZone de la
-- sesion). El indice idx_ai_usage_org_time ya cubre queries por rango con
-- range scan eficiente sobre created_at.

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- SELECT: propia org + super_admin impersonate. INSERT/UPDATE/DELETE: solo
-- service_role (los edge functions escriben con la key admin).
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_select ON ai_usage_log;
CREATE POLICY ai_usage_select ON ai_usage_log FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );

-- No policies INSERT/UPDATE/DELETE para authenticated → service_role bypasses
-- RLS por default, asi que las edge functions escriben sin problema.

-- ─── Vista agregada para el owner: consumo del mes actual ───────────────────
-- Cachea la agregacion mensual para que el owner vea de un vistazo cuanto
-- lleva gastado sin escanear millones de rows.
CREATE OR REPLACE VIEW ai_usage_current_month AS
SELECT
  org_id,
  COUNT(*)                                 AS calls,
  COALESCE(SUM(prompt_tokens), 0)          AS prompt_tokens,
  COALESCE(SUM(output_tokens), 0)          AS output_tokens,
  COALESCE(SUM(total_tokens), 0)           AS total_tokens,
  COALESCE(SUM(cost_usd), 0)               AS cost_usd,
  jsonb_object_agg(
    function_name,
    call_count
  ) AS calls_by_function
FROM (
  SELECT
    org_id,
    function_name,
    prompt_tokens,
    output_tokens,
    total_tokens,
    cost_usd,
    COUNT(*) OVER (PARTITION BY org_id, function_name) AS call_count
  FROM ai_usage_log
  WHERE created_at >= date_trunc('month', NOW())
) t
GROUP BY org_id;

COMMENT ON TABLE ai_usage_log IS
  'Log de cada llamada a edge function IA con tokens consumidos + costo estimado.
   Se escribe fire-and-forget desde las edge functions. Fuente para futura
   facturacion por consumo y para el panel de administracion de costos.';
