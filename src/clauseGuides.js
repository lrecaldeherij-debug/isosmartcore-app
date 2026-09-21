// Catálogo central de guías ISO 9001:2015 por cláusula.
//
// Cada cláusula puede llevar además `iso17020`: qué pide la norma de organismos
// de inspección sobre ese mismo tema. Solo se muestra a las organizaciones que
// tienen el módulo 17020 habilitado (lo resuelve IsoInfoCard).
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
    iso17020: {
      clause: '4.1 / 8.5.1',
      note: 'La 17020 mira un riesgo que la 9001 no nombra: la imparcialidad. Identificá qué puede sesgar un dictamen.',
      tips: [
        'Sumá al FODA las relaciones que amenazan la imparcialidad: inspeccionar a un cliente que también es tu contratista, o a una obra que tu empresa ejecutó.',
        'Como Herij es tipo no A, el riesgo más fuerte es inspeccionar ítems que la propia empresa intervino: la salvaguarda está en el módulo de Inspección.',
        'Cada amenaza a la imparcialidad necesita una salvaguarda concreta y alguien que la vigile.',
      ],
    },
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
    iso17020: {
      clause: '4.1.3 / 5.2',
      note: 'Sumá las partes interesadas propias de un organismo de inspección.',
      tips: [
        'Agregá al organismo de acreditación, al dueño del activo inspeccionado y a quien recibe el informe, que no siempre es quien contrata.',
        'Si el que paga la inspección es el que fabricó el ítem, declaralo: es una presión sobre la imparcialidad.',
      ],
    },
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
    iso17020: {
      clause: '5.2.3',
      note: 'El alcance del SGC no es el alcance de acreditación: son dos cosas distintas que conviven.',
      tips: [
        'El alcance del SGC dice qué cubre tu sistema de calidad; el alcance técnico dice qué actividades de inspección hacés, con qué rango y contra qué normas.',
        'El alcance técnico se declara en Inspección → Alcance, actividad por actividad, con su tipo de independencia (A o no A).',
        'Cuidá que el alcance del SGC incluya la actividad de inspección; si no, el evaluador va a ver una contradicción.',
      ],
    },
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
    iso17020: {
      clause: '7.1 / 7.4',
      note: 'El proceso de inspección tiene que estar en el mapa de procesos, con sus entradas y salidas reales.',
      tips: [
        'Agregá el proceso de inspección: entra la solicitud y el ítem, salen el registro de campo y el informe con dictamen.',
        'Marcá qué procesos de soporte lo alimentan: calibración de equipos, competencia y autorización de inspectores.',
      ],
    },
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
    iso17020: {
      clause: '4.1.5 / 5.2',
      note: 'La política tiene que comprometerse con la imparcialidad, no solo con la satisfacción del cliente.',
      tips: [
        'Declará que la dirección se compromete a mantener la imparcialidad y a que nadie sea presionado para cambiar un dictamen.',
        'Agregá que la remuneración del personal de inspección no depende del resultado de la inspección ni de la cantidad de ítems aprobados.',
      ],
    },
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
    iso17020: {
      clause: '5.1 / 6.1.1',
      note: 'Un organismo de inspección necesita responsable técnico, y con suplente.',
      tips: [
        'Definí el responsable técnico de cada actividad y quién lo reemplaza cuando no está: sin eso no se puede operar.',
        'Separá las líneas de reporte: quien decide el dictamen no puede depender de quien vende el servicio.',
        'Las autorizaciones por método se cargan en Inspección → Inspectores, no alcanza con el perfil de cargo.',
      ],
    },
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
    iso17020: {
      clause: '4.1 / 8.5',
      note: 'Sumá los riesgos propios del organismo de inspección.',
      tips: [
        'Imparcialidad, competencia del inspector, equipo descalibrado, dictamen mal emitido y presión comercial sobre el resultado.',
        'El seguro de responsabilidad civil se dimensiona con este análisis de riesgos (5.2.4), no a ojo.',
      ],
    },
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
    iso17020: {
      clause: '8.2',
      note: 'Los objetivos deberían medir también el desempeño técnico de la inspección.',
      tips: [
        'Ejemplos medibles: informes emitidos sin observación del cliente, monitoreos en campo cumplidos, certificaciones vencidas en cero.',
      ],
    },
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
    iso17020: {
      clause: '6.2.6 / 6.2.7',
      note: 'Acá está uno de los hallazgos más comunes de una evaluación.',
      tips: [
        'Todo equipo que influye en el resultado necesita calibración trazable y vigente, y tiene que quedar claro cuál es.',
        'Guardá los certificados y anotá el número de serie: el registro de inspección referencia ese equipo concreto.',
        'Definí qué hacer cuando un equipo aparece fuera de tolerancia: hay que revisar los informes emitidos con él.',
      ],
    },
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
    iso17020: {
      clause: '6.1.2 / 6.1.4 / 6.1.5',
      note: 'Para un inspector, "competente" tiene un significado más estricto.',
      tips: [
        'No alcanza la formación: hace falta certificación por método y nivel, examen de agudeza visual vigente y autorización formal.',
        'Antes de autorizar hay un período mentorizado; después, monitoreo en campo periódico.',
        'Todo eso se carga en Inspección → Inspectores, y la app no deja firmar a quien no está habilitado hoy.',
      ],
    },
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
    iso17020: {
      clause: '7.1 / 7.3 / 8.3',
      note: 'Los métodos y los registros de inspección son información documentada, con reglas extra.',
      tips: [
        'El método de inspección se controla en Inspección → Métodos: si es propio o modificado, no puede estar vigente sin validación.',
        'Los registros de inspección deben permitir reconstruir la inspección: qué equipo, qué condiciones y qué desviaciones hubo.',
      ],
    },
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
    iso17020: {
      clause: '5.2.5 / 7.1.2',
      note: 'La revisión del pedido decide si podés aceptar el trabajo.',
      tips: [
        'Antes de aceptar: ¿la actividad está en tu alcance declarado?, ¿hay método vigente?, ¿hay inspector autorizado disponible?',
        'Dejá por escrito qué información tiene que entregar el cliente y en qué condiciones debe estar el ítem.',
        'Si el cliente pide un criterio de aceptación distinto al habitual, acordalo y registralo antes de empezar.',
      ],
    },
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
    iso17020: {
      clause: '6.3',
      note: 'Subcontratar inspección tiene reglas propias.',
      tips: [
        'El organismo no puede subcontratar la decisión del dictamen; sí, excepcionalmente, parte de la ejecución.',
        'El subcontratista debe ser competente y cumplir los mismos requisitos: guardá esa evidencia y el consentimiento del cliente.',
      ],
    },
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
    iso17020: {
      clause: '7.3 / 7.4',
      note: 'La "producción" del organismo es la inspección misma.',
      tips: [
        'El ítem bajo tu custodia tiene que estar identificado y protegido de deterioro mientras lo inspeccionás.',
        'La inspección se registra en el módulo de Inspección, no en órdenes de producción.',
      ],
    },
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
    iso17020: {
      clause: '7.4 / 7.5',
      note: 'La liberación es el informe con dictamen.',
      tips: [
        'El informe lo firma quien está autorizado a interpretar o firmar ese método, y la app lo verifica contra su autorización vigente.',
        'Un informe emitido no se edita: se corrige con una enmienda que referencia y reemplaza a la anterior (7.6).',
      ],
    },
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
    iso17020: {
      clause: '8.6',
      note: 'La auditoría interna tiene que cubrir los requisitos técnicos, no solo el sistema.',
      tips: [
        'Agregá al programa: imparcialidad, competencia y autorización de inspectores, métodos, equipos e informes emitidos.',
        'Quien audita la parte técnica necesita conocimiento del método que audita.',
      ],
    },
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
    iso17020: {
      clause: '8.7',
      note: 'La agenda de la revisión por la dirección suma temas.',
      tips: [
        'Imparcialidad y sus amenazas, quejas y apelaciones, resultados del monitoreo de inspectores, y el estado del alcance de acreditación.',
      ],
    },
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
    iso17020: {
      clause: '8.8 / 7.5',
      note: 'Una no conformidad puede afectar informes ya entregados.',
      tips: [
        'Si el trabajo no conforme afecta informes emitidos, hay que evaluar el impacto y avisar a los clientes alcanzados.',
        'Las quejas de clientes sobre un dictamen se tratan aparte, con alguien que no participó en la inspección.',
      ],
    },
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
  '7.1.3': {
    clause: '7.1.3',
    title: 'Infraestructura',
    tips: [
      'Incluye edificios, equipos (hardware y software), transporte y servicios de apoyo (TIC, energía, aire comprimido).',
      'No confundir con 7.1.5: los equipos de medición van en Calibración; acá va el resto de la infraestructura.',
      'Para cada activo crítico definí frecuencia de mantenimiento preventivo — el auditor pide el historial, no solo el plan.',
      'Conectá cada activo con el proceso del SGC que depende de él: eso justifica su criticidad.',
    ],
  },
  '7.1.6': {
    clause: '7.1.6',
    title: 'Conocimientos de la Organización',
    tips: [
      'Requisito nuevo de la versión 2015: el know-how necesario para operar los procesos debe estar identificado y disponible.',
      'El riesgo real que cubre: conocimiento que vive solo en la cabeza de una persona. Si se va, el proceso se cae.',
      'Distinguí fuente interna (experiencia propia, lecciones aprendidas) de externa (normas, cursos, consultores).',
      'Para cada conocimiento crítico definí un plan de respaldo: documentarlo, formar a un backup o ambas.',
    ],
  },
  '7.3': {
    clause: '7.3',
    title: 'Toma de Conciencia',
    tips: [
      'No es lo mismo que competencia (7.2). Competencia = sabe hacer el trabajo. Conciencia = entiende por qué existe el SGC y su rol.',
      'La norma exige cubrir 4 puntos: política de calidad, objetivos pertinentes, su contribución al SGC e implicaciones de no cumplir.',
      'El auditor lo verifica entrevistando personal al azar: si no saben la política, se abre no conformidad aunque tengas el acta firmada.',
      'Registrá la verificación de comprensión, no solo la asistencia: entrevista, cuestionario u observación.',
    ],
  },
  '8.2.1': {
    clause: '8.2.1',
    title: 'Comunicación con el Cliente',
    tips: [
      'Cubre: información del producto, consultas y pedidos, retroalimentación INCLUYENDO QUEJAS, propiedad del cliente y contingencias.',
      'El registro de quejas es lo primero que pide el auditor en esta cláusula. Sin evidencia de cómo se cierran, es no conformidad casi segura.',
      'Registrá el canal por el que llegó cada comunicación: demuestra que hay múltiples vías abiertas al cliente.',
      'Una queja crítica debería escalar a no conformidad formal (10.2) con análisis de causa raíz.',
    ],
  },
  '9.1.2': {
    clause: '9.1.2',
    title: 'Satisfacción del Cliente',
    tips: [
      'La norma exige hacer seguimiento de las percepciones del cliente. No basta con "no tenemos quejas": hay que medir activamente.',
      'Métodos válidos: encuestas, retroalimentación sobre productos entregados, reuniones con clientes, análisis de cuotas de mercado, felicitaciones.',
      'Lo que el auditor busca es la TENDENCIA: ¿mejoró o empeoró respecto al período anterior? y qué hiciste al respecto.',
      'Un resultado bajo debe disparar acción: oportunidad de mejora (10.3) o no conformidad (10.2) según la gravedad.',
    ],
  },
  '9.1.3': {
    clause: '9.1.3',
    title: 'Análisis y Evaluación',
    tips: [
      'El tablero muestra números; esta cláusula pide el ANÁLISIS: qué conclusión saca la organización de esos números.',
      'La norma lista 6 ejes: conformidad de productos, satisfacción del cliente, desempeño del SGC, eficacia de lo planificado, eficacia frente a riesgos y desempeño de proveedores.',
      'El resultado es un registro fechado que alimenta la revisión por la dirección (9.3) — no un gráfico en vivo.',
      'Congelá los indicadores del período en el informe: si los datos cambian después, el análisis sigue siendo verificable.',
    ],
  },
}
