// =============================================================================
// Cliente de envío de email transaccional
//
// Llama la Edge Function `send-email` que proxia hacia Resend.
// La API key vive solo en el servidor — nunca en el bundle del cliente.
//
// Uso:
//   import { sendEmail, emailTemplates } from './lib/email'
//   await sendEmail({
//     to: 'cliente@ejemplo.com',
//     subject: 'Te invitaron a IsoSmartCore',
//     html: emailTemplates.invitation({ inviter: 'Juan', orgName: 'Acme', acceptUrl: '...' }),
//     tag: 'invitation'
//   })
// =============================================================================

import { supabase } from '../supabaseClient'

export async function sendEmail({ to, subject, html, text, replyTo, tag }) {
  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: { to, subject, html, text, replyTo, tag },
    })

    if (error) {
      console.warn('Error invocando send-email:', error)
      return { ok: false, error: error.message || 'fallo al invocar la función' }
    }

    if (data?.ok) {
      return { ok: true, id: data.id }
    }

    return { ok: false, error: data?.error || 'Respuesta vacía' }
  } catch (err) {
    console.warn('Excepción en sendEmail:', err)
    return { ok: false, error: err?.message || 'Error de red' }
  }
}

// =============================================================================
// TEMPLATES HTML
//
// Diseño "expediente certificado" en línea con el resto del producto.
// Mantenidos como funciones puras: data → html string. Cero estado.
// =============================================================================

const BRAND = {
  name: 'IsoSmartCore',
  url: 'https://isosmartcore.com',
  seal: '#8B2438',
  paper: '#F5F1E8',
  paperWarm: '#EFEAD9',
  ink: '#2E1F1A',
  inkMid: '#5A4A3F',
  inkSoft: '#8A7A6B',
  hairline: '#D8CFB8',
}

function shell(innerHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:${BRAND.paper};font-family:Georgia,'Times New Roman',serif;color:${BRAND.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.paper};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${BRAND.hairline};">
        <!-- Header -->
        <tr><td style="padding:24px 32px;border-bottom:1px solid ${BRAND.hairline};background:${BRAND.paperWarm};">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:36px;vertical-align:middle;">
                <div style="width:32px;height:32px;border:1.5px solid ${BRAND.seal};border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;line-height:30px;font-family:'Courier New',monospace;font-size:9px;font-weight:bold;color:${BRAND.seal};letter-spacing:1px;">ISO</div>
              </td>
              <td style="vertical-align:middle;padding-left:12px;">
                <div style="font-size:18px;font-weight:600;color:${BRAND.ink};line-height:1;">${BRAND.name}</div>
                <div style="font-family:'Courier New',monospace;font-size:10px;color:${BRAND.inkSoft};letter-spacing:1.5px;text-transform:uppercase;margin-top:3px;">EXP·ISC·${new Date().getFullYear()}</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;color:${BRAND.inkMid};font-size:15px;line-height:1.7;">
          ${innerHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid ${BRAND.hairline};background:${BRAND.paperWarm};font-family:'Courier New',monospace;font-size:10px;color:${BRAND.inkSoft};letter-spacing:1.5px;text-transform:uppercase;text-align:center;">
          ${BRAND.name} · Quito · Ecuador<br>
          <a href="${BRAND.url}/legal/privacidad" style="color:${BRAND.inkSoft};text-decoration:none;border-bottom:1px solid ${BRAND.hairline};margin:0 8px;">Privacidad</a>
          <a href="${BRAND.url}/legal/terminos" style="color:${BRAND.inkSoft};text-decoration:none;border-bottom:1px solid ${BRAND.hairline};margin:0 8px;">Términos</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function eyebrow(num, label) {
  return `<div style="border-bottom:1px solid ${BRAND.hairline};padding-bottom:8px;margin-bottom:20px;">
    <span style="font-family:'Courier New',monospace;font-size:13px;font-weight:bold;color:${BRAND.seal};">§ ${num}</span>
    <span style="font-family:'Courier New',monospace;font-size:11px;color:${BRAND.inkSoft};letter-spacing:1.5px;text-transform:uppercase;margin-left:14px;">${label}</span>
  </div>`
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:${BRAND.seal};border-radius:2px;">
    <a href="${href}" style="display:inline-block;padding:14px 28px;color:#FFFFFF;font-family:Georgia,serif;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.5px;">${label}</a>
  </td></tr></table>`
}

function h1(text) {
  return `<h1 style="margin:0 0 16px 0;font-family:Georgia,serif;font-size:32px;font-weight:600;color:${BRAND.ink};line-height:1.1;">${text}</h1>`
}

export const emailTemplates = {
  // 1) Bienvenida (post-confirmación de email)
  welcome({ fullName, orgName }) {
    return shell(`
      ${eyebrow('00', 'ALTA DE EXPEDIENTE')}
      ${h1(`Bienvenido, ${escapeHtml(fullName)}.`)}
      <p>Tu cuenta de <strong>${escapeHtml(orgName)}</strong> en ${BRAND.name} quedó abierta. Tienes <strong>14 días de prueba gratis</strong>, sin tarjeta de crédito.</p>
      <p>El siguiente paso es completar el ADN de tu empresa para que la IA pueda personalizar tu Sistema de Gestión de Calidad.</p>
      ${button(BRAND.url, 'Abrir el expediente →')}
      <p style="font-size:13px;color:${BRAND.inkSoft};margin-top:24px;">Si no fuiste tú quien abrió esta cuenta, puedes ignorar este correo.</p>
    `)
  },

  // 2) Invitación de equipo
  invitation({ inviterName, orgName, role, acceptUrl }) {
    return shell(`
      ${eyebrow('07', 'INVITACIÓN AL EXPEDIENTE')}
      ${h1('Te invitaron a colaborar.')}
      <p><strong>${escapeHtml(inviterName)}</strong> te invitó a colaborar en el Sistema de Gestión de Calidad de <strong>${escapeHtml(orgName)}</strong> con el rol de <em>${escapeHtml(role)}</em>.</p>
      ${button(acceptUrl, 'Aceptar la invitación →')}
      <p style="font-size:13px;color:${BRAND.inkSoft};margin-top:24px;">Esta invitación vence en 7 días. Si no esperabas este correo, puedes ignorarlo sin riesgo.</p>
    `)
  },

  // 3) Reset de contraseña
  passwordReset({ resetUrl }) {
    return shell(`
      ${eyebrow('00', 'RESTAURAR ACCESO')}
      ${h1('Recuperar contraseña.')}
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en ${BRAND.name}. Si fuiste tú, haz clic en el botón. El link es válido por 1 hora.</p>
      ${button(resetUrl, 'Restablecer contraseña →')}
      <p style="font-size:13px;color:${BRAND.inkSoft};margin-top:24px;">Si no solicitaste este cambio, ignora este correo. Tu contraseña actual sigue siendo válida.</p>
    `)
  },

  // 4) Confirmación de pago / suscripción
  subscriptionConfirmed({ planName, amount, currency, periodEnd }) {
    return shell(`
      ${eyebrow('05', 'COMPROBANTE DE PAGO')}
      ${h1('Pago confirmado.')}
      <p>Confirmamos la activación de tu suscripción <strong>${escapeHtml(planName)}</strong> en ${BRAND.name}.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0;border:1px solid ${BRAND.hairline};">
        <tr><td style="padding:10px 14px;border-bottom:1px solid ${BRAND.hairline};font-family:'Courier New',monospace;font-size:11px;color:${BRAND.inkSoft};text-transform:uppercase;letter-spacing:1px;width:40%;">Plan</td>
            <td style="padding:10px 14px;border-bottom:1px solid ${BRAND.hairline};">${escapeHtml(planName)}</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid ${BRAND.hairline};font-family:'Courier New',monospace;font-size:11px;color:${BRAND.inkSoft};text-transform:uppercase;letter-spacing:1px;">Monto</td>
            <td style="padding:10px 14px;border-bottom:1px solid ${BRAND.hairline};">${escapeHtml(currency)} ${escapeHtml(String(amount))}</td></tr>
        <tr><td style="padding:10px 14px;font-family:'Courier New',monospace;font-size:11px;color:${BRAND.inkSoft};text-transform:uppercase;letter-spacing:1px;">Vence</td>
            <td style="padding:10px 14px;">${escapeHtml(periodEnd)}</td></tr>
      </table>
      <p>La factura electrónica se genera por separado conforme a SRI y la recibirás en las próximas 24 horas.</p>
      <p style="font-size:13px;color:${BRAND.inkSoft};margin-top:24px;">Si detectas algún problema con el cobro, escríbenos a soporte@isosmartcore.com.</p>
    `)
  },

  // 5) Genérico para uso ad-hoc desde features menores
  generic({ title, bodyHtml, ctaUrl, ctaLabel }) {
    return shell(`
      ${eyebrow('—', 'COMUNICACIÓN OFICIAL')}
      ${h1(escapeHtml(title))}
      ${bodyHtml}
      ${ctaUrl && ctaLabel ? button(ctaUrl, ctaLabel) : ''}
    `)
  },
}

function escapeHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
