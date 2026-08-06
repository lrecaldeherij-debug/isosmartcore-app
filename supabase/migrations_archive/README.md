# Migraciones históricas (2025 — pre-CLI)

Estas 68 migraciones (`iso_migration_v1.sql` a `iso_migration_v67_*.sql`) fueron
creadas y ejecutadas MANUALMENTE en el SQL Editor de Supabase antes de que la app
adoptara el pipeline oficial de Supabase CLI + GitHub Actions.

## Estado

Todas están **ya aplicadas** en la base de datos de producción
(`rokudpywehgopfqpdwnj`). No las corras de nuevo — muchas usan `IF NOT EXISTS`
y serían no-op, pero otras (triggers, seeds, RLS policies) podrían fallar con
"already exists" o insertar filas duplicadas.

## ¿Por qué se conservan?

- **Historia auditable**: si algún día necesitás rastrear cuándo se agregó una
  columna o política, buscá aquí con grep.
- **Referencia para desarrollo local**: si un dev nuevo quiere levantar la app
  desde cero contra una DB limpia, puede correr `iso_migration_v67_schema_sync.sql`
  (el master sync que consolida las 336 columnas de todas las anteriores).

## Nuevas migraciones — a partir de agosto 2026

Todo cambio de schema nuevo va en `supabase/migrations/` con el formato
oficial del CLI: `YYYYMMDDHHMMSS_descripcion.sql`.

Ver `SETUP_SUPABASE_CLI.md` en la raíz del repo para el flujo completo.
