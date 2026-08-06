# Setup Supabase CLI + Pipeline de migraciones automatizado

**Objetivo**: nunca más ver un error "Could not find X column of Y in the schema cache"
en producción. Cada push a `main` con cambios de schema los aplica automáticamente
en la DB de Supabase, en el mismo momento que Vercel deploya el frontend nuevo.

## Estado

- ✅ Supabase CLI instalado local (`~/AppData/Local/supabase-cli/supabase.exe`)
- ✅ `supabase/config.toml` presente
- ✅ 68 migraciones históricas archivadas en `supabase/migrations_archive/`
- ✅ Carpeta `supabase/migrations/` lista para migraciones nuevas
- ✅ Workflow `.github/workflows/db-migrate.yml` listo
- ⏳ **Falta configurar 2 secrets en GitHub** ← ÚNICO paso manual pendiente

---

## Paso 1 — Generar Personal Access Token (2 min)

1. Andá a https://supabase.com/dashboard/account/tokens
2. Click **"Generate new token"**
3. Nombre: `github-actions-isosmartcore`
4. Copiá el token (empieza con `sbp_...`). **Solo se muestra 1 vez.**

## Paso 2 — Obtener el password de la DB (1 min)

1. Andá a https://supabase.com/dashboard/project/rokudpywehgopfqpdwnj/settings/database
2. Sección **"Database password"** → si no lo recordás, click **"Reset database password"** y copiá el nuevo
3. **⚠️ Ojo**: si reseteás, actualizá también donde uses la connection string directamente

## Paso 3 — Configurar los 3 secrets en GitHub (3 min)

1. Andá a https://github.com/lrecaldeherij-debug/isosmartcore-app/settings/secrets/actions
2. Click **"New repository secret"** y creá estos 3:

| Nombre | Valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | El `sbp_...` del paso 1 |
| `SUPABASE_DB_PASSWORD` | El password del paso 2 |
| `SUPABASE_PROJECT_REF` | `rokudpywehgopfqpdwnj` |

## Paso 4 — Testear el pipeline (opcional pero recomendado)

Andá a la pestaña **Actions** de GitHub → **"Deploy Supabase Migrations"** →
click **"Run workflow"** → **Run**. La primera vez no habrá migraciones nuevas
(carpeta `supabase/migrations/` vacía), así que solo verificás que la conexión
funcione.

Salida esperada: workflow verde en <60s, log dice `Local migration files match remote database`.

---

## Uso diario — cómo agregar una migración nueva

Local:

```bash
# 1. Crear la migración (genera un archivo con timestamp)
supabase migration new agregar_columna_a_procesos

# 2. Editar el SQL que se creó en supabase/migrations/YYYYMMDDHHMMSS_agregar_columna_a_procesos.sql
# Ejemplo:
#   ALTER TABLE processes ADD COLUMN IF NOT EXISTS nueva_columna TEXT;

# 3. (Opcional) Probar local
supabase db reset  # solo si tenés `supabase start` corriendo

# 4. Commit + push
git add supabase/migrations/
git commit -m "feat(db): agregar nueva_columna a processes"
git push
```

GitHub Actions detecta el push, corre `supabase db push`, y en <30 segundos
la columna está en producción. Sin abrir el SQL Editor.

---

## Convenciones para migraciones nuevas

- **Siempre `IF NOT EXISTS`** en ADD COLUMN, CREATE TABLE, CREATE INDEX
- **`CREATE OR REPLACE`** en funciones y vistas
- **`DROP + CREATE`** en triggers y policies (Postgres no tiene IF NOT EXISTS para triggers)
- **Nombres descriptivos**: `add_processes_last_reviewed_at` mejor que `v68`
- **1 migración = 1 cambio lógico**: no mezclar 5 tablas en un archivo
- **Nunca editar** una migración que ya fue pusheada — creá una nueva que corrija

---

## Rollback

Si una migración rompió producción:

1. Creá una migración NUEVA que revierta el cambio (ej: `DROP COLUMN`)
2. `git commit + push` → se aplica en <30s
3. Investigá qué falló en la que rompió, arreglala en la migración siguiente

**No usar** `git revert` sobre migraciones — el archivo desaparece pero la DB no se
"desmigra" sola. Siempre otra migración adelante que corrija.

---

## Troubleshooting

**El workflow falla con "authentication failed"**
→ El `SUPABASE_ACCESS_TOKEN` está mal o expiró. Regenerá y actualizá el secret.

**El workflow falla con "password authentication failed"**
→ El `SUPABASE_DB_PASSWORD` está mal. Reseteá el password en el dashboard y actualizá.

**El workflow dice "local migrations don't match remote"**
→ Alguien corrió una migración manual en el SQL Editor sin commitear el archivo.
Corré `supabase db pull` local → generará un archivo con la diferencia → commit.
