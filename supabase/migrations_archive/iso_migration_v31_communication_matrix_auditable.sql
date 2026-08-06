-- =============================================================================
-- v31 — Communication Matrix: campos auditables para ISO 7.4
--
-- El módulo tenía sólo: type (Interna/Externa), what, when, who_receives, how,
-- who_communicates — todo texto libre. Para cumplir con los tips ISO 7.4:
--
--   - "Distingue entre rutinaria (operativa) y de gestión (estratégica)" → category
--   - "No olvides clientes/proveedores/reguladores"                       → external_target
--   - "Documenta canales formales trazables"                              → channel + evidence_url
--   - "Frecuencia consistente"                                            → frequency
--
-- Si la tabla no existe (caso de proyectos antiguos), también la creamos.
-- =============================================================================

-- 1. Crear tabla si no existe
CREATE TABLE IF NOT EXISTS communication_matrix (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  type              TEXT NOT NULL DEFAULT 'Interna' CHECK (type IN ('Interna','Externa')),
  what              TEXT NOT NULL,
  "when"            TEXT,
  who_receives      TEXT,
  how               TEXT,
  who_communicates  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Columnas auditables
ALTER TABLE communication_matrix ADD COLUMN IF NOT EXISTS category          TEXT;   -- 'Rutinaria' | 'Gestión'
ALTER TABLE communication_matrix ADD COLUMN IF NOT EXISTS channel           TEXT;   -- 'Email' | 'Reunión' | 'Intranet' | 'WhatsApp' | 'Cartelera' | 'Informe' | 'Otro'
ALTER TABLE communication_matrix ADD COLUMN IF NOT EXISTS frequency         TEXT;   -- 'Diaria' | 'Semanal' | 'Mensual' | 'Trimestral' | 'Anual' | 'Por evento'
ALTER TABLE communication_matrix ADD COLUMN IF NOT EXISTS external_target   TEXT;   -- 'Clientes' | 'Proveedores' | 'Reguladores' | 'Comunidad' | 'Otros'
ALTER TABLE communication_matrix ADD COLUMN IF NOT EXISTS responsible_role  TEXT;   -- rol del responsable (ej "Coordinador SGC")
ALTER TABLE communication_matrix ADD COLUMN IF NOT EXISTS evidence_url      TEXT;   -- link al registro real (acta, email, post intranet, etc.)
ALTER TABLE communication_matrix ADD COLUMN IF NOT EXISTS notes             TEXT;

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_communication_matrix_org  ON communication_matrix(org_id);
CREATE INDEX IF NOT EXISTS idx_communication_matrix_type ON communication_matrix(type);

-- 4. RLS (idempotente)
ALTER TABLE communication_matrix ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cm_select" ON communication_matrix;
CREATE POLICY "cm_select" ON communication_matrix FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "cm_insert" ON communication_matrix;
CREATE POLICY "cm_insert" ON communication_matrix FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "cm_update" ON communication_matrix;
CREATE POLICY "cm_update" ON communication_matrix FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "cm_delete" ON communication_matrix;
CREATE POLICY "cm_delete" ON communication_matrix FOR DELETE USING (org_id = auth_org_id());
