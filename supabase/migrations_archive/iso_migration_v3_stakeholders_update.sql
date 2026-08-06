-- iso_migration_v3_stakeholders_update.sql
-- Agregar nuevas columnas a la tabla stakeholders para alinear con el formato Excel

DO $$
BEGIN
    -- 1. Agregar columna para "Planificación en el SGC"
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stakeholders' AND column_name = 'planning_in_sgc') THEN
        ALTER TABLE stakeholders ADD COLUMN planning_in_sgc TEXT;
    END IF;

    -- 2. Agregar columna para "Método de Evaluación / Seguimiento"
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stakeholders' AND column_name = 'evaluation_method') THEN
        ALTER TABLE stakeholders ADD COLUMN evaluation_method TEXT;
    END IF;

    -- 3. Agregar columna para "Responsable"
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stakeholders' AND column_name = 'responsible') THEN
        ALTER TABLE stakeholders ADD COLUMN responsible TEXT;
    END IF;
    
    -- 4. Asegurarse de que exista user_id si no estaba (para la seguridad RLS)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stakeholders' AND column_name = 'user_id') THEN
        ALTER TABLE stakeholders ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;

END $$;
