# 🩺 Reporte de Verificación de Cumplimiento ISO 9001:2015 — IsoSmartCore

Cobertura técnica del software frente a los requisitos de la norma.

**Última revisión:** 2026-09-10 · Revisión cláusula por cláusula contra el código real.

> **Nota sobre la versión anterior de este documento:** declaraba "100% de cumplimiento"
> sin respaldo. La revisión de septiembre 2026 encontró 6 cláusulas sin módulo real
> (7.1.3, 7.1.6, 7.3, 8.2.1, 9.1.2, 9.1.3). Todas se cerraron en la migración
> `20260910120000_iso9001_gap_closure.sql`. Este documento ahora refleja el estado
> verificado, no el aspiracional.

---

## 4. Contexto de la Organización

- [x] **4.1 Comprensión de la organización y su contexto** — `ContextAnalysis.jsx`, FODA con asistencia IA
- [x] **4.2 Partes interesadas** — `Stakeholders.jsx`, requisitos por parte interesada
- [x] **4.3 Alcance del SGC** — `ScopeDeclaration.jsx`, con exclusión justificada de 8.3
- [x] **4.4 Sistema de gestión y procesos** — `Processes.jsx`, caracterización de procesos

## 5. Liderazgo

- [x] **5.2 Política de Calidad** — `QualityPolicy.jsx`, redactor asistido por IA
- [x] **5.3 Roles, responsabilidades y autoridades** — `RolesResponsibilities.jsx` + `OrgChart.jsx`
- [~] **5.1 Liderazgo y compromiso** — cubierto parcialmente vía `ManagementReview.jsx`.
      La evidencia del compromiso de la alta dirección es principalmente documental
      (actas, asignación de recursos), no de software.

## 6. Planificación

- [x] **6.1 Acciones para abordar riesgos y oportunidades** — `RisksOpportunities.jsx`
- [x] **6.2 Objetivos de calidad** — `QualityObjectives.jsx`, metodología SMART
- [x] **6.3 Planificación de cambios** — `StrategicActionPlan.jsx`

## 7. Apoyo

- [x] **7.1.2 Personas** — `Personnel.jsx`
- [x] **7.1.3 Infraestructura** — `Infrastructure.jsx` *(cerrado 2026-09-10)*
      Activos por categoría con criticidad, plan de mantenimiento preventivo e
      historial de intervenciones por activo.
- [x] **7.1.4 Ambiente para la operación** — `ClimateSurveys.jsx`, encuestas de clima
- [x] **7.1.5 Recursos de seguimiento y medición** — `Calibration.jsx`
- [x] **7.1.6 Conocimientos de la organización** — `KnowledgeAwareness.jsx` *(cerrado 2026-09-10)*
      Mapa de know-how crítico con responsable, riesgo de pérdida y plan de respaldo.
- [x] **7.2 Competencia** — `Training.jsx` + vinculación perfiles/colaboradores
- [x] **7.3 Toma de conciencia** — `KnowledgeAwareness.jsx` *(cerrado 2026-09-10)*
      Los 4 puntos de la cláusula como checklist verificable, con verificación de
      comprensión y constancia sellada por hash SHA-256.
- [x] **7.4 Comunicación** — `CommunicationMatrix.jsx`, matriz 5W+H
- [x] **7.5 Información documentada** — `Documents.jsx`, control de versiones y estados

## 8. Operación

- [x] **8.1 Planificación y control operacional** — `ProductionControl.jsx`
- [x] **8.2 Requisitos para los productos y servicios** — `CustomerRequirements.jsx`
- [x] **8.2.1 Comunicación con el cliente** — `CustomerVoice.jsx` *(cerrado 2026-09-10)*
      Registro de quejas, consultas, sugerencias y felicitaciones por canal, con flujo
      de cierre, evaluación de conformidad del cliente y escalamiento a NC.
- [ ] **8.3 Diseño y desarrollo** — EXCLUIDO. Justificación: la organización no realiza
      diseño propio de productos/servicios. La exclusión está declarada en 4.3.
- [x] **8.4 Control de proveedores externos** — `Suppliers.jsx`
- [x] **8.5 Producción y provisión del servicio** — `ProductionControl.jsx`
- [x] **8.5.2 Identificación y trazabilidad** — `WorkOrderTimeline.jsx`, timeline de eventos
      con firma digital por evento de decisión
- [x] **8.5.3 Propiedad del cliente** — `OperationalIncidents.jsx`
- [x] **8.5.6 Control de los cambios** — `OperationalIncidents.jsx`
- [x] **8.6 Liberación de productos y servicios** — `QCRelease.jsx`
- [x] **8.7 Control de salidas no conformes** — `NonConformities.jsx`
- [~] **8.5.4 Preservación / 8.5.5 Actividades posteriores a la entrega** — aplicabilidad
      limitada en organizaciones de servicio. Si el alcance incluye producto físico,
      documentar el criterio en 4.3 o abrir módulo específico.

## 9. Evaluación del Desempeño

- [x] **9.1.1 Seguimiento y medición** — `Dashboard.jsx` y métricas de objetivos
- [x] **9.1.2 Satisfacción del cliente** — `CustomerVoice.jsx` *(cerrado 2026-09-10)*
      6 dimensiones puntuadas 1-5 + NPS, con cálculo de tendencia entre períodos y
      detección de la dimensión más débil. Acepta carga manual o link público anónimo.
- [x] **9.1.3 Análisis y evaluación** — `DataAnalysis.jsx` *(cerrado 2026-09-10)*
      Informe periódico con los 6 ejes que exige la norma. Recolecta indicadores reales
      de 11 tablas del período, los congela en un snapshot verificable y ofrece redactar
      el análisis con IA sobre esos números.
- [x] **9.2 Auditoría interna** — `InternalAudits.jsx`, con asistente experto
- [x] **9.3 Revisión por la dirección** — `ManagementReview.jsx`

## 10. Mejora

- [x] **10.2 No conformidad y acción correctiva** — `NonConformities.jsx`, análisis de
      causa raíz asistido por IA
- [x] **10.3 Mejora continua** — `ImprovementOpportunities.jsx`, ciclo Auditoría → NC →
      Plan Estratégico

---

## Funcionalidad más allá de la norma

Estas capacidades no son exigidas por ISO 9001 pero refuerzan la evidencia frente a
un auditor externo:

- **Segregación de funciones** (`SegregacionPanel.jsx`) — detecta automáticamente cuando
  la misma persona toma dos decisiones sobre el mismo registro (relevante para 5.3 y
  para la imparcialidad que exigirá ISO 17020)
- **Firma digital de eventos** — SHA-256 sobre cada evento de decisión, verificable vía
  RPC. Detecta manipulación por fuera del flujo de la aplicación
- **Modo auditor externo** — link temporal de solo lectura con expiración y límite de
  usos, sin necesidad de crear cuenta
- **Copilot RAG** — asistente con contexto real de la organización (pgvector + citas)
- **Trazabilidad multi-tenant** — RLS por organización en todas las tablas, con soporte
  de impersonación para soporte técnico

---

## Estado

| Bloque | Cláusulas cubiertas | Observaciones |
|---|---|---|
| 4. Contexto | 4/4 | — |
| 5. Liderazgo | 2/3 | 5.1 es mayormente evidencia documental |
| 6. Planificación | 3/3 | — |
| 7. Apoyo | 8/8 | 7.1.3, 7.1.6 y 7.3 cerrados en sep-2026 |
| 8. Operación | 9/9 aplicables | 8.3 excluido con justificación |
| 9. Evaluación | 5/5 | 9.1.2 y 9.1.3 cerrados en sep-2026 |
| 10. Mejora | 2/2 | — |

**Conclusión:** el software cubre todos los requisitos de ISO 9001:2015 que son
soportables por sistema, dentro del alcance declarado. Lo que queda fuera del software
(actas de reunión, evidencia física del compromiso de la dirección, entrevistas de
verificación) es responsabilidad del proceso, no de la herramienta.

**Próximo paso:** con 9001 cerrado, la base está lista para montar ISO/IEC 17020 encima
usando la Opción B de su cláusula 8, que permite reutilizar un SGC 9001 vigente como
sistema de gestión del organismo de inspección.
