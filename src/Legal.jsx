import { colors, families, tracking, weight } from './components/ui/tokens'
import { ArrowLeft } from 'lucide-react'

// =========================================================================
// CONTENIDO LEGAL
//
// MVP defensivo para Ecuador (LOPDP — Ley Orgánica de Protección de Datos
// Personales 2021) + lo mínimo de e-commerce SaaS. No reemplaza revisión
// de un abogado, pero cubre el piso para cobrar y no quedar expuesto.
//
// Estructura: cada documento es un objeto { title, sectionLabel, version,
// sections[] }. Las secciones se renderizan con el mismo design "expediente
// certificado" del Login.
// =========================================================================

const EMPRESA = {
  comercial: 'IsoSmartCore',
  razonSocial: 'Herij',
  dominio: 'isosmartcore.com',
  ciudad: 'Quito, Ecuador',
  contactoSoporte: 'soporte@isosmartcore.com',
  contactoLegal: 'legal@isosmartcore.com',
  contactoOwner: 'lebis.recalde@herijec.com',
}

const VERSION_PRIVACIDAD = '1.0 — 2026-06-25'
const VERSION_TERMINOS = '1.0 — 2026-06-25'
const VERSION_COOKIES = '1.0 — 2026-06-25'

const PRIVACIDAD = {
  slug: 'privacidad',
  title: 'Política de Privacidad',
  sectionLabel: 'LOPDP · ECUADOR',
  version: VERSION_PRIVACIDAD,
  intro: `Esta Política describe cómo ${EMPRESA.comercial} (operado por ${EMPRESA.razonSocial}, con domicilio en ${EMPRESA.ciudad}) trata los datos personales que recolecta cuando usas el sitio web ${EMPRESA.dominio} y el software de gestión de calidad ISO 9001 (en adelante, el "Servicio"). Cumple con la Ley Orgánica de Protección de Datos Personales del Ecuador (LOPDP, 2021) y sus normas conexas.`,
  sections: [
    {
      num: '01',
      title: 'Responsable del tratamiento',
      body: `Responsable: ${EMPRESA.razonSocial}, domiciliada en ${EMPRESA.ciudad}.
Punto de contacto en materia de protección de datos: ${EMPRESA.contactoLegal}
Contacto general: ${EMPRESA.contactoSoporte}

Si tu organización contrató el Servicio para sus propios fines (por ejemplo, gestionar el SGC interno), tu organización es la "responsable" frente a sus empleados, y ${EMPRESA.razonSocial} actúa como "encargada del tratamiento" sobre los datos cargados en la plataforma.`,
    },
    {
      num: '02',
      title: 'Datos que recolectamos',
      body: `(a) Datos de cuenta: correo electrónico, nombre completo, contraseña cifrada, razón social y datos básicos de tu empresa.

(b) Datos del Sistema de Gestión de Calidad que tú o tu equipo carga: política, procesos, FODA, riesgos, objetivos, no conformidades, auditorías, registros de personal, indicadores, evidencias y documentos adjuntos.

(c) Datos de uso técnico: dirección IP, identificador de sesión, tipo de navegador, sistema operativo, páginas visitadas, tiempo de respuesta, errores en consola. Recolectados con fines de seguridad y mejora del Servicio.

(d) Datos de facturación: razón social, RUC, dirección fiscal, datos mínimos de la pasarela de pago (token o referencia, nunca el número de tarjeta completo). El procesador de pagos es responsable directo del dato financiero.

(e) Comunicaciones con soporte: el contenido de los correos o mensajes que nos envíes a ${EMPRESA.contactoSoporte} o a través del módulo de Ayuda.`,
    },
    {
      num: '03',
      title: 'Finalidades y base legal',
      body: `Tratamos tus datos para:

— Prestar el Servicio contratado (ejecución de contrato, art. 7.b LOPDP).
— Cumplir obligaciones legales: facturación, retenciones tributarias SRI, denuncias regulatorias (cumplimiento legal, art. 7.c).
— Garantizar la seguridad del Servicio, prevenir fraude y abusos (interés legítimo, art. 7.f).
— Enviarte comunicaciones operativas necesarias (notificaciones de cuenta, avisos de cambios en T&C, alertas de seguridad).
— Enviarte comunicaciones comerciales sobre nuevas funciones o productos relacionados, solo si nos diste consentimiento expreso (art. 7.a).
— Mejorar el Servicio en base a estadísticas agregadas y anonimizadas (interés legítimo).

No usamos tus datos para "perfilamiento automatizado" que produzca efectos jurídicos sobre ti sin tu intervención.`,
    },
    {
      num: '04',
      title: 'Inteligencia artificial',
      body: `El Servicio incluye funciones de IA (sugerencias de política, FODA, análisis de riesgos, redacción de objetivos, etc.) que envían fragmentos de los datos que cargas a un proveedor de modelos de lenguaje (actualmente Google Gemini, operado por Google LLC).

— Solo se envían los datos estrictamente necesarios para resolver la consulta.
— El proveedor no entrena sus modelos con tus datos cuando usamos la API empresarial.
— Los resultados generados por IA son sugerencias orientativas: la responsabilidad final del contenido del SGC es del usuario que lo aprueba.
— Si no deseas que ningún dato pase por proveedores de IA, puedes desactivar las funciones IA desde la configuración de tu organización.`,
    },
    {
      num: '05',
      title: 'Encargados del tratamiento (proveedores)',
      body: `Para operar el Servicio compartimos datos con proveedores especializados, todos bajo contrato de encargo conforme al art. 75 LOPDP:

— Supabase Inc. (Estados Unidos): base de datos, autenticación, almacenamiento de archivos.
— Vercel Inc. (Estados Unidos): hosting de la aplicación web.
— Cloudflare Inc. (Estados Unidos): DNS, CDN, protección anti-DDoS.
— Google LLC (Estados Unidos): API de modelos de lenguaje Gemini (solo cuando usas funciones IA).
— Resend Inc. (Estados Unidos): envío de correos transaccionales.
— Proveedor de pasarela de pagos local (Ecuador): procesamiento de transacciones.

Algunas transferencias salen del Ecuador hacia Estados Unidos. Tu autorización para esa transferencia queda incorporada en esta Política y en los T&C. Los proveedores cuentan con cláusulas contractuales tipo de protección equivalente.`,
    },
    {
      num: '06',
      title: 'Tiempo de conservación',
      body: `— Datos de cuenta y del SGC: durante toda la vigencia de tu suscripción + 12 meses adicionales por si decides reactivar.
— Datos de facturación: 7 años (obligación tributaria SRI).
— Logs de seguridad y acceso: 12 meses.
— Comunicaciones de soporte: 24 meses.

Vencidos estos plazos eliminamos o anonimizamos los datos, salvo que una obligación legal exija conservarlos más tiempo.`,
    },
    {
      num: '07',
      title: 'Tus derechos (ARCO+P)',
      body: `Como titular de datos personales tienes derecho a (art. 12 LOPDP):

— Acceder a los datos que tenemos sobre ti.
— Rectificar datos inexactos o desactualizados.
— Cancelar (eliminar) tus datos cuando ya no sean necesarios.
— Oponerte al tratamiento por motivos legítimos.
— Portabilidad: recibir tus datos en formato estructurado.
— Revocar el consentimiento cuando éste sea la base legal.
— Presentar reclamo ante la Autoridad de Protección de Datos.

Para ejercer cualquiera de estos derechos: escribe a ${EMPRESA.contactoLegal} desde el correo asociado a tu cuenta. Respondemos en máximo 15 días hábiles. Si no estás conforme con la respuesta, puedes acudir a la Superintendencia de Protección de Datos Personales del Ecuador.`,
    },
    {
      num: '08',
      title: 'Seguridad',
      body: `Aplicamos medidas técnicas y organizativas razonables:

— Conexión cifrada TLS 1.3 en todo el sitio.
— Contraseñas hasheadas con bcrypt; nunca almacenadas en texto plano.
— Aislamiento por organización (Row Level Security en base de datos).
— Backups automáticos diarios con retención mínima de 7 días.
— Logs de auditoría de cambios sensibles.
— Acceso a producción restringido al personal estrictamente necesario.

Ningún sistema es 100% inviolable. En caso de brecha que pueda afectar tus derechos, te notificaremos en máximo 5 días conforme al art. 45 LOPDP.`,
    },
    {
      num: '09',
      title: 'Menores de edad',
      body: `El Servicio está dirigido exclusivamente a empresas y profesionales mayores de edad. No recolectamos datos de menores. Si detectas que un menor cargó datos, contáctanos en ${EMPRESA.contactoLegal} para eliminarlos.`,
    },
    {
      num: '10',
      title: 'Cambios a esta Política',
      body: `Podemos actualizar esta Política. Cuando los cambios sean sustanciales (por ejemplo, nuevos proveedores con acceso a datos, nuevas finalidades) te avisaremos por correo y dentro del Servicio con al menos 15 días de antelación. La versión vigente siempre está disponible en ${EMPRESA.dominio}/legal/privacidad con su fecha de actualización.`,
    },
    {
      num: '11',
      title: 'Contacto y jurisdicción',
      body: `Para cualquier consulta sobre esta Política: ${EMPRESA.contactoLegal}

Esta Política se rige por las leyes de la República del Ecuador. Para cualquier controversia las partes se someten a los jueces competentes de ${EMPRESA.ciudad}, sin perjuicio del derecho del titular a reclamar ante la Superintendencia de Protección de Datos Personales.`,
    },
  ],
}

const TERMINOS = {
  slug: 'terminos',
  title: 'Términos y Condiciones',
  sectionLabel: 'CONTRATO DE SERVICIO',
  version: VERSION_TERMINOS,
  intro: `Estos Términos y Condiciones (en adelante, "T&C") regulan el uso del software de gestión de calidad ISO 9001 ${EMPRESA.comercial}, operado por ${EMPRESA.razonSocial}, con domicilio en ${EMPRESA.ciudad}. Al crear una cuenta o usar el Servicio aceptas estos T&C en su totalidad. Si no estás de acuerdo, no uses el Servicio.`,
  sections: [
    {
      num: '01',
      title: 'Definiciones',
      body: `Servicio: la plataforma web ${EMPRESA.comercial} accesible desde ${EMPRESA.dominio}, incluyendo todos sus módulos.
Usuario / tú: la persona natural o jurídica que crea una cuenta y usa el Servicio.
Organización: la cuenta empresarial que agrupa uno o más usuarios bajo la misma suscripción.
Contenido del Usuario: cualquier dato que cargues o generes dentro del Servicio (procesos, riesgos, registros, documentos, etc.).
Proveedor: ${EMPRESA.razonSocial}.`,
    },
    {
      num: '02',
      title: 'Cuenta y suscripción',
      body: `Para usar el Servicio debes crear una cuenta con un correo válido. Eres responsable de la confidencialidad de tu contraseña y de toda la actividad realizada bajo tu cuenta.

El Servicio se ofrece bajo modalidad SaaS por suscripción mensual o anual, con un período de prueba gratuito de 14 días sin tarjeta de crédito. Al finalizar la prueba, debes elegir un plan pago para continuar usando el Servicio; de lo contrario tu cuenta pasa a modo lectura.

Los planes vigentes, sus precios y limitaciones se publican en ${EMPRESA.dominio}/pricing. Podemos modificar precios con aviso de 30 días.`,
    },
    {
      num: '03',
      title: 'Facturación, pagos e impuestos',
      body: `Los pagos se procesan a través de pasarelas autorizadas en Ecuador. Aceptamos tarjetas de crédito/débito y otros medios que se vayan habilitando.

— Las suscripciones se renuevan automáticamente al final de cada ciclo.
— Puedes cancelar la renovación en cualquier momento desde tu panel de facturación.
— Los precios se expresan en dólares estadounidenses (USD) e incluyen o excluyen el IVA según se indique al checkout.
— ${EMPRESA.razonSocial} emite factura electrónica conforme a la normativa del SRI.
— Si tu pago falla, te notificamos y otorgamos 7 días de gracia antes de suspender el acceso.

Los cobros realizados no son reembolsables, salvo lo previsto en la cláusula 04 (derecho de desistimiento).`,
    },
    {
      num: '04',
      title: 'Derecho de desistimiento',
      body: `Si contratas como consumidor final tienes derecho a desistir sin justificación dentro de los 15 días posteriores a la primera facturación, conforme a la Ley Orgánica de Defensa del Consumidor. En ese caso reembolsamos el monto cobrado descontando los días efectivamente utilizados.

Solicita el desistimiento escribiendo a ${EMPRESA.contactoSoporte} desde el correo asociado a tu cuenta.`,
    },
    {
      num: '05',
      title: 'Propiedad intelectual',
      body: `(a) Servicio: el software, marca, diseño, código fuente y documentación son propiedad exclusiva de ${EMPRESA.razonSocial}. Te otorgamos una licencia limitada, no exclusiva, no transferible para usar el Servicio durante la vigencia de tu suscripción.

(b) Contenido del Usuario: todo lo que cargas en el Servicio sigue siendo tuyo. Nos otorgas únicamente la licencia técnica necesaria para almacenar, procesar y mostrar ese contenido dentro del Servicio mientras dure tu suscripción.

(c) Plantillas y sugerencias generadas por IA: las plantillas predefinidas son propiedad de ${EMPRESA.razonSocial} pero puedes usarlas libremente dentro y fuera del Servicio para tu propio Sistema de Gestión. Las sugerencias generadas por IA a partir de tus datos te pertenecen.`,
    },
    {
      num: '06',
      title: 'Uso aceptable',
      body: `Te comprometes a no:

— Cargar contenido ilegal, difamatorio, que infrinja derechos de terceros, o que contenga malware.
— Intentar acceder a cuentas u organizaciones que no te corresponden.
— Hacer ingeniería inversa, descompilar o intentar derivar el código fuente.
— Usar el Servicio para enviar spam o realizar actividades que sobrecarguen la infraestructura.
— Revender, sublicenciar o ceder tu suscripción a terceros sin autorización.

El incumplimiento puede dar lugar a suspensión o cancelación de tu cuenta sin reembolso, sin perjuicio de las acciones legales que correspondan.`,
    },
    {
      num: '07',
      title: 'Disponibilidad del Servicio',
      body: `Hacemos esfuerzos razonables para mantener el Servicio disponible 24/7, pero no garantizamos disponibilidad ininterrumpida. Pueden existir ventanas de mantenimiento (anunciadas con antelación cuando sea posible) o caídas no programadas por fallos de nuestros proveedores de infraestructura.

No somos responsables por la indisponibilidad atribuible a tu conexión, tu navegador, o a terceros ajenos a nuestro control.`,
    },
    {
      num: '08',
      title: 'Inteligencia artificial: alcance y limitaciones',
      body: `Las funciones IA del Servicio ofrecen sugerencias, plantillas y borradores. Estas salidas pueden contener errores, omisiones o información desactualizada. La responsabilidad final sobre el contenido del Sistema de Gestión, la veracidad de los registros, las decisiones operativas y el cumplimiento normativo es siempre del usuario.

${EMPRESA.razonSocial} no garantiza la aprobación de tu organización por parte de ningún organismo certificador ni la conformidad con ninguna norma específica. El Servicio es una herramienta de apoyo, no un sustituto del juicio profesional de auditores, consultores ni de la propia Alta Dirección de tu organización.`,
    },
    {
      num: '09',
      title: 'Limitación de responsabilidad',
      body: `En la máxima medida permitida por la ley, ${EMPRESA.razonSocial} no será responsable por daños indirectos, lucro cesante, pérdida de oportunidad, daño reputacional o cualquier daño consecuente derivado del uso o imposibilidad de uso del Servicio.

La responsabilidad total acumulada de ${EMPRESA.razonSocial} hacia ti, por cualquier causa, no excederá del monto pagado por la suscripción en los 12 meses anteriores al hecho que origina la reclamación.

Esta limitación no aplica en caso de dolo, culpa grave o cuando la ley imperativa establezca lo contrario.`,
    },
    {
      num: '10',
      title: 'Cancelación y terminación',
      body: `Puedes cancelar tu suscripción en cualquier momento desde tu panel de facturación. La cancelación toma efecto al final del ciclo de facturación en curso; mantienes acceso hasta esa fecha.

${EMPRESA.razonSocial} puede suspender o terminar tu cuenta inmediatamente en caso de incumplimiento grave de estos T&C, fraude, o uso ilegal del Servicio.

Al terminar la relación, mantenemos tu Contenido durante 12 meses (por si decides reactivar) y luego lo eliminamos definitivamente. Puedes solicitar la exportación de tus datos en formato estructurado en cualquier momento desde el panel o escribiendo a ${EMPRESA.contactoSoporte}.`,
    },
    {
      num: '11',
      title: 'Modificaciones a los T&C',
      body: `Podemos modificar estos T&C. Los cambios sustanciales se notifican por correo y dentro del Servicio con al menos 15 días de antelación. Si no estás de acuerdo con los cambios puedes cancelar tu suscripción antes de la entrada en vigor; el uso continuado del Servicio luego de esa fecha implica aceptación.

La versión vigente siempre está disponible en ${EMPRESA.dominio}/legal/terminos con su fecha de actualización.`,
    },
    {
      num: '12',
      title: 'Ley aplicable y jurisdicción',
      body: `Estos T&C se rigen por las leyes de la República del Ecuador. Cualquier controversia derivada se someterá a la jurisdicción ordinaria de los jueces competentes de ${EMPRESA.ciudad}, renunciando las partes a cualquier otro fuero.

Si alguna cláusula resulta nula o inaplicable, el resto del documento permanece vigente.`,
    },
    {
      num: '13',
      title: 'Contacto',
      body: `Para consultas sobre estos T&C: ${EMPRESA.contactoLegal}
Para soporte técnico y facturación: ${EMPRESA.contactoSoporte}
Propietario y contacto comercial: ${EMPRESA.contactoOwner}`,
    },
  ],
}

const COOKIES = {
  slug: 'cookies',
  title: 'Aviso de Cookies',
  sectionLabel: 'TECNOLOGÍAS DE RASTREO',
  version: VERSION_COOKIES,
  intro: `Este aviso explica qué cookies y tecnologías similares usa ${EMPRESA.comercial} y para qué. Forma parte integral de nuestra Política de Privacidad.`,
  sections: [
    {
      num: '01',
      title: '¿Qué es una cookie?',
      body: `Una cookie es un pequeño archivo de texto que se guarda en tu navegador cuando visitas un sitio web. Permite recordar información entre páginas (por ejemplo, que estás logueado) y registrar datos básicos de uso.`,
    },
    {
      num: '02',
      title: 'Cookies que usamos',
      body: `(a) Estrictamente necesarias — Token de sesión de autenticación (Supabase), preferencia de idioma, estado del menú lateral. Sin estas el Servicio no funciona. No requieren consentimiento.

(b) De seguridad — Protección contra ataques (Cloudflare), detección de bots, prevención de CSRF. No requieren consentimiento.

(c) De analítica anónima — Estadísticas agregadas de uso (qué módulos se usan más, tiempos de carga, errores). No identifican personas. En esta primera versión no usamos analítica externa: las métricas son internas a Supabase y se anonimizan.

(d) De marketing — No usamos cookies de marketing ni pixels de terceros (Meta, Google Ads, LinkedIn) en esta versión. Si en el futuro lo hacemos te lo informaremos y te pediremos consentimiento explícito.`,
    },
    {
      num: '03',
      title: 'Cómo controlar las cookies',
      body: `Puedes borrar las cookies desde la configuración de tu navegador o bloquearlas selectivamente. Ten en cuenta que si bloqueas las estrictamente necesarias no podrás iniciar sesión ni usar el Servicio.

Guías oficiales:
— Chrome: support.google.com/chrome/answer/95647
— Firefox: support.mozilla.org/kb/cookies-informacion-que-los-sitios-web-guardan-en-su-computadora
— Safari: support.apple.com/guide/safari/manage-cookies-sfri11471
— Edge: support.microsoft.com/microsoft-edge`,
    },
    {
      num: '04',
      title: 'Cambios',
      body: `Si en el futuro incorporamos cookies adicionales (por ejemplo analítica de terceros) actualizaremos este aviso y, cuando corresponda, te pediremos consentimiento explícito antes de activarlas.`,
    },
    {
      num: '05',
      title: 'Contacto',
      body: `Para consultas sobre cookies: ${EMPRESA.contactoLegal}`,
    },
  ],
}

const DOCS = {
  privacidad: PRIVACIDAD,
  terminos: TERMINOS,
  cookies: COOKIES,
}

// =========================================================================
// COMPONENTE
// =========================================================================

export default function Legal({ page = 'privacidad' }) {
  const doc = DOCS[page] || PRIVACIDAD

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.paper,
      color: colors.ink,
      fontFamily: families.body,
    }}>
      {/* ─── Top bar editorial con sello ─── */}
      <header style={{
        padding: '24px 40px',
        borderBottom: `1px solid ${colors.hairline}`,
        background: colors.paperWarm,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <a href="/" style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          textDecoration: 'none', color: colors.ink,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: `1.5px solid ${colors.seal}`, background: colors.paper,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: families.mono, fontSize: 9, fontWeight: weight.bold,
            color: colors.seal, letterSpacing: tracking.wide,
          }}>ISO</div>
          <div>
            <div style={{
              fontFamily: families.display, fontWeight: weight.semibold,
              fontSize: 18, lineHeight: 1,
            }}>{EMPRESA.comercial}</div>
            <div style={{
              fontFamily: families.mono, fontSize: 10,
              letterSpacing: tracking.wider, color: colors.inkSoft,
              textTransform: 'uppercase', marginTop: 3,
            }}>EXP·ISC·2026</div>
          </div>
        </a>

        <a href="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          textDecoration: 'none', color: colors.inkMid,
          fontFamily: families.mono, fontSize: 12,
          letterSpacing: tracking.wide, textTransform: 'uppercase',
        }}>
          <ArrowLeft size={14} /> Volver al expediente
        </a>
      </header>

      {/* ─── Cuerpo del documento ─── */}
      <main style={{
        maxWidth: 760, margin: '0 auto',
        padding: '56px 40px 80px',
      }}>
        {/* Eyebrow */}
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 14,
          paddingBottom: 10, borderBottom: `1px solid ${colors.hairline}`,
        }}>
          <span style={{
            fontFamily: families.mono, fontSize: 13, fontWeight: weight.bold,
            color: colors.seal,
          }}># 00</span>
          <span style={{
            fontFamily: families.mono, fontSize: 11,
            letterSpacing: tracking.wider, color: colors.inkSoft,
            textTransform: 'uppercase',
          }}>{doc.sectionLabel}</span>
        </div>

        {/* Título + version */}
        <h1 style={{
          margin: '28px 0 8px 0', fontFamily: families.display,
          fontSize: 'clamp(36px, 4vw, 48px)', fontWeight: weight.semibold,
          lineHeight: 1.05, letterSpacing: tracking.tight,
        }}>{doc.title}</h1>

        <div style={{
          fontFamily: families.mono, fontSize: 11,
          letterSpacing: tracking.wider, color: colors.inkSoft,
          textTransform: 'uppercase', marginBottom: 32,
        }}>VERSIÓN {doc.version}</div>

        {/* Intro */}
        <p style={{
          fontFamily: families.body, fontSize: 16, lineHeight: 1.7,
          color: colors.inkMid, marginBottom: 40,
        }}>{doc.intro}</p>

        {/* Secciones */}
        {doc.sections.map(s => (
          <section key={s.num} style={{ marginBottom: 36 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 14,
              marginBottom: 12,
            }}>
              <span style={{
                fontFamily: families.mono, fontSize: 13,
                fontWeight: weight.bold, color: colors.seal,
              }}># {s.num}</span>
              <h2 style={{
                margin: 0, fontFamily: families.display,
                fontSize: 22, fontWeight: weight.semibold,
                color: colors.ink,
              }}>{s.title}</h2>
            </div>
            <div style={{
              fontFamily: families.body, fontSize: 15, lineHeight: 1.7,
              color: colors.inkMid, whiteSpace: 'pre-wrap',
            }}>{s.body}</div>
          </section>
        ))}

        {/* Footer del expediente */}
        <div style={{
          marginTop: 56, paddingTop: 24,
          borderTop: `1px solid ${colors.hairline}`,
          display: 'flex', justifyContent: 'space-between',
          fontFamily: families.mono, fontSize: 10,
          letterSpacing: tracking.wider, color: colors.inkSoft,
          textTransform: 'uppercase',
        }}>
          <span>FOLIO LEG/{new Date().getFullYear()}</span>
          <span>{EMPRESA.razonSocial} · {EMPRESA.ciudad}</span>
        </div>

        {/* Links a otros docs */}
        <nav style={{
          marginTop: 32, display: 'flex', gap: 24, flexWrap: 'wrap',
          fontSize: 14, fontFamily: families.body,
        }}>
          {Object.values(DOCS).filter(d => d.slug !== doc.slug).map(d => (
            <a key={d.slug} href={`/legal/${d.slug}`} style={{
              color: colors.ink, textDecoration: 'none',
              borderBottom: `1px solid ${colors.ink}`,
            }}>{d.title} →</a>
          ))}
        </nav>
      </main>
    </div>
  )
}
