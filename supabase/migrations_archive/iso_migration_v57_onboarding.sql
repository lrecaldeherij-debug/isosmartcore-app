-- =============================================================================
-- v57 — Onboarding tracking
--
-- Marca cuándo una org completó el wizard inicial y en qué paso quedó si
-- todavía no terminó (resume desde donde dejó).
-- =============================================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_completed_at   TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_skipped_at     TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_current_step   INT DEFAULT 0;

-- Para orgs ya existentes con datos: las damos por completadas para no molestarlas
UPDATE organizations o
   SET onboarding_completed_at = COALESCE(o.created_at, now())
 WHERE onboarding_completed_at IS NULL
   AND EXISTS (
     SELECT 1 FROM company_profile WHERE company_profile.org_id = o.id
   )
   AND EXISTS (
     SELECT 1 FROM processes WHERE processes.org_id = o.id LIMIT 1
   );

NOTIFY pgrst, 'reload schema';
