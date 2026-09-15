-- =============================================================================
-- Invitaciones a organizaciones que funcionan aunque la persona YA tenga cuenta
--
-- Problema (sep-2026, Herij): una colaboradora se registró sola antes de ser
-- invitada. El signup self-service le creó una organización propia y vacía, y
-- luego invite-member falló porque inviteUserByEmail no acepta emails ya
-- registrados. Resultado: la persona quedaba fuera de la empresa sin salida.
--
-- Solución:
--   1. org_invitations: registro de cada invitación (pendiente/aceptada/...).
--   2. invite-member siempre crea la invitación. Si el email no tiene cuenta,
--      además manda el invite de Supabase (flujo de siempre). Si ya tiene
--      cuenta, la persona ve la invitación al entrar a la app.
--   3. accept_org_invitation(): la persona acepta (consentimiento explícito) y
--      queda movida a la org con el rol. Si venía de una org propia donde era
--      la única persona, esa org vacía se elimina.
--   4. Trigger en user_profiles: marca aceptada la invitación cuando el usuario
--      entra a la org por cualquier camino (incluido el invite de Supabase).
-- =============================================================================

CREATE TABLE IF NOT EXISTS org_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            org_role NOT NULL,
  full_name       TEXT,
  org_name        TEXT,
  invited_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by_name TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
  responded_at    TIMESTAMPTZ
);

-- Defensivo por si la tabla existía con otra forma
ALTER TABLE org_invitations ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE org_invitations ADD COLUMN IF NOT EXISTS org_name TEXT;
ALTER TABLE org_invitations ADD COLUMN IF NOT EXISTS invited_by_name TEXT;
ALTER TABLE org_invitations ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
ALTER TABLE org_invitations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_invitations_status_check') THEN
    ALTER TABLE org_invitations ADD CONSTRAINT org_invitations_status_check
      CHECK (status IN ('pending', 'accepted', 'declined', 'revoked'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_invitations_role_check') THEN
    ALTER TABLE org_invitations ADD CONSTRAINT org_invitations_role_check
      CHECK (role <> 'owner');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON org_invitations (lower(email)) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON org_invitations (org_id, created_at DESC);
-- Una sola invitación pendiente por email y org
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_invitations_pending
  ON org_invitations (org_id, lower(email)) WHERE status = 'pending';

ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

-- Owner de la org: ve y revoca las invitaciones de su org
DROP POLICY IF EXISTS org_inv_select_owner ON org_invitations;
CREATE POLICY org_inv_select_owner ON org_invitations FOR SELECT
  USING (org_id = auth_org_id() AND auth_role() = 'owner');

DROP POLICY IF EXISTS org_inv_update_owner ON org_invitations;
CREATE POLICY org_inv_update_owner ON org_invitations FOR UPDATE
  USING (org_id = auth_org_id() AND auth_role() = 'owner')
  WITH CHECK (org_id = auth_org_id() AND status IN ('pending', 'revoked'));

-- Invitado: ve las invitaciones dirigidas a su email
DROP POLICY IF EXISTS org_inv_select_invitee ON org_invitations;
CREATE POLICY org_inv_select_invitee ON org_invitations FOR SELECT
  USING (lower(email) = lower(auth.jwt() ->> 'email'));

-- INSERT: solo la edge function (service_role). Aceptar/rechazar: RPCs.

-- ─── Datos de destino para invite-member (solo service_role) ────────────────
CREATE OR REPLACE FUNCTION invitation_target_status(p_email TEXT, p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id  UUID;
  v_role    TEXT;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('exists', false);
  END IF;
  SELECT org_id, role::TEXT INTO v_org_id, v_role FROM user_profiles WHERE user_id = v_user_id;
  RETURN jsonb_build_object(
    'exists', true,
    'user_id', v_user_id,
    'same_org', v_org_id IS NOT DISTINCT FROM p_org_id,
    'current_role', v_role
  );
END;
$$;

REVOKE ALL ON FUNCTION invitation_target_status(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION invitation_target_status(TEXT, UUID) TO service_role;

-- ─── Aceptar invitación ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accept_org_invitation(p_invitation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            UUID := auth.uid();
  v_email          TEXT;
  v_confirmed      TIMESTAMPTZ;
  v_inv            org_invitations%ROWTYPE;
  v_cur_org        UUID;
  v_cur_role       TEXT;
  v_cur_org_name   TEXT;
  v_members        INT;
  v_other_owners   INT;
  v_has_billing    BOOLEAN;
  v_removed_org    TEXT := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT email, email_confirmed_at INTO v_email, v_confirmed FROM auth.users WHERE id = v_uid;
  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'Confirmá tu email antes de aceptar la invitación';
  END IF;

  SELECT * INTO v_inv FROM org_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND OR lower(v_inv.email) <> lower(v_email) THEN
    RAISE EXCEPTION 'Invitación no encontrada';
  END IF;
  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Esta invitación ya no está vigente';
  END IF;
  IF v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'La invitación venció. Pedile al responsable que te invite de nuevo';
  END IF;

  SELECT org_id, role::TEXT INTO v_cur_org, v_cur_role FROM user_profiles WHERE user_id = v_uid;

  IF v_cur_org IS NULL THEN
    INSERT INTO user_profiles (user_id, org_id, role, full_name)
    VALUES (v_uid, v_inv.org_id, v_inv.role, NULLIF(v_inv.full_name, ''));

  ELSIF v_cur_org = v_inv.org_id THEN
    -- Ya pertenece: no se degrada a un owner por una invitación
    IF v_cur_role <> 'owner' THEN
      UPDATE user_profiles SET role = v_inv.role, updated_at = now() WHERE user_id = v_uid;
    END IF;

  ELSE
    SELECT name INTO v_cur_org_name FROM organizations WHERE id = v_cur_org;
    SELECT COUNT(*) INTO v_members FROM user_profiles WHERE org_id = v_cur_org;
    SELECT COUNT(*) INTO v_other_owners FROM user_profiles
      WHERE org_id = v_cur_org AND role = 'owner' AND user_id <> v_uid;

    IF v_members <= 1 THEN
      -- Org propia donde está sola (típicamente creada por el signup). Se
      -- elimina salvo que tenga una suscripción paga asociada.
      SELECT (stripe_subscription_id IS NOT NULL OR COALESCE(is_combo_client, false))
        INTO v_has_billing FROM organizations WHERE id = v_cur_org;
      IF v_has_billing THEN
        RAISE EXCEPTION 'Tu organización actual "%" tiene una suscripción activa. Escribinos a soporte para unirte a otra organización', v_cur_org_name;
      END IF;

      PERFORM set_config('app.deleting_org', 'true', true);
      DELETE FROM organizations WHERE id = v_cur_org;   -- CASCADE borra su perfil y datos
      PERFORM set_config('app.deleting_org', 'false', true);
      v_removed_org := v_cur_org_name;

      INSERT INTO user_profiles (user_id, org_id, role, full_name)
      VALUES (v_uid, v_inv.org_id, v_inv.role, NULLIF(v_inv.full_name, ''));

    ELSIF v_cur_role = 'owner' AND v_other_owners = 0 THEN
      RAISE EXCEPTION 'Sos el único propietario de "%", que tiene otros miembros. Transferí la propiedad antes de unirte a otra organización', v_cur_org_name;

    ELSE
      UPDATE user_profiles
        SET org_id = v_inv.org_id, role = v_inv.role, updated_at = now()
        WHERE user_id = v_uid;
    END IF;
  END IF;

  UPDATE org_invitations
    SET status = 'accepted', responded_at = now()
    WHERE id = v_inv.id;

  -- Otras invitaciones pendientes para el mismo email quedan como estaban:
  -- la persona puede verlas, pero al estar ya en una org con equipo, aceptar
  -- otra la movería; eso requiere otra acción explícita.

  RETURN jsonb_build_object(
    'org_id', v_inv.org_id,
    'org_name', v_inv.org_name,
    'role', v_inv.role,
    'removed_org_name', v_removed_org
  );
END;
$$;

REVOKE ALL ON FUNCTION accept_org_invitation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION accept_org_invitation(UUID) TO authenticated;

-- ─── Rechazar invitación ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decline_org_invitation(p_invitation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE org_invitations
    SET status = 'declined', responded_at = now()
    WHERE id = p_invitation_id
      AND status = 'pending'
      AND lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitación no encontrada';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION decline_org_invitation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION decline_org_invitation(UUID) TO authenticated;

-- ─── Marcar aceptada cuando el usuario entra a la org por cualquier camino ──
CREATE OR REPLACE FUNCTION mark_invitation_accepted_on_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    UPDATE org_invitations
      SET status = 'accepted', responded_at = now()
      WHERE org_id = NEW.org_id
        AND status = 'pending'
        AND lower(email) = lower((SELECT email FROM auth.users WHERE id = NEW.user_id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_mark_invitation_accepted ON user_profiles;
CREATE TRIGGER tr_mark_invitation_accepted
  AFTER INSERT OR UPDATE OF org_id ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION mark_invitation_accepted_on_join();

NOTIFY pgrst, 'reload schema';
