-- =============================================================================
-- Relaja límites de longitud en documents_versions.
--
-- Bug: code y version se crearon como VARCHAR(20) y VARCHAR(10) en la
-- migración v1. En la práctica, códigos de documento en industrias como
-- inspección/soldadura suelen pasar de 20 caracteres:
--   POL-CAL-DIR-PROC-INSPEC-01  (26)
--   TALL-PRO-CALIDAD-END-001    (25)
--
-- Talleres Mejía intentó guardar un código y Postgres devolvió
-- "value too long for type character varying(20)". Sin manera de aliviar
-- desde el frontend — hay que cambiar el schema.
--
-- Fix: ambos campos pasan a TEXT (sin límite práctico). Postgres maneja
-- TEXT y VARCHAR con la misma performance. El CHECK constraint del status
-- ya limita valores permitidos en ese campo, así que ese queda como está.
-- =============================================================================

BEGIN;

ALTER TABLE documents_versions ALTER COLUMN code    TYPE TEXT;
ALTER TABLE documents_versions ALTER COLUMN version TYPE TEXT;

COMMIT;

-- Verificación
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'documents_versions'
  AND column_name IN ('code', 'version', 'type', 'status')
ORDER BY column_name;
-- Esperado: code TEXT/null, version TEXT/null, type varchar/50, status varchar/20
