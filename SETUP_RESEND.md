# Setup Resend — Email transaccional

Esta guía te lleva paso a paso a tener emails transaccionales (bienvenidas, invitaciones, resets de password, confirmaciones de pago) funcionando desde `isosmartcore.com`.

Tiempo estimado: **20–30 minutos** (la mayor parte es esperar la verificación DNS).

---

## 1️⃣ Crear cuenta en Resend (2 min)

1. Andá a https://resend.com/signup
2. Registrate con `lebis.recalde@herijec.com` (o el email que prefieras como administrador)
3. Confirmá tu email
4. En el dashboard verás tu **API key** por defecto (empieza con `re_`). Cópiala y guardala en un lugar seguro — la vamos a usar en el paso 4. **No la pegues en el chat ni la commitees al repo.**

> Plan gratuito de Resend: 3000 emails/mes y 100 emails/día. Suficiente para arrancar; cuando lo superes pasás al plan Pro ($20/mes por 50k emails).

---

## 2️⃣ Verificar el dominio `isosmartcore.com` en Resend (5 min + 5–60 min de propagación DNS)

1. En el dashboard de Resend, click **Domains** → **Add Domain**
2. Ingresá: `isosmartcore.com`
3. Region: **us-east-1** (más rápido para Latam)
4. Resend te va a mostrar **3 registros DNS** que tenés que agregar en Cloudflare:
   - **MX**: dirige el correo (necesario para SPF)
   - **TXT (SPF)**: autoriza a Resend a enviar en nombre tuyo
   - **TXT (DKIM)**: firma criptográfica para que no caigan en spam

### Agregar los registros en Cloudflare

1. Andá a https://dash.cloudflare.com → seleccioná `isosmartcore.com` → **DNS** → **Records**
2. Para cada uno de los 3 registros que te mostró Resend:
   - Click **Add record**
   - Type: `MX` o `TXT` (según corresponda)
   - Name: lo que diga Resend (por ejemplo `send`, `resend._domainkey`)
   - Content / Target: lo que diga Resend
   - **Proxy status: DNS only (nube gris)** ← muy importante, NO la nube naranja
   - Priority (solo para MX): `10`
   - TTL: Auto
   - Save
3. Volvé al dashboard de Resend → en la fila del dominio → click **Verify DNS Records**
4. Si todos los registros están bien, el estado pasa a **Verified** (puede tardar de 5 a 60 minutos en propagar)

---

## 3️⃣ Configurar el remitente (1 min)

Una vez verificado el dominio, en Resend creá un remitente:
- Nombre: `IsoSmartCore`
- Email: `no-reply@isosmartcore.com` (o `hola@isosmartcore.com` si querés algo más cercano)

Guardá esa dirección, la vas a usar en el siguiente paso como `EMAIL_FROM`.

---

## 4️⃣ Configurar secrets en Supabase (3 min)

1. Andá a https://supabase.com/dashboard → seleccioná tu proyecto IsoSmartCore
2. Click izq **Project Settings** (engranaje al fondo) → **Edge Functions** → **Manage secrets**
3. Click **Add a new secret** y agregá estos tres:

| Secret name              | Valor                                                  |
|--------------------------|--------------------------------------------------------|
| `RESEND_API_KEY`         | La API key del paso 1 (`re_xxxxx...`)                  |
| `EMAIL_FROM`             | `IsoSmartCore <no-reply@isosmartcore.com>`             |
| `EMAIL_ALLOWED_DOMAIN`   | `isosmartcore.com`                                     |

Click **Save** después de cada uno.

---

## 5️⃣ Deployar la Edge Function (5 min — opción A o B)

Tenés dos formas de subir la función `send-email` que dejé en `supabase/functions/send-email/index.ts`:

### Opción A — Desde el dashboard de Supabase (sin instalar nada)

1. Dashboard de Supabase → tu proyecto → **Edge Functions** (icono lambda)
2. Click **Create a new function**
3. Name: `send-email`
4. Pegá el contenido completo del archivo `supabase/functions/send-email/index.ts` que tenés en tu repo
5. Click **Deploy function**

### Opción B — Desde la CLI (recomendado a largo plazo)

```bash
# Instalar Supabase CLI (solo la primera vez)
npm install -g supabase

# Login (te abre el navegador)
supabase login

# Link el proyecto local con tu proyecto remoto (solo primera vez)
supabase link --project-ref <tu-project-ref>

# Deploy
supabase functions deploy send-email
```

Tu `project-ref` lo ves en la URL del dashboard: `https://supabase.com/dashboard/project/<aquí>`.

---

## 6️⃣ Probar que funciona (1 min)

Desde la consola del navegador en https://isosmartcore.com (después de loguearte):

```javascript
const { data, error } = await window.supabase.functions.invoke('send-email', {
  body: {
    to: 'lebis.recalde@herijec.com',
    subject: 'Test desde IsoSmartCore',
    html: '<p>Hola, esto es una prueba.</p>',
    tag: 'test'
  }
})
console.log({ data, error })
```

Si todo está bien, en 5 segundos te llega el email y la consola muestra `{ ok: true, id: "..." }`.

---

## 7️⃣ Conectar Supabase Auth con Resend para los emails del sistema (opcional pero recomendado)

Por defecto Supabase Auth envía sus propios emails (confirmación de cuenta, magic link, reset password) usando su SMTP gratuito, que tiene **límite de 4 emails/hora** — no sirve para producción.

Para usar Resend como SMTP de Auth:

1. Dashboard de Supabase → **Authentication** → **Emails** → **SMTP Settings** → toggle **Enable Custom SMTP**
2. Llenar:
   - **Sender email**: `no-reply@isosmartcore.com`
   - **Sender name**: `IsoSmartCore`
   - **Host**: `smtp.resend.com`
   - **Port**: `465`
   - **Username**: `resend`
   - **Password**: tu API key de Resend (la misma del paso 1)
   - **Secure connection**: SSL/TLS
3. Click **Save**
4. Opcionalmente personalizá los **Email Templates** (Confirm signup, Reset password, etc.) — pegá HTML de `src/lib/email.js` adaptado, o dejá el default por ahora.

---

## ✅ Checklist final

- [ ] Cuenta de Resend creada y API key guardada de forma segura
- [ ] Dominio `isosmartcore.com` verificado en Resend (estado: Verified)
- [ ] Registros DNS (MX + 2 TXT) agregados en Cloudflare con proxy gris (DNS only)
- [ ] Remitente `no-reply@isosmartcore.com` configurado
- [ ] Secrets `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_ALLOWED_DOMAIN` en Supabase Edge Functions
- [ ] Edge Function `send-email` deployada
- [ ] Email de prueba enviado y recibido
- [ ] SMTP de Supabase Auth apuntando a Resend (opcional pero importante para producción)

---

## Troubleshooting rápido

**"Domain not verified" después de 1 hora**
- Verificá en Cloudflare que los 3 registros estén en **DNS only** (nube gris). Si están naranja, Cloudflare los está enmascarando.
- En la terminal: `nslookup -type=txt isosmartcore.com 8.8.8.8` — debería listar el SPF de Resend.

**"Servicio de email no configurado" (error 500)**
- Faltan los secrets en Supabase. Volvé al paso 4.

**Email cae en spam**
- Esperá 24–48h después de la primera verificación. Resend va construyendo reputación.
- Verificá que DKIM esté verde en el dashboard de Resend.

**"You can only send testing emails to your own email"**
- Estás usando el dominio `onboarding@resend.dev` (default de Resend en desarrollo). Asegurate de que `EMAIL_FROM` use tu dominio verificado.
