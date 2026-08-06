-- =============================================================================
-- v33 — Documents Versions: agregar Área funcional
--
-- En la vida real las empresas buscan documentos por ÁREA ("dame los de RRHH"),
-- no por tipo. Agregamos un campo libre con valores típicos alineados a procesos
-- ISO (Calidad, RRHH, Producción, Comercial, Compras, etc).
-- =============================================================================

ALTER TABLE documents_versions ADD COLUMN IF NOT EXISTS area TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_versions_area ON documents_versions(area);

NOTIFY pgrst, 'reload schema';
