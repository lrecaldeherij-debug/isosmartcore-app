-- =============================================================================
-- ISO/IEC 17020:2026 — Fase 1: base técnica de la inspección
--
-- El SGC ISO 9001 ya cubre el capítulo 8 por la vía de la cláusula 8.1.3. Lo
-- que falta es el núcleo técnico, y esta fase construye las tres piezas de las
-- que dependen todas las demás (un informe no se firma sin inspector
-- autorizado, y un inspector se autoriza para un método que debe existir antes):
--
--   1. inspection_scopes  — alcance técnico por actividad (5.2.3): campo,
--      rango, etapa del ítem, normas de referencia y tipo de independencia
--      declarado para esa actividad (5.1 / Anexo A).
--   2. inspection_methods — catálogo de métodos (7.2): distingue norma
--      publicada de método propio o modificado, con los apartados que pide
--      7.2.5 (técnica, muestreo, información del cliente, tecnología/IA,
--      seguridad y criterio de decisión) y el estado de validación (7.2.6).
--   3. inspection_items   — ítems inspeccionados (7.3): identificación única,
--      verificación de estado listo y cuidado contra el deterioro.
--
-- El módulo se habilita por organización: las empresas que solo usan ISO 9001
-- no ven nada nuevo.
-- =============================================================================

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS inspection_module_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.inspection_module_enabled IS
  'Habilita los módulos de organismo de inspección (ISO/IEC 17020). Off por defecto.';

-- ─── 1. Alcance técnico por actividad (5.2.3 / 5.1) ─────────────────────────
CREATE TABLE IF NOT EXISTS inspection_scopes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  code               TEXT,
  activity           TEXT NOT NULL,            -- "Medición de espesores por ultrasonido"
  field              TEXT,                     -- campo: integridad mecánica, soldadura, etc.
  item_types         TEXT,                     -- qué se inspecciona: recipientes, líneas, juntas
  range_description  TEXT,                     -- rango: espesores 2-50 mm, DN 2"-24", etc.
  item_stage         TEXT,                     -- diseño | fabricación | instalación | en servicio
  reference_standards TEXT,                    -- API 510, ASME VIII Div.1, AWS D1.1…

  -- La edición 2026 permite declarar un tipo distinto por actividad
  independence_type  TEXT CHECK (independence_type IN ('A', 'no_A')),
  independence_note  TEXT,

  accreditation_status TEXT NOT NULL DEFAULT 'No acreditado'
                       CHECK (accreditation_status IN ('No acreditado', 'En preparación', 'Solicitado', 'Acreditado', 'Suspendido')),
  status             TEXT NOT NULL DEFAULT 'Borrador'
                       CHECK (status IN ('Borrador', 'Vigente', 'Suspendido', 'Retirado')),

  approved_by        TEXT,
  approved_role      TEXT,
  approved_at        DATE,
  notes              TEXT,
  change_log         JSONB DEFAULT '[]'::jsonb,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspection_scopes_org ON inspection_scopes(org_id, status);

-- ─── 2. Catálogo de métodos de inspección (7.2) ─────────────────────────────
CREATE TABLE IF NOT EXISTS inspection_methods (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  scope_id           UUID REFERENCES inspection_scopes(id) ON DELETE SET NULL,

  code               TEXT,
  name               TEXT NOT NULL,
  version            TEXT DEFAULT 'v1.0',

  -- 7.2.1–7.2.4: norma publicada, método propio o norma modificada
  method_source      TEXT NOT NULL DEFAULT 'normalizado'
                       CHECK (method_source IN ('normalizado', 'modificado', 'no_normalizado')),
  standard_ref       TEXT,                     -- norma y edición: "ASTM E797-21"
  modification_note  TEXT,                     -- qué se modificó respecto de la norma

  -- 7.2.5: apartados obligatorios del método
  technique          TEXT,                     -- técnica y procedimiento
  equipment_required TEXT,                     -- equipos e influencia en el resultado
  sampling_plan      TEXT,                     -- muestreo y su justificación
  client_info_required TEXT,                   -- información que debe aportar el cliente
  technology_use     TEXT,                     -- tecnología, software o IA empleados
  safety_requirements TEXT,                    -- seguridad del personal y del ítem
  acceptance_criteria TEXT,                    -- criterio de decisión / aceptación

  -- 7.2.6: los métodos no normalizados o modificados deben validarse
  validation_status  TEXT NOT NULL DEFAULT 'No aplica'
                       CHECK (validation_status IN ('No aplica', 'Pendiente', 'En curso', 'Validado', 'No validado')),
  validation_evidence TEXT,
  validated_by       TEXT,
  validated_at       DATE,

  status             TEXT NOT NULL DEFAULT 'Borrador'
                       CHECK (status IN ('Borrador', 'Vigente', 'Obsoleto')),
  approved_by        TEXT,
  approved_role      TEXT,
  approved_at        DATE,

  document_id        UUID REFERENCES documents_versions(id) ON DELETE SET NULL,
  notes              TEXT,
  change_log         JSONB DEFAULT '[]'::jsonb,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspection_methods_org ON inspection_methods(org_id, status);
CREATE INDEX IF NOT EXISTS idx_inspection_methods_scope ON inspection_methods(scope_id);

-- Un método propio o modificado no puede quedar Vigente sin validación (7.2.6).
-- Se aplica en la base para que no dependa solo de la UI.
CREATE OR REPLACE FUNCTION enforce_method_validation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'Vigente'
     AND NEW.method_source IN ('modificado', 'no_normalizado')
     AND NEW.validation_status <> 'Validado' THEN
    RAISE EXCEPTION 'El método "%" no es normalizado: hay que validarlo antes de ponerlo vigente (ISO/IEC 17020 7.2.6)', NEW.name
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_method_validation ON inspection_methods;
CREATE TRIGGER tr_enforce_method_validation
  BEFORE INSERT OR UPDATE ON inspection_methods
  FOR EACH ROW EXECUTE FUNCTION enforce_method_validation();

-- ─── 3. Ítems inspeccionados (7.3) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspection_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  tag                TEXT NOT NULL,            -- identificación única: TK-101, L-2004-J12
  name               TEXT,
  item_type          TEXT,                     -- recipiente, línea, junta soldada, estructura
  client_name        TEXT,
  customer_order_id  UUID,
  location           TEXT,
  manufacturer       TEXT,
  serial_number      TEXT,
  service_fluid      TEXT,                     -- servicio / fluido contenido
  design_code        TEXT,                     -- código de diseño del ítem
  scope_id           UUID REFERENCES inspection_scopes(id) ON DELETE SET NULL,

  -- 7.3.1–7.3.2: verificar que el ítem está listo antes de inspeccionar
  readiness_verified BOOLEAN NOT NULL DEFAULT false,
  readiness_notes    TEXT,
  readiness_by       TEXT,
  readiness_at       DATE,

  -- 7.3.3: cuidado para evitar deterioro mientras está bajo custodia
  protection_notes   TEXT,

  status             TEXT NOT NULL DEFAULT 'Registrado'
                       CHECK (status IN ('Registrado', 'Listo', 'En inspección', 'Inspeccionado', 'No apto', 'Fuera de alcance')),
  notes              TEXT,
  change_log         JSONB DEFAULT '[]'::jsonb,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- La identificación tiene que ser inequívoca dentro de la organización (7.3.1)
CREATE UNIQUE INDEX IF NOT EXISTS uq_inspection_items_tag ON inspection_items(org_id, lower(tag));
CREATE INDEX IF NOT EXISTS idx_inspection_items_status ON inspection_items(org_id, status);

-- ─── updated_at automático ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_touch_inspection_scopes ON inspection_scopes;
CREATE TRIGGER tr_touch_inspection_scopes BEFORE UPDATE ON inspection_scopes
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS tr_touch_inspection_items ON inspection_items;
CREATE TRIGGER tr_touch_inspection_items BEFORE UPDATE ON inspection_items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── RLS (mismo patrón que el resto del proyecto) ───────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['inspection_scopes', 'inspection_methods', 'inspection_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format($f$CREATE POLICY %I ON %I FOR SELECT USING (
        org_id = auth_org_id()
        OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
      )$f$, t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (org_id = auth_org_id())', t || '_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (org_id = auth_org_id()) WITH CHECK (org_id = auth_org_id())', t || '_update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (org_id = auth_org_id())', t || '_delete', t);
  END LOOP;
END $$;

COMMENT ON TABLE inspection_scopes IS 'ISO/IEC 17020 5.2.3 — alcance técnico declarado por actividad de inspección.';
COMMENT ON TABLE inspection_methods IS 'ISO/IEC 17020 7.2 — catálogo de métodos con sus apartados y estado de validación.';
COMMENT ON TABLE inspection_items IS 'ISO/IEC 17020 7.3 — ítems con identificación única y verificación de estado listo.';

NOTIFY pgrst, 'reload schema';

COMMIT;
