-- =============================================================================
-- Storage RLS para modo impersonate del super_admin.
--
-- Contexto:
--   El bucket `documents` tiene policies que exigen storage_path_org_id(name)
--   = auth_org_id(). auth_org_id() devuelve la org REAL del super_admin (la
--   suya, Herij), no la impersonada. Resultado visible: cuando el super_admin
--   entra a soporte de un cliente y abre un módulo con archivos adjuntos
--   (Documents, versiones firmadas de política, evidencias de auditoría), la
--   lista viene VACÍA aunque los archivos existan. No es un data leak — es
--   ausencia de lectura — pero rompe el soporte.
--
--   La migración 20260807210000 solucionó exactamente este patrón para las
--   TABLAS ISO agregando policies _select_impersonate con:
--     is_super_admin() AND current_impersonate_org() = org_id
--   Este archivo aplica el MISMO patrón al bucket documents.
--
-- Diseño:
--   - Solo SELECT. En modo impersonate el super_admin sigue siendo read-only
--     — no puede subir, sobreescribir ni borrar archivos del cliente. Eso
--     preserva el contrato: nadie firma un cambio en el SGC del cliente
--     "en nombre del super_admin". Si necesita subir algo, tiene que dejar
--     de impersonar y pedirle al cliente que lo suba.
--   - Coexiste con documents_select_own_org (que sigue cubriendo lectura de
--     la propia org). Postgres OR-combina policies permissive → si cualquiera
--     matchea, el select pasa. El super_admin no-impersonando lee solo su org
--     por auth_org_id(); impersonando, lee la org impersonada por esta policy;
--     nunca lee ambas mezcladas.
--
-- Verificación manual post-apply:
--   1. Login super_admin (Herij) → /admin → impersonar Talleres Mejía.
--   2. Ir a Documentos → click en un doc que tenga adjunto → debe mostrarlo.
--   3. Verificar que el botón "Subir archivo" NO responde o falla explícito
--      (INSERT bloqueado — no hay policy _insert_impersonate y así queremos).
-- =============================================================================

BEGIN;

-- Solo SELECT del bucket documents en modo impersonate.
DROP POLICY IF EXISTS documents_select_impersonate ON storage.objects;
CREATE POLICY documents_select_impersonate ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND is_super_admin()
    AND current_impersonate_org() IS NOT NULL
    AND storage_path_org_id(name) = current_impersonate_org()
  );

-- Nota deliberada: NO creamos policies _insert/_update/_delete_impersonate.
-- Escrituras del super_admin sobre archivos del cliente son un anti-patrón
-- para trazabilidad ISO — quedan bloqueadas por ausencia de policy.

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE 'documents_%'
ORDER BY policyname;
-- Esperado: 4 policies (select_own_org, insert_own_org, update_own_org,
-- delete_own_org) + 1 nueva (select_impersonate). Total 5.
