-- =============================================================================
-- v25 — Columnas residual + execution_date en risk_matrix
--
-- El form de Riesgos incluye:
--   - Fecha de ejecución del control
--   - Evaluación residual (probabilidad e impacto esperados después del control)
-- Pero esas columnas nunca se crearon. El frontend envía `execution_date`,
-- `prob_residual`, `impact_residual` y la BD rechaza el insert/update.
--
-- También agregamos `score_residual` como columna generada (igual que score_initial).
-- =============================================================================

ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS execution_date          DATE;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS probability_residual    INT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS impact_residual         INT;

-- score_residual: si todavía no existe, lo creamos como GENERATED igual que score_initial
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'risk_matrix'
      AND column_name = 'score_residual'
  ) THEN
    ALTER TABLE risk_matrix
      ADD COLUMN score_residual INT GENERATED ALWAYS AS (probability_residual * impact_residual) STORED;
  END IF;
END $$;
