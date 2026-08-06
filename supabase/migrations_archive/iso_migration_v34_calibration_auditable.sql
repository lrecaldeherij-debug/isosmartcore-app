-- =============================================================================
-- v34 — Equipment Calibration: campos auditables ISO 7.1.5
--
-- El módulo solo tenía equipment_name, serial_number, fechas, status y url.
-- Para cumplir 7.1.5 hace falta TRAZABILIDAD a patrones nacionales y registro
-- de DESVIACIONES con su impacto.
--
-- Campos nuevos:
--   - equipment_type, location, used_in_process, responsible
--   - measurement_range, tolerance
--   - calibration_lab, certificate_number, traceability_pattern
--   - calibration_frequency_months (calcula próxima fecha auto)
--   - deviation_notes (qué se hizo si hubo desvío)
--
-- Tabla nueva calibration_history: histórico de calibraciones del mismo equipo.
-- =============================================================================

-- 1. Crear tabla si no existe (igual que con climate_surveys, por las dudas)
CREATE TABLE IF NOT EXISTS equipment_calibration (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  equipment_name    TEXT NOT NULL,
  serial_number     TEXT,
  last_calibration  DATE,
  next_calibration  DATE,
  status            TEXT NOT NULL DEFAULT 'Vigente' CHECK (status IN ('Vigente','Vencido','Fuera de Servicio')),
  certificate_url   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Columnas auditables (idempotente)
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS equipment_type             TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS location                   TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS used_in_process            TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS responsible                TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS measurement_range          TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS tolerance                  TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS calibration_lab            TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS certificate_number         TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS traceability_pattern       TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS calibration_frequency_months  INT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS deviation_notes            TEXT;

-- 3. Histórico de calibraciones
CREATE TABLE IF NOT EXISTS calibration_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  equipment_id        UUID NOT NULL REFERENCES equipment_calibration(id) ON DELETE CASCADE,
  calibration_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  next_calibration    DATE,
  certificate_number  TEXT,
  certificate_url     TEXT,
  calibration_lab     TEXT,
  result              TEXT,                     -- 'Conforme' | 'Con desviación' | 'No conforme'
  deviation_notes     TEXT,
  actions_taken       TEXT,
  recorded_by         UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calibration_history_equipment ON calibration_history(equipment_id, calibration_date DESC);
CREATE INDEX IF NOT EXISTS idx_calibration_history_org       ON calibration_history(org_id);

-- 4. RLS
ALTER TABLE equipment_calibration ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ec_select" ON equipment_calibration;
CREATE POLICY "ec_select" ON equipment_calibration FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "ec_insert" ON equipment_calibration;
CREATE POLICY "ec_insert" ON equipment_calibration FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "ec_update" ON equipment_calibration;
CREATE POLICY "ec_update" ON equipment_calibration FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "ec_delete" ON equipment_calibration;
CREATE POLICY "ec_delete" ON equipment_calibration FOR DELETE USING (org_id = auth_org_id());

ALTER TABLE calibration_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ch_select" ON calibration_history;
CREATE POLICY "ch_select" ON calibration_history FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "ch_insert" ON calibration_history;
CREATE POLICY "ch_insert" ON calibration_history FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "ch_update" ON calibration_history;
CREATE POLICY "ch_update" ON calibration_history FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "ch_delete" ON calibration_history;
CREATE POLICY "ch_delete" ON calibration_history FOR DELETE USING (org_id = auth_org_id());

-- 5. Índices útiles
CREATE INDEX IF NOT EXISTS idx_equipment_calibration_org    ON equipment_calibration(org_id);
CREATE INDEX IF NOT EXISTS idx_equipment_calibration_next   ON equipment_calibration(next_calibration);
CREATE INDEX IF NOT EXISTS idx_equipment_calibration_status ON equipment_calibration(status);

NOTIFY pgrst, 'reload schema';
