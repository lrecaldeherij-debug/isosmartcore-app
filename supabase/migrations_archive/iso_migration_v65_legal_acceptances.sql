-- =============================================================================
-- v65 — Audit trail de aceptaciones legales (T&C + Privacidad)
--
-- Cumple LOPDP Ecuador (Ley Orgánica de Protección de Datos Personales):
-- el responsable debe poder demostrar que obtuvo consentimiento informado.
-- Sin este audit trail, ante una denuncia, no podríamos probar QUÉ versión
-- de T&C aceptó el usuario ni CUÁNDO.
--
-- Cada inserción es definitiva (no se borra, no se actualiza) — es evidencia.
-- =============================================================================

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version   TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  user_agent      TEXT,            -- Para forenses; truncado a 500 chars en cliente
  ip_address      INET,            -- Lo rellena un trigger desde request headers
  accepted_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices defensivos
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user
  ON legal_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_accepted_at
  ON legal_acceptances(accepted_at DESC);

-- RLS
ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;

-- INSERT: el usuario solo puede insertar SU propia aceptación
DROP POLICY IF EXISTS "legal_acceptances_insert" ON legal_acceptances;
CREATE POLICY "legal_acceptances_insert" ON legal_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- SELECT: el usuario ve solo SUS propias aceptaciones (para mostrar historial)
DROP POLICY IF EXISTS "legal_acceptances_select" ON legal_acceptances;
CREATE POLICY "legal_acceptances_select" ON legal_acceptances
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- NO UPDATE / NO DELETE: estos registros son evidencia inmutable.
-- (No definimos políticas → con RLS activado y sin política UPDATE/DELETE,
-- ningún cliente authenticated puede modificar/borrar. Service_role sí puede.)

COMMENT ON TABLE legal_acceptances IS
  'Audit trail inmutable de aceptaciones de T&C y Política de Privacidad. Evidencia LOPDP art. 7.a (consentimiento informado).';
