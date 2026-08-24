// =============================================================================
// Edge Function: send-email
//
// Proxy seguro hacia Resend para enviar correos transaccionales.
// La API key de Resend vive SOLO en el servidor (env var RESEND_API_KEY).
//
// GUARDAS DE SEGURIDAD (post-auditoría 21-ago-2026):
//   1. Requiere JWT válido (verify_jwt=true en config.toml + getUser check)
//   2. Solo owner o quality_manager pueden invocar — un viewer no envía emails
//   3. Todos los destinatarios DEBEN matchear EMAIL_ALLOWED_DOMAIN — bloquea
//      phishing con nuestro dominio verificado. Sin este check, cualquier
//      user autenticado enviaba HTML libre a cualquier destinatario desde
//      no-reply@isosmartcore.com.
//   4. Máximo 20 destinatarios por request (anti-spam básico)
//   5. Loguea cada intento denegado a stderr para revisión posterior
//
// Body esperado:
//   {
//     to: string | string[],
//     subject: string,
//     html: string,
//     text?: string,
//     replyTo?: string,
//     tag?: string
//   }
//
// Env vars requeridas (supabase secrets set):
//   RESEND_API_KEY         — clave API de Resend (empieza con re_)
//   EMAIL_FROM             — remitente verificado (ej: "IsoSmartCore <no-reply@isosmartcore.com>")
//   EMAIL_ALLOWED_DOMAIN   — restricción de seguridad (ej: "isosmartcore.com" — sin @, sin espacios)
//   SUPABASE_URL           — para validar el user invocador
//   SUPABASE_ANON_KEY      — para el cliente que hace getUser
// =============================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface SendEmailBody {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  tag?: string
}

const MAX_RECIPIENTS = 20

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Extrae el dominio de "Foo <a@b.com>" o "a@b.com". Devuelve lowercased o null. */
function extractDomain(addr: string): string | null {
  const m = addr.match(/<([^>]+)>/)
  const email = (m ? m[1] : addr).trim()
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  return email.slice(at + 1).toLowerCase().trim()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResp({ ok: false, error: 'Method not allowed' }, 405)

  try {
    // ── 1. Env vars ─────────────────────────────────────────────────────
    const apiKey = Deno.env.get('RESEND_API_KEY')
    const emailFrom = Deno.env.get('EMAIL_FROM')
    const allowedDomain = Deno.env.get('EMAIL_ALLOWED_DOMAIN')?.toLowerCase().trim()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')

    if (!apiKey || !emailFrom) {
      console.error('send-email: faltan RESEND_API_KEY o EMAIL_FROM')
      return jsonResp({ ok: false, error: 'Servicio de email no configurado' }, 500)
    }
    if (!allowedDomain) {
      // FAIL CLOSED. Sin la restricción de dominio, la función es un vector
      // de phishing con nuestro dominio verificado. Nunca operar sin ella.
      console.error('send-email: EMAIL_ALLOWED_DOMAIN no configurado — rechazando')
      return jsonResp({ ok: false, error: 'Servicio de email no configurado (dominio permitido)' }, 500)
    }
    if (!supabaseUrl || !supabaseAnon) {
      console.error('send-email: faltan SUPABASE_URL o SUPABASE_ANON_KEY')
      return jsonResp({ ok: false, error: 'Servicio de email no configurado (auth)' }, 500)
    }

    // ── 2. Auth: JWT + rol ──────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResp({ ok: false, error: 'Falta header Authorization' }, 401)

    const invoker = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await invoker.auth.getUser()
    if (userErr || !user) {
      return jsonResp({ ok: false, error: 'Sesión inválida' }, 401)
    }

    const { data: profile } = await invoker
      .from('user_profiles')
      .select('org_id, role')
      .eq('user_id', user.id)
      .single()

    if (!profile) return jsonResp({ ok: false, error: 'Perfil no encontrado' }, 403)
    if (!['owner', 'quality_manager'].includes(profile.role)) {
      console.warn(`send-email: denegado a rol=${profile.role} user=${user.id} org=${profile.org_id}`)
      return jsonResp({ ok: false, error: 'Solo el owner o quality_manager pueden enviar correos' }, 403)
    }

    // ── 3. Body validation ──────────────────────────────────────────────
    const body = (await req.json()) as SendEmailBody
    if (!body.to || !body.subject || !body.html) {
      return jsonResp({ ok: false, error: 'Faltan campos: to, subject, html' }, 400)
    }

    const recipients = (Array.isArray(body.to) ? body.to : [body.to])
      .map(r => String(r).trim())
      .filter(Boolean)

    if (recipients.length === 0) {
      return jsonResp({ ok: false, error: 'Sin destinatarios' }, 400)
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return jsonResp({ ok: false, error: `Máximo ${MAX_RECIPIENTS} destinatarios por envío` }, 400)
    }

    // ── 4. Whitelist de dominio ─────────────────────────────────────────
    // Fail-closed: si CUALQUIER destinatario no matchea, rechazamos todo el
    // envío. Esto bloquea phishing con nuestro dominio, invoice fraud, y
    // uso del canal Resend para spam externo.
    const disallowed = recipients.filter(r => {
      const domain = extractDomain(r)
      return !domain || domain !== allowedDomain
    })
    if (disallowed.length > 0) {
      console.warn(
        `send-email: dominio no permitido en destinatarios ` +
        `user=${user.id} org=${profile.org_id} allowed=${allowedDomain} ` +
        `denied=${JSON.stringify(disallowed)}`
      )
      return jsonResp({
        ok: false,
        error: `Solo se puede enviar a direcciones @${allowedDomain}. Destinatarios rechazados: ${disallowed.join(', ')}`,
      }, 403)
    }

    // ── 5. Llamada a Resend ─────────────────────────────────────────────
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: recipients,
        subject: body.subject,
        html: body.html,
        text: body.text,
        reply_to: body.replyTo,
        tags: body.tag ? [{ name: 'category', value: body.tag }] : undefined,
      }),
    })

    const resendData = await resendRes.json()

    if (!resendRes.ok) {
      console.error('send-email: Resend error', resendData)
      return jsonResp({
        ok: false,
        error: resendData?.message || 'Error al enviar correo',
      }, 502)
    }

    return jsonResp({ ok: true, id: resendData.id }, 200)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-email: exception', message)
    return jsonResp({ ok: false, error: message || 'Error desconocido' }, 500)
  }
})
