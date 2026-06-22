-- iso_migration_v17_storage_documents.sql
-- Bucket privado `documents` para archivos del SGC.
-- Convención de path: <org_id>/<document_group_id>/<filename>
-- Las políticas RLS sobre storage.objects fuerzan que cada org solo vea sus archivos.
--
-- Acceso desde el cliente:
--   - subida: supabase.storage.from('documents').upload(`${org_id}/${group}/${name}`, file)
--   - descarga: supabase.storage.from('documents').createSignedUrl(path, 60) → enlace temporal
--
-- Importante: el bucket NO es público. Sólo se accede vía signed URL emitido para
-- usuarios autenticados de la propia org.

-- =============================================================================
-- 1. Crear el bucket (privado)
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. Helper: extraer el org_id desde el primer segmento del path
-- =============================================================================
CREATE OR REPLACE FUNCTION storage_path_org_id(p_name TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(p_name, '/', 1), '')::UUID
$$;

-- =============================================================================
-- 3. Políticas RLS sobre storage.objects (solo del bucket 'documents')
-- =============================================================================
DROP POLICY IF EXISTS documents_select_own_org ON storage.objects;
CREATE POLICY documents_select_own_org ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND storage_path_org_id(name) = auth_org_id()
  );

DROP POLICY IF EXISTS documents_insert_own_org ON storage.objects;
CREATE POLICY documents_insert_own_org ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND storage_path_org_id(name) = auth_org_id()
    AND auth_role() IN ('owner'::org_role, 'quality_manager'::org_role)
  );

DROP POLICY IF EXISTS documents_update_own_org ON storage.objects;
CREATE POLICY documents_update_own_org ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND storage_path_org_id(name) = auth_org_id()
    AND auth_role() IN ('owner'::org_role, 'quality_manager'::org_role)
  );

DROP POLICY IF EXISTS documents_delete_own_org ON storage.objects;
CREATE POLICY documents_delete_own_org ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND storage_path_org_id(name) = auth_org_id()
    AND auth_role() = 'owner'::org_role
  );

-- =============================================================================
-- 4. Agregar columna storage_path a documents_versions para guardar el path
--    cuando el usuario sube un archivo (en vez de pegar una URL externa).
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_versions' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE documents_versions ADD COLUMN storage_path TEXT;
  END IF;
END $$;
