-- =============================================================================
-- v67 — MASTER SYNC: sincronizar schema completo con lo que espera el código
--
-- Consolida todos los ADD COLUMN IF NOT EXISTS de las 66 migraciones previas
-- en un único script idempotente. Corrélo una vez para asegurar que tu DB
-- tiene TODAS las columnas que el código deployado espera.
--
-- ¿Por qué es necesario?
-- Supabase no trackea qué migraciones aplicaste. Si alguna te la salteaste
-- (ej. porque se creó después de que ya usabas ese módulo), el código intenta
-- guardar en columnas que no existen y te sale error tipo:
--   "Could not find the 'X' column of 'Y' in the schema cache"
--
-- Es seguro correrlo:
-- - Todas las declaraciones usan IF NOT EXISTS → no rompe si la columna ya está
-- - No borra ni modifica datos existentes
-- - No modifica columnas existentes (no cambia tipos, defaults, etc.)
-- - Solo agrega columnas que faltan
--
-- Al final se ejecuta NOTIFY pgrst 'reload schema' para refrescar el cache
-- de PostgREST — sin eso, aunque la columna exista, el API cliente puede
-- seguir viendo el schema viejo unos minutos.
-- =============================================================================

BEGIN;

ALTER TABLE climate_surveys ADD COLUMN IF NOT EXISTS evidence_url TEXT;
ALTER TABLE climate_surveys ADD COLUMN IF NOT EXISTS notes        TEXT;
ALTER TABLE climate_surveys ADD COLUMN IF NOT EXISTS survey_date  DATE DEFAULT CURRENT_DATE;
ALTER TABLE communication_matrix ADD COLUMN IF NOT EXISTS category          TEXT;   -- 'Rutinaria' | 'Gestión'
ALTER TABLE communication_matrix ADD COLUMN IF NOT EXISTS channel           TEXT;   -- 'Email' | 'Reunión' | 'Intranet' | 'WhatsApp' | 'Cartelera' | 'Informe' | 'Otro'
ALTER TABLE communication_matrix ADD COLUMN IF NOT EXISTS evidence_url      TEXT;   -- link al registro real (acta, email, post intranet, etc.)
ALTER TABLE communication_matrix ADD COLUMN IF NOT EXISTS external_target   TEXT;   -- 'Clientes' | 'Proveedores' | 'Reguladores' | 'Comunidad' | 'Otros'
ALTER TABLE communication_matrix ADD COLUMN IF NOT EXISTS frequency         TEXT;   -- 'Diaria' | 'Semanal' | 'Mensual' | 'Trimestral' | 'Anual' | 'Por evento'
ALTER TABLE communication_matrix ADD COLUMN IF NOT EXISTS notes             TEXT;
ALTER TABLE communication_matrix ADD COLUMN IF NOT EXISTS responsible_role  TEXT;   -- rol del responsable (ej "Coordinador SGC")
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS change_log           JSONB DEFAULT '[]'::jsonb;
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS crossover_strategy   TEXT;
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS impact_level         TEXT DEFAULT 'Medio';
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS linked_risk_id       UUID REFERENCES risk_matrix(id) ON DELETE SET NULL;
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS linked_stakeholder_id UUID REFERENCES stakeholders(id) ON DELETE SET NULL;
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS next_review_date     DATE;
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS priority_score       INT;
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS probability          TEXT DEFAULT 'Medio';
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS status               TEXT DEFAULT 'Activo';
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS acceptance_date         DATE;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS capacity_review         TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS change_log              JSONB DEFAULT '[]'::jsonb;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS currency                TEXT DEFAULT 'USD';
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_contact_person TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_email          TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_phone          TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS evidence_url            TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS notes                   TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS priority                TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS quoted_amount           NUMERIC;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS requirements_implicit   TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS requirements_legal      TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS reviewed_at             DATE;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS reviewed_by             TEXT;
ALTER TABLE documents_versions  ADD COLUMN IF NOT EXISTS content_url         TEXT;
ALTER TABLE documents_versions  ADD COLUMN IF NOT EXISTS type                TEXT;
ALTER TABLE documents_versions ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE documents_versions ADD COLUMN IF NOT EXISTS change_summary   TEXT;
ALTER TABLE documents_versions ADD COLUMN IF NOT EXISTS document_owner   TEXT;
ALTER TABLE documents_versions ADD COLUMN IF NOT EXISTS is_record        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE documents_versions ADD COLUMN IF NOT EXISTS retention_until  DATE;
ALTER TABLE documents_versions ADD COLUMN IF NOT EXISTS review_date      DATE;
ALTER TABLE documents_versions ADD COLUMN IF NOT EXISTS tags             TEXT[];
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS calibration_frequency_months  INT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS calibration_lab            TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS certificate_number         TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS deviation_notes            TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS equipment_type             TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS location                   TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS measurement_range          TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS responsible                TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS tolerance                  TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS traceability_pattern       TEXT;
ALTER TABLE equipment_calibration ADD COLUMN IF NOT EXISTS used_in_process            TEXT;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS actual_date      DATE;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS audit_criteria   TEXT;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS audit_scope      TEXT;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS audit_team       JSONB DEFAULT '[]'::jsonb;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS audit_type       TEXT DEFAULT 'Programada';
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS change_log       JSONB DEFAULT '[]'::jsonb;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS conclusions      TEXT;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS findings_count   INT DEFAULT 0;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS lead_auditor     TEXT;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS planned_date     DATE;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS process_id       UUID REFERENCES processes(id) ON DELETE SET NULL;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS recommendations  TEXT;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'Planificada';
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS year             INT;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS area             TEXT;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS authorities_json    JSONB DEFAULT '[]'::jsonb;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS change_log          JSONB DEFAULT '[]'::jsonb;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS competencies_json   JSONB DEFAULT '{}'::jsonb;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS current_holder      TEXT;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS current_holder_since DATE;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS document_url TEXT;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS is_sgc_responsible  BOOLEAN DEFAULT false;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS parent_id        UUID REFERENCES job_descriptions(id) ON DELETE SET NULL;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS position_index   INT DEFAULT 0;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS raci_json           JSONB DEFAULT '[]'::jsonb;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS status              TEXT DEFAULT 'Activo';
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS agenda             TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS attendees          JSONB DEFAULT '[]'::jsonb;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS chairperson        TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS change_log         JSONB DEFAULT '[]'::jsonb;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_audit_results       TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_changes             TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_customer_feedback   TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_nonconformities     TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_objectives          TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_performance         TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_previous_actions    TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_resources           TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_risks               TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_supplier_performance TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS outputs_changes_needed     TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS outputs_improvement_opportunities TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS outputs_resource_needs     TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS period_end         DATE;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS period_start       DATE;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS report_url         TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS review_type        TEXT DEFAULT 'Anual';
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS status             TEXT DEFAULT 'Programada';
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS audit_id                 UUID REFERENCES internal_audits(id) ON DELETE SET NULL;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS change_log               JSONB DEFAULT '[]'::jsonb;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS closed_by                TEXT;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS closure_date             DATE;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS correction               TEXT;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS cost_impact              NUMERIC;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS currency                 TEXT DEFAULT 'PYG';
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS customer_name            TEXT;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS detected_by              TEXT;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS detection_date           DATE;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS due_date                 DATE;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS effectiveness_check_date DATE;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS effectiveness_evaluator  TEXT;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS effectiveness_notes      TEXT;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS effectiveness_result     TEXT DEFAULT 'Pendiente';
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS evidence_url TEXT;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS five_whys                JSONB DEFAULT '[]'::jsonb;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS improvement_opportunity_id UUID REFERENCES improvement_opportunities(id) ON DELETE SET NULL;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS is_recurrent             BOOLEAN DEFAULT false;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS process_id               UUID REFERENCES processes(id) ON DELETE SET NULL;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS recurrent_of_id          UUID REFERENCES non_conformities(id) ON DELETE SET NULL;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS risk_id                  UUID REFERENCES risk_matrix(id) ON DELETE SET NULL;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS severity                 TEXT;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS supplier_id              UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS type                     TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS actions_taken         TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS asset_condition       TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS asset_description     TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS asset_location        TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS change_log            JSONB DEFAULT '[]'::jsonb;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS change_planned        BOOLEAN DEFAULT true;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS change_what           TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS change_why            TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS client_name           TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS client_notified       BOOLEAN DEFAULT false;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS client_notified_at    DATE;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS customer_order_id     UUID REFERENCES customer_orders(id) ON DELETE SET NULL;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS evidence_url          TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS linked_nc_id          UUID;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS production_order_id   UUID REFERENCES production_orders(id) ON DELETE SET NULL;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS severity              TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS status                TEXT DEFAULT 'Abierto';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_prompts_used_month   INT DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_usage_reset_at       DATE DEFAULT CURRENT_DATE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_cycle           TEXT DEFAULT 'monthly';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS canceled_at             TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS current_period_end      TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_completed_at   TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_current_step   INT DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_skipped_at     TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_id                 TEXT REFERENCES plans(id) DEFAULT 'starter';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status     TEXT DEFAULT 'trialing';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_ends_at           TIMESTAMPTZ;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS change_log            JSONB DEFAULT '[]'::jsonb;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS competency_gap        TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS document_id             TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS education_institution   TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS education_year          INT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS email                   TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS evidence_url            TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS job_id                UUID REFERENCES job_descriptions(id) ON DELETE SET NULL;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS next_evaluation_date  DATE;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS phone                   TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS process_id            UUID REFERENCES processes(id) ON DELETE SET NULL;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS start_date              DATE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS change_log             JSONB DEFAULT '[]'::jsonb;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS interactions_downstream JSONB DEFAULT '[]'::jsonb;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS interactions_upstream   JSONB DEFAULT '[]'::jsonb;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS last_reviewed_at       DATE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS next_review_date       DATE;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS procedure_url TEXT;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS process_owner          TEXT;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS process_owner_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS revision               TEXT DEFAULT 'v1.0';
ALTER TABLE processes ADD COLUMN IF NOT EXISTS status                 TEXT DEFAULT 'Activo';
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS actual_end_date      TIMESTAMPTZ;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS actual_start_date    TIMESTAMPTZ;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS change_log           JSONB DEFAULT '[]'::jsonb;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS customer_order_id    UUID REFERENCES customer_orders(id) ON DELETE SET NULL;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS equipment_used       JSONB DEFAULT '[]'::jsonb;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS evidence_url         TEXT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS operator             TEXT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS planned_end_date     DATE;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS priority             TEXT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS process_instructions TEXT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS product_spec         TEXT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS quality_criteria     TEXT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS raw_materials        JSONB DEFAULT '[]'::jsonb;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS supervisor           TEXT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS unit                 TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS approved_at                DATE;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS approved_by                TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS baseline_value             NUMERIC;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS category                   TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS change_log                 JSONB DEFAULT '[]'::jsonb;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS comm_method                TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS created_at                 TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS current                    NUMERIC;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS evidence_url               TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS evidence_url TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS frequency                  TEXT DEFAULT 'Mensual';
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS improvement_opportunity_id UUID REFERENCES improvement_opportunities(id) ON DELETE SET NULL;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS indicator                  TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS is_achievable              BOOLEAN DEFAULT false;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS is_measurable              BOOLEAN DEFAULT false;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS is_relevant                BOOLEAN DEFAULT false;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS is_specific                BOOLEAN DEFAULT false;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS is_time_bound              BOOLEAN DEFAULT false;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS name                       TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS objective                  TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS policy_id                  UUID REFERENCES quality_policy(id) ON DELETE SET NULL;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS process_ids                JSONB DEFAULT '[]'::jsonb;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS responsible                TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS risk_id                    UUID REFERENCES risk_matrix(id) ON DELETE SET NULL;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS start_date                 DATE;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS status                     TEXT DEFAULT 'Borrador';
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS strategic_action_id        UUID REFERENCES strategic_actions(id) ON DELETE SET NULL;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS target                     NUMERIC;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS target_date                DATE;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS unit                       TEXT DEFAULT '%';
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS year                       INT;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS alignment_with_objectives TEXT;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS approved_at           DATE;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS approved_by           TEXT;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS approved_role         TEXT;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS change_log            JSONB DEFAULT '[]'::jsonb;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS communicated_at       DATE;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS communication_audience TEXT;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS communication_evidence_url TEXT;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS communication_method  TEXT;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS document_url          TEXT;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS next_review_date      DATE;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS revision              TEXT DEFAULT 'v1.0';
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS status                TEXT DEFAULT 'Borrador';
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS control_measure     TEXT;
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS impact_initial      INT;
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS probability_initial INT;
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS process_area        TEXT;
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS responsible         TEXT;
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS risk_description    TEXT;
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS score_initial       INT;
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS status              TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS approved_at                DATE;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS approved_by                TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS category                   TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS change_log                 JSONB DEFAULT '[]'::jsonb;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS context_id                 UUID REFERENCES context_analysis(id) ON DELETE SET NULL;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS currency                   TEXT DEFAULT 'PYG';
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS due_date                   DATE;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS execution_date          DATE;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS identification_date        DATE DEFAULT CURRENT_DATE;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS impact_residual         INT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS improvement_opportunity_id UUID REFERENCES improvement_opportunities(id) ON DELETE SET NULL;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS kri_current                TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS kri_indicator              TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS kri_target                 TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS owner                      TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS potential_cause            TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS potential_consequence      TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS probability_residual    INT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS process_id                 UUID REFERENCES processes(id) ON DELETE SET NULL;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS review_date                DATE;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS stakeholder_id             UUID REFERENCES stakeholders(id) ON DELETE SET NULL;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS strategic_action_id        UUID REFERENCES strategic_actions(id) ON DELETE SET NULL;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS treatment_cost             NUMERIC;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS treatment_strategy         TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS type                       TEXT DEFAULT 'Riesgo';
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS approved_at          DATE;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS approved_by          TEXT;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS approved_role        TEXT;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS change_log           JSONB DEFAULT '[]'::jsonb;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS document_url         TEXT;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS iso_exclusions       JSONB DEFAULT '[]'::jsonb;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS linked_processes_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS next_review_date     DATE;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS revision             TEXT DEFAULT 'v1.0';
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS status               TEXT DEFAULT 'Borrador';
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS category             TEXT DEFAULT 'Cliente';
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS change_log           JSONB DEFAULT '[]'::jsonb;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS communication_strategy TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS compliance_date      DATE;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS engagement_strategy  TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS evaluation_method    TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS evidence_url         TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS evidence_url TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS interest_level       TEXT DEFAULT 'Medio';
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS last_reviewed_at     DATE;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS next_review_date     DATE;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS planning_in_sgc      TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS power_level          TEXT DEFAULT 'Medio';
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS responsible          TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS status               TEXT DEFAULT 'Pendiente';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address                   TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category                  TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS change_log                JSONB DEFAULT '[]'::jsonb;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_email             TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_name              TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_phone             TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS country                   TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS criteria_delivery         INT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS criteria_price            INT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS criteria_quality          INT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS criteria_service          INT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS criticality               TEXT DEFAULT 'Normal';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS evaluation_date           DATE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS evidence_url              TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS last_evaluation_by        TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS next_evaluation_date      DATE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes                     TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS requirements_communicated TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS requirements_communicated_at DATE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_id                    TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS website                   TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS attendance_url             TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS certificate_url            TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS change_log                 JSONB DEFAULT '[]'::jsonb;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS competency_gap_origin      TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS cost                       NUMERIC;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS currency                   TEXT DEFAULT 'PYG';
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS duration_hours             NUMERIC;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS efficacy_criteria          TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS efficacy_evaluation_date   DATE;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS efficacy_evaluator         TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS efficacy_result            TEXT DEFAULT 'Pendiente';
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS learning_objective         TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS material_url               TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS modality                   TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS planned_quarter            INT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS planned_year               INT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS target_job_ids             JSONB DEFAULT '[]'::jsonb;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS target_process_ids         JSONB DEFAULT '[]'::jsonb;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS type                       TEXT;

-- Refresh schema cache de PostgREST (fuerza que el API vea las columnas nuevas)
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación: total de columnas por tabla ISO relevante
SELECT table_name, COUNT(*) AS total_columns
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN (
     'organizations', 'user_profiles', 'processes', 'context_analysis',
     'stakeholders', 'quality_objectives', 'risks_opportunities',
     'nonconformities', 'internal_audits', 'management_reviews',
     'improvement_opportunities', 'documents', 'training_records',
     'personnel', 'suppliers', 'climate_surveys', 'communication_matrix',
     'calibration_equipment', 'customer_orders', 'production_orders',
     'qc_inspections', 'operational_incidents', 'plans'
   )
 GROUP BY table_name
 ORDER BY table_name;
