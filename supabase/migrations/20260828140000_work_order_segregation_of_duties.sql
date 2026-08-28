-- =============================================================================
-- Fase 1.5: Segregacion de funciones ("regla de 4 ojos" suave)
--
-- Contexto: la Fase 1 permitio que cualquier user con permiso escriba en el
-- timeline. Eso no impide que la misma persona cree, apruebe y libere el mismo
-- pedido — lo que viola segregacion de funciones (ISO 5.3 / 7.1.2).
--
-- Esta migracion no bloquea la accion (para no romper flujo de PYMEs de 1-2
-- personas donde el owner hace todo al arrancar). Solo la DETECTA y la MARCA
-- para que el auditor la vea.
--
-- Cambios:
--   1. Columna work_order_events.same_person — flag booleano
--   2. Trigger BEFORE INSERT que la calcula automaticamente (fuente unica
--      de verdad, no se puede engañar desde el frontend)
--   3. Indice para filtrar rapido en el panel del auditor
--
-- Regla: un evento se marca same_person=true si el mismo performed_by ya
-- hizo ANTES otro evento "de decision" (created, approved, released,
-- conditional_release, delivered, rejected) sobre el mismo pedido/orden.
-- =============================================================================

-- ─── 1. Columna same_person ─────────────────────────────────────────────────
ALTER TABLE work_order_events ADD COLUMN IF NOT EXISTS same_person BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_woe_same_person
  ON work_order_events(org_id, created_at DESC)
  WHERE same_person = true;

-- ─── 2. Trigger de auto-deteccion ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION calc_same_person_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  decision_types TEXT[] := ARRAY['created','approved','released','conditional_release','delivered','rejected'];
BEGIN
  -- Solo interesa marcar eventos de decision. Comentarios y pausas
  -- de produccion no violan segregacion — quedan como false.
  IF NEW.event_type <> ALL(decision_types) THEN
    NEW.same_person := false;
    RETURN NEW;
  END IF;

  -- Si NEW no tiene performed_by (evento del sistema) → no aplica
  IF NEW.performed_by IS NULL THEN
    NEW.same_person := false;
    RETURN NEW;
  END IF;

  -- Chequear si existe algun evento previo de decision sobre el mismo
  -- (source_table, source_id) hecho por el mismo user.
  IF EXISTS (
    SELECT 1 FROM work_order_events e
    WHERE e.source_table = NEW.source_table
      AND e.source_id = NEW.source_id
      AND e.performed_by = NEW.performed_by
      AND e.event_type = ANY(decision_types)
  ) THEN
    NEW.same_person := true;
  ELSE
    NEW.same_person := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calc_same_person ON work_order_events;
CREATE TRIGGER trg_calc_same_person
  BEFORE INSERT ON work_order_events
  FOR EACH ROW
  EXECUTE FUNCTION calc_same_person_flag();

-- ─── 3. Backfill: recalcular flag para eventos existentes ────────────────────
-- Solo aplica si ya hay eventos (probablemente ninguno en produccion todavia,
-- pero por si el owner cargo algun evento de prueba).
UPDATE work_order_events e
SET same_person = true
WHERE event_type IN ('created','approved','released','conditional_release','delivered','rejected')
  AND performed_by IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM work_order_events e2
    WHERE e2.source_table = e.source_table
      AND e2.source_id = e.source_id
      AND e2.performed_by = e.performed_by
      AND e2.event_type IN ('created','approved','released','conditional_release','delivered','rejected')
      AND e2.id <> e.id
      AND e2.created_at < e.created_at
  );

COMMENT ON COLUMN work_order_events.same_person IS
  'Flag auto-calculado por trigger: true si el mismo user ya hizo antes otro
   evento de decision sobre este pedido. Indica violacion de segregacion de
   funciones (ISO 5.3 / 7.1.2) — el auditor lo revisa en el panel Segregacion.';
