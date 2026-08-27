// Supabase Edge Function: gemini-proxy
//
// Proxy autenticado para llamadas a Google Gemini.
// La API key vive como secret de la función (GEMINI_API_KEY), nunca en el cliente.
//
// GUARDAS DE SEGURIDAD Y COSTO (post-auditoría 21-ago-2026):
//   1. verify_jwt=true en config.toml + getUser() explícito para saber quién invoca
//   2. Bloqueo de orgs con suscripción expirada/cancelada
//   3. Enforcement de quota mensual: increment_ai_usage() se llama SIEMPRE
//      antes de invocar Gemini. Si excede plan.ai_prompts_per_month → 402
//      (Payment Required). Cuentas internas (is_internal_account=true) sin límite.
//   4. Timeout de 25s por modelo con AbortController — la función no cuelga
//      hasta el hard-limit de Supabase (150s) si Gemini está lento
//   5. Logs de intentos denegados por cost/rol/auth para auditoría posterior
//
// Deploy:
//   supabase functions deploy gemini-proxy
//   supabase secrets set GEMINI_API_KEY=<tu-key>

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// gemini-2.0-flash fue retirado en 2026 (respuesta oficial de Google apunta
// a gemini-3.6-flash). gemini-1.5-flash también deprecado. Actualizamos el
// default; el env var GEMINI_MODELS sigue permitiendo override sin redeploy.
const MODELS = (Deno.env.get("GEMINI_MODELS") ?? "gemini-3.6-flash,gemini-2.5-flash,gemini-1.5-flash")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const MODEL_TIMEOUT_MS = Number(Deno.env.get("GEMINI_TIMEOUT_MS") ?? "25000");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── 1. Env vars ──────────────────────────────────────────────────────
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!apiKey) return json({ error: "GEMINI_API_KEY no configurada" }, 500);
  if (!supabaseUrl || !supabaseAnon) return json({ error: "Supabase env vars faltantes" }, 500);

  // ── 2. Auth: JWT + user_profile ──────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta Authorization header" }, 401);

  const invoker = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userErr } = await invoker.auth.getUser();
  if (userErr || !user) return json({ error: "Sesión inválida" }, 401);

  // ── 3. Cargar org + plan (via vista org_with_plan) ───────────────────
  // La vista es la fuente de verdad porque calcula effective_status considerando
  // cuentas internas, combos y trial. increment_ai_usage() por su parte es
  // SECURITY DEFINER — no depende de RLS del user.
  const { data: profile, error: profErr } = await invoker
    .from("user_profiles")
    .select("org_id, role")
    .eq("user_id", user.id)
    .single();
  if (profErr || !profile) return json({ error: "Perfil no encontrado" }, 403);

  const { data: org, error: orgErr } = await invoker
    .from("org_with_plan")
    .select("id, is_internal_account, effective_status, ai_prompts_per_month, ai_prompts_remaining")
    .eq("id", profile.org_id)
    .maybeSingle();
  if (orgErr || !org) return json({ error: "Organización no encontrada" }, 403);

  // ── 4. Guardas de estado y quota ─────────────────────────────────────
  // Cuentas internas (Herij, tests): sin límite y sin chequeos de estado.
  if (!org.is_internal_account) {
    if (!["active", "trialing"].includes(org.effective_status)) {
      console.warn(`gemini-proxy: bloqueado por estado org=${profile.org_id} status=${org.effective_status}`);
      return json({
        error: "Tu suscripción no está activa. Renová o contactá a soporte.",
        code: "subscription_inactive",
      }, 402);
    }
    // Quota mensual: si el plan tiene límite y ya no queda cupo, bloquear.
    const cap = org.ai_prompts_per_month;
    const remaining = org.ai_prompts_remaining;
    if (cap !== null && remaining !== null && remaining <= 0) {
      console.warn(`gemini-proxy: quota agotada org=${profile.org_id} cap=${cap}`);
      return json({
        error: `Alcanzaste el límite mensual de tu plan (${cap} consultas IA). Se reinicia el próximo mes o podés subir de plan.`,
        code: "ai_quota_exceeded",
        cap,
      }, 402);
    }
  }

  // ── 5. Body ──────────────────────────────────────────────────────────
  let payload: { prompt?: string; systemContext?: string };
  try { payload = await req.json(); }
  catch { return json({ error: "Body inválido (JSON esperado)" }, 400); }

  const { prompt, systemContext = "" } = payload;
  if (!prompt || typeof prompt !== "string") {
    return json({ error: "Falta 'prompt'" }, 400);
  }
  if (prompt.length > 20000) {
    return json({ error: "Prompt demasiado largo (>20k chars)" }, 400);
  }

  // ── 6. Incrementar contador ANTES de invocar Gemini ──────────────────
  // Racing note: si dos requests concurrentes disparan al mismo tiempo, ambas
  // incrementan y ambas pueden pasar el check anterior. Es aceptable —
  // increment_ai_usage() usa UPDATE atómico y el desvío máximo es (workers - 1)
  // consultas extra por org. No incrementamos si es cuenta interna.
  let newUsage: number | null = null;
  if (!org.is_internal_account) {
    const { data: usageData, error: incErr } = await invoker.rpc("increment_ai_usage", {
      p_org_id: profile.org_id,
    });
    if (incErr) {
      console.error("gemini-proxy: increment_ai_usage falló", incErr);
      return json({ error: "No se pudo registrar el uso de IA" }, 500);
    }
    newUsage = typeof usageData === "number" ? usageData : null;
  }

  // ── 7. Construir prompt (sin cambios respecto al original) ───────────
  const fullPrompt = systemContext
    ? `${systemContext}\n\nSolicitud del usuario: ${prompt}`
    : `
    Actúa como un Consultor Experto en Normas ISO 9001:2015.
    Tu objetivo es ayudar a redactar descripciones concisas y estratégicas para el análisis de contexto (FODA).

    Solicitud del usuario: ${prompt}

    INSTRUCCIONES CLAVE DE FORMATO:
    1. Analiza si el factor es positivo (Fortaleza/Oportunidad) o negativo (Debilidad/Amenaza) según el contexto empresarial.
    2. Si es positivo, enfoca la estrategia en potenciarlo. Si es negativo, en mitigarlo o eliminarlo.
    3. Sé MUY conciso. Máximo 2-3 frases por sección.
    4. Usa lenguaje técnico de calidad pero directo.
    5. NO incluyas introducciones como "Claro, aquí tienes...". Ve directo al grano.
    6. Estructura la respuesta exactamente en este formato JSON (sin markdown):
    {
      "descripcion": "Texto breve de la descripción técnica (max 300 caracteres).",
      "estrategia": "Texto breve de la estrategia recomendada considerando si es riesgo positivo o negativo (max 300 caracteres)."
    }
  `;

  // ── 8. Fallback por modelo con timeout + auto-parseo del reemplazo ──
  // Cuando Google retira un modelo devuelve 404 con "Please use models/X" —
  // extraemos X del mensaje y lo agregamos al head de la queue. Sistema
  // se auto-repara sin redeploy.
  let lastError = "Sin respuesta";
  const queue = [...MODELS];
  const attempted = new Set<string>();

  while (queue.length > 0) {
    const model = queue.shift()!;
    if (attempted.has(model)) continue;
    attempted.add(model);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const ctl = new AbortController();
    const timeoutId = setTimeout(() => ctl.abort(), MODEL_TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
        }),
        signal: ctl.signal,
      });
      clearTimeout(timeoutId);
      const data: any = await resp.json();

      if (!resp.ok) {
        const msg = data?.error?.message ?? `HTTP ${resp.status}`;
        if (msg.includes("API_KEY_INVALID")) {
          return json({ error: "API Key de Gemini inválida" }, 502);
        }
        lastError = `${model}: ${msg}`;
        // Auto-parseo: si es 404/400 y Google sugiere reemplazo, prepend.
        if (resp.status === 404 || resp.status === 400) {
          const suggested = msg.match(/models\/([a-z0-9\-\.]+)/i)?.[1];
          if (suggested && !attempted.has(suggested)) {
            console.info(`gemini-proxy: ${model} retirado, sugiere ${suggested} → prepend`);
            queue.unshift(suggested);
          }
        }
        continue;
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastError = `${model}: respuesta vacía`;
        continue;
      }

      // Limpiar markdown que Gemini a veces envuelve sobre el JSON.
      let cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
      if (!cleanText.startsWith("{") && cleanText.includes("{")) {
        cleanText = cleanText.substring(cleanText.indexOf("{"));
      }
      if (!cleanText.endsWith("}") && cleanText.includes("}")) {
        cleanText = cleanText.substring(0, cleanText.lastIndexOf("}") + 1);
      }

      return json({ text: cleanText, model, ai_prompts_used_month: newUsage });
    } catch (e) {
      clearTimeout(timeoutId);
      const errMsg = (e as Error).name === "AbortError"
        ? `timeout (${MODEL_TIMEOUT_MS}ms)`
        : (e as Error).message;
      lastError = `${model}: ${errMsg}`;
    }
  }

  return json({ error: `No se pudo contactar a Gemini. Último error: ${lastError}` }, 502);
});
