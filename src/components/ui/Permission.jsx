import { Lock } from 'lucide-react'
import { useOrg } from '../../OrgContext'
import { can, roleLabel } from '../../lib/roles'
import { colors, radius, font } from './tokens'

/**
 * <Permission> — wrapper que oculta/desactiva hijos según rol.
 *
 * Usage:
 *   <Permission entity="non_conformities" action="write">
 *     <Button onClick={createNC}>Nueva NC</Button>
 *   </Permission>
 *
 *   <Permission entity="billing" action="read" fallback="hide">
 *     {...solo owner ve esto...}
 *   </Permission>
 *
 * Props:
 *  - entity: nombre de tabla / dominio (ver PERMISSIONS en lib/roles)
 *  - action: 'read' | 'write' | 'delete' (default 'write')
 *  - fallback: 'hide' (default) | 'disable' | 'lock' (muestra candado + tooltip)
 *  - children
 */
export default function Permission({ entity, action = 'write', fallback = 'hide', children }) {
  const { role } = useOrg()
  const allowed = can(role, entity, action)

  if (allowed) return children

  if (fallback === 'hide') return null

  if (fallback === 'disable') {
    return <div style={{ opacity: 0.4, pointerEvents: 'none' }}>{children}</div>
  }

  if (fallback === 'lock') {
    return (
      <div
        title={`Sin permiso (rol: ${roleLabel(role)})`}
        style={{
          position: 'relative',
          opacity: 0.5, pointerEvents: 'none',
          display: 'inline-flex', alignItems: 'center', gap: '4px',
        }}
      >
        <Lock size={12} color={colors.textGhost} />
        {children}
      </div>
    )
  }

  return null
}

/**
 * <RoleBadge> — pill visual que muestra el rol de un usuario.
 */
export function RoleBadge({ role, size = 'sm' }) {
  const label = roleLabel(role)
  const isXs = size === 'xs'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      background: '#f1f5f9', color: colors.textMuted,
      padding: isXs ? '1px 6px' : '2px 8px', borderRadius: radius.pill,
      fontSize: isXs ? font.xs : font.sm, fontWeight: 600,
    }}>
      {label}
    </span>
  )
}
