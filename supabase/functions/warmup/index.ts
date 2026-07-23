// =============================================================================
// Edge Function: warmup
//
// Endpoint público que mantiene "caliente" el proyecto Supabase.
// El plan Free de Supabase pausa el proyecto tras horas de inactividad,
// causando cold starts de 30-60s en la primera request de un usuario.
//
// UptimeRobot (u otro servicio de monitoreo gratis) hace ping a este endpoint
// cada 5 minutos → mantiene la DB despierta → cold start prácticamente eliminado.
//
// La función:
//   1. Hace SELECT 1 contra la DB para despertarla realmente
//   2. Devuelve un JSON simple con timestamp y ok:true
//   3. Es pública (verify_jwt = false) — no expone datos sensibles
//   4. Rate limit implícito por Supabase edge platform
//
// Deploy:
//   Dashboard → Edge Functions → Create → Pegar este archivo
//   Después: Function → Settings → toggle "Verify JWT" a OFF
//
// URL final: https://<project-ref>.supabase.co/functions/v1/warmup
// =============================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startedAt = Date.now()

  try {
    // Cliente admin (service_role) para consulta trivial. Esta key nunca sale
    // del servidor — solo se usa acá para despertar la DB.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Env vars missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // SELECT trivial que fuerza a Postgres a despertar sin retornar datos sensibles.
    // Consultamos la tabla `plans` porque tiene RLS que permite SELECT público
    // y solo tiene 3 filas (Starter/Pro/Enterprise). Cero costo real.
    const { error } = await client.from('plans').select('id').limit(1)

    const elapsedMs = Date.now() - startedAt

    if (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: error.message,
          elapsed_ms: elapsedMs,
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        elapsed_ms: elapsedMs,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: (err as Error)?.message || 'unknown',
        elapsed_ms: Date.now() - startedAt,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
