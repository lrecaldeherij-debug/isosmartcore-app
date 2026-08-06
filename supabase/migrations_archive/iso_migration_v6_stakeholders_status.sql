-- iso_migration_v6_stakeholders_status.sql
-- Agregar nuevas columnas para Fecha de Cumplimiento y Estatus

DO $$
BEGIN
    -- 1. Agregar columna para "Fecha de Cumplimiento"
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stakeholders' AND column_name = 'compliance_date') THEN
        ALTER TABLE stakeholders ADD COLUMN compliance_date TEXT;
    END IF;

    -- 2. Agregar columna para "Status" (Listo, Pendiente, En Proceso, etc.)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stakeholders' AND column_name = 'status') THEN
        ALTER TABLE stakeholders ADD COLUMN status TEXT DEFAULT 'Pendiente';
    END IF;

END $$;
