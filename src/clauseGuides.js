// Catálogo central de guías ISO 9001:2015 por cláusula.
// Cada módulo importa y usa: <IsoInfoCard {...CLAUSE_GUIDES['x.x']} />
//
// Si quieres ajustar un texto o agregar un tip, lo haces aquí una sola vez y
// se refleja en todos lados.

export const CLAUSE_GUIDES = {
  '4.1': {
    clause: '4.1',
    title: 'Comprensión de la organización y de su contexto',
    tips: [
      'Identifica factores internos (recursos, cultura, conocimiento) y externos (mercado, competencia, regulación).',
      'Clasifica cada factor en positivo (Fortaleza/Oportunidad) o negativo (Debilidad/Amenaza).',
      'Para cada factor, define una estrategia: cómo potenciarlo o cómo mitigarlo.',
      'Revísalo al menos una vez al año o cuando cambie el contexto del negocio.',
    ],
  },
  '4.2': {
    clause: '4.2',
    title: 'Comprensión de las necesidades y expectativas de las partes interesadas',
    tips: [
      'Identifica quiénes influyen en tu calidad: Clientes, Proveedores, Empleados, Accionistas, Gobierno.',
      'No listes todo lo que quieren, solo lo "pertinente" al Sistema de Gestión de Calidad.',
      'Define claramente CÓMO vas a cumplir esos requisitos (Planificación) y quién se encarga.',
      'Usa nuestra IA para sugerir expectativas estándar, pero valídalas con tu realidad.',
    ],
  },
  '4.3': {
    clause: '4.3',
    title: 'Determinación del alcance del Sistema de Gestión de Calidad',
    tips: [
      'Define qué productos/servicios cubre el SGC y qué ubicaciones físicas aplica.',
      'Considera el contexto (4.1) y los requisitos de las partes interesadas (4.2).',
      'Si excluyes alguna cláusula (típicamente 8.3 - Diseño y Desarrollo), justifica por qué.',
      'El alcance debe estar disponible como información documentada accesible.',
    ],
  },
  '4.4': {
    clause: '4.4',
    title: 'Sistema de Gestión de Calidad y sus procesos',
    tips: [
      'Mapea los procesos en 3 tipos: Estratégicos (dirección), Operativos (realización) y de Soporte.',
      'Para cada proceso define: entradas, salidas, recursos, responsables, indicadores y riesgos.',
      'Establece cómo interactúan entre sí (un proceso de soporte alimenta uno operativo).',
      'Asigna un dueño claro a cada proceso, con autoridad para mantenerlo.',
    ],
  },
  '5.2': {
    clause: '5.2',
    title: 'Política de Calidad — Compromiso de la Alta Dirección',
    tips: [
      'Debe ser apropiada al propósito y contexto de la organización (no copia-pega genérica).',
      'Tiene que incluir el compromiso de cumplir requisitos aplicables y mejorar continuamente.',
      'Marca el marco de referencia para establecer los objetivos de calidad (6.2).',
      'Tiene que estar disponible, comunicada, entendida y aplicada dentro de la organización.',
    ],
  },
  '5.3': {
    clause: '5.3',
    title: 'Roles, responsabilidades y autoridades en la organización',
    tips: [
      'La Alta Dirección asigna roles formalmente — debe quedar documentado quién hace qué.',
      'Define funciones (qué hace), responsabilidades (de qué responde) y autoridades (qué puede decidir).',
      'Asigna un responsable del SGC con autoridad para reportar el desempeño a la Alta Dirección.',
      'Comunica los roles a toda la organización (organigrama visible y perfiles de cargo disponibles).',
    ],
  },
  '6.1': {
    clause: '6.1',
    title: 'Acciones para abordar riesgos y oportunidades',
    tips: [
      'Para cada proceso identifica los riesgos que pueden afectar el cumplimiento.',
      'Evalúa probabilidad x impacto (matriz) y define controles para los más críticos.',
      'No olvides las oportunidades: cambios favorables que puedes capitalizar.',
      'Las acciones deben ser proporcionales al impacto potencial sobre la conformidad.',
    ],
  },
  '6.2': {
    clause: '6.2',
    title: 'Objetivos de Calidad y planificación para lograrlos',
    tips: [
      'Aplica metodología SMART: Específicos, Medibles, Alcanzables, Relevantes, con plazo (Time-bound).',
      'Cada objetivo debe alinearse con la política de calidad (5.2).',
      'Define: qué se va a hacer, qué recursos requiere, quién es responsable, cuándo se evalúa.',
      'Revisalos en cada Revisión por la Dirección (9.3) y ajustalos si es necesario.',
    ],
  },
  '6.3': {
    clause: '6.3',
    title: 'Planificación de los cambios del SGC',
    tips: [
      'Los cambios al SGC se planifican: no se hacen "sobre la marcha".',
      'Considera el propósito del cambio, sus consecuencias y la disponibilidad de recursos.',
      'Asigna o reasigna responsabilidades cuando un cambio afecte roles.',
      'Documentá el plan estratégico con hitos verificables y responsables claros.',
    ],
  },
  '7.1.2': {
    clause: '7.1.2',
    title: 'Personas — Recursos humanos necesarios para el SGC',
    tips: [
      'Determina las personas necesarias para operar y controlar los procesos.',
      'Mantén información actualizada de cada colaborador y su vínculo con el SGC.',
      'Vincula a cada persona con un perfil de cargo (cláusula 5.3) y un proceso.',
      'Documenta competencias, formación y experiencia en su ficha personal.',
    ],
  },
  '7.1.4': {
    clause: '7.1.4',
    title: 'Ambiente para la operación de los procesos',
    tips: [
      'Considera factores físicos (temperatura, ruido, iluminación, higiene) y sociales (clima, motivación).',
      'Las encuestas de clima laboral son evidencia clave de seguimiento.',
      'Identifica acciones concretas a partir de los resultados: no quedés en el diagnóstico.',
      'Comunicá los resultados al equipo y mostrá las mejoras que se implementaron.',
    ],
  },
  '7.1.5': {
    clause: '7.1.5',
    title: 'Recursos de seguimiento y medición — Calibración',
    tips: [
      'Identifica todos los equipos que miden o monitorean conformidad del producto/servicio.',
      'Manten registros de calibración con frecuencia definida y certificados trazables a patrones nacionales.',
      'Si un equipo se desvía, evalúa el impacto sobre las mediciones ya hechas.',
      'Programa la próxima calibración antes de que venza la actual.',
    ],
  },
  '7.2': {
    clause: '7.2',
    title: 'Competencia del personal',
    tips: [
      'Determina la competencia necesaria para cada cargo (educación, formación, experiencia).',
      'Identifica brechas entre competencia requerida y actual, y planificá cómo cerrarlas.',
      'Mantén evidencia de la competencia adquirida (certificados, evaluaciones, registros).',
      'Evalúa la eficacia de la formación: ¿se aplicó en el puesto de trabajo?',
    ],
  },
  '7.4': {
    clause: '7.4',
    title: 'Comunicación interna y externa',
    tips: [
      'Define para cada comunicación: qué, cuándo, a quién, cómo y quién lo comunica (5W+H).',
      'Distingue entre comunicación rutinaria (operativa) y de gestión (estratégica).',
      'No olvides las comunicaciones externas: clientes, proveedores, reguladores.',
      'Documenta canales formales (email, reuniones, intranet) para que sean trazables.',
    ],
  },
  '7.5': {
    clause: '7.5',
    title: 'Información documentada — Control de documentos y registros',
    tips: [
      'Distingue documentos (políticas, procedimientos) de registros (evidencia de actividad).',
      'Controla creación, aprobación, distribución, acceso, modificación, retiro y disposición.',
      'Identifica cada documento con código y versión; mantén el histórico de cambios.',
      'Solo la versión "Vigente" debe estar disponible para uso operativo.',
    ],
  },
  '8.2': {
    clause: '8.2',
    title: 'Requisitos para los productos y servicios — Pedidos del cliente',
    tips: [
      'Revisa los requisitos del cliente antes de comprometerte a entregar.',
      'Incluye requisitos legales/reglamentarios aplicables y los no declarados pero necesarios.',
      'Documenta la aceptación del pedido y cualquier cambio acordado posteriormente.',
      'Asegurate de tener capacidad para cumplir antes de aceptar.',
    ],
  },
  '8.4': {
    clause: '8.4',
    title: 'Control de los procesos, productos y servicios suministrados externamente',
    tips: [
      'Evalúa, selecciona y reevalúa proveedores con criterios objetivos.',
      'Define el nivel de control según el impacto del producto/servicio externo sobre el tuyo.',
      'Comunica al proveedor los requisitos: especificaciones, métodos de verificación, competencia requerida.',
      'Mantén registros de evaluación y desempeño para defender decisiones de continuidad.',
    ],
  },
  '8.5': {
    clause: '8.5',
    title: 'Producción y provisión del servicio',
    tips: [
      'Mantén información documentada de las características del producto/servicio y de las actividades.',
      'Usa equipos de medición adecuados y trazá los lotes con identificación única.',
      'Si la trazabilidad es un requisito, debe permitirte rastrear hacia atrás y adelante.',
      'Preservá las salidas durante la producción y la entrega.',
    ],
  },
  '8.5.3': {
    clause: '8.5.3 / 8.5.6',
    title: 'Propiedad del cliente y control de cambios',
    tips: [
      'Identifica, protege y salvaguarda la propiedad del cliente bajo tu control (materiales, datos, planos).',
      'Si algo se pierde, deteriora o se vuelve inadecuado, notificalo al cliente y mantené registro.',
      'Los cambios en la producción se planifican y se controlan: no se improvisan.',
      'Documenta cada cambio: quién lo autorizó, qué se modificó, cuándo, por qué.',
    ],
  },
  '8.6': {
    clause: '8.6',
    title: 'Liberación de los productos y servicios',
    tips: [
      'No liberar nada hasta que las inspecciones planificadas se hayan completado satisfactoriamente.',
      'Mantén evidencia: quién autorizó la liberación y cuándo.',
      'Si liberás antes de tiempo por necesidad, requerí autorización de un responsable y registralo.',
      'Esto es el último filtro antes de que el cliente reciba el producto/servicio.',
    ],
  },
  '9.2': {
    clause: '9.2',
    title: 'Auditoría interna',
    tips: [
      'Planifica auditorías a intervalos definidos para verificar conformidad del SGC.',
      'Selecciona auditores objetivos e imparciales (no auditás tu propio proceso).',
      'Comunica resultados a la dirección y abre acciones correctivas para los hallazgos.',
      'Mantén registros del programa, criterios, alcance y resultados de cada auditoría.',
    ],
  },
  '9.3': {
    clause: '9.3',
    title: 'Revisión por la Dirección',
    tips: [
      'La Alta Dirección revisa el SGC a intervalos planificados (típicamente anual o semestral).',
      'Incluye entradas: estado de acciones previas, cambios, desempeño, hallazgos de auditoría, NC.',
      'Las salidas deben incluir decisiones sobre mejora, cambios necesarios y recursos.',
      'Documentá la revisión: agenda, asistentes, decisiones, plazos, responsables.',
    ],
  },
  '10.2': {
    clause: '10.2',
    title: 'No conformidad y acción correctiva',
    tips: [
      'Reacciona ante la NC: controla, corrige, contiene; evalúa el impacto.',
      'Analiza la causa raíz (5 Por qués, Ishikawa) — no te quedés con el síntoma.',
      'Implementa acciones correctivas para evitar que vuelva a ocurrir.',
      'Verifica la eficacia de la acción: ¿realmente eliminó la causa?',
    ],
  },
  '10.3': {
    clause: '10.3',
    title: 'Mejora Continua',
    tips: [
      'Mejora la idoneidad, adecuación y eficacia del SGC de manera proactiva (no solo reaccionando a NCs).',
      'Considera entradas: análisis de datos (9.1), salidas de revisión por la dirección (9.3), NCs recurrentes.',
      'Cada oportunidad debe evaluarse: costo, beneficio, prioridad — para que la mejora sea sostenible.',
      'Verifica la eficacia después de implementar: ¿el beneficio esperado se materializó?',
    ],
  },
}
