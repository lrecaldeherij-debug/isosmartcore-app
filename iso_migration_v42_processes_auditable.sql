-- =============================================================================
-- v42 — Processes: ISO 4.4 (Mapa de procesos)
--
-- Agrega interacciones entre procesos, owner formal, revisión periódica,
-- estado de la ficha y change_log auditable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS processes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  code            TEXT,
  process_type    TEXT DEFAULT 'Operativo',
  objective       TEXT,
  scope           TEXT,
  responsible_role TEXT,
  procedure_url   TEXT,
  entries_json    JSONB DEFAULT '[]'::jsonb,
  activities_json JSONB DEFAULT '[]'::jsonb,
  outputs_json    JSONB DEFAULT '[]'::jsonb,
  resources_json  JSONB DEFAULT '{}'::jsonb,
  risks_json      JSONB DEFAULT '[]'::jsonb,
  indicators_json JSONB DEFAULT '[]'::jsonb,
  approvals_json  JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Interacciones entre procesos (ISO 4.4)
ALTER TABLE processes ADD COLUMN IF NOT EXISTS interactions_upstream   JSONB DEFAULT '[]'::jsonb;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS interactions_downstream JSONB DEFAULT '[]'::jsonb;

-- Owner formal
ALTER TABLE processes ADD COLUMN IF NOT EXISTS process_owner          TEXT;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS process_owner_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Revisión periódica de la ficha
ALTER TABLE processes ADD COLUMN IF NOT EXISTS revision               TEXT DEFAULT 'v1.0';
ALTER TABLE processes ADD COLUMN IF NOT EXISTS last_reviewed_at       DATE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS next_review_date       DATE;

-- Estado de la ficha
ALTER TABLE processes ADD COLUMN IF NOT EXISTS status                 TEXT DEFAULT 'Activo';

-- Auditoría
ALTER TABLE processes ADD COLUMN IF NOT EXISTS change_log             JSONB DEFAULT '[]'::jsonb;

-- Constraints
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE 'processes%status%check%'
  ) THEN
    EXECUTE 'ALTER TABLE processes DROP CONSTRAINT IF EXISTS processes_status_check';
  END IF;
END $$;

ALTER TABLE processes
  ADD CONSTRAINT processes_status_check
  CHECK (status IN ('Activo','En revisión','Obsoleto','Borrador'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE 'processes%process_type%check%'
  ) THEN
    EXECUTE 'ALTER TABLE processes DROP CONSTRAINT IF EXISTS processes_process_type_check';
  END IF;
END $$;

ALTER TABLE processes
  ADD CONSTRAINT processes_process_type_check
  CHECK (process_type IN ('Estratégico','Operativo','Soporte'));

-- Índices
CREATE INDEX IF NOT EXISTS idx_processes_org    ON processes(org_id);
CREATE INDEX IF NOT EXISTS idx_processes_type   ON processes(process_type);
CREATE INDEX IF NOT EXISTS idx_processes_status ON processes(status);
CREATE INDEX IF NOT EXISTS idx_processes_review ON processes(next_review_date);

-- RLS
ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "proc_select" ON processes;
CREATE POLICY "proc_select" ON processes FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "proc_insert" ON processes;
CREATE POLICY "proc_insert" ON processes FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "proc_update" ON processes;
CREATE POLICY "proc_update" ON processes FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "proc_delete" ON processes;
CREATE POLICY "proc_delete" ON processes FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
