-- =============================================================================
-- v24 — Columna document_url en job_descriptions
--
-- El frontend (Manual de Cargo / Roles y Responsabilidades) usa un input
-- "Link al manual firmado" pero la columna nunca se creó en la tabla.
-- Mismo caso que procedure_url en processes (v22).
-- =============================================================================

ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS document_url TEXT;
