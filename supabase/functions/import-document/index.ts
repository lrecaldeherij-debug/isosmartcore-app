// Supabase Edge Function: import-document
// Recibe un archivo (PDF/DOCX/TXT) + el módulo destino y devuelve JSON estructurado
// listo para insertar en la BD.
//
// Flujo:
//   1) Cliente envía { file_base64, mime_type, filename, target_module }
//   2) Función extrae texto del archivo:
//       - PDF  → mandado a Gemini como inline_data (multimodal nativo)
//       - DOCX → extraído con npm:mammoth, mandado como texto
//       - TXT  → texto plano
//   3) Función llama a Gemini con un prompt específico por módulo
//   4) Devuelve { ok: true, data: <json estructurado>, model }
//
// Deploy:
//   supabase functions deploy import-document
//   supabase secrets set GEMINI_API_KEY=<tu-key>   # ya configurada para gemini-proxy
//
// JWT requerido (verify_jwt=true por defecto) → solo usuarios logueados.

// deno-lint-ignore-file no-explicit-any

import mammoth from "npm:mammoth@1.7.0";

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Prompts específicos por módulo. Cada uno describe exactamente la forma
// del JSON que debe devolver Gemini para que el frontend lo inserte sin transformaciones.
const MODULE_PROMPTS: Record<string, { instructions: string; schema: string }> = {
  policy: {
    instructions:
      `Te paso una política de calidad existente. Tu trabajo es extraer su contenido y mapearlo a estos 5 campos para un sistema ISO 9001:2015. Si el documento no incluye explícitamente alguno, redactalo basándote en el contexto general del documento (no dejes campos vacíos).`,
    schema: `{
  "what_we_do": "actividad principal en una frase",
  "who_is_customer": "tipo de cliente al que sirven",
  "value_proposition": "qué diferencia ofrecen",
  "commitments": "compromisos concretos de calidad mencionados",
  "final_policy_statement": "declaración formal completa, 2-3 oraciones, con el nombre real de la empresa si aparece"
}`,
  },
  context: {
    instructions:
      `Te paso un análisis FODA / análisis de contexto existente. Extraé los factores y devolvelos como array. Cada factor debe estar clasificado como Interno (Fortaleza/Debilidad) o Externo (Oportunidad/Amenaza).`,
    schema: `{
  "context": [
    { "type": "Interno|Externo", "category": "Fortaleza|Debilidad|Oportunidad|Amenaza", "factor": "título corto", "description": "1-2 frases", "strategy": "qué hacer (sé concreto)" }
  ]
}`,
  },
  stakeholders: {
    instructions:
      `Te paso un análisis de partes interesadas. Extraé cada parte interesada con sus expectativas y nivel de influencia.`,
    schema: `{
  "stakeholders": [
    {
      "name": "nombre de la parte",
      "expectations": "qué espera del SGC",
      "influence_level": "Alto|Medio|Bajo",
      "is_sgc_requirement": true,
      "follow_up_frequency": "Mensual|Trimestral|Semestral|Anual|Continua",
      "planning_in_sgc": "cómo se planifica abordarlo",
      "evaluation_method": "cómo se mide el cumplimiento",
      "responsible": "responsable interno",
      "status": "Pendiente"
    }
  ]
}`,
  },
  risks: {
    instructions:
      `Te paso una matriz de riesgos existente. Extraé cada riesgo con su evaluación.`,
    schema: `{
  "risks": [
    {
      "process_area": "proceso afectado",
      "risk_description": "descripción del riesgo",
      "probability_initial": 5,
      "impact_initial": 5,
      "control_measure": "control existente o propuesto",
      "responsible": "responsable",
      "status": "En proceso"
    }
  ]
}`,
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  // strip data URL prefix if present
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function extractTextFromDocx(b64: string): Promise<string> {
  const buffer = base64ToBytes(b64);
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

function buildPrompt(targetModule: string, extractedText: string | null): string {
  const cfg = MODULE_PROMPTS[targetModule];
  if (!cfg) throw new Error(`Módulo no soportado: ${targetModule}`);

  const base = `Sos un consultor experto en ISO 9001:2015 ayudando a importar un documento existente del cliente.

${cfg.instructions}

Devolveme SOLO JSON con esta forma exacta (sin markdown, sin texto adicional):
${cfg.schema}`;

  if (extractedText) {
    return `${base}\n\nContenido del documento:\n"""\n${extractedText}\n"""`;
  }
  return base; // PDF se manda como inline_data, el prompt no necesita el texto
}

async function callGemini(
  apiKey: string,
  prompt: string,
  pdfInlineData?: { mime_type: string; data: string },
): Promise<{ ok: boolean; data?: any; error?: string; model?: string }> {
  const parts: any[] = [{ text: prompt }];
  if (pdfInlineData) {
    parts.push({ inline_data: pdfInlineData });
  }

  let lastError = "Sin respuesta";
  for (const model of MODELS) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
        }),
      });
      const respJson: any = await resp.json();

      if (!resp.ok) {
        const msg = respJson?.error?.message ?? `HTTP ${resp.status}`;
        if (msg.includes("API_KEY_INVALID")) {
          return { ok: false, error: "API Key de Gemini inválida" };
        }
        lastError = `${model}: ${msg}`;
        continue;
      }

      const text = respJson?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastError = `${model}: respuesta vacía`;
        continue;
      }

      // Limpiar markdown fences que Gemini a veces agrega
      let clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const first = clean.indexOf("{");
      const last = clean.lastIndexOf("}");
      if (first < 0 || last < 0) {
        lastError = `${model}: respuesta sin JSON parseable`;
        continue;
      }
      clean = clean.substring(first, last + 1);

      try {
        const parsed = JSON.parse(clean);
        return { ok: true, data: parsed, model };
      } catch (e) {
        lastError = `${model}: JSON inválido (${(e as Error).message})`;
        continue;
      }
    } catch (e) {
      lastError = `${model}: ${(e as Error).message}`;
    }
  }

  return { ok: false, error: `No se pudo procesar con Gemini. Último error: ${lastError}` };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return json({ error: "GEMINI_API_KEY no configurada" }, 500);
  }

  let payload: {
    file_base64?: string;
    mime_type?: string;
    filename?: string;
    target_module?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body inválido (se esperaba JSON)" }, 400);
  }

  const { file_base64, mime_type, target_module } = payload;
  if (!file_base64 || !mime_type || !target_module) {
    return json({
      error: "Faltan campos: file_base64, mime_type, target_module",
    }, 400);
  }

  if (!MODULE_PROMPTS[target_module]) {
    return json({
      error: `Módulo no soportado: ${target_module}. Válidos: ${Object.keys(MODULE_PROMPTS).join(", ")}`,
    }, 400);
  }

  // Resolución por tipo de archivo
  let extractedText: string | null = null;
  let pdfInline: { mime_type: string; data: string } | undefined;

  try {
    if (mime_type === "application/pdf") {
      // PDF nativo a Gemini multimodal
      const clean = file_base64.includes(",") ? file_base64.split(",")[1] : file_base64;
      pdfInline = { mime_type: "application/pdf", data: clean };
    } else if (
      mime_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      extractedText = await extractTextFromDocx(file_base64);
      if (!extractedText.trim()) {
        return json({ error: "El DOCX está vacío o no se pudo leer su contenido." }, 400);
      }
    } else if (mime_type === "text/plain" || mime_type === "text/markdown") {
      const bytes = base64ToBytes(file_base64);
      extractedText = new TextDecoder("utf-8").decode(bytes);
    } else {
      return json({
        error:
          `Tipo de archivo no soportado: ${mime_type}. Aceptamos PDF, DOCX y TXT.`,
      }, 400);
    }
  } catch (e) {
    return json({ error: `Error procesando archivo: ${(e as Error).message}` }, 500);
  }

  const prompt = buildPrompt(target_module, extractedText);
  const result = await callGemini(apiKey, prompt, pdfInline);

  if (!result.ok) {
    return json({ error: result.error }, 502);
  }
  return json({ ok: true, data: result.data, model: result.model });
});
