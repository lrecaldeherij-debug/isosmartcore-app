// Supabase Edge Function: gemini-proxy
// Proxy autenticado para llamadas a Google Gemini.
// La API key vive como secret de la función (GEMINI_API_KEY), nunca en el cliente.
//
// Deploy:
//   supabase functions deploy gemini-proxy
//   supabase secrets set GEMINI_API_KEY=<tu-key>
//
// Por defecto Supabase exige JWT válido en el Authorization header (verify_jwt=true),
// así que sólo usuarios logueados pueden invocar esta función.

// deno-lint-ignore-file no-explicit-any

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
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
    return json({ error: "GEMINI_API_KEY no configurada en la Edge Function" }, 500);
  }

  let payload: { prompt?: string; systemContext?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body inválido (se esperaba JSON)" }, 400);
  }

  const { prompt, systemContext = "" } = payload;
  if (!prompt || typeof prompt !== "string") {
    return json({ error: "Falta 'prompt'" }, 400);
  }

  // Mismo prompting que el cliente original, pero ahora ejecutado server-side.
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

  let lastError = "Sin respuesta";
  for (const model of MODELS) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
        }),
      });
      const data: any = await resp.json();

      if (!resp.ok) {
        const msg = data?.error?.message ?? `HTTP ${resp.status}`;
        if (msg.includes("API_KEY_INVALID")) {
          return json({ error: "API Key de Gemini inválida" }, 502);
        }
        lastError = `${model}: ${msg}`;
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

      return json({ text: cleanText, model });
    } catch (e) {
      lastError = `${model}: ${(e as Error).message}`;
    }
  }

  return json({ error: `No se pudo contactar a Gemini. Último error: ${lastError}` }, 502);
});
