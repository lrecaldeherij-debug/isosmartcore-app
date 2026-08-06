-- iso_migration_v4_stakeholders_policies.sql
-- Solución al problema de que "guarda pero no se ve nada"
-- Esto habilita que puedas VER (Select), EDITAR (Update) y BORRAR (Delete) los datos.

-- 1. Política para VER los datos (SELECT)
CREATE POLICY "Permitir ver a usuarios autenticados"
ON "public"."stakeholders"
FOR SELECT
TO authenticated
USING (true);

-- 2. Política para EDITAR los datos (UPDATE)
CREATE POLICY "Permitir editar a usuarios autenticados"
ON "public"."stakeholders"
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 3. Política para ELIMINAR los datos (DELETE)
CREATE POLICY "Permitir eliminar a usuarios autenticados"
ON "public"."stakeholders"
FOR DELETE
TO authenticated
USING (true);
