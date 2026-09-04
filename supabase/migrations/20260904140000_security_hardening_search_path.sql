-- =============================================================================
-- Security hardening: SET search_path en funciones criticas
--
-- Cierra finding #30 del audit: "auth_org_id y auth_role son SECURITY DEFINER
-- sin SET search_path — ancla frágil". El baseline v11 SI las declaraba
-- correctamente, pero algunas funciones auxiliares (auth_can_write,
-- auth_can_admin, current_impersonate_org) quedaron sin el pin.
--
-- Riesgo real: un atacante con permisos de CREATE en cualquier schema puede
-- shadowear objetos referenciados por estas funciones (ej. crear un tipo
-- 'org_role' en un schema propio y forzar que Postgres lo resuelva antes
-- que el 'public.org_role'). Con SET search_path pinneado, Postgres solo
-- busca en public + pg_temp (que es seguro).
--
-- Todas usan CREATE OR REPLACE — idempotente. Solo recrean la funcion con
-- el pin, no cambian el cuerpo.
-- =============================================================================

-- ─── auth_org_id: ya tiene search_path desde v11 — reafirmar por si acaso ────
CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT org_id FROM user_profiles WHERE user_id = auth.uid()
$$;

-- ─── auth_role: idem ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_role()
RETURNS org_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM user_profiles WHERE user_id = auth.uid()
$$;

-- ─── auth_can_write: v11 la creo sin SECURITY DEFINER — endurecer ───────────
CREATE OR REPLACE FUNCTION auth_can_write()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth_role() IN ('owner', 'quality_manager', 'auditor')
$$;

-- ─── auth_can_admin: idem ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_can_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth_role() = 'owner'
$$;

-- ─── current_impersonate_org: agregar SET search_path ────────────────────────
-- No es SECURITY DEFINER (usa auth.jwt() del user actual), pero pinnear el
-- search_path la deja consistente con las demas y previene shadowing de
-- 'auth' schema o del cast ::UUID.
CREATE OR REPLACE FUNCTION current_impersonate_org()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public, pg_temp, auth
AS $$
  SELECT NULLIF(
    auth.jwt() -> 'user_metadata' ->> 'impersonate_org_id',
    ''
  )::UUID
$$;

-- ─── Comentarios documentando por que estan pineadas ─────────────────────────
COMMENT ON FUNCTION auth_org_id() IS
  'Devuelve org_id del user actual. SECURITY DEFINER + search_path pinneado
   para prevenir shadowing malicioso de user_profiles/auth.uid().';

COMMENT ON FUNCTION auth_role() IS
  'Devuelve rol del user actual. SECURITY DEFINER + search_path pinneado.';

COMMENT ON FUNCTION current_impersonate_org() IS
  'Extrae impersonate_org_id del JWT actual. search_path pinneado a
   public+pg_temp+auth para resolver auth.jwt() sin ambiguedad.';
