# Deployment Guide for IsoSmartCore

Guía para llevar IsoSmartCore a producción con la postura de seguridad correcta.

> ⚠️ **Si venís de la versión anterior, leé primero la sección "Migración desde la versión insegura".**

---

## Prerrequisitos

1. **GitHub** — repositorio privado.
2. **Supabase** — proyecto creado.
3. **Vercel** (o Netlify) — hosting del frontend.
4. **Google AI Studio** — API key de Gemini.
5. **Supabase CLI** instalado localmente (`npm i -g supabase` o `scoop install supabase`).

---

## Paso 1: Base de datos (Supabase)

En el **SQL Editor**, ejecutar las migraciones **en orden**:

1. `iso_migration_v1.sql`
2. `iso_migration_v2_audit_triggers.sql`
3. `iso_migration_v3_stakeholders_update.sql`
4. `iso_migration_v4_stakeholders_policies.sql`
5. `iso_migration_v5_stakeholders_docs.sql`
6. `iso_migration_v6_stakeholders_status.sql`
7. `iso_migration_v7_company_profile.sql`
8. `iso_migration_v8_company_logo_web.sql`
9. **`iso_migration_v9_audit_trigger_fix.sql`** ← arregla bug del trigger en DELETE
10. **`iso_migration_v10_rls_hardening.sql`** ← habilita RLS en todas las tablas

Las migraciones v9 y v10 son idempotentes: se pueden re-ejecutar sin error.

---

## Paso 2: Edge Function `gemini-proxy`

La API key de Gemini **NO** debe vivir en el frontend (sería visible en el bundle).
Se invoca a través de una Edge Function autenticada.

```bash
cd IsoSmartCore-app
supabase login
supabase link --project-ref <tu-project-ref>

# Guardar la API key como secret (sólo accesible desde la function)
supabase secrets set GEMINI_API_KEY=<tu-gemini-api-key>

# Desplegar la función
supabase functions deploy gemini-proxy
```

`verify_jwt = true` ya está configurado en `supabase/config.toml`, por lo que sólo
usuarios autenticados pueden invocarla.

---

## Paso 3: Autenticación

En Supabase → **Authentication → URL Configuration**:

- **Site URL:** `https://your-app.vercel.app`
- **Redirect URLs:** `https://your-app.vercel.app/**`

---

## Paso 4: Frontend (Vercel)

1. Push del repo a GitHub.
2. En Vercel, **Add New → Project** e importar el repo.
3. **Environment Variables** (sólo dos, ya no hace falta la de Gemini):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.

> Si todavía existe `VITE_GEMINI_API_KEY` en Vercel, **borrarla**: ya no se usa.

---

## Paso 5: Verificación post-deploy

1. **Login**: registrarse / iniciar sesión.
2. **RLS**: con un usuario sin sesión (logout), las tablas no deben devolver datos.
3. **IA**: en "Análisis de Contexto" → "Generar con IA". Debe funcionar **sin**
   variable de entorno de Gemini en el frontend (porque va por la Edge Function).
4. **Auditoría**: crear/editar/borrar un registro y verificar que aparezca en
   "Logs de Auditoría". El DELETE ya no debe fallar (era el bug de v1).

---

## Migración desde la versión insegura

Si ya tenías la app en producción con la API key de Gemini en `VITE_GEMINI_API_KEY`:

1. **Rotá la key de Gemini ya** — está comprometida porque viaja en el bundle.
   Andá a [Google AI Studio](https://aistudio.google.com/app/apikey) y revocá la
   anterior. Generá una nueva.
2. Configurá la nueva key como secret de la Edge Function (Paso 2).
3. Eliminá `VITE_GEMINI_API_KEY` de Vercel y de tu `.env.local`.
4. Ejecutá las migraciones v9 y v10.
5. Redeploy.

---

## Local Development vs. Production

- **Local:** `npm run dev` → `http://localhost:5173`.
  Para que las llamadas IA funcionen en local, la Edge Function debe estar
  desplegada (apunta al mismo proyecto Supabase que `.env.local`).
  Alternativa: `supabase functions serve gemini-proxy --env-file supabase/.env`.
- **Production:** Vercel sirve el bundle estático generado por `vite build`.
