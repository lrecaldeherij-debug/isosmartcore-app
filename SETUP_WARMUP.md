# Warmup — Mantener Supabase caliente

## El problema

El plan Free de Supabase pausa el proyecto tras horas de inactividad. La primera request de un usuario después de la pausa toma **30-60 segundos** en despertar la DB. Esto vuela conversión: prospects rebotan antes de ver el login.

## La solución

Cada 5 minutos, un servicio externo (UptimeRobot free) hace un ping HTTP a una Edge Function `warmup` que ejecuta `SELECT 1` contra la DB. Eso mantiene el proyecto activo permanentemente.

**Costo total: $0.** UptimeRobot gratis + Supabase Free + Vercel Hobby.

---

## Paso 1 — Deployar la Edge Function `warmup`

1. Dashboard de Supabase → **Edge Functions** → **Deploy a new function**
2. **Name:** `warmup`
3. Pegar el contenido de `supabase/functions/warmup/index.ts` (ya está en el repo)
4. Click **Deploy function**
5. Muy importante: click en la función → **Settings** (tab) → toggle **"Verify JWT with legacy secret" a OFF**

Por qué OFF: UptimeRobot no manda header Authorization, entonces la función debe ser pública. La función no expone datos sensibles (solo hace SELECT id FROM plans LIMIT 1).

Tu URL queda así:

```
https://rokudpywehgopfqpdwnj.supabase.co/functions/v1/warmup
```

Probala en el navegador. Deberías ver:

```json
{
  "ok": true,
  "elapsed_ms": 143,
  "timestamp": "2026-06-25T22:34:12.456Z"
}
```

Si sale un JSON así, el warmup está activo. Copiá la URL, la usás en el paso 2.

---

## Paso 2 — Configurar UptimeRobot (3 min)

1. Andá a https://uptimerobot.com/signup
2. Cuenta gratis con `lebis.recalde@herijec.com`
3. Confirmá el email
4. En el dashboard, click **"+ New Monitor"**
5. Llenar:

| Campo | Valor |
|---|---|
| **Monitor Type** | `HTTP(s)` |
| **Friendly Name** | `IsoSmartCore Warmup` |
| **URL (or IP)** | `https://rokudpywehgopfqpdwnj.supabase.co/functions/v1/warmup` |
| **Monitoring Interval** | `5 minutes` (el mínimo del plan free — perfecto) |
| **Alert Contacts** | Tu email (te avisa si el warmup falla) |

6. Click **Create Monitor**

En 30 segundos empieza a pinguear. Vas a ver el status como "Up" (verde) después del primer chequeo.

---

## Paso 3 — Verificar impacto (30 min de espera + prueba)

- Esperá 30-60 minutos con la pestaña cerrada
- Volvé a abrir `isosmartcore.com/app`
- El load ahora debería ser de 1-3s en lugar de 30-60s

Antes: cold start 30-60s cada primera visita
Después: DB siempre despierta, cold start prácticamente eliminado

---

## Bonus: monitoreo de uptime real

UptimeRobot no solo te sirve para warmup. Te avisa por email si:

- Supabase se cae
- Tu Vercel deja de responder
- El dominio se rompe

Agregá un segundo monitor:

| Campo | Valor |
|---|---|
| **Friendly Name** | `IsoSmartCore Landing` |
| **URL** | `https://isosmartcore.com` |
| **Monitoring Interval** | `5 minutes` |

Con eso quedás con monitoreo básico gratis de infraestructura.

---

## Alternativa: Supabase Pro ($25/mes)

Si en algún momento tenés budget y querés eliminar esta capa de complicación:

Dashboard → Project Settings → Subscription → Upgrade a **Pro**.

Beneficios:
- Sin pausa nunca
- 8 GB de DB (vs 500 MB free)
- Backups diarios con point-in-time recovery
- Soporte por email

En ese momento podés borrar el warmup y el monitor de UptimeRobot. Pero mientras estés bootstrapping con clientes reales, la combinación warmup + UptimeRobot alcanza sobradamente.

---

## Troubleshooting

**"Failed with status code 401" en UptimeRobot**
- Falta el paso de desactivar "Verify JWT with legacy secret" en la función. Volvé al paso 1.5.

**El warmup no arranca el proyecto pausado**
- Necesitás pegar ambos secrets `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en Edge Functions → Secrets.
- Se los pegás una vez y ya. Los podés copiar de Project Settings → API.

**"elapsed_ms: 30000" en la primera respuesta después de inactividad prolongada**
- Es el cold start real. Del segundo ping en adelante debería caer a <500ms. Confirma que UptimeRobot está pingueando cada 5 min sin fallos.
