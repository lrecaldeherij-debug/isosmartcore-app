-- iso_migration_v8_company_logo_web.sql
-- (Corregido) Incluye la creación de la tabla si no existe, y agrega columnas Logo/Web

-- 1. Asegurar que la tabla existe (Copiado de v7 por si no se ejecutó)
CREATE TABLE IF NOT EXISTS company_profile (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    industry TEXT,
    description TEXT,
    employees_count TEXT,
    strategic_direction TEXT,
    founded_year TEXT,
    main_products TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Habilitar RLS si no se ha hecho
ALTER TABLE company_profile ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas de seguridad de forma segura (para no fallar si ya existen)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_profile' AND policyname = 'Users can view own company profile') THEN
        CREATE POLICY "Users can view own company profile" ON company_profile FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_profile' AND policyname = 'Users can insert own company profile') THEN
        CREATE POLICY "Users can insert own company profile" ON company_profile FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'company_profile' AND policyname = 'Users can update own company profile') THEN
        CREATE POLICY "Users can update own company profile" ON company_profile FOR UPDATE TO authenticated USING (true);
    END IF;
END $$;

-- 4. Agregar columnas nuevas (Logo y Website)
DO $$
BEGIN
    -- Agregar columna para "URL del Logo"
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_profile' AND column_name = 'logo_url') THEN
        ALTER TABLE company_profile ADD COLUMN logo_url TEXT;
    END IF;

    -- Agregar columna para "Sitio Web"
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_profile' AND column_name = 'website_url') THEN
        ALTER TABLE company_profile ADD COLUMN website_url TEXT;
    END IF;
END $$;
