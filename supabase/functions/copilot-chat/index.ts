// =============================================================================
// Edge Function: copilot-chat
//
// Chat conversacional con contexto RAG de la org del user. Flujo:
//   1. Recibe la pregunta + historial opcional
//   2. Enforcement de quota (increment_ai_usage — SÍ cuenta esta llamada)
//   3. Genera embedding de la pregunta con Gemini text-embedding-004
//   4. Llama RPC rag_search para top-K chunks de la org efectiva
//      (respeta impersonate: si super_admin impersona → busca en esa org)
//   5. Arma prompt: system + contexto + historial + pregunta
//   6. Llama Gemini generateContent
//   7. Devuelve { text, citations: [{ source_table, source_id, title, similarity }] }
//
// Deploy:
//   supabase functions deploy copilot-chat
// =============================================================================

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMBEDDING_MODELS = (Deno.env.get("GEMINI_EMBEDDING_MODELS") ?? "gemini-embedding-001,text-embedding-004,embedding-001")
  .split(",").map(s => s.trim()).filter(Boolean);
const EMBEDDING_DIMS = 768;
const CHAT_MODEL = Deno.env.get("COPILOT_MODEL") ?? "gemini-2.0-flash";
const CHAT_TIMEOUT_MS = 25000;
const TOP_K = 5;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function tryEmbedModel(apiKey: string, model: string, text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
  const body: any = {
    content: { parts: [{ text }] },
    // La query del user va con taskType RETRIEVAL_QUERY (asimétrico con
    // RETRIEVAL_DOCUMENT usado al indexar — mejora calidad de retrieval).
    taskType: "RETRIEVAL_QUERY",
  };
  if (model === "gemini-embedding-001") body.outputDimensionality = EMBEDDING_DIMS;

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data: any = await res.json();
    const values = data?.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMS) {
      throw new Error(`dims incorrectas: got ${values?.length}, want ${EMBEDDING_DIMS}`);
    }
    return values;
  } finally { clearTimeout(t); }
}

async function embedQuery(apiKey: string, text: string): Promise<number[]> {
  const errors: string[] = [];
  for (const model of EMBEDDING_MODELS) {
    try {
      return await tryEmbedModel(apiKey, model, text);
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`${model}: ${msg}`);
      if (!/HTTP (400|404)/.test(msg) && !/dims incorrectas/.test(msg)) throw e;
    }
  }
  throw new Error(`Todos los modelos fallaron: ${errors.join(" | ")}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!apiKey) return json({ error: "GEMINI_API_KEY no configurada" }, 500);
  if (!supabaseUrl || !supabaseAnon || !serviceRole) return json({ error: "Env vars faltantes" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta Authorization" }, 401);
  const invoker = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await invoker.auth.getUser();
  if (userErr || !user) return json({ error: "Sesión inválida" }, 401);

  const { data: profile } = await invoker
    .from("user_profiles")
    .select("org_id, role, is_super_admin")
    .eq("user_id", user.id)
    .single();
  if (!profile) return json({ error: "Perfil no encontrado" }, 403);

  // Org efectiva: si el user es super_admin y tiene impersonate_org_id en
  // user_metadata, usar esa. Sino, la propia. Coincide con la lógica de
  // OrgContext.jsx + current_impersonate_org() del SQL.
  const impersonateOrgId = user.user_metadata?.impersonate_org_id || null;
  const effectiveOrgId = (profile.is_super_admin && impersonateOrgId) ? impersonateOrgId : profile.org_id;

  // Cargar plan / estado — mismo pattern que gemini-proxy
  const { data: org } = await invoker
    .from("org_with_plan")
    .select("id, is_internal_account, effective_status, ai_prompts_per_month, ai_prompts_remaining")
    .eq("id", profile.org_id)  // ← quota se cuenta sobre la propia org del user, no la impersonada
    .maybeSingle();
  if (!org) return json({ error: "Organización no encontrada" }, 403);

  if (!org.is_internal_account) {
    if (!["active", "trialing"].includes(org.effective_status)) {
      return json({
        error: "Tu suscripción no está activa. Renová o contactá a soporte.",
        code: "subscription_inactive",
      }, 402);
    }
    if (org.ai_prompts_per_month !== null && org.ai_prompts_remaining !== null && org.ai_prompts_remaining <= 0) {
      return json({
        error: `Alcanzaste el límite mensual (${org.ai_prompts_per_month}). Se reinicia el próximo mes.`,
        code: "ai_quota_exceeded",
        cap: org.ai_prompts_per_month,
      }, 402);
    }
  }

  // Body
  let body: { question?: string; history?: Array<{ role: string; text: string }> };
  try { body = await req.json(); }
  catch { return json({ error: "Body inválido" }, 400); }

  const question = String(body.question || "").trim();
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];  // últimas 6 msgs
  if (!question) return json({ error: "Falta 'question'" }, 400);
  if (question.length > 4000) return json({ error: "Pregunta demasiado larga" }, 400);

  // Increment quota antes de invocar Gemini (misma lógica que gemini-proxy)
  if (!org.is_internal_account) {
    const { error: incErr } = await invoker.rpc("increment_ai_usage", { p_org_id: profile.org_id });
    if (incErr) {
      console.error("copilot-chat: increment_ai_usage falló", incErr);
      return json({ error: "No se pudo registrar el uso de IA" }, 500);
    }
  }

  // 1. Embedding de la pregunta
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedQuery(apiKey, question);
    if (queryEmbedding.length !== 768) throw new Error(`Dims incorrectas: ${queryEmbedding.length}`);
  } catch (e) {
    return json({ error: `Embedding falló: ${(e as Error).message}` }, 502);
  }

  // 2. Retrieval — service_role bypassa RLS pero pasamos org_id explícito
  const admin = createClient(supabaseUrl, serviceRole);
  const { data: chunks, error: searchErr } = await admin.rpc("rag_search", {
    p_org_id: effectiveOrgId,
    p_query_embedding: "[" + queryEmbedding.join(",") + "]",
    p_top_k: TOP_K,
  });
  if (searchErr) {
    console.error("copilot-chat: rag_search falló", searchErr);
    return json({ error: `Búsqueda RAG falló: ${searchErr.message}` }, 500);
  }

  const contextChunks = (chunks || []) as Array<{
    id: string; source_table: string; source_id: string;
    title: string; content: string; similarity: number;
  }>;

  // 3. Armar prompt
  const contextBlock = contextChunks.length === 0
    ? "(No hay información indexada aún en esta organización sobre el tema. Respondé honestamente que no tenés datos y sugerí al user cargar la información en el módulo correspondiente.)"
    : contextChunks.map((c, i) =>
        `[${i + 1}] ${c.title}\n${c.content}`
      ).join("\n\n---\n\n");

  const historyBlock = history.length === 0 ? "" :
    "\n\nCONVERSACIÓN PREVIA:\n" +
    history.map(m => `${m.role === "user" ? "Usuario" : "Copiloto"}: ${m.text}`).join("\n");

  const fullPrompt = `Sos el Copiloto ISO 9001:2015 de IsoSmartCore. Ayudás a gerentes de calidad y auditores a entender el estado de su Sistema de Gestión de Calidad respondiendo preguntas con base en los datos reales de su organización.

REGLAS:
1. Respondé SOLO con base en el CONTEXTO abajo. Si no está en el contexto, decilo honestamente — no inventes.
2. Cuando cites información específica, referí al chunk con [1], [2], etc. — el frontend renderizará el link al registro original.
3. Tono profesional, conciso, orientado a acción. Sos consultor, no charlatán.
4. Si detectás un problema (riesgos altos sin tratar, NCs vencidas, docs obsoletos), sugerí acción concreta según ISO 9001.
5. Respondé en español rioplatense.
6. Si la pregunta no es sobre calidad/SGC, redirigí amablemente al scope.

CONTEXTO (top-${TOP_K} chunks más relevantes de la organización):
${contextBlock}
${historyBlock}

PREGUNTA DEL USUARIO: ${question}

Respondé ahora:`;

  // 4. Generación
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${apiKey}`;
  const ctl = new AbortController();
  const timeoutId = setTimeout(() => ctl.abort(), CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
      }),
      signal: ctl.signal,
    });
    clearTimeout(timeoutId);
    const data: any = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      return json({ error: `Gemini generación: ${msg}` }, 502);
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return json({ error: "Respuesta vacía de Gemini" }, 502);

    return json({
      text: text.trim(),
      citations: contextChunks.map((c, i) => ({
        index: i + 1,
        source_table: c.source_table,
        source_id: c.source_id,
        title: c.title,
        similarity: Number(c.similarity.toFixed(3)),
      })),
      model: CHAT_MODEL,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    const isTimeout = (e as Error).name === "AbortError";
    return json({ error: isTimeout ? `Timeout ${CHAT_TIMEOUT_MS}ms` : (e as Error).message }, 502);
  }
});
