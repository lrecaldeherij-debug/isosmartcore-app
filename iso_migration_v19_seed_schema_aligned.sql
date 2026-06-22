-- =============================================================================
-- v19 — Seed alineado al schema real
--
-- Problema: la función seed_organization (v14) usa nombres de columna que no
-- coinciden con el schema real de la base:
--   risk_matrix.process_name        -> en realidad es process_area
--   risk_matrix.prob_initial         -> en realidad es probability_initial
-- También faltan salvaguardas en columnas opcionales (type, content_url, etc.)
-- que podrían no existir en bases creadas en versiones antiguas.
--
-- Solución:
--   1) ADD COLUMN IF NOT EXISTS para columnas opcionales que el seed referencia.
--   2) Reemplazar completamente la función seed_organization con nombres reales.
-- =============================================================================

-- --- Salvaguardas de schema -------------------------------------------------
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS process_area        TEXT;
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS risk_description    TEXT;
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS probability_initial INT;
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS impact_initial      INT;
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS score_initial       INT;
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS control_measure     TEXT;
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS responsible         TEXT;
ALTER TABLE risk_matrix         ADD COLUMN IF NOT EXISTS status              TEXT;

ALTER TABLE documents_versions  ADD COLUMN IF NOT EXISTS type                TEXT;
ALTER TABLE documents_versions  ADD COLUMN IF NOT EXISTS content_url         TEXT;

-- --- Reemplazo de la función seed_organization ------------------------------
CREATE OR REPLACE FUNCTION seed_organization(target_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role org_role;
  v_caller_org UUID;
  v_inserted JSONB := '{}'::jsonb;
  v_count INT;
BEGIN
  -- Verificación de permisos: sólo el owner de la propia org puede sembrar
  SELECT org_id, role INTO v_caller_org, v_caller_role
  FROM user_profiles WHERE user_id = auth.uid();

  IF v_caller_org IS NULL OR v_caller_org <> target_org_id THEN
    RAISE EXCEPTION 'No tienes acceso a esta organización';
  END IF;

  IF v_caller_role <> 'owner'::org_role THEN
    RAISE EXCEPTION 'Solo el owner puede cargar plantillas iniciales';
  END IF;

  -- ============================================================
  -- 4.1 CONTEXTO (FODA) — 8 factores tipo
  -- ============================================================
  SELECT COUNT(*) INTO v_count FROM context_analysis WHERE org_id = target_org_id;
  IF v_count = 0 THEN
    INSERT INTO context_analysis (org_id, type, category, factor, description, strategy) VALUES
    (target_org_id, 'Interno', 'Fortaleza', 'Personal técnico capacitado', 'Equipo con experiencia en el rubro y conocimiento técnico del producto/servicio.', 'Mantener planes de formación continua y retención de talento.'),
    (target_org_id, 'Interno', 'Fortaleza', 'Procesos documentados', 'Procedimientos operativos establecidos y conocidos por el equipo.', 'Profundizar control documental y revisión periódica.'),
    (target_org_id, 'Interno', 'Debilidad', 'Falta de indicadores de gestión', 'No existen mediciones formales de eficiencia y satisfacción.', 'Definir KPIs por proceso y tablero de control mensual.'),
    (target_org_id, 'Interno', 'Debilidad', 'Dependencia de personas clave', 'Conocimiento no documentado concentrado en pocas personas.', 'Documentar procedimientos críticos y formar respaldos.'),
    (target_org_id, 'Externo', 'Oportunidad', 'Demanda creciente del mercado', 'Crecimiento sostenido del sector permite expandir cartera.', 'Reforzar capacidad comercial y operativa para captar nuevos clientes.'),
    (target_org_id, 'Externo', 'Oportunidad', 'Acreditación ISO como diferencial', 'Pocos competidores certificados; la acreditación abre licitaciones.', 'Acelerar implementación y comunicar la certificación al mercado.'),
    (target_org_id, 'Externo', 'Amenaza', 'Competidores con precios bajos', 'Presión sobre márgenes por nuevos entrantes.', 'Diferenciarse por calidad y servicio, no por precio.'),
    (target_org_id, 'Externo', 'Amenaza', 'Cambios en regulación', 'Posibles nuevas exigencias legales/sectoriales.', 'Monitoreo regulatorio trimestral; matriz de requisitos legales.');
    v_inserted := jsonb_set(v_inserted, '{context_analysis}', '8');
  END IF;

  -- ============================================================
  -- 4.2 PARTES INTERESADAS — 6 stakeholders típicos
  -- ============================================================
  SELECT COUNT(*) INTO v_count FROM stakeholders WHERE org_id = target_org_id;
  IF v_count = 0 THEN
    INSERT INTO stakeholders (org_id, name, expectations, influence_level, is_sgc_requirement, follow_up_frequency, planning_in_sgc, evaluation_method, responsible, status) VALUES
    (target_org_id, 'Clientes', 'Calidad consistente, entregas en plazo, atención post-venta.', 'Alto', true, 'Mensual', 'Encuestas de satisfacción, gestión de reclamos, revisión por la dirección.', 'Encuesta NPS / índice de reclamos / tasa de retención.', 'Responsable Comercial', 'Pendiente'),
    (target_org_id, 'Empleados', 'Condiciones laborales adecuadas, desarrollo profesional, comunicación clara.', 'Alto', true, 'Trimestral', 'Encuestas de clima, planes de capacitación, evaluación de desempeño.', 'Encuesta de clima / horas de capacitación / rotación.', 'Responsable RRHH', 'Pendiente'),
    (target_org_id, 'Proveedores', 'Pagos en tiempo, relación de largo plazo, claridad en requerimientos.', 'Medio', true, 'Semestral', 'Evaluación y selección de proveedores, comunicación de especificaciones.', 'Calificación de proveedores / cumplimiento de plazos.', 'Responsable Compras', 'Pendiente'),
    (target_org_id, 'Accionistas / Dirección', 'Rentabilidad, crecimiento sostenible, gestión de riesgos.', 'Alto', true, 'Trimestral', 'Revisión por la dirección, indicadores financieros y operativos.', 'Estados financieros / cumplimiento de objetivos estratégicos.', 'Gerencia General', 'Pendiente'),
    (target_org_id, 'Organismos reguladores', 'Cumplimiento de normativa aplicable.', 'Alto', true, 'Continua', 'Matriz de requisitos legales, auditorías de cumplimiento.', 'Inspecciones aprobadas / multas / vencimientos.', 'Responsable Legal / Calidad', 'Pendiente'),
    (target_org_id, 'Comunidad y sociedad', 'Impacto ambiental y social responsable.', 'Bajo', false, 'Anual', 'Política de responsabilidad social, comunicación con el entorno.', 'Reclamos comunitarios / iniciativas RSE.', 'Gerencia General', 'Pendiente');
    v_inserted := jsonb_set(v_inserted, '{stakeholders}', '6');
  END IF;

  -- ============================================================
  -- 4.3 ALCANCE — declaración guía
  -- ============================================================
  SELECT COUNT(*) INTO v_count FROM scope_declaration WHERE org_id = target_org_id;
  IF v_count = 0 THEN
    INSERT INTO scope_declaration (org_id, considerations_41_42, processes_covered, products_services, geographic_location, exclusions_83_etc, scope_statement) VALUES
    (target_org_id,
     'Se consideraron los factores internos y externos identificados en el análisis de contexto (4.1) y las necesidades de las partes interesadas (4.2).',
     'Procesos estratégicos, operativos y de soporte vinculados a la realización del producto/servicio.',
     '[Completar: productos y/o servicios que ofrece la organización]',
     '[Completar: domicilios y sucursales donde aplica el SGC]',
     'Se excluye 8.3 (Diseño y Desarrollo) en caso de no aplicar a la organización. Justificar.',
     'El Sistema de Gestión de Calidad de [Nombre de la Organización] aplica a [productos/servicios] desarrollados en [ubicación], conforme a los requisitos de la norma ISO 9001:2015.');
    v_inserted := jsonb_set(v_inserted, '{scope_declaration}', '1');
  END IF;

  -- ============================================================
  -- 4.4 PROCESOS — 5 procesos típicos
  -- ============================================================
  SELECT COUNT(*) INTO v_count FROM processes WHERE org_id = target_org_id;
  IF v_count = 0 THEN
    INSERT INTO processes (org_id, name, code, process_type, objective, scope, responsible_role) VALUES
    (target_org_id, 'Dirección y Mejora Continua', 'PRC-01', 'Estratégico', 'Establecer y revisar la estrategia, política y objetivos de calidad; impulsar la mejora continua.', 'Aplica a la planificación, revisión por la dirección y acciones de mejora.', 'Gerencia General'),
    (target_org_id, 'Gestión Comercial', 'PRC-02', 'Operativo', 'Captar clientes, formalizar pedidos y gestionar la satisfacción post-venta.', 'Desde la prospección comercial hasta el cierre de pedido y servicio post-venta.', 'Responsable Comercial'),
    (target_org_id, 'Realización del Producto / Prestación del Servicio', 'PRC-03', 'Operativo', 'Producir/prestar conforme a los requisitos del cliente y la organización.', 'Desde la planificación operativa hasta la entrega del producto/servicio.', 'Responsable de Operaciones'),
    (target_org_id, 'Gestión de Compras y Proveedores', 'PRC-04', 'Soporte', 'Adquirir insumos y servicios que cumplan los requisitos del SGC.', 'Selección, evaluación y reevaluación de proveedores.', 'Responsable de Compras'),
    (target_org_id, 'Gestión del Talento Humano', 'PRC-05', 'Soporte', 'Asegurar la competencia, toma de conciencia y bienestar del personal.', 'Selección, formación, evaluación de desempeño y comunicación interna.', 'Responsable RRHH');
    v_inserted := jsonb_set(v_inserted, '{processes}', '5');
  END IF;

  -- ============================================================
  -- 5.2 POLÍTICA DE CALIDAD — borrador
  -- ============================================================
  SELECT COUNT(*) INTO v_count FROM quality_policy WHERE org_id = target_org_id;
  IF v_count = 0 THEN
    INSERT INTO quality_policy (org_id, what_we_do, who_is_customer, value_proposition, commitments, final_policy_statement) VALUES
    (target_org_id,
     '[Completar: actividad principal de la organización]',
     '[Completar: a quién sirve la organización]',
     'Calidad consistente, cumplimiento de plazos y servicio profesional.',
     'Cumplir requisitos legales y del cliente, mejorar continuamente la eficacia del SGC y desarrollar al equipo.',
     '[Nombre de la Organización] se compromete a entregar [productos/servicios] de calidad a [tipo de cliente], cumpliendo los requisitos aplicables y mejorando continuamente la eficacia de su Sistema de Gestión de Calidad. La dirección impulsa una cultura de mejora basada en datos, capacitación del personal y satisfacción del cliente.');
    v_inserted := jsonb_set(v_inserted, '{quality_policy}', '1');
  END IF;

  -- ============================================================
  -- 5.3 ROLES Y RESPONSABILIDADES — 3 perfiles tipo
  -- ============================================================
  SELECT COUNT(*) INTO v_count FROM job_descriptions WHERE org_id = target_org_id;
  IF v_count = 0 THEN
    INSERT INTO job_descriptions (org_id, title, code, level, dependency, mission, functions_json, responsibilities_json) VALUES
    (target_org_id, 'Gerencia General', 'CARGO-01', 'Estratégico', '-',
     'Liderar la estrategia de la organización, asegurar el cumplimiento del SGC y la satisfacción de las partes interesadas.',
     '[{"funcion":"Definir estrategia y objetivos de calidad","periodicidad":"Anual","tipo":"Decisión"},{"funcion":"Revisión por la dirección","periodicidad":"Semestral","tipo":"Decisión"},{"funcion":"Asignación de recursos","periodicidad":"Mensual","tipo":"Decisión"}]'::jsonb,
     '{"responsabilidades":["Política y objetivos de calidad","Provisión de recursos","Comunicación de la importancia del SGC"],"autoridades":["Aprobar política y manual","Asignar presupuesto","Designar al Responsable de Calidad"]}'::jsonb),
    (target_org_id, 'Responsable de Calidad', 'CARGO-02', 'Táctico', 'Gerencia General',
     'Mantener, mejorar y reportar el desempeño del Sistema de Gestión de Calidad.',
     '[{"funcion":"Coordinar auditorías internas","periodicidad":"Semestral","tipo":"Ejecución"},{"funcion":"Gestionar no conformidades y acciones correctivas","periodicidad":"Continua","tipo":"Ejecución"},{"funcion":"Mantener documentación del SGC","periodicidad":"Continua","tipo":"Ejecución"}]'::jsonb,
     '{"responsabilidades":["Plan de auditorías","Gestión de NC","Control documental"],"autoridades":["Detener procesos no conformes","Convocar auditorías","Emitir comunicados del SGC"]}'::jsonb),
    (target_org_id, 'Operador / Personal Operativo', 'CARGO-03', 'Operativo', 'Responsable de área',
     'Ejecutar las tareas operativas conforme a los procedimientos del SGC.',
     '[{"funcion":"Ejecutar tareas según procedimiento","periodicidad":"Diaria","tipo":"Ejecución"},{"funcion":"Registrar evidencias de trabajo","periodicidad":"Diaria","tipo":"Ejecución"},{"funcion":"Reportar desvíos o no conformidades","periodicidad":"Cuando aplique","tipo":"Reporte"}]'::jsonb,
     '{"responsabilidades":["Cumplir procedimientos","Registrar evidencias","Reportar desvíos"],"autoridades":["Detener tarea ante riesgo evidente"]}'::jsonb);
    v_inserted := jsonb_set(v_inserted, '{job_descriptions}', '3');
  END IF;

  -- ============================================================
  -- 6.1 RIESGOS Y OPORTUNIDADES — 5 riesgos típicos
  --   FIX v19: process_name -> process_area, prob_initial -> probability_initial
  -- ============================================================
  SELECT COUNT(*) INTO v_count FROM risk_matrix WHERE org_id = target_org_id;
  IF v_count = 0 THEN
    -- score_initial es columna generada (probability_initial * impact_initial), no se inserta.
    INSERT INTO risk_matrix (org_id, process_area, risk_description, probability_initial, impact_initial, control_measure, responsible, status) VALUES
    (target_org_id, 'Gestión Comercial', 'Pérdida de un cliente clave por insatisfacción no detectada a tiempo.', 7, 9, 'Encuestas trimestrales, gestión proactiva de reclamos, plan de fidelización.', 'Responsable Comercial', 'En proceso'),
    (target_org_id, 'Realización del Producto / Servicio', 'Fallo de equipo crítico que detiene la producción.', 6, 8, 'Plan de mantenimiento preventivo, stock de repuestos críticos, proveedores alternativos.', 'Responsable de Operaciones', 'En proceso'),
    (target_org_id, 'Gestión del Talento Humano', 'Rotación de personal capacitado.', 5, 7, 'Planes de carrera, encuestas de clima, política de retención.', 'Responsable RRHH', 'En proceso'),
    (target_org_id, 'Gestión de Compras', 'Incumplimiento del proveedor único en plazos o calidad.', 6, 8, 'Calificación periódica, contratos con SLA, proveedor alternativo identificado.', 'Responsable de Compras', 'En proceso'),
    (target_org_id, 'Dirección', 'No detección oportuna de cambios regulatorios.', 4, 9, 'Monitoreo regulatorio trimestral, suscripción a boletines sectoriales.', 'Gerencia General', 'En proceso');
    v_inserted := jsonb_set(v_inserted, '{risk_matrix}', '5');
  END IF;

  -- ============================================================
  -- 6.2 OBJETIVOS DE CALIDAD — 4 objetivos SMART
  -- ============================================================
  SELECT COUNT(*) INTO v_count FROM quality_objectives WHERE org_id = target_org_id;
  IF v_count = 0 THEN
    INSERT INTO quality_objectives (org_id, objective, indicator, target, current, unit, frequency, responsible) VALUES
    (target_org_id, 'Aumentar la satisfacción del cliente', 'Índice de satisfacción (encuesta NPS)', '85', '0', 'puntos', 'Trimestral', 'Responsable Comercial'),
    (target_org_id, 'Reducir las no conformidades internas', 'Cantidad de NC abiertas al cierre de mes', '< 5', '0', 'NC/mes', 'Mensual', 'Responsable de Calidad'),
    (target_org_id, 'Cumplir el plan de capacitación', 'Porcentaje de horas-hombre capacitadas vs. plan', '90', '0', '%', 'Trimestral', 'Responsable RRHH'),
    (target_org_id, 'Mejorar el cumplimiento de entregas', 'Porcentaje de entregas en plazo', '95', '0', '%', 'Mensual', 'Responsable de Operaciones');
    v_inserted := jsonb_set(v_inserted, '{quality_objectives}', '4');
  END IF;

  -- ============================================================
  -- 7.5 DOCUMENTOS — 4 documentos borrador con código y versión
  -- ============================================================
  SELECT COUNT(*) INTO v_count FROM documents_versions WHERE org_id = target_org_id;
  IF v_count = 0 THEN
    INSERT INTO documents_versions (org_id, document_group_id, code, title, type, version, status) VALUES
    (target_org_id, gen_random_uuid(), 'MAN-01', 'Manual del Sistema de Gestión de Calidad', 'Manual', '1.0', 'Borrador'),
    (target_org_id, gen_random_uuid(), 'PRO-01', 'Procedimiento de Control de Documentos y Registros', 'Procedimiento', '1.0', 'Borrador'),
    (target_org_id, gen_random_uuid(), 'PRO-02', 'Procedimiento de Auditoría Interna', 'Procedimiento', '1.0', 'Borrador'),
    (target_org_id, gen_random_uuid(), 'PRO-03', 'Procedimiento de No Conformidades y Acción Correctiva', 'Procedimiento', '1.0', 'Borrador');
    v_inserted := jsonb_set(v_inserted, '{documents_versions}', '4');
  END IF;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_organization(UUID) TO authenticated;
