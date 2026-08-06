-- =============================================================================
-- v64 — Lista de espera para Academia IsoSmartCore
--
-- Captura usuarios interesados en el futuro curso propio (Auditor Interno
-- + módulos de habilidades blandas). Sirve como validación de demanda antes
-- de invertir en producir contenido.
--
-- Seguridad:
-- - Cada usuario solo ve/modifica su propia entrada (RLS por user_id)
-- - org_id se guarda como contexto pero NO restringe acceso (es un funnel
--   de marketing, no datos sensibles de la org)
-- - UNIQUE INDEX en user_id evita duplicados accidentales
-- =============================================================================

CREATE TABLE IF NOT EXISTS academy_waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES organizations(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  interests   TEXT[] NOT NULL DEFAULT '{}',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices defensivos
CREATE UNIQUE INDEX IF NOT EXISTS uq_academy_waitlist_user
  ON academy_waitlist(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_academy_waitlist_org
  ON academy_waitlist(org_id);

CREATE INDEX IF NOT EXISTS idx_academy_waitlist_created
  ON academy_waitlist(created_at DESC);

-- RLS
ALTER TABLE academy_waitlist ENABLE ROW LEVEL SECURITY;

-- INSERT: cualquier usuario autenticado puede sumarse — debe ser su propio user_id
DROP POLICY IF EXISTS "academy_waitlist_insert" ON academy_waitlist;
CREATE POLICY "academy_waitlist_insert" ON academy_waitlist
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- SELECT: el usuario ve solo SU entrada (para saber si ya se sumó)
DROP POLICY IF EXISTS "academy_waitlist_select" ON academy_waitlist;
CREATE POLICY "academy_waitlist_select" ON academy_waitlist
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- UPDATE: puede actualizar sus intereses/notas
DROP POLICY IF EXISTS "academy_waitlist_update" ON academy_waitlist;
CREATE POLICY "academy_waitlist_update" ON academy_waitlist
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: puede darse de baja
DROP POLICY IF EXISTS "academy_waitlist_delete" ON academy_waitlist;
CREATE POLICY "academy_waitlist_delete" ON academy_waitlist
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION academy_waitlist_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_academy_waitlist_updated_at ON academy_waitlist;
CREATE TRIGGER trg_academy_waitlist_updated_at
  BEFORE UPDATE ON academy_waitlist
  FOR EACH ROW
  EXECUTE FUNCTION academy_waitlist_touch_updated_at();

-- Nota: para consultar la lista completa como admin del producto (vos),
-- ejecutá desde el SQL Editor de Supabase con permisos service_role:
--   SELECT email, interests, notes, created_at FROM academy_waitlist ORDER BY created_at DESC;
