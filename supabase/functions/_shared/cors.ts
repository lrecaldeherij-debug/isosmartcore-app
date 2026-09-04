// =============================================================================
// cors.ts — helper compartido para CORS restringido por env.
//
// Cierra finding #44 del audit: CORS wildcard "*" en las 10 edge functions
// permite que cualquier origen invoque las funciones con la cookie/JWT del
// user. Con RLS multi-capa el impacto es limitado, pero sigue siendo un
// vector CSRF real para operaciones autenticadas.
//
// Estrategia:
//   - env ALLOWED_ORIGINS = lista comma-separated de origenes permitidos
//     (ej. "https://isosmartcore.com,http://localhost:3173").
//   - Si el Origin del request esta en la lista, devuelvo ese Origin exacto.
//   - Si NO esta, devuelvo el primer permitido (fallback conservador — el
//     browser bloqueara la respuesta si no matchea).
//   - Si el env NO esta seteado (proyectos que no lo configuraron todavia),
//     mantiene "*" para backward-compat. Setearlo despues del deploy cierra
//     el hole sin necesidad de redeploy de funciones.
//
// Uso desde una edge function:
//   import { corsHeaders } from "../_shared/cors.ts";
//   const CORS = corsHeaders(req);
//   if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
// =============================================================================

const ALLOWED_METHODS = "POST, OPTIONS, GET";
const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";

function allowedOriginsList(): string[] | null {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  if (!raw) return null;  // fallback a wildcard
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

export function corsHeaders(req: Request): Record<string, string> {
  const allowed = allowedOriginsList();
  const origin = req.headers.get("Origin") || "";

  let allowOrigin: string;
  if (!allowed || allowed.length === 0) {
    // Backward-compat: sin env seteado, comportamiento actual (wildcard)
    allowOrigin = "*";
  } else if (allowed.includes(origin)) {
    // Origin conocido — devolver ese Origin exacto (necesario si algun dia
    // agregamos credentials: 'include')
    allowOrigin = origin;
  } else {
    // Origin desconocido — devolver el primero de la lista como fallback.
    // El browser va a bloquear la respuesta porque no matchea el Origin del
    // request, que es exactamente lo que queremos.
    allowOrigin = allowed[0];
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Vary": "Origin",  // avisar caches que el response cambia segun Origin
  };
}
