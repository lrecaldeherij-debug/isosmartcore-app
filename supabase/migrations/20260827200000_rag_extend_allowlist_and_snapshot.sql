-- =============================================================================
-- RAG Copilot v2 — extender allowlist a 6 tablas más + RPC get_sgc_snapshot
--
-- Post-feedback en producción: el copilot respondía literal ("4.4 al 50%")
-- porque (1) solo veía riesgos/NCs/documentos, no procesos ni política ni
-- objetivos; y (2) no tenía un resumen ejecutivo del estado del SGC para
-- detectar inconsistencias del usuario.
--
-- Cambios:
--   A) Allowlist rag_chunks.source_table ahora incluye: context_analysis,
--      processes, quality_policy, quality_objectives, internal_audits,
--      management_review. Total 9 tablas indexables.
--   B) Nueva RPC get_sgc_snapshot(p_org_id) que devuelve JSON con % por
--      cláusula ISO + counts operativos. copilot-chat la llama antes del
--      retrieval y la anexa al prompt como "ESTADO ACTUAL DEL SGC".
-- =============================================================================

BEGIN;

-- ─── A. Ampliar allowlist ──────────────────────────────────────────────────
ALTER TABLE rag_chunks DROP CONSTRAINT IF EXISTS rag_chunks_source_table_check;
ALTER TABLE rag_chunks ADD CONSTRAINT rag_chunks_source_table_check
  CHECK (source_table IN (
    'risk_matrix',
    'non_conformities',
    'documents_versions',
    'context_analysis',
    'processes',
    'quality_policy',
    'quality_objectives',
    'internal_audits',
    'management_review'
  ));

-- ─── B. RPC get_sgc_snapshot ───────────────────────────────────────────────
-- Devuelve un JSON compacto con el estado del SGC para inyectar al copiloto.
-- No pretende ser 100% idéntico a computeImplementation() del frontend, es
-- una versión simplificada que cubre las cláusulas más consultadas + counts
-- operativos. SECURITY DEFINER — bypassa RLS; caller (copilot-chat) valida
-- p_org_id contra la org efectiva del user antes de invocar.
CREATE OR REPLACE FUNCTION get_sgc_snapshot(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_total    INT := 0;
  v_context_reviewed INT := 0;
  v_stakeholders     INT := 0;
  v_stakeholders_ok  INT := 0;
  v_scope_exists     BOOLEAN := false;
  v_processes        INT := 0;
  v_policy_status    TEXT;
  v_owner_count      INT := 0;
  v_sgc_resp         INT := 0;
  v_risks_total      INT := 0;
  v_risks_high       INT := 0;
  v_risks_untreated  INT := 0;
  v_objectives       INT := 0;
  v_obj_measured     INT := 0;
  v_personnel        INT := 0;
  v_personnel_gap    INT := 0;
  v_comm             INT := 0;
  v_calib            INT := 0;
  v_docs             INT := 0;
  v_docs_obsolete    INT := 0;
  v_docs_due_review  INT := 0;
  v_audits_planned   INT := 0;
  v_audits_done      INT := 0;
  v_reviews_recent   INT := 0;
  v_ncs_open         INT := 0;
  v_ncs_overdue      INT := 0;
  v_opps_open        INT := 0;
BEGIN
  -- 4.1 Contexto
  SELECT COUNT(*), COUNT(*) FILTER (WHERE last_reviewed_date >= (CURRENT_DATE - INTERVAL '12 months'))
    INTO v_context_total, v_context_reviewed
    FROM context_analysis WHERE org_id = p_org_id;

  -- 4.2 Partes interesadas
  SELECT COUNT(*), COUNT(*) FILTER (WHERE needs IS NOT NULL AND length(needs) > 0)
    INTO v_stakeholders, v_stakeholders_ok
    FROM stakeholders WHERE org_id = p_org_id;

  -- 4.3 Alcance
  SELECT EXISTS(SELECT 1 FROM scope_declaration WHERE org_id = p_org_id AND scope_text IS NOT NULL)
    INTO v_scope_exists;

  -- 4.4 Procesos
  SELECT COUNT(*) INTO v_processes FROM processes WHERE org_id = p_org_id;

  -- 5.2 Política
  SELECT status INTO v_policy_status FROM quality_policy WHERE org_id = p_org_id LIMIT 1;

  -- 5.3 Roles
  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_sgc_responsible)
    INTO v_owner_count, v_sgc_resp
    FROM job_descriptions WHERE org_id = p_org_id;

  -- 6.1 Riesgos
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE score_initial >= 15),
         COUNT(*) FILTER (WHERE control_measure IS NULL OR length(control_measure) = 0)
    INTO v_risks_total, v_risks_high, v_risks_untreated
    FROM risk_matrix WHERE org_id = p_org_id;

  -- 6.2 Objetivos
  SELECT COUNT(*) INTO v_objectives FROM quality_objectives WHERE org_id = p_org_id;
  SELECT COUNT(DISTINCT objective_id) INTO v_obj_measured
    FROM objective_measurements
    WHERE objective_id IN (SELECT id FROM quality_objectives WHERE org_id = p_org_id);

  -- 7.2 Personal / competencias
  SELECT COUNT(*), COUNT(*) FILTER (WHERE competency_gap IS NOT NULL AND length(competency_gap) > 0)
    INTO v_personnel, v_personnel_gap
    FROM personnel WHERE org_id = p_org_id;

  -- 7.4 Comunicación
  SELECT COUNT(*) INTO v_comm FROM communication_matrix WHERE org_id = p_org_id;

  -- 7.1.5 Calibración
  SELECT COUNT(*) INTO v_calib FROM equipment_calibration WHERE org_id = p_org_id;

  -- 7.5 Documentos
  SELECT COUNT(DISTINCT document_group_id),
         COUNT(*) FILTER (WHERE status = 'Obsoleto'),
         COUNT(*) FILTER (WHERE review_date IS NOT NULL AND review_date <= (CURRENT_DATE + INTERVAL '30 days'))
    INTO v_docs, v_docs_obsolete, v_docs_due_review
    FROM documents_versions WHERE org_id = p_org_id;

  -- 9.2 Auditorías internas
  SELECT COUNT(*) FILTER (WHERE year = EXTRACT(YEAR FROM CURRENT_DATE)::INT),
         COUNT(*) FILTER (WHERE is_finished AND year = EXTRACT(YEAR FROM CURRENT_DATE)::INT)
    INTO v_audits_planned, v_audits_done
    FROM internal_audits WHERE org_id = p_org_id;

  -- 9.3 Revisión por la dirección
  SELECT COUNT(*) INTO v_reviews_recent
    FROM management_review
    WHERE org_id = p_org_id
      AND review_date >= (CURRENT_DATE - INTERVAL '12 months');

  -- 10.2 NCs
  SELECT COUNT(*) FILTER (WHERE status NOT IN ('Cerrada', 'Verificada')),
         COUNT(*) FILTER (WHERE status NOT IN ('Cerrada', 'Verificada')
                          AND due_date IS NOT NULL AND due_date < CURRENT_DATE)
    INTO v_ncs_open, v_ncs_overdue
    FROM non_conformities WHERE org_id = p_org_id;

  -- 10.3 Mejora
  SELECT COUNT(*) FILTER (WHERE status NOT IN ('Implementada', 'Cerrada'))
    INTO v_opps_open
    FROM improvement_opportunities WHERE org_id = p_org_id;

  RETURN jsonb_build_object(
    'computed_at', now(),
    'clauses', jsonb_build_object(
      '4.1_contexto', jsonb_build_object(
        'nombre', 'Contexto (FODA)',
        'total_factores', v_context_total,
        'revisados_ultimos_12m', v_context_reviewed,
        'pct_revisados', CASE WHEN v_context_total = 0 THEN 0 ELSE ROUND(100.0 * v_context_reviewed / v_context_total) END
      ),
      '4.2_partes_interesadas', jsonb_build_object(
        'nombre', 'Partes interesadas',
        'total', v_stakeholders,
        'con_necesidades', v_stakeholders_ok
      ),
      '4.3_alcance', jsonb_build_object(
        'nombre', 'Alcance del SGC',
        'definido', v_scope_exists
      ),
      '4.4_procesos', jsonb_build_object(
        'nombre', 'Mapa de procesos',
        'total_procesos', v_processes,
        'implementado', v_processes >= 3
      ),
      '5.2_politica', jsonb_build_object(
        'nombre', 'Política de calidad',
        'status', COALESCE(v_policy_status, 'Sin definir')
      ),
      '5.3_roles', jsonb_build_object(
        'nombre', 'Roles y responsabilidades',
        'total_perfiles', v_owner_count,
        'responsables_sgc_designados', v_sgc_resp
      ),
      '6.1_riesgos', jsonb_build_object(
        'nombre', 'Riesgos y oportunidades',
        'total', v_risks_total,
        'alto_riesgo_inicial', v_risks_high,
        'sin_tratamiento', v_risks_untreated
      ),
      '6.2_objetivos', jsonb_build_object(
        'nombre', 'Objetivos de calidad',
        'total', v_objectives,
        'con_mediciones', v_obj_measured
      ),
      '7.1.5_recursos_seguimiento', jsonb_build_object(
        'nombre', 'Recursos de seguimiento (calibración)',
        'equipos_registrados', v_calib
      ),
      '7.2_competencias', jsonb_build_object(
        'nombre', 'Personal / competencias',
        'total_personas', v_personnel,
        'con_brecha', v_personnel_gap
      ),
      '7.4_comunicacion', jsonb_build_object(
        'nombre', 'Comunicación',
        'canales_registrados', v_comm
      ),
      '7.5_documentacion', jsonb_build_object(
        'nombre', 'Información documentada',
        'total_documentos', v_docs,
        'obsoletos', v_docs_obsolete,
        'proximos_a_revisar', v_docs_due_review
      ),
      '9.2_auditorias_internas', jsonb_build_object(
        'nombre', 'Auditorías internas',
        'planificadas_este_año', v_audits_planned,
        'finalizadas_este_año', v_audits_done
      ),
      '9.3_revision_direccion', jsonb_build_object(
        'nombre', 'Revisión por la dirección',
        'realizadas_ultimos_12m', v_reviews_recent
      ),
      '10.2_no_conformidades', jsonb_build_object(
        'nombre', 'No conformidades',
        'abiertas', v_ncs_open,
        'vencidas', v_ncs_overdue
      ),
      '10.3_mejora', jsonb_build_object(
        'nombre', 'Oportunidades de mejora',
        'abiertas', v_opps_open
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_sgc_snapshot(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación
SELECT pg_get_constraintdef(oid) FROM pg_constraint
  WHERE conname = 'rag_chunks_source_table_check';
-- Esperado: CHECK con las 9 tablas.

-- Probar el snapshot con tu org (reemplazar UUID)
-- SELECT jsonb_pretty(get_sgc_snapshot('<TU_ORG_ID>'::UUID));
