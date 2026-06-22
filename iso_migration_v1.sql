-- 1. Tabla de Auditoría (Log inmutable)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR(50) NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de Documentos con Historial (Reemplaza estructura anterior si es necesario)
CREATE TABLE IF NOT EXISTS documents_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_group_id UUID NOT NULL, -- ID agrupa versiones
  code VARCHAR(20) NOT NULL,
  title TEXT NOT NULL,
  type VARCHAR(50), -- Tipo de documento (Manual, Política, etc.)
  version VARCHAR(10) NOT NULL,
  content_url TEXT,
  status VARCHAR(20) CHECK (status IN ('Borrador', 'Vigente', 'Obsoleto')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Trigger de Auditoría
CREATE OR REPLACE FUNCTION log_changes() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), row_to_json(OLD), row_to_json(NEW));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_documents ON documents_versions;
CREATE TRIGGER audit_documents
AFTER INSERT OR UPDATE OR DELETE ON documents_versions
FOR EACH ROW EXECUTE FUNCTION log_changes();
