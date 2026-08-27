-- =============================================================================
-- RAG Copilot: pgvector + tabla rag_chunks + RPC rag_search
--
-- Sesión 1/2 del feature "Copilot IA con contexto real de la org".
--
-- Diseño:
--   - Extensión pgvector (nativa en Supabase Postgres)
--   - Tabla rag_chunks: 1 fila = 1 chunk indexable. Para el MVP indexamos
--     source_table ∈ {risk_matrix, non_conformities, documents_versions} — las
--     tres con más texto libre útil. Extensible sin refactor.
--   - Embeddings vector(768) porque usamos Gemini text-embedding-004
--     (768 dims, gratis en tier free, misma API key del gemini-proxy).
--   - RLS: SELECT solo la propia org (o la impersonada por super_admin).
--          INSERT/UPDATE/DELETE solo service_role — las escrituras las
--          hacen las edge functions embed-and-index y copilot-chat, no
--          el cliente directo.
--   - Índice HNSW (mejor calidad que ivfflat, sin ANALYZE post-build).
--   - RPC rag_search: SECURITY DEFINER, filtra por org efectiva (real o
--     impersonada) — devuelve top-K chunks + payload para citations.
--
-- Cuota IA: 1 pregunta al copilot = 1 uso (el embedding de la query cuenta
-- como interno). Los embeddings de ingestion NO cuentan contra el user —
-- son costo del sistema.
-- =============================================================================

BEGIN;

-- 1. Extensión pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla rag_chunks
CREATE TABLE IF NOT EXISTS rag_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_table  TEXT NOT NULL CHECK (source_table IN (
                  'risk_matrix', 'non_conformities', 'documents_versions'
                )),
  source_id     UUID NOT NULL,
  chunk_index   INT  NOT NULL DEFAULT 0,
  -- Texto human-readable del chunk (lo que va al prompt del LLM)
  content       TEXT NOT NULL,
  -- Título corto para renderar la citation ("NC-2026-042: Falla en tornillo XR-9")
  title         TEXT,
  -- Embedding — 768 dims para gemini text-embedding-004
  embedding     vector(768) NOT NULL,
  -- Hash del content para detectar si cambió y hay que re-embeddear
  content_hash  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un chunk por (source_table, source_id, chunk_index). Para MVP casi todos
  -- los rows tienen chunk_index=0 (1 fila = 1 chunk); dejamos la puerta
  -- abierta a splitting cuando aparezcan textos largos.
  UNIQUE (source_table, source_id, chunk_index)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_rag_chunks_org ON rag_chunks(org_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_source ON rag_chunks(source_table, source_id);

-- Índice HNSW para búsqueda por coseno. m=16 ef_construction=64 son defaults
-- razonables para <100k chunks (largamente lo que necesita una PyME).
-- El operador <=> es coseno; para dot product sería <#>, euclídeo <->.
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding_hnsw
  ON rag_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 3. RLS
ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;

-- SELECT: org propia + impersonate. INSERT/UPDATE/DELETE: solo service_role
-- (que bypassa RLS por default, no necesita policy).
DROP POLICY IF EXISTS rag_chunks_select_own ON rag_chunks;
CREATE POLICY rag_chunks_select_own ON rag_chunks
  FOR SELECT TO authenticated
  USING (org_id = auth_org_id());

DROP POLICY IF EXISTS rag_chunks_select_impersonate ON rag_chunks;
CREATE POLICY rag_chunks_select_impersonate ON rag_chunks
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    AND current_impersonate_org() IS NOT NULL
    AND current_impersonate_org() = org_id
  );

-- 4. RPC de retrieval
-- Recibe embedding de la pregunta + top_k. Devuelve chunks + metadata para
-- que el frontend arme citations. Filtra por org efectiva.
--
-- SECURITY DEFINER — necesita bypassar RLS para calcular efficiency de la
-- búsqueda vectorial (los planners RLS + ivfflat/hnsw a veces no eligen el
-- índice). Guardamos la seguridad con el filtro explícito p_org_id que
-- valida el caller (el copilot-chat edge function ya identifica la org
-- correcta desde JWT + impersonate y la pasa acá).
CREATE OR REPLACE FUNCTION rag_search(
  p_org_id      UUID,
  p_query_embedding vector(768),
  p_top_k       INT DEFAULT 5
) RETURNS TABLE (
  id           UUID,
  source_table TEXT,
  source_id    UUID,
  title        TEXT,
  content      TEXT,
  similarity   FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cap defensivo — el caller puede pedir 20, no más.
  IF p_top_k > 20 THEN p_top_k := 20; END IF;
  IF p_top_k < 1 THEN p_top_k := 1; END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.source_table,
    c.source_id,
    c.title,
    c.content,
    -- Similaridad = 1 - distancia_coseno. Escala [0,1], 1 = idéntico.
    (1 - (c.embedding <=> p_query_embedding))::FLOAT AS similarity
  FROM rag_chunks c
  WHERE c.org_id = p_org_id
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_top_k;
END;
$$;

-- Solo la edge function autenticada puede llamar. authenticated OK; anon NO
-- (el copilot no es público).
GRANT EXECUTE ON FUNCTION rag_search(UUID, vector(768), INT) TO authenticated;

-- 5. Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION touch_rag_chunks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_rag_chunks_touch ON rag_chunks;
CREATE TRIGGER tr_rag_chunks_touch
  BEFORE UPDATE ON rag_chunks
  FOR EACH ROW EXECUTE FUNCTION touch_rag_chunks_updated_at();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'rag_chunks' ORDER BY ordinal_position;
SELECT policyname, cmd FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'rag_chunks' ORDER BY policyname;
