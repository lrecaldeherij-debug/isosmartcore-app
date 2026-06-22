-- iso_migration_v15_approvals_schema.sql
-- Esquema de aprobaciones para evidencia auditable.
--
-- Modelo conceptual:
--   - Una "approval" es una solicitud de revisión sobre una entidad versionable
--     (por ahora documents_versions; mañana quality_policy, scope_declaration).
--   - Cada cambio de estado queda en approval_events (append-only).
--   - Al aprobar se guarda content_hash → si el contenido cambia después, se nota.
--
-- Separación de funciones: el aprobador NO puede ser el creador.
-- Esa regla la hace cumplir la RPC, no RLS (porque RLS no ve quién creó qué).

-- =============================================================================
-- 1. ENUM de estados de aprobación
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
    CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
  END IF;
END $$;

-- =============================================================================
-- 2. Tabla approvals (genérica por entity_type)
-- =============================================================================
CREATE TABLE IF NOT EXISTS approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,    -- 'documents_versions', 'quality_policy', etc.
  entity_id UUID NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending',
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  content_hash TEXT,            -- SHA-256 del payload al momento de aprobar
  decision_comment TEXT,        -- comentario del aprobador
  requester_note TEXT,          -- nota opcional al solicitar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_org ON approvals(org_id);
CREATE INDEX IF NOT EXISTS idx_approvals_entity ON approvals(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(org_id, status);

DROP TRIGGER IF EXISTS tr_approvals_updated_at ON approvals;
CREATE TRIGGER tr_approvals_updated_at
BEFORE UPDATE ON approvals
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =============================================================================
-- 3. Tabla approval_events (audit log de aprobaciones, append-only)
-- =============================================================================
CREATE TABLE IF NOT EXISTS approval_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  approval_id UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,     -- 'submitted', 'approved', 'rejected', 'cancelled', 'reopened'
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_events_approval ON approval_events(approval_id, created_at);
CREATE INDEX IF NOT EXISTS idx_approval_events_org ON approval_events(org_id);

-- =============================================================================
-- 4. Extender documents_versions con campos de aprobación
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_versions' AND column_name = 'approval_id'
  ) THEN
    ALTER TABLE documents_versions ADD COLUMN approval_id UUID REFERENCES approvals(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_versions' AND column_name = 'content_hash'
  ) THEN
    ALTER TABLE documents_versions ADD COLUMN content_hash TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_versions' AND column_name = 'submitted_by'
  ) THEN
    ALTER TABLE documents_versions ADD COLUMN submitted_by UUID REFERENCES auth.users(id);
    ALTER TABLE documents_versions ADD COLUMN submitted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_versions' AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE documents_versions ADD COLUMN approved_by UUID REFERENCES auth.users(id);
    ALTER TABLE documents_versions ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_versions' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE documents_versions ADD COLUMN created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid();
  END IF;
END $$;

-- Reemplazar el CHECK constraint de status (de v1 era IN ('Borrador','Vigente','Obsoleto'))
-- Ahora soportamos 'En Revisión' y 'Rechazado'.
-- Nota: Postgres reescribe IN (...) como ANY(ARRAY[...]) en pg_get_constraintdef,
-- así que filtramos por 'status' a secas, no por '%status%IN%'.
DO $$
DECLARE
  c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'documents_versions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE documents_versions DROP CONSTRAINT %I', c);
  END LOOP;

  ALTER TABLE documents_versions ADD CONSTRAINT documents_versions_status_check
    CHECK (status IN ('Borrador', 'En Revisión', 'Vigente', 'Obsoleto', 'Rechazado'));
END $$;

-- =============================================================================
-- 5. RLS para approvals y approval_events
-- =============================================================================
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approvals_select ON approvals;
CREATE POLICY approvals_select ON approvals
  FOR SELECT TO authenticated
  USING (org_id = auth_org_id());

-- INSERT/UPDATE/DELETE solo vía RPC (SECURITY DEFINER). El cliente nunca toca
-- directamente esta tabla, así garantizamos las invariantes (separación de
-- funciones, transiciones de estado válidas, escritura de eventos).

DROP POLICY IF EXISTS approval_events_select ON approval_events;
CREATE POLICY approval_events_select ON approval_events
  FOR SELECT TO authenticated
  USING (org_id = auth_org_id());

-- =============================================================================
-- 6. Bloquear edición/borrado directo de documentos Vigentes
--    (la inmutabilidad la garantiza la app + esta política RLS de respaldo)
-- =============================================================================
DROP POLICY IF EXISTS org_update ON documents_versions;
CREATE POLICY org_update ON documents_versions
  FOR UPDATE TO authenticated
  USING (
    org_id = auth_org_id()
    AND auth_role() IN ('owner'::org_role, 'quality_manager'::org_role)
    AND status IN ('Borrador', 'Rechazado')  -- solo se edita lo no aprobado
  )
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS org_delete ON documents_versions;
CREATE POLICY org_delete ON documents_versions
  FOR DELETE TO authenticated
  USING (
    org_id = auth_org_id()
    AND auth_role() = 'owner'::org_role
    AND status IN ('Borrador', 'Rechazado')  -- vigente / obsoleto no se borran
  );
