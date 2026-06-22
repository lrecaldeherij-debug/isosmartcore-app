// send-survey-invitations: el owner / quality_manager selecciona empleados,
// la function crea una survey_campaign + N survey_invitations con token único
// y envía un email por cada uno con un link al formulario público.
//
// Body esperado:
//   {
//     campaign_name: string,
//     description?: string,
//     person_ids: string[],
//     app_url: string,                  // ej "https://tudominio.com"
//     expires_in_days?: number,         // default 14
//     from_name?: string                // "Recursos Humanos · Acme"
//   }
//
// Variables de entorno requeridas:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY
//   RESEND_FROM_EMAIL                   // ej "encuestas@tudominio.com" (verificado en Resend)
//
// Deploy:
//   supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM_EMAIL=encuestas@tudominio.com
//   supabase functions deploy send-survey-invitations

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function emailHtml(opts: {
  personName: string;
  campaignName: string;
  description?: string;
  link: string;
  expiresAt: string;
  fromName: string;
}) {
  const safeDesc = opts.description ? `<p style="color:#475569;margin:0 0 16px 0;">${opts.description}</p>` : "";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:540px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px;color:#fff;">
      <h2 style="margin:0;font-size:18px;font-weight:600;">📊 ${opts.campaignName}</h2>
      <p style="margin:4px 0 0 0;font-size:13px;opacity:0.85;">${opts.fromName}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px 0;color:#0f172a;">Hola <strong>${opts.personName}</strong>,</p>
      <p style="margin:0 0 16px 0;color:#334155;">
        Te invitamos a completar la encuesta de clima laboral. Tus respuestas son confidenciales
        y serán usadas para mejorar el ambiente de trabajo según la norma ISO 9001:2015.
      </p>
      ${safeDesc}
      <div style="text-align:center;margin:28px 0;">
        <a href="${opts.link}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
          Responder encuesta
        </a>
      </div>
      <p style="margin:0;color:#64748b;font-size:13px;">
        El link es personal y expira el ${new Date(opts.expiresAt).toLocaleDateString("es-ES")}.
        Si el botón no funciona, copiá esta URL:<br>
        <span style="word-break:break-all;color:#475569;font-size:12px;">${opts.link}</span>
      </p>
    </div>
    <div style="background:#f8fafc;padding:16px;text-align:center;color:#94a3b8;font-size:12px;">
      Enviado por IsoSmartCore · Sistema de Gestión de Calidad
    </div>
  </div>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("RESEND_FROM_EMAIL");

  if (!url || !anon || !serviceRole) {
    return json({ error: "Faltan variables SUPABASE_* en la function" }, 500);
  }
  if (!resendKey || !resendFrom) {
    return json({ error: "Faltan RESEND_API_KEY o RESEND_FROM_EMAIL" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const invoker = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });

  const { data: { user }, error: userErr } = await invoker.auth.getUser();
  if (userErr || !user) return json({ error: "No autenticado" }, 401);

  const { data: profile } = await invoker
    .from("user_profiles")
    .select("org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) return json({ error: "Perfil no encontrado" }, 403);
  if (!["owner", "quality_manager"].includes(profile.role)) {
    return json({ error: "Solo el owner o quality_manager pueden enviar encuestas" }, 403);
  }

  let body: {
    campaign_name?: string;
    description?: string;
    person_ids?: string[];
    app_url?: string;
    expires_in_days?: number;
    from_name?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }

  const campaignName = body.campaign_name?.trim();
  const description = body.description?.trim() ?? "";
  const personIds = body.person_ids ?? [];
  const appUrl = body.app_url?.replace(/\/$/, "");
  const expiresInDays = body.expires_in_days ?? 14;
  const fromName = body.from_name?.trim() || "Equipo de Calidad";

  if (!campaignName) return json({ error: "campaign_name es obligatorio" }, 400);
  if (!appUrl) return json({ error: "app_url es obligatorio" }, 400);
  if (!personIds.length) return json({ error: "Debes seleccionar al menos un empleado" }, 400);

  const admin = createClient(url, serviceRole);

  // 1. Crear la campaña
  const { data: campaign, error: campErr } = await admin
    .from("survey_campaigns")
    .insert({
      org_id: profile.org_id,
      name: campaignName,
      description,
      survey_type: "climate",
      status: "active",
      expires_at: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
      created_by: user.id,
    })
    .select()
    .single();

  if (campErr || !campaign) {
    return json({ error: "No se pudo crear la campaña: " + (campErr?.message ?? "") }, 500);
  }

  // 2. Traer los empleados con email
  const { data: people, error: peopleErr } = await admin
    .from("personnel")
    .select("id, full_name, email")
    .in("id", personIds);

  if (peopleErr) {
    return json({ error: "Error consultando personnel: " + peopleErr.message }, 500);
  }

  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const results: { person_id: string; full_name: string; email: string; ok: boolean; error?: string }[] = [];

  for (const person of people ?? []) {
    if (!person.email || !person.email.includes("@")) {
      results.push({ person_id: person.id, full_name: person.full_name, email: person.email ?? "", ok: false, error: "Sin email válido" });
      continue;
    }

    const token = randomToken();
    const link = `${appUrl}/encuesta/${token}`;

    // 2a. Crear la invitación
    const { error: invErr } = await admin
      .from("survey_invitations")
      .insert({
        org_id: profile.org_id,
        campaign_id: campaign.id,
        person_id: person.id,
        email: person.email,
        token,
        status: "pending",
        expires_at: expiresAt,
      });

    if (invErr) {
      results.push({ person_id: person.id, full_name: person.full_name, email: person.email, ok: false, error: invErr.message });
      continue;
    }

    // 2b. Enviar email vía Resend
    try {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <${resendFrom}>`,
          to: [person.email],
          subject: `Te invitamos a la encuesta: ${campaignName}`,
          html: emailHtml({
            personName: person.full_name,
            campaignName,
            description,
            link,
            expiresAt,
            fromName,
          }),
        }),
      });

      if (!resendRes.ok) {
        const errBody = await resendRes.text();
        await admin.from("survey_invitations")
          .update({ status: "failed", error_message: `Resend: ${errBody.substring(0, 200)}` })
          .eq("token", token);
        results.push({ person_id: person.id, full_name: person.full_name, email: person.email, ok: false, error: `Resend ${resendRes.status}` });
        continue;
      }

      await admin.from("survey_invitations")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("token", token);

      results.push({ person_id: person.id, full_name: person.full_name, email: person.email, ok: true });
    } catch (e) {
      results.push({ person_id: person.id, full_name: person.full_name, email: person.email, ok: false, error: String(e) });
    }
  }

  const sent = results.filter(r => r.ok).length;
  const failed = results.length - sent;

  return json({
    ok: true,
    campaign_id: campaign.id,
    sent,
    failed,
    results,
  });
});
