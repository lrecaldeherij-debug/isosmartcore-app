-- iso_migration_v9_audit_trigger_fix.sql
-- Corrige el bug del trigger log_changes() de v1/v2:
--   * En DELETE, NEW es NULL → row_to_json(NEW) explotaba.
--   * El trigger debe retornar OLD en DELETE (no NEW).
--   * SECURITY DEFINER para que el INSERT en audit_logs no dependa
--     de los permisos del usuario que dispara el cambio.

CREATE OR REPLACE FUNCTION log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_record_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := OLD.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id;
  ELSE  -- INSERT
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id;
  END IF;

  INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, v_record_id, v_old, v_new);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Asegurar que el dueño del trigger pueda insertar en audit_logs
-- sin importar las políticas RLS de la tabla destino.
ALTER FUNCTION log_changes() OWNER TO postgres;
