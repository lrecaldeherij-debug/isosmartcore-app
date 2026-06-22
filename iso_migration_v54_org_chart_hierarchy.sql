-- =============================================================================
-- v54 — Org Chart Hierarchy: ISO 5.3 (Organigrama estructural)
--
-- Agrega vínculo padre↔hijo formal (parent_id self-FK) a job_descriptions,
-- agrupación por área y orden entre hermanos. Habilita renderizar un árbol
-- jerárquico real desde el módulo OrgChart.
--
-- NOTA: la tabla job_descriptions ya existe y tiene RLS desde v43. Acá solo
-- agregamos columnas estructurales para la jerarquía.
-- =============================================================================

-- ─── Columnas nuevas ───
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS parent_id        UUID REFERENCES job_descriptions(id) ON DELETE SET NULL;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS area             TEXT;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS position_index   INT DEFAULT 0;

-- ─── Limpieza defensiva ───
-- Si dependency era texto y no hay parent_id, lo dejamos así (no podemos resolver TEXT→UUID automático)
-- El módulo OrgChart permite asignar parent_id desde el UI.

UPDATE job_descriptions SET position_index = 0 WHERE position_index IS NULL;

-- ─── Índices ───
CREATE INDEX IF NOT EXISTS idx_jd_parent ON job_descriptions(parent_id);
CREATE INDEX IF NOT EXISTS idx_jd_area   ON job_descriptions(area);

NOTIFY pgrst, 'reload schema';
