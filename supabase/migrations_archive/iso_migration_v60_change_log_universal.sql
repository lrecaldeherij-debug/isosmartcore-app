-- =============================================================================
-- v60 — change_log universal + columnas auditables comunes
--
-- Varias migraciones auditables (v42 processes, v43 job_descriptions, etc.)
-- definieron change_log SOLO en CREATE TABLE IF NOT EXISTS, no en ALTER. Las
-- orgs con tablas pre-existentes nunca recibieron la columna y el form falla
-- con "Could not find the 'change_log' column of 'X' in the schema cache".
--
-- Esta migración agrega change_log + review/approval columns comunes a TODA
-- tabla auditable que exista, con skip silencioso si no existe.
-- =============================================================================

CREATE OR REPLACE FUNCTION _ensure_audit_cols(tbl TEXT) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
    RAISE NOTICE 'Tabla % no existe, skip', tbl;
    RETURN;
  END IF;

  -- change_log JSONB (auditoría)
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS change_log JSONB DEFAULT ''[]''::jsonb', tbl);

  -- Columnas comunes de revisión / aprobación (no fallan si la tabla no las usa)
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS last_reviewed_date DATE', tbl);
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS next_review_date DATE', tbl);

  RAISE NOTICE 'OK %', tbl;
END;
$$;

-- Tablas auditables principales
SELECT _ensure_audit_cols('context_analysis');
SELECT _ensure_audit_cols('stakeholders');
SELECT _ensure_audit_cols('scope_declaration');
SELECT _ensure_audit_cols('quality_policy');
SELECT _ensure_audit_cols('processes');
SELECT _ensure_audit_cols('job_descriptions');
SELECT _ensure_audit_cols('risk_matrix');
SELECT _ensure_audit_cols('quality_objectives');
SELECT _ensure_audit_cols('strategic_actions');
SELECT _ensure_audit_cols('training_records');
SELECT _ensure_audit_cols('personnel');
SELECT _ensure_audit_cols('suppliers');
SELECT _ensure_audit_cols('customer_requirements');
SELECT _ensure_audit_cols('documents');
SELECT _ensure_audit_cols('communication_matrix');
SELECT _ensure_audit_cols('production_orders');
SELECT _ensure_audit_cols('qc_release');
SELECT _ensure_audit_cols('operational_incidents');
SELECT _ensure_audit_cols('non_conformities');
SELECT _ensure_audit_cols('internal_audits');
SELECT _ensure_audit_cols('improvement_opportunities');
SELECT _ensure_audit_cols('management_review');
SELECT _ensure_audit_cols('management_review_actions');
SELECT _ensure_audit_cols('objective_measurements');

DROP FUNCTION IF EXISTS _ensure_audit_cols(TEXT);

NOTIFY pgrst, 'reload schema';
