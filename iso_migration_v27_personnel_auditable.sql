-- =============================================================================
-- v27 — Personnel: campos auditables para ISO 7.2 (Competencia)
--
-- El form actual solo permite nombre, cargo, educación, experiencia, skills y
-- estado de competencia. Para que un auditor pueda trazar la competencia
-- documentada según ISO 7.2 hace falta:
--
--   - Identificación inequívoca de la persona (documento, fecha ingreso, contacto)
--   - Educación detallada (institución + año, no solo título suelto)
--   - Evidencia documentada (link a CV/títulos/certificados firmados en Drive)
-- =============================================================================

ALTER TABLE personnel ADD COLUMN IF NOT EXISTS document_id             TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS start_date              DATE;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS email                   TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS phone                   TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS education_institution   TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS education_year          INT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS evidence_url            TEXT;
