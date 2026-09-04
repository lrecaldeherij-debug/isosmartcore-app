# Migraciones históricas (2025 — pre-CLI)

Estas 68 migraciones (`iso_migration_v1.sql` a `iso_migration_v67_*.sql`) fueron
creadas y ejecutadas MANUALMENTE en el SQL Editor de Supabase antes de que la app
adoptara el pipeline oficial de Supabase CLI + GitHub Actions.

## Estado

Todas están **ya aplicadas** en la base de datos de producción
(`rokudpywehgopfqpdwnj`). No las corras de nuevo sobre producción — muchas usan
`IF NOT EXISTS` y serían no-op, pero otras (triggers, seeds, RLS policies)
podrían fallar con "already exists" o insertar filas duplicadas.

## ¿Por qué se conservan?

- **Historia auditable**: si algún día necesitás rastrear cuándo se agregó una
  columna o política, buscá aquí con `grep`.
- **Baseline para proyectos nuevos**: son el schema real que `/migrations/`
  asume que ya existe. Un proyecto Supabase virgen las necesita.

## Bootstrap de un proyecto nuevo desde cero

`supabase db reset` **NO alcanza** para levantar un ambiente virgen porque las
migraciones en `/migrations/` asumen tablas que este archivo creó. Orden correcto:

**Paso 1 — Baseline (una sola vez, en orden numérico)**

Desde el SQL Editor del proyecto nuevo, ejecutar en este orden:

```
iso_migration_v1.sql
iso_migration_v2_audit_triggers.sql
iso_migration_v10_rls_hardening.sql
iso_migration_v11_multitenant_schema.sql   ← crea organizations, user_profiles, enum org_role
iso_migration_v12_rls_by_org.sql
iso_migration_v13_signup_trigger.sql
... (todos los v14 a v67 en orden)
iso_migration_v67_schema_sync.sql          ← consolida columnas faltantes (idempotente)
```

Todos usan `IF NOT EXISTS` o son idempotentes, así que si algo se corrió antes
no rompe. Si tenés `psql` local podés hacerlo en batch:

```bash
for f in $(ls iso_migration_v*.sql | sort -V); do
  psql "$DATABASE_URL" -f "$f"
done
```

**Paso 2 — Migraciones nuevas (`/supabase/migrations/`)**

Ya con el baseline aplicado, correr las del CLI:

```bash
supabase db push
```

Que ejecuta en orden todas las `YYYYMMDDHHMMSS_*.sql` de `/supabase/migrations/`.

**Paso 3 — Storage bucket**

Crear manualmente el bucket `documents` en Supabase Dashboard → Storage.
Todas las políticas RLS del bucket se aplican vía las migraciones del paso 2.

## Nuevas migraciones — a partir de agosto 2026

Todo cambio de schema nuevo va en `supabase/migrations/` con el formato
oficial del CLI: `YYYYMMDDHHMMSS_descripcion.sql`. Ver `SETUP_SUPABASE_CLI.md`
en la raíz del repo para el flujo completo.
