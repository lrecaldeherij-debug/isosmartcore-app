-- iso_migration_v2_audit_triggers.sql
-- Aplica el trigger de auditoría a todas las tablas críticas del sistema

-- 1. Asegurar que la función existe (ya debería existir por v1, pero por seguridad)
CREATE OR REPLACE FUNCTION log_changes() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), row_to_json(OLD), row_to_json(NEW));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Triggers para Contexto y Liderazgo
DROP TRIGGER IF EXISTS audit_risk_matrix ON risk_matrix;
CREATE TRIGGER audit_risk_matrix
AFTER INSERT OR UPDATE OR DELETE ON risk_matrix
FOR EACH ROW EXECUTE FUNCTION log_changes();

DROP TRIGGER IF EXISTS audit_quality_objectives ON quality_objectives;
CREATE TRIGGER audit_quality_objectives
AFTER INSERT OR UPDATE OR DELETE ON quality_objectives
FOR EACH ROW EXECUTE FUNCTION log_changes();

-- 3. Triggers para Evaluación y Mejora
DROP TRIGGER IF EXISTS audit_internal_audits ON internal_audits;
CREATE TRIGGER audit_internal_audits
AFTER INSERT OR UPDATE OR DELETE ON internal_audits
FOR EACH ROW EXECUTE FUNCTION log_changes();

DROP TRIGGER IF EXISTS audit_non_conformities ON non_conformities;
CREATE TRIGGER audit_non_conformities
AFTER INSERT OR UPDATE OR DELETE ON non_conformities
FOR EACH ROW EXECUTE FUNCTION log_changes();

DROP TRIGGER IF EXISTS audit_management_review ON management_review;
CREATE TRIGGER audit_management_review
AFTER INSERT OR UPDATE OR DELETE ON management_review
FOR EACH ROW EXECUTE FUNCTION log_changes();

-- 4. Opcional: Tablas de configuración si existen (ej. processes, job_descriptions)
-- Asumiendo que existen según el código de RisksOpportunities.jsx
DROP TRIGGER IF EXISTS audit_processes ON processes;
CREATE TRIGGER audit_processes
AFTER INSERT OR UPDATE OR DELETE ON processes
FOR EACH ROW EXECUTE FUNCTION log_changes();

DROP TRIGGER IF EXISTS audit_job_descriptions ON job_descriptions;
CREATE TRIGGER audit_job_descriptions
AFTER INSERT OR UPDATE OR DELETE ON job_descriptions
FOR EACH ROW EXECUTE FUNCTION log_changes();
