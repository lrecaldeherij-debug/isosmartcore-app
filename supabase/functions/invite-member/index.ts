// invite-member: el owner de una organización invita a una persona por email.
//
// Siempre registra la invitación en org_invitations. Luego:
//   - Email SIN cuenta → inviteUserByEmail con metadata { invited_org_id,
//     invited_role, full_name }. Supabase manda el link y el trigger
//     handle_new_user_signup la une a la org al completar el registro.
//   - Email CON cuenta (se registró sola, o está en otra org) → no se puede
//     usar inviteUserByEmail. La invitación queda pendiente, se le avisa por
//     email (Resend) y al entrar a la app ve el aviso para aceptarla
//     (RPC accept_org_invitation).
//   - Ya es miembro de esta org → 409 con mensaje claro.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Opcionales para el aviso por email: RESEND_API_KEY, EMAIL_FROM, APP_URL.
//
// Deploy:
//   supabase functions deploy invite-member

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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

const ROLE_LABELS: Record<string, string> = {
  quality_manager: "Gestor de calidad",
  auditor: "Auditor",
  operator: "Operativo",
  viewer: "Lector",
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function notifyExistingUser(opts: {
  to: string; orgName: string; roleLabel: string; inviterName: string; appUrl: string;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!apiKey || !from) return false;

  const org = escapeHtml(opts.orgName);
  const inviter = escapeHtml(opts.inviterName);
  const role = escapeHtml(opts.roleLabel);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#2E1F1A">
      <h2 style="color:#8B2438">Te invitaron a ${org}</h2>
      <p>${inviter} te invitó a unirte a <strong>${org}</strong> en IsoSmartCore con el rol <strong>${role}</strong>.</p>
      <p>Como ya tenés una cuenta, entrá con tu email y contraseña de siempre. Vas a ver un aviso para aceptar la invitación.</p>
      <p style="margin:28px 0">
        <a href="${opts.appUrl}" style="background:#8B2438;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none">Entrar a IsoSmartCore</a>
      </p>
      <p style="font-size:12px;color:#6b5a52">Si no esperabas esta invitación, ignorá este correo.</p>
    </div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: `${opts.orgName} te invitó a IsoSmartCore`,
        html,
        tags: [{ name: "type", value: "org_invitation" }],
      }),
    });
    if (!r.ok) console.error("[invite-member] Resend", r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error("[invite-member] Resend error", e);
    return false;
  }
}

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
  const appUrl = Deno.env.get("APP_URL") ?? "https://www.isosmartcore.com";

  // Cliente con el JWT del invocador para chequear que es owner
  const authHeader = req.headers.get("Authorization") ?? "";
  const invoker = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userErr } = await invoker.auth.getUser();
  if (userErr || !user) return json({ error: "No autenticado" }, 401);

  const { data: profile, error: profErr } = await invoker
    .from("user_profiles")
    .select("org_id, role, full_name")
    .eq("user_id", user.id)
    .single();

  if (profErr || !profile) return json({ error: "Perfil no encontrado" }, 403);
  if (profile.role !== "owner") return json({ error: "Solo el owner puede invitar" }, 403);

  let body: { email?: string; role?: string; full_name?: string };
  try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }

  const email = body.email?.trim().toLowerCase();
  const role = body.role ?? "viewer";
  const fullName = body.full_name?.trim().slice(0, 120) ?? "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email inválido" }, 400);
  if (!VALID_ROLES.includes(role)) {
    return json({ error: `Rol inválido. Permitidos: ${VALID_ROLES.join(", ")}` }, 400);
  }

  const admin = createClient(url, serviceRole);

  const { data: org } = await admin.from("organizations").select("name").eq("id", profile.org_id).single();
  const orgName = org?.name ?? "tu organización";

  const { data: target, error: targetErr } = await admin.rpc("invitation_target_status", {
    p_email: email,
    p_org_id: profile.org_id,
  });
  if (targetErr) {
    // Migración org_invitations sin aplicar: flujo anterior (solo emails nuevos)
    console.error("[invite-member] target status (¿falta migración?)", targetErr);
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { invited_org_id: profile.org_id, invited_role: role, full_name: fullName },
      redirectTo: appUrl,
    });
    if (error) {
      const already = /already|registered|exists/i.test(error.message);
      return json({
        error: already
          ? `${email} ya tiene una cuenta en IsoSmartCore, así que no se le puede enviar una invitación de registro. Falta aplicar la actualización de invitaciones para poder sumarla.`
          : `No se pudo enviar la invitación: ${error.message}`,
      }, already ? 409 : 400);
    }
    return json({ ok: true, existing_user: false, user_id: data?.user?.id });
  }

  if (target?.same_org) {
    return json({ error: `${email} ya es miembro de ${orgName}. Si querés cambiarle el rol, hacelo desde la lista del equipo.` }, 409);
  }

  // Reemplaza una invitación pendiente previa al mismo email (re-invitar)
  await admin.from("org_invitations")
    .update({ status: "revoked", responded_at: new Date().toISOString() })
    .eq("org_id", profile.org_id)
    .eq("email", email)
    .eq("status", "pending");

  const { data: invitation, error: invErr } = await admin.from("org_invitations").insert({
    org_id: profile.org_id,
    email,
    role,
    full_name: fullName || null,
    org_name: orgName,
    invited_by: user.id,
    invited_by_name: profile.full_name || user.email,
  }).select("id").single();

  if (invErr || !invitation) {
    console.error("[invite-member] insert invitation", invErr);
    return json({ error: "No se pudo registrar la invitación" }, 500);
  }

  if (target?.exists) {
    const emailed = await notifyExistingUser({
      to: email,
      orgName,
      roleLabel: ROLE_LABELS[role] ?? role,
      inviterName: profile.full_name || user.email || "El responsable",
      appUrl,
    });
    return json({ ok: true, existing_user: true, emailed, invitation_id: invitation.id });
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      invited_org_id: profile.org_id,
      invited_role: role,
      full_name: fullName,
    },
    redirectTo: appUrl,
  });

  if (error) {
    await admin.from("org_invitations").update({ status: "revoked" }).eq("id", invitation.id);
    console.error("[invite-member] inviteUserByEmail", error);
    return json({ error: `No se pudo enviar la invitación: ${error.message}` }, 400);
  }

  return json({ ok: true, existing_user: false, user_id: data?.user?.id, invitation_id: invitation.id });
});
