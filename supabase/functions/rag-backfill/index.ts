// =============================================================================
// Edge Function: rag-backfill
//
// Indexa TODAS las filas existentes de las 3 tablas RAG (risk_matrix,
// non_conformities, documents_versions) para una organización.
//
// Se corre 1 vez cuando el owner activa el copiloto por primera vez o
// cuando el super_admin migra datos históricos de un cliente nuevo.
//
// Body:
//   { org_id?: string }   ← solo super_admin puede pasar org_id ajeno;
//                           el owner siempre indexa su propia org.
//   { limit_per_table?: number }  ← seguridad, default 500 rows/tabla.
//
// Response:
//   { ok: true, results: [{ table, processed, skipped, failed }] }
//
// NO cuenta contra ai_prompts_used_month — es setup, no uso conversacional.
// El costo de embedding vive del tier free de Gemini.
//
// Deploy:
//   supabase functions deploy rag-backfill
// =============================================================================

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMBEDDING_MODELS = (Deno.env.get("GEMINI_EMBEDDING_MODELS") ?? "gemini-embedding-001,text-embedding-004,embedding-001")
  .split(",").map(s => s.trim()).filter(Boolean);
const EMBEDDING_DIMS = 768;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Duplicado intencional del helper de embed-and-index. Deno edge functions
// no comparten módulos entre sí; para 2 sitios, copiar > la infra de tener
// un módulo compartido publicado.
function stringifyForEmbedding(obj: Record<string, any>): string {
  return Object.entries(obj)
    .filter(([_, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join("\n");
}

function extractChunk(table: string, row: any): { content: string; title: string } | null {
  if (!row) return null;
  if (table === "risk_matrix") {
    const c = stringifyForEmbedding({
      "Riesgo": row.risk_description, "Tipo": row.type, "Categoría": row.category,
      "Puntaje inicial": row.score_initial, "Puntaje residual": row.score_residual,
      "Medidas de control": row.control_measure, "Estrategia de tratamiento": row.treatment_strategy,
      "Estado": row.status,
    });
    if (!c) return null;
    return { content: c, title: `Riesgo · ${(row.risk_description || row.category || "sin título").slice(0, 80)}` };
  }
  if (table === "non_conformities") {
    const c = stringifyForEmbedding({
      "Descripción": row.description, "Origen": row.source, "Tipo": row.type,
      "Severidad": row.severity, "Estado": row.status,
      "Fecha detección": row.detection_date, "Fecha cierre": row.closure_date,
      "Resultado eficacia": row.effectiveness_result, "Causa raíz": row.root_cause,
      "Plan de acción": row.action_plan, "Recurrente": row.is_recurrent ? "sí" : "no",
      "5 por qués": row.five_whys,
    });
    if (!c) return null;
    return { content: c, title: `NC · ${(row.description || "sin descripción").slice(0, 80)}` };
  }
  if (table === "documents_versions") {
    const c = stringifyForEmbedding({
      "Código": row.code, "Título": row.title, "Área": row.area,
      "Tipo": row.document_type, "Descripción": row.description,
      "Estado": row.status, "Versión": row.version, "Notas de versión": row.version_notes,
    });
    if (!c) return null;
    return { content: c, title: `${row.code || "DOC"} · ${(row.title || "sin título").slice(0, 80)}` };
  }
  if (table === "context_analysis") {
    const c = stringifyForEmbedding({
      "Tipo": row.type, "Categoría": row.category, "Factor": row.factor,
      "Descripción": row.description, "Estrategia": row.strategy, "Estado": row.status,
    });
    if (!c) return null;
    return { content: c, title: `Contexto · ${row.type || ""} ${(row.factor || row.category || "").slice(0, 60)}`.trim() };
  }
  if (table === "processes") {
    const c = stringifyForEmbedding({
      "Código": row.code, "Nombre": row.name, "Tipo": row.process_type,
      "Objetivo": row.objective, "Alcance": row.scope, "Responsable": row.responsible_role,
      "Entradas": row.inputs, "Salidas": row.outputs, "Indicadores": row.indicators,
    });
    if (!c) return null;
    return { content: c, title: `Proceso · ${row.code || ""} ${(row.name || "").slice(0, 60)}`.trim() };
  }
  if (table === "quality_policy") {
    const c = stringifyForEmbedding({
      "Política final": row.final_policy_statement || row.policy_text,
      "Compromisos": row.commitments, "Estado": row.status, "Última revisión": row.last_reviewed,
    });
    if (!c) return null;
    return { content: c, title: "Política de Calidad" };
  }
  if (table === "quality_objectives") {
    const c = stringifyForEmbedding({
      "Nombre": row.name, "Objetivo": row.objective, "Categoría": row.category,
      "Indicador": row.indicator, "Unidad": row.unit,
      "Meta": row.target, "Actual": row.current, "Baseline": row.baseline_value,
      "Estado": row.status, "Año": row.year,
    });
    if (!c) return null;
    return { content: c, title: `Objetivo · ${(row.name || row.objective || "").slice(0, 60)}` };
  }
  if (table === "internal_audits") {
    const c = stringifyForEmbedding({
      "Tipo": row.audit_type, "Proceso auditado": row.audit_process,
      "Estado": row.status, "Año": row.year,
      "Fecha planificada": row.planned_date, "Fecha real": row.audit_date,
      "Auditor líder": row.lead_auditor, "Alcance": row.audit_scope,
      "Criterios": row.audit_criteria, "Conclusiones": row.conclusions,
      "Finalizada": row.is_finished ? "sí" : "no",
    });
    if (!c) return null;
    return { content: c, title: `Auditoría · ${row.year || ""} ${(row.audit_process || row.audit_type || "").slice(0, 60)}`.trim() };
  }
  if (table === "management_review") {
    const c = stringifyForEmbedding({
      "Tipo": row.review_type, "Fecha": row.review_date,
      "Presidida por": row.chairperson, "Estado": row.status,
      "Período": (row.period_start && row.period_end) ? `${row.period_start} → ${row.period_end}` : null,
      "Salidas — oportunidades": row.outputs_improvement_opportunities,
      "Salidas — cambios necesarios": row.outputs_changes_needed,
    });
    if (!c) return null;
    return { content: c, title: `Revisión Dirección · ${row.review_date || row.review_type || ""}` };
  }
  return null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join("");
}

async function tryEmbedModel(apiKey: string, model: string, text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
  const body: any = {
    content: { parts: [{ text }] },
    taskType: "RETRIEVAL_DOCUMENT",
  };
  if (model === "gemini-embedding-001") body.outputDimensionality = EMBEDDING_DIMS;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
}

async function embedText(apiKey: string, text: string): Promise<number[]> {
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
      const suggested = msg.match(/models\/([a-z0-9\-\.]+)/i)?.[1];
      if (suggested && !attempted.has(suggested)) {
        console.info(`rag-backfill: ${model} retirado, sugiere ${suggested} → prepend`);
        queue.unshift(suggested);
      }
    }
  }
  throw new Error(`Todos los modelos fallaron: ${errors.join(" | ")}`);
}

const TABLES = [
  "risk_matrix",
  "non_conformities",
  "documents_versions",
  "context_analysis",
  "processes",
  "quality_policy",
  "quality_objectives",
  "internal_audits",
  "management_review",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!apiKey || !url || !anon || !serviceRole) return json({ error: "Env vars faltantes" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta Authorization" }, 401);
  const invoker = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await invoker.auth.getUser();
  if (userErr || !user) return json({ error: "Sesión inválida" }, 401);

  const { data: profile } = await invoker
    .from("user_profiles")
    .select("org_id, role, is_super_admin")
    .eq("user_id", user.id)
    .single();
  if (!profile) return json({ error: "Perfil no encontrado" }, 403);
  if (!profile.is_super_admin && profile.role !== "owner") {
    return json({ error: "Solo owner o super_admin pueden hacer backfill" }, 403);
  }

  let body: { org_id?: string; limit_per_table?: number };
  try { body = await req.json(); }
  catch { body = {}; }

  const targetOrgId = (profile.is_super_admin && body.org_id) ? body.org_id : profile.org_id;
  const limit = Math.min(Math.max(body.limit_per_table ?? 500, 1), 2000);

  const admin = createClient(url, serviceRole);
  const results: Array<{ table: string; processed: number; skipped: number; failed: number }> = [];

  for (const table of TABLES) {
    const { data: rows, error: rowsErr } = await admin
      .from(table).select("*").eq("org_id", targetOrgId).limit(limit);
    if (rowsErr) {
      results.push({ table, processed: 0, skipped: 0, failed: -1 });
      continue;
    }

    let processed = 0, skipped = 0, failed = 0;
    for (const row of rows ?? []) {
      const chunk = extractChunk(table, row);
      if (!chunk) { skipped++; continue; }

      const hash = await sha256Hex(chunk.content);
      const { data: existing } = await admin
        .from("rag_chunks")
        .select("content_hash")
        .eq("source_table", table).eq("source_id", row.id).eq("chunk_index", 0)
        .maybeSingle();
      if (existing?.content_hash === hash) { skipped++; continue; }

      try {
        const embedding = await embedText(apiKey, chunk.content);
        const { error: upErr } = await admin.from("rag_chunks").upsert({
          org_id: targetOrgId,
          source_table: table,
          source_id: row.id,
          chunk_index: 0,
          content: chunk.content,
          title: chunk.title,
          embedding: "[" + embedding.join(",") + "]",
          content_hash: hash,
        }, { onConflict: "source_table,source_id,chunk_index" });
        if (upErr) { failed++; continue; }
        processed++;

        // Throttle: 50ms entre calls para no reventar el tier free de Gemini.
        // El tier free tiene 1500 RPM = 25 req/s; nosotros vamos a ~20/s.
        await new Promise(r => setTimeout(r, 50));
      } catch (e) {
        console.error(`rag-backfill: falló ${table}/${row.id}`, e);
        failed++;
      }
    }
    results.push({ table, processed, skipped, failed });
  }

  return json({ ok: true, target_org_id: targetOrgId, results });
});
