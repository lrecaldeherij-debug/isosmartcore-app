// =============================================================================
// Edge Function: embed-and-index
//
// Genera embedding con Gemini text-embedding-004 y hace UPSERT del chunk en
// rag_chunks. Se invoca desde el frontend POST-save de la fila fuente:
//
//   await supabase.functions.invoke('embed-and-index', {
//     body: { source_table: 'risk_matrix', source_id: '<uuid>' }
//   })
//
// Para operation:'delete' borra el chunk (post-delete cleanup).
//
// SEGURIDAD:
//   1. verify_jwt=true — solo authenticated puede invocar
//   2. Valida que el user tenga acceso a la org de la fila (el service_role
//      client leería cualquier org, así que chequeamos org_id explícito)
//   3. NO cuenta contra ai_prompts_used_month — este es costo interno del
//      sistema (el user no lo pidió, se dispara por su save)
//
// Deploy:
//   supabase functions deploy embed-and-index
// =============================================================================

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAiUsage } from "../_shared/aiUsage.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Modelos con fallback. text-embedding-004 dio 404 en producción (Google
// deprecó el path v1beta/models/text-embedding-004 durante 2026); el modelo
// vigente es gemini-embedding-001, que soporta outputDimensionality=768 para
// mantener compatibilidad con vector(768) sin recrear el índice.
const EMBEDDING_MODELS = (Deno.env.get("GEMINI_EMBEDDING_MODELS") ?? "gemini-embedding-001,text-embedding-004,embedding-001")
  .split(",").map(s => s.trim()).filter(Boolean);
const EMBEDDING_DIMS = 768;

// CORS por-request via helper compartido (respeta env ALLOWED_ORIGINS).
function makeJson(req: Request) {
  const cors = corsHeaders(req);
  return (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Convierte objeto plano a "clave: valor\nclave: valor" ignorando null/undefined/vacíos
function stringifyForEmbedding(obj: Record<string, any>): string {
  return Object.entries(obj)
    .filter(([_, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join("\n");
}

// Extrae contenido indexable y título de una fila según su tabla.
// Devuelve null si la fila no tiene suficiente texto para embeddear.
function extractChunkFromRow(table: string, row: any): { content: string; title: string } | null {
  if (!row) return null;

  if (table === "risk_matrix") {
    const content = stringifyForEmbedding({
      "Riesgo": row.risk_description,
      "Tipo": row.type,
      "Categoría": row.category,
      "Puntaje inicial": row.score_initial,
      "Puntaje residual": row.score_residual,
      "Medidas de control": row.control_measure,
      "Estrategia de tratamiento": row.treatment_strategy,
      "Estado": row.status,
    });
    if (!content) return null;
    return {
      content,
      title: `Riesgo · ${(row.risk_description || row.category || "sin título").slice(0, 80)}`,
    };
  }

  if (table === "non_conformities") {
    const content = stringifyForEmbedding({
      "Descripción": row.description,
      "Origen": row.source,
      "Tipo": row.type,
      "Severidad": row.severity,
      "Estado": row.status,
      "Fecha detección": row.detection_date,
      "Fecha cierre": row.closure_date,
      "Resultado eficacia": row.effectiveness_result,
      "Causa raíz": row.root_cause,
      "Plan de acción": row.action_plan,
      "Recurrente": row.is_recurrent ? "sí" : "no",
      "5 por qués": row.five_whys,
    });
    if (!content) return null;
    return {
      content,
      title: `NC · ${(row.description || "sin descripción").slice(0, 80)}`,
    };
  }

  if (table === "documents_versions") {
    const content = stringifyForEmbedding({
      "Código": row.code,
      "Título": row.title,
      "Área": row.area,
      "Tipo": row.document_type,
      "Descripción": row.description,
      "Estado": row.status,
      "Versión": row.version,
      "Notas de versión": row.version_notes,
    });
    if (!content) return null;
    return {
      content,
      title: `${row.code || "DOC"} · ${(row.title || "sin título").slice(0, 80)}`,
    };
  }

  if (table === "context_analysis") {
    const content = stringifyForEmbedding({
      "Tipo": row.type, "Categoría": row.category, "Factor": row.factor,
      "Descripción": row.description, "Estrategia": row.strategy, "Estado": row.status,
    });
    if (!content) return null;
    return {
      content,
      title: `Contexto · ${row.type || ""} ${(row.factor || row.category || "sin factor").slice(0, 60)}`.trim(),
    };
  }

  if (table === "processes") {
    const content = stringifyForEmbedding({
      "Código": row.code, "Nombre": row.name, "Tipo": row.process_type,
      "Objetivo": row.objective, "Alcance": row.scope, "Responsable": row.responsible_role,
      "Entradas": row.inputs, "Salidas": row.outputs, "Indicadores": row.indicators,
    });
    if (!content) return null;
    return {
      content,
      title: `Proceso · ${row.code || ""} ${(row.name || "sin nombre").slice(0, 60)}`.trim(),
    };
  }

  if (table === "quality_policy") {
    const content = stringifyForEmbedding({
      "Política final": row.final_policy_statement || row.policy_text,
      "Compromisos": row.commitments,
      "Estado": row.status,
      "Última revisión": row.last_reviewed,
    });
    if (!content) return null;
    return { content, title: "Política de Calidad" };
  }

  if (table === "quality_objectives") {
    const content = stringifyForEmbedding({
      "Nombre": row.name, "Objetivo": row.objective, "Categoría": row.category,
      "Indicador": row.indicator, "Unidad": row.unit,
      "Meta": row.target, "Actual": row.current, "Baseline": row.baseline_value,
      "Estado": row.status, "Año": row.year,
    });
    if (!content) return null;
    return {
      content,
      title: `Objetivo · ${(row.name || row.objective || "sin nombre").slice(0, 60)}`,
    };
  }

  if (table === "internal_audits") {
    const content = stringifyForEmbedding({
      "Tipo": row.audit_type, "Proceso auditado": row.audit_process,
      "Estado": row.status, "Año": row.year,
      "Fecha planificada": row.planned_date, "Fecha real": row.audit_date,
      "Auditor líder": row.lead_auditor, "Alcance": row.audit_scope,
      "Criterios": row.audit_criteria, "Conclusiones": row.conclusions,
      "Finalizada": row.is_finished ? "sí" : "no",
    });
    if (!content) return null;
    return {
      content,
      title: `Auditoría · ${row.year || ""} ${(row.audit_process || row.audit_type || "").slice(0, 60)}`.trim(),
    };
  }

  if (table === "management_review") {
    const content = stringifyForEmbedding({
      "Tipo": row.review_type, "Fecha": row.review_date,
      "Presidida por": row.chairperson, "Estado": row.status,
      "Período": (row.period_start && row.period_end)
        ? `${row.period_start} → ${row.period_end}` : null,
      "Salidas — oportunidades": row.outputs_improvement_opportunities,
      "Salidas — cambios necesarios": row.outputs_changes_needed,
    });
    if (!content) return null;
    return {
      content,
      title: `Revisión Dirección · ${row.review_date || row.review_type || "sin fecha"}`,
    };
  }

  return null;
}

async function sha256Hex(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

async function tryEmbedModel(apiKey: string, model: string, text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
  const body: any = {
    content: { parts: [{ text }] },
    taskType: "RETRIEVAL_DOCUMENT",
  };
  // gemini-embedding-001 default es 3072 dims — pedimos 768 para el pgvector actual.
  if (model === "gemini-embedding-001") body.outputDimensionality = EMBEDDING_DIMS;

  const ctl = new AbortController();
  const timeoutId = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data: any = await res.json();
    const values = data?.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMS) {
      throw new Error(`dims incorrectas: got ${values?.length}, want ${EMBEDDING_DIMS}`);
    }
    return values;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function embedWithGemini(apiKey: string, text: string): Promise<number[]> {
  const errors: string[] = [];
  const queue = [...EMBEDDING_MODELS];
  const attempted = new Set<string>();
  while (queue.length > 0) {
    const model = queue.shift()!;
    if (attempted.has(model)) continue;
    attempted.add(model);
    try {
      return await tryEmbedModel(apiKey, model, text);
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`${model}: ${msg}`);
      if (!/HTTP (400|404)/.test(msg) && !/dims incorrectas/.test(msg)) throw e;
      // Auto-parseo del modelo sugerido por Google en el error 404.
      const suggested = msg.match(/models\/([a-z0-9\-\.]+)/i)?.[1];
      if (suggested && !attempted.has(suggested)) {
        console.info(`embed-and-index: ${model} retirado, sugiere ${suggested} → prepend`);
        queue.unshift(suggested);
      }
    }
  }
  throw new Error(`Todos los modelos de embedding fallaron: ${errors.join(" | ")}`);
}

// pgvector espera formato "[0.1,0.2,...]"
function vectorToPgLiteral(vec: number[]): string {
  return "[" + vec.join(",") + "]";
}

const ALLOWED_TABLES = new Set([
  "risk_matrix",
  "non_conformities",
  "documents_versions",
  "context_analysis",
  "processes",
  "quality_policy",
  "quality_objectives",
  "internal_audits",
  "management_review",
]);

Deno.serve(async (req: Request) => {
  const json = makeJson(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // 1. Env
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!apiKey) return json({ error: "GEMINI_API_KEY no configurada" }, 500);
  if (!supabaseUrl || !supabaseAnon || !serviceRole) {
    return json({ error: "Supabase env vars faltantes" }, 500);
  }

  // 2. Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta Authorization header" }, 401);
  const invoker = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await invoker.auth.getUser();
  if (userErr || !user) return json({ error: "Sesión inválida" }, 401);

  const { data: profile } = await invoker
    .from("user_profiles")
    .select("org_id, role")
    .eq("user_id", user.id)
    .single();
  if (!profile) return json({ error: "Perfil no encontrado" }, 403);

  // Solo roles con escritura pueden triggerar indexación. Un viewer que ve la
  // pantalla no dispara ingestion.
  if (!["owner", "quality_manager", "auditor"].includes(profile.role)) {
    return json({ error: "Rol sin permisos de indexación" }, 403);
  }

  // 3. Body
  let payload: { source_table?: string; source_id?: string; operation?: string };
  try { payload = await req.json(); }
  catch { return json({ error: "Body inválido" }, 400); }

  const { source_table, source_id, operation } = payload;
  if (!source_table || !source_id) {
    return json({ error: "Faltan source_table y source_id" }, 400);
  }
  if (!ALLOWED_TABLES.has(source_table)) {
    return json({ error: `source_table '${source_table}' no está en la allowlist RAG` }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRole);

  // 4. Operación DELETE: borrar todos los chunks de esa source_id
  if (operation === "delete") {
    const { error: delErr } = await admin
      .from("rag_chunks")
      .delete()
      .eq("source_table", source_table)
      .eq("source_id", source_id)
      .eq("org_id", profile.org_id);
    if (delErr) return json({ error: `No se pudo borrar: ${delErr.message}` }, 500);
    return json({ ok: true, deleted: true });
  }

  // 5. Operación por default: (re)indexar. Leemos la fila fuente.
  const { data: row, error: rowErr } = await admin
    .from(source_table)
    .select("*")
    .eq("id", source_id)
    .single();
  if (rowErr || !row) return json({ error: `Fila fuente no encontrada: ${rowErr?.message ?? "?"}` }, 404);

  // Defense-in-depth: el user debe pertenecer a la misma org que la fila.
  if (row.org_id !== profile.org_id) {
    console.warn(`embed-and-index: intento cross-org user=${user.id} row_org=${row.org_id}`);
    return json({ error: "Fila fuente pertenece a otra organización" }, 403);
  }

  const chunk = extractChunkFromRow(source_table, row);
  if (!chunk) {
    // Fila sin texto suficiente. Borramos el chunk viejo si existe (por si
    // el user vació todos los campos).
    await admin.from("rag_chunks").delete()
      .eq("source_table", source_table)
      .eq("source_id", source_id);
    return json({ ok: true, indexed: false, reason: "empty_content" });
  }

  const contentHash = await sha256Hex(chunk.content);

  // Si el hash no cambió, no re-embeddear (ahorra cuota gratuita de Gemini).
  const { data: existing } = await admin
    .from("rag_chunks")
    .select("id, content_hash")
    .eq("source_table", source_table)
    .eq("source_id", source_id)
    .eq("chunk_index", 0)
    .maybeSingle();

  if (existing && existing.content_hash === contentHash) {
    return json({ ok: true, indexed: false, reason: "unchanged" });
  }

  // 6. Generar embedding
  let embedding: number[];
  const tEmbed0 = Date.now();
  try {
    embedding = await embedWithGemini(apiKey, chunk.content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("embed-and-index: Gemini error", msg);
    return json({ error: `Gemini falló: ${msg}` }, 502);
  }
  // Fire-and-forget: log de consumo. Los edge functions de embedContent no
  // devuelven usageMetadata, asi que estimamos tokens ~= chars/4.
  logAiUsage(admin, {
    orgId: profile.org_id,
    userId: user.id,
    functionName: "embed-and-index",
    model: EMBEDDING_MODELS[0],
    usageMetadata: { promptTokenCount: Math.ceil(chunk.content.length / 4), candidatesTokenCount: 0 },
    latencyMs: Date.now() - tEmbed0,
    metadata: { source_table, source_id, content_length: chunk.content.length },
  });

  // 7. UPSERT
  const { error: upErr } = await admin
    .from("rag_chunks")
    .upsert({
      org_id: profile.org_id,
      source_table,
      source_id,
      chunk_index: 0,
      content: chunk.content,
      title: chunk.title,
      embedding: vectorToPgLiteral(embedding),
      content_hash: contentHash,
    }, { onConflict: "source_table,source_id,chunk_index" });

  if (upErr) {
    console.error("embed-and-index: upsert falló", upErr);
    return json({ error: `Upsert falló: ${upErr.message}` }, 500);
  }

  return json({ ok: true, indexed: true, title: chunk.title });
});
