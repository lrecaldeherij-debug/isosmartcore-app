-- =============================================================================
-- v58 — Hotfix: evidence_url faltante en non_conformities
--
-- Bug en v52: evidence_url está en el CREATE TABLE IF NOT EXISTS pero NO tiene
-- su ALTER TABLE ADD COLUMN IF NOT EXISTS. Las orgs cuya tabla ya existía
-- antes de v52 nunca recibieron esta columna, y el form de NCs falla al
-- intentar insertar con "Could not find the 'evidence_url' column".
-- =============================================================================

ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS evidence_url TEXT;

NOTIFY pgrst, 'reload schema';
