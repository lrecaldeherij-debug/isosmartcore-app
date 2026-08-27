// =============================================================================
// Edge Function: ai-health-check
//
// Pinguea cada modelo de Gemini que usamos con un request minúsculo (1 token)
// y devuelve el status de cada uno. La corre un cron diario desde GH Actions
// para detectar deprecaciones ANTES de que un user se tope con el error.
//
// Modelos chequeados (chat + embeddings):
//   - Chat: los del env var COPILOT_MODELS + GEMINI_MODELS
//   - Embeddings: los del env var GEMINI_EMBEDDING_MODELS
//
// Response:
//   {
//     ok: true,
//     summary: { total: N, healthy: M, unhealthy: K, suggested_replacements: [...] },
//     details: [{ model, kind, ok, latency_ms, error?, suggested_replacement? }]
//   }
//
// Exit codes (para que GH Actions sepa fallar):
//   - HTTP 200 si TODOS los modelos responden OK
//   - HTTP 503 si al menos 1 falla — GH Actions falla el workflow y avisa
//
// Seguridad:
//   No requiere JWT (verify_jwt=false via config.toml). Es un health-check
//   público; no expone datos. Rate limit natural (1 call por día del cron).
//
// Deploy:
//   supabase functions deploy ai-health-check --no-verify-jwt
// =============================================================================

// deno-lint-ignore-file no-explicit-any

const CHAT_MODELS = (Deno.env.get("COPILOT_MODELS") ?? Deno.env.get("GEMINI_MODELS") ?? "gemini-3.6-flash,gemini-2.5-flash,gemini-1.5-flash")
  .split(",").map(s => s.trim()).filter(Boolean);

const EMBEDDING_MODELS = (Deno.env.get("GEMINI_EMBEDDING_MODELS") ?? "gemini-embedding-001,text-embedding-004,embedding-001")
  .split(",").map(s => s.trim()).filter(Boolean);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface Result {
  model: string;
  kind: "chat" | "embedding";
  ok: boolean;
  latency_ms: number;
  error?: string;
  suggested_replacement?: string;
}

async function pingChat(apiKey: string, model: string): Promise<Result> {
  const start = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 1 },  // respuesta minúscula
      }),
    });
    const latency = Date.now() - start;
    if (res.ok) return { model, kind: "chat", ok: true, latency_ms: latency };
    const errBody: any = await res.json().catch(() => ({}));
    const errMsg = errBody?.error?.message ?? `HTTP ${res.status}`;
    const suggested = errMsg.match(/models\/([a-z0-9\-\.]+)/i)?.[1];
    return {
      model, kind: "chat", ok: false, latency_ms: latency,
      error: errMsg.slice(0, 200),
      ...(suggested && suggested !== model ? { suggested_replacement: suggested } : {}),
    };
  } catch (e) {
    return { model, kind: "chat", ok: false, latency_ms: Date.now() - start, error: (e as Error).message };
  }
}

async function pingEmbedding(apiKey: string, model: string): Promise<Result> {
  const start = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
  try {
    const body: any = { content: { parts: [{ text: "ping" }] } };
    if (model === "gemini-embedding-001") body.outputDimensionality = 768;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const latency = Date.now() - start;
    if (res.ok) return { model, kind: "embedding", ok: true, latency_ms: latency };
    const errBody: any = await res.json().catch(() => ({}));
    const errMsg = errBody?.error?.message ?? `HTTP ${res.status}`;
    const suggested = errMsg.match(/models\/([a-z0-9\-\.]+)/i)?.[1];
    return {
      model, kind: "embedding", ok: false, latency_ms: latency,
      error: errMsg.slice(0, 200),
      ...(suggested && suggested !== model ? { suggested_replacement: suggested } : {}),
    };
  } catch (e) {
    return { model, kind: "embedding", ok: false, latency_ms: Date.now() - start, error: (e as Error).message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ ok: false, error: "GEMINI_API_KEY no configurada" }, 500);

  const results = await Promise.all([
    ...CHAT_MODELS.map(m => pingChat(apiKey, m)),
    ...EMBEDDING_MODELS.map(m => pingEmbedding(apiKey, m)),
  ]);

  const healthy = results.filter(r => r.ok).length;
  const unhealthy = results.filter(r => !r.ok).length;
  const suggestedReplacements = [...new Set(
    results.filter(r => r.suggested_replacement).map(r => r.suggested_replacement!)
  )];

  const summary = {
    total: results.length,
    healthy,
    unhealthy,
    suggested_replacements: suggestedReplacements,
  };

  const status = unhealthy > 0 ? 503 : 200;
  return json({ ok: unhealthy === 0, summary, details: results }, status);
});
