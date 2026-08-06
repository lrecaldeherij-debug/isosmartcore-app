-- =============================================================================
-- v23 — Versiones oficiales de reportes
--
-- Hasta ahora la sección "Reportes y exportaciones" genera PDFs en vivo desde
-- los datos del SGC. Pero los auditores y la dirección suelen mantener UNA
-- versión firmada/oficial como evidencia documentada (ISO 7.5).
--
-- Esta tabla guarda la versión "oficial" subida por el cliente para cada
-- reporte (manual, risks, stakeholders, etc.). El historial se conserva
-- (is_active=false) por trazabilidad.
--
-- Storage: archivos en bucket `documents`, path: <org_id>/reports/<report_key>/<uuid>.<ext>
-- =============================================================================

CREATE TABLE IF NOT EXISTS report_artifacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  report_key        TEXT NOT NULL,                            -- 'manual', 'risks', 'stakeholders', etc.
  storage_path      TEXT NOT NULL,                            -- path dentro del bucket 'documents'
  original_filename TEXT NOT NULL,
  mime_type         TEXT,
  size_bytes        BIGINT,
  version_label     TEXT,                                     -- opcional, ej 'v2.0 firmada por GG'
  notes             TEXT,                                     -- comentarios libres del cargador
  uploaded_by       UUID REFERENCES auth.users(id),
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active         BOOLEAN NOT NULL DEFAULT true            -- la última versión activa es "la oficial"
);

CREATE INDEX IF NOT EXISTS idx_report_artifacts_org_key_active
  ON report_artifacts(org_id, report_key, is_active, uploaded_at DESC);

-- ------------ RLS ------------
ALTER TABLE report_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_artifacts_select" ON report_artifacts;
CREATE POLICY "report_artifacts_select" ON report_artifacts
  FOR SELECT USING (org_id = auth_org_id());

DROP POLICY IF EXISTS "report_artifacts_insert" ON report_artifacts;
CREATE POLICY "report_artifacts_insert" ON report_artifacts
  FOR INSERT WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS "report_artifacts_update" ON report_artifacts;
CREATE POLICY "report_artifacts_update" ON report_artifacts
  FOR UPDATE USING (org_id = auth_org_id());

DROP POLICY IF EXISTS "report_artifacts_delete" ON report_artifacts;
CREATE POLICY "report_artifacts_delete" ON report_artifacts
  FOR DELETE USING (org_id = auth_org_id());
