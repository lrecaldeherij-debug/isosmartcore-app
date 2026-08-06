-- =============================================================================
-- v32 — Documents Versions: campos auditables para ISO 7.5
--
-- El módulo ya tenía workflow de aprobación, versionado, storage, hash y
-- approver tracking. Le faltan los campos que exige la 7.5.2 y 7.5.3:
--
--   - 7.5.3 Distribución, acceso, recuperación, RETENCIÓN y DISPOSICIÓN
--     → review_date, retention_until
--   - 7.5.2 Identificación, descripción, REVISIÓN y APROBACIÓN
--     → change_summary (changelog por versión), document_owner
--   - Distinguir DOCUMENTOS de REGISTROS (registros = evidencia de actividad)
--     → is_record
--   - Etiquetado libre para vincular a procesos/áreas
--     → tags
-- =============================================================================

ALTER TABLE documents_versions ADD COLUMN IF NOT EXISTS document_owner   TEXT;
ALTER TABLE documents_versions ADD COLUMN IF NOT EXISTS review_date      DATE;
ALTER TABLE documents_versions ADD COLUMN IF NOT EXISTS retention_until  DATE;
ALTER TABLE documents_versions ADD COLUMN IF NOT EXISTS change_summary   TEXT;
ALTER TABLE documents_versions ADD COLUMN IF NOT EXISTS is_record        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE documents_versions ADD COLUMN IF NOT EXISTS tags             TEXT[];

-- Índice para que los filtros por status (Vigente, Borrador, etc.) sigan rápidos
CREATE INDEX IF NOT EXISTS idx_documents_versions_status     ON documents_versions(status);
CREATE INDEX IF NOT EXISTS idx_documents_versions_review     ON documents_versions(review_date) WHERE review_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_versions_is_record  ON documents_versions(is_record);

-- Refresh schema cache para PostgREST
NOTIFY pgrst, 'reload schema';
