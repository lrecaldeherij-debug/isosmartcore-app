// =============================================================================
// aiUsage.ts — helper compartido para loggear consumo de IA en ai_usage_log.
//
// Uso desde una edge function:
//   import { logAiUsage, estimateCost } from "../_shared/aiUsage.ts";
//   const t0 = Date.now();
//   const geminiResponse = await fetch(...);
//   const data = await geminiResponse.json();
//   logAiUsage(admin, {
//     orgId, userId, functionName: "copilot-chat",
//     model, usageMetadata: data?.usageMetadata,
//     latencyMs: Date.now() - t0,
//   });
//
// SIEMPRE fire-and-forget (no await). Si falla, log a console pero no
// bloquea la respuesta al user — el tracking no debe romper el producto.
// =============================================================================

// deno-lint-ignore-file no-explicit-any

// ─── Pricing hardcoded (USD por 1M tokens, sep-2026) ─────────────────────────
// Fuente: https://ai.google.dev/pricing — snapshot mantenido a mano. Si Google
// cambia precios, actualizar aca (o convertir en env var si cambia seguido).
// Los precios estan por millon de tokens. Costos < $0.001 se contabilizan.
const PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  // Chat models
  "gemini-3.6-flash":       { inputPer1M: 0.075, outputPer1M: 0.30 },
  "gemini-2.5-flash":       { inputPer1M: 0.075, outputPer1M: 0.30 },
  "gemini-1.5-flash":       { inputPer1M: 0.075, outputPer1M: 0.30 },
  "gemini-2.0-flash":       { inputPer1M: 0.075, outputPer1M: 0.30 }, // legacy, por si aparece
  "gemini-pro":             { inputPer1M: 0.50,  outputPer1M: 1.50 },

  // Embedding models — el output no cuenta (solo se cobra input)
  "gemini-embedding-001":   { inputPer1M: 0.10,  outputPer1M: 0 },
  "text-embedding-004":     { inputPer1M: 0.10,  outputPer1M: 0 },
  "embedding-001":          { inputPer1M: 0.10,  outputPer1M: 0 },
};

// Fallback conservador cuando aparece un modelo desconocido (Google lanza uno
// nuevo y todavia no lo agregamos aca). Usa el precio del flash como proxy.
const FALLBACK_PRICING = { inputPer1M: 0.075, outputPer1M: 0.30 };

export function estimateCost(model: string | null | undefined, promptTokens: number, outputTokens: number): number {
  const p = (model && PRICING[model]) || FALLBACK_PRICING;
  const inputCost = (promptTokens / 1_000_000) * p.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * p.outputPer1M;
  return Number((inputCost + outputCost).toFixed(6));
}

export interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface LogAiUsageArgs {
  orgId: string;
  userId: string | null;
  functionName: "copilot-chat" | "gemini-proxy" | "embed-and-index" | "rag-backfill";
  model: string | null;
  usageMetadata: UsageMetadata | null | undefined;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Loggea el consumo de una llamada IA. Fire-and-forget: no bloquea al caller.
 * Si Gemini no devolvio usageMetadata (raro pero pasa en algunos errores),
 * loggea con 0 tokens y $0 costo — sigue sirviendo para saber que hubo llamada.
 */
export function logAiUsage(admin: any, args: LogAiUsageArgs): void {
  const promptTokens = args.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = args.usageMetadata?.candidatesTokenCount ?? 0;
  const totalTokens = args.usageMetadata?.totalTokenCount ?? (promptTokens + outputTokens);
  const cost = estimateCost(args.model, promptTokens, outputTokens);

  // No await → fire-and-forget. Si la insercion falla, logueamos pero no
  // propagamos el error al caller (el user ya recibio su respuesta).
  admin.from("ai_usage_log").insert({
    org_id: args.orgId,
    user_id: args.userId,
    function_name: args.functionName,
    model: args.model,
    prompt_tokens: promptTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    cost_usd: cost,
    latency_ms: args.latencyMs ?? null,
    metadata: args.metadata ?? null,
  }).then((res: any) => {
    if (res?.error) {
      console.warn(`[aiUsage] insert failed: ${res.error.message}`);
    }
  }).catch((err: Error) => {
    console.warn(`[aiUsage] insert threw: ${err.message}`);
  });
}
