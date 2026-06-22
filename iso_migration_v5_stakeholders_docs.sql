-- iso_migration_v5_stakeholders_docs.sql
-- Agregar columna para enlace de evidencia/documento (Drive, SharePoint, etc.)

ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS evidence_url TEXT;
