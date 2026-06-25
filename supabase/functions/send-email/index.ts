// =============================================================================
// Edge Function: send-email
//
// Proxy seguro hacia Resend para enviar correos transaccionales desde el SaaS.
// La API key de Resend vive SOLO en el servidor (env var RESEND_API_KEY).
//
// Invocada desde el cliente vía supabase.functions.invoke('send-email', { body: {...} })
//
// Body esperado:
//   {
//     to: string | string[],         // destinatario(s)
//     subject: string,               // asunto
//     html: string,                  // contenido HTML
//     text?: string,                 // opcional: fallback plain text
//     replyTo?: string,              // opcional: dirección de respuesta
//     tag?: string                   // opcional: tag para tracking en Resend
//   }
//
// Respuesta:
//   { ok: true, id: "<resend message id>" }    // éxito
//   { ok: false, error: "..." }                // error
//
// Deploy:
//   supabase functions deploy send-email
//
// Env vars requeridas (configurar en dashboard de Supabase → Edge Functions → secrets):
//   RESEND_API_KEY         — clave API de Resend (empieza con re_)
//   EMAIL_FROM             — remitente verificado (ej: "IsoSmartCore <no-reply@isosmartcore.com>")
//   EMAIL_ALLOWED_DOMAIN   — restricción de seguridad (ej: "isosmartcore.com")
// =============================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

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

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Solo POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Auth: requerir JWT válido (Supabase ya lo valida si verify_jwt = true en config)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta header Authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Env vars
    const apiKey = Deno.env.get('RESEND_API_KEY')
    const emailFrom = Deno.env.get('EMAIL_FROM')
    if (!apiKey || !emailFrom) {
      console.error('Faltan env vars: RESEND_API_KEY o EMAIL_FROM')
      return new Response(
        JSON.stringify({ ok: false, error: 'Servicio de email no configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse body
    const body = (await req.json()) as SendEmailBody
    if (!body.to || !body.subject || !body.html) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Faltan campos: to, subject, html' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Llamada a Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: Array.isArray(body.to) ? body.to : [body.to],
        subject: body.subject,
        html: body.html,
        text: body.text,
        reply_to: body.replyTo,
        tags: body.tag ? [{ name: 'category', value: body.tag }] : undefined,
      }),
    })

    const resendData = await resendRes.json()

    if (!resendRes.ok) {
      console.error('Error de Resend:', resendData)
      return new Response(
        JSON.stringify({
          ok: false,
          error: resendData?.message || 'Error al enviar correo',
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ ok: true, id: resendData.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Error en send-email:', err)
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
