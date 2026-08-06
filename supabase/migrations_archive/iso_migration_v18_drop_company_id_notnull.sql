-- =============================================================================
-- v18 — Compatibilidad multi-tenant
--
-- Problema: varias tablas heredan una columna `company_id` NOT NULL del esquema
-- single-tenant original (cuando cada usuario era "su" company). Al migrar a
-- multi-tenant (v11) reemplazamos esa lógica por `org_id`, pero `company_id`
-- quedó con NOT NULL. La función `seed_organization` (v14) corre como
-- SECURITY DEFINER y por tanto `auth.uid()` devuelve NULL, lo que hace fallar
-- cualquier DEFAULT basado en el usuario actual → "null value in column
-- company_id violates not-null constraint".
--
-- Solución: aflojar el NOT NULL en `company_id` para todas las tablas donde
-- exista. No se elimina la columna por seguridad: si hubiera datos legacy
-- referenciados desde otro lado, siguen accesibles. Se puede dropear en una
-- v19 después de confirmar que no quedan referencias.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'company_id'
      AND is_nullable = 'NO'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN company_id DROP NOT NULL',
      r.table_schema, r.table_name
    );
    RAISE NOTICE 'company_id ahora es NULLABLE en %.%', r.table_schema, r.table_name;
  END LOOP;
END $$;

-- Verificación: listar qué tablas todavía tienen company_id (cualquiera, NULL o NOT NULL)
-- después del cambio. Útil para decidir si dropear la columna en v19.
SELECT table_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'company_id'
ORDER BY table_name;
