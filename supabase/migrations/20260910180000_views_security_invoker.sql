-- =============================================================================
-- Fix de seguridad: forzar security_invoker en todas las vistas
--
-- Hallazgo (revisión 2026-09-10): ninguna de las 6 vistas del proyecto declara
-- `security_invoker`. En PostgreSQL una vista corre por defecto con los
-- permisos de QUIEN LA CREÓ (postgres), no de quien la consulta — y eso
-- BYPASEA las políticas RLS de las tablas base.
--
-- Impacto concreto: `org_with_plan` se consulta desde OrgContext con un filtro
-- .eq('id', orgId), así que el uso normal es correcto. Pero cualquier usuario
-- autenticado podía pedir la vista SIN filtro y obtener el listado completo de
-- organizaciones del SaaS con su plan, estado de suscripción y fechas de combo.
-- Lo mismo para los KPIs de satisfacción, quejas e infraestructura de otras
-- organizaciones.
--
-- `security_invoker = on` hace que la vista se evalúe con los permisos del
-- usuario que la consulta, de modo que las políticas RLS de las tablas base
-- vuelven a aplicar. El uso legítimo no cambia: cada quien sigue viendo su
-- propia organización, y el super_admin impersonando también, porque las
-- políticas de las tablas base ya contemplan ese caso.
--
-- Requiere PostgreSQL 15+. Supabase corre 15+, pero el guard evita romper una
-- instalación vieja: si la versión no lo soporta, la migración avisa y sigue.
-- =============================================================================

DO $$
DECLARE
  v_view  TEXT;
  v_views TEXT[] := ARRAY[
    'org_with_plan',
    'ai_usage_current_month',
    'customer_satisfaction_kpis',
    'customer_feedback_kpis',
    'infrastructure_kpis'
  ];
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE WARNING 'PostgreSQL % no soporta security_invoker (requiere 15+). Las vistas siguen bypaseando RLS — actualizá el servidor.',
      current_setting('server_version');
    RETURN;
  END IF;

  FOREACH v_view IN ARRAY v_views LOOP
    -- to_regclass devuelve NULL si la vista no existe, en vez de lanzar error.
    -- Así la migración no falla en instalaciones que se saltearon alguna previa.
    IF to_regclass('public.' || v_view) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v_view);
      RAISE NOTICE 'security_invoker activado en %', v_view;
    ELSE
      RAISE NOTICE 'vista % no existe, se omite', v_view;
    END IF;
  END LOOP;
END$$;

NOTIFY pgrst, 'reload schema';
