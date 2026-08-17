-- =============================================================================
-- Fix: la funcion log_changes() (trigger universal de auditoria) intenta
-- insertar en audit_logs con org_id = OLD.org_id durante el CASCADE del
-- DELETE de organizations. Como la org ya esta por eliminarse, el INSERT
-- viola el FK audit_logs.org_id -> organizations(id).
--
-- Fix: extender el bypass de app.deleting_org a log_changes tambien.
-- Cuando el super_admin borra una org, no logueamos los DELETEs individuales
-- (serian logs huerfanos igual — el log macro de "delete_organization" ya
-- quedo en admin_audit_log antes del DELETE).
-- =============================================================================

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
  v_org_id UUID;
BEGIN
  -- Bypass: cuando super_admin esta eliminando la org completa via RPC,
  -- no logueamos los DELETEs individuales de las filas hijas.
  IF current_setting('app.deleting_org', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := OLD.id;
    v_org_id := OLD.org_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id;
    v_org_id := NEW.org_id;
  ELSE
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id;
    v_org_id := NEW.org_id;
  END IF;

  INSERT INTO audit_logs (user_id, org_id, action, table_name, record_id, old_data, new_data)
  VALUES (auth.uid(), v_org_id, TG_OP, TG_TABLE_NAME, v_record_id, v_old, v_new);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
