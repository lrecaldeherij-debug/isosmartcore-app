-- iso_migration_v7_company_profile.sql
-- Module 0: Understanding the Organization (Company Profile)

-- 1. Create the table
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

-- 2. RLS Policies
ALTER TABLE company_profile ENABLE ROW LEVEL SECURITY;

-- Allow users to see their own profile
CREATE POLICY "Users can view own company profile"
ON company_profile FOR SELECT
TO authenticated
USING (true);

-- Allow users to insert their own profile
CREATE POLICY "Users can insert own company profile"
ON company_profile FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own company profile"
ON company_profile FOR UPDATE
TO authenticated
USING (true);

-- 3. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_company_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_company_profile_updated_at ON company_profile;
CREATE TRIGGER tr_company_profile_updated_at
BEFORE UPDATE ON company_profile
FOR EACH ROW
EXECUTE FUNCTION update_company_profile_updated_at();
