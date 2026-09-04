// invite-member: el owner de una organización invita a un nuevo usuario por email.
// La invitación crea (si no existe) un auth.user con metadata
// { invited_org_id, invited_role, full_name }, y Supabase le envía un email
// con un link mágico para completar el signup. El trigger handle_new_user_signup
// detecta la metadata y une al usuario a la org existente con el rol indicado.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY como secret de la function:
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role>
//
// Deploy:
//   supabase functions deploy invite-member

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// CORS por-request via helper compartido (respeta env ALLOWED_ORIGINS).
function makeJson(req: Request) {
  const cors = corsHeaders(req);
  return (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// operator agregado en Fase 1 del portal operativo — puede invitarse como
// comercial/produccion/QC sin acceso a modulos SGC completos.
const VALID_ROLES = ["quality_manager", "auditor", "operator", "viewer"];

Deno.serve(async (req: Request) => {
  const json = makeJson(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceRole) {
    return json({ error: "Faltan variables SUPABASE_* en la function" }, 500);
  }

  // Cliente con el JWT del invocador para chequear que es owner
  const authHeader = req.headers.get("Authorization") ?? "";
  const invoker = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userErr } = await invoker.auth.getUser();
  if (userErr || !user) return json({ error: "No autenticado" }, 401);

  const { data: profile, error: profErr } = await invoker
    .from("user_profiles")
    .select("org_id, role")
    .eq("user_id", user.id)
    .single();

  if (profErr || !profile) return json({ error: "Perfil no encontrado" }, 403);
  if (profile.role !== "owner") return json({ error: "Solo el owner puede invitar" }, 403);

  let body: { email?: string; role?: string; full_name?: string };
  try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }

  const email = body.email?.trim().toLowerCase();
  const role = body.role ?? "viewer";
  const fullName = body.full_name?.trim() ?? "";

  if (!email || !email.includes("@")) return json({ error: "Email inválido" }, 400);
  if (!VALID_ROLES.includes(role)) {
    return json({ error: `Rol inválido. Permitidos: ${VALID_ROLES.join(", ")}` }, 400);
  }

  // Cliente admin para invitar
  const admin = createClient(url, serviceRole);

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      invited_org_id: profile.org_id,
      invited_role: role,
      full_name: fullName,
    },
  });

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ ok: true, user_id: data?.user?.id });
});
