-- =============================================================================
-- v22 — Columna procedure_url en processes
--
-- El frontend ya tiene un input "Vínculo al Procedimiento Detallado (Google Drive)"
-- para que cada proceso enlace al PDF/Doc del procedimiento, pero la columna nunca
-- se creó en la tabla. Por eso fallaba: "Could not find the 'procedure_url' column".
-- =============================================================================

ALTER TABLE processes ADD COLUMN IF NOT EXISTS procedure_url TEXT;
