// =============================================================================
// ImpersonateBanner — franja fija arriba de la app cuando el super_admin
// está viendo la app como otro cliente en modo lectura.
//
// Se muestra sólo si OrgContext.impersonating = true.
// Botón "Salir" vuelve al panel /admin.
// =============================================================================

import { Shield, X } from 'lucide-react'
import { useOrg } from '../OrgContext'
import { stopImpersonation } from '../lib/impersonate'
import { colors, families, tracking, weight } from './ui/tokens'

export default function ImpersonateBanner() {
  const { org, impersonating } = useOrg()
  if (!impersonating) return null

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 5000,
      background: colors.alert, color: colors.paper,
      padding: '10px 20px',
      display: 'flex', alignItems: 'center', gap: 14,
      fontFamily: families.body, fontSize: 13,
      borderBottom: `2px solid ${colors.alertText}`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}>
      <Shield size={16} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: families.mono, fontSize: 11, letterSpacing: tracking.wider,
          textTransform: 'uppercase', fontWeight: weight.bold,
        }}>
          MODO ADMIN — LECTURA
        </span>
        <span>
          Viendo la app como <strong>{org?.name || '…'}</strong>. Los cambios están bloqueados por seguridad.
        </span>
      </div>
      <button
        onClick={stopImpersonation}
        style={{
          background: colors.paper, color: colors.alertText,
          border: 'none', padding: '6px 12px',
          fontSize: 12, fontWeight: weight.semibold,
          cursor: 'pointer', fontFamily: families.body,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <X size={14} /> Salir al panel admin
      </button>
    </div>
  )
}
