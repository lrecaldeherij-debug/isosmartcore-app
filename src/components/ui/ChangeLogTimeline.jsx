import { useMemo, useState } from 'react'
import { History, Plus, Edit3, ArrowRight, ChevronDown, ChevronUp, User } from 'lucide-react'
import { colors, radius, font } from './tokens'
import Badge from './Badge'
import { EmptyState } from './misc'

/**
 * ChangeLogTimeline — visor de auditoría para columnas JSONB `change_log`.
 *
 * Estructura esperada de cada entrada:
 *   { at: ISO_string, changes: [{ field, from, to }], by?, note? }
 *
 * Una entrada con `field === 'created'` se renderiza como evento de creación.
 *
 * Props:
 *  - entries: array de entradas del JSONB
 *  - fieldLabels: { fieldName: 'Etiqueta visible' } — opcional, mapea nombres técnicos a etiquetas humanas
 *  - max: cantidad inicial a mostrar antes de "Ver más" (default 5)
 *  - emptyMessage: texto para estado vacío
 *  - title: encabezado (default "Historial de cambios")
 *  - compact: si true, oculta encabezado e icono
 */
export default function ChangeLogTimeline({
  entries = [],
  fieldLabels = {},
  max = 5,
  emptyMessage = 'No hay cambios registrados todavía.',
  title = 'Historial de cambios',
  compact = false,
}) {
  const [expanded, setExpanded] = useState(false)

  const sorted = useMemo(() => {
    if (!Array.isArray(entries)) return []
    return [...entries].sort((a, b) => {
      const ta = a?.at ? new Date(a.at).getTime() : 0
      const tb = b?.at ? new Date(b.at).getTime() : 0
      // Entries con fecha inválida/ausente van al final, las válidas más recientes primero
      if (!isFinite(ta) && !isFinite(tb)) return 0
      if (!isFinite(ta)) return 1
      if (!isFinite(tb)) return -1
      return tb - ta
    })
  }, [entries])

  const visible = expanded ? sorted : sorted.slice(0, max)
  const hidden = Math.max(0, sorted.length - max)

  if (!sorted.length) {
    return (
      <div>
        {!compact && <Header title={title} count={0} />}
        <EmptyState
          icon={<History size={28} color={colors.textGhost} />}
          title="Sin historial"
          subtitle={emptyMessage}
        />
      </div>
    )
  }

  return (
    <div>
      {!compact && <Header title={title} count={sorted.length} />}

      <div style={{ position: 'relative', paddingLeft: '20px' }}>
        {/* línea vertical */}
        <div style={{
          position: 'absolute', left: '7px', top: '6px', bottom: '6px',
          width: '2px', background: colors.border,
        }} />

        {visible.map((entry, i) => (
          <TimelineEntry key={i} entry={entry} fieldLabels={fieldLabels} />
        ))}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          style={{
            marginTop: '8px', background: 'transparent', border: 'none',
            color: colors.primary, cursor: 'pointer', fontSize: font.sm,
            fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '4px 8px',
          }}
        >
          {expanded
            ? <>Ver menos <ChevronUp size={14} /></>
            : <>Ver {hidden} cambio{hidden === 1 ? '' : 's'} más <ChevronDown size={14} /></>
          }
        </button>
      )}
    </div>
  )
}

function Header({ title, count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '10px', paddingBottom: '8px',
      borderBottom: `1px solid ${colors.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <History size={16} color={colors.textMuted} />
        <strong style={{ color: colors.text, fontSize: font.base }}>{title}</strong>
      </div>
      {count > 0 && (
        <Badge bg={colors.bgSubtle} color={colors.textMuted}>{count}</Badge>
      )}
    </div>
  )
}

function TimelineEntry({ entry, fieldLabels }) {
  const isCreation = entry?.changes?.some(c => c.field === 'created')
  const dotColor = isCreation ? colors.success : colors.primary
  const Icon = isCreation ? Plus : Edit3

  return (
    <div style={{ position: 'relative', paddingBottom: '14px', paddingLeft: '12px' }}>
      {/* dot */}
      <div style={{
        position: 'absolute', left: '-19px', top: '4px',
        width: '16px', height: '16px', borderRadius: '50%',
        background: 'white', border: `2px solid ${dotColor}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={8} color={dotColor} strokeWidth={3} />
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        fontSize: font.sm, color: colors.textMuted, marginBottom: '4px',
      }}>
        <span style={{ fontWeight: 600, color: colors.text }}>
          {formatRelative(entry.at)}
        </span>
        <span style={{ color: colors.textGhost }}>·</span>
        <span style={{ fontSize: font.xs }}>{formatAbsolute(entry.at)}</span>
        {entry.by && (
          <>
            <span style={{ color: colors.textGhost }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: font.xs }}>
              <User size={10} /> {entry.by}
            </span>
          </>
        )}
      </div>

      <div style={{
        background: colors.bgMuted, border: `1px solid ${colors.border}`,
        borderRadius: radius.lg, padding: '8px 10px',
      }}>
        {isCreation ? (
          <div style={{ fontSize: font.sm, color: colors.successText, fontWeight: 600 }}>
            Registro creado{entry.changes[0]?.to ? `: ${truncate(String(entry.changes[0].to), 60)}` : ''}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {(entry.changes || []).map((c, i) => (
              <ChangeRow key={i} change={c} fieldLabels={fieldLabels} />
            ))}
          </div>
        )}

        {entry.note && (
          <div style={{
            marginTop: '6px', paddingTop: '6px',
            borderTop: `1px dashed ${colors.border}`,
            fontSize: font.xs, color: colors.textFaint, fontStyle: 'italic',
          }}>
            {entry.note}
          </div>
        )}
      </div>
    </div>
  )
}

function ChangeRow({ change, fieldLabels }) {
  const label = fieldLabels[change.field] || humanize(change.field)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: font.sm }}>
      <span style={{ color: colors.textMuted, fontWeight: 600, minWidth: 'fit-content' }}>
        {label}:
      </span>
      <ValuePill value={change.from} variant="from" />
      <ArrowRight size={12} color={colors.textGhost} />
      <ValuePill value={change.to} variant="to" />
    </div>
  )
}

function ValuePill({ value, variant }) {
  const empty = isEmptyValue(value)
  const bg = empty
    ? colors.bgSubtle
    : variant === 'from' ? colors.dangerLight : colors.successLight
  const color = empty
    ? colors.textGhost
    : variant === 'from' ? colors.dangerText : colors.successText

  let display = '—'
  if (!empty) {
    try { display = truncate(formatValue(value), 40) } catch { display = '(valor)' }
  }

  return (
    <span style={{
      background: bg, color, padding: '1px 8px', borderRadius: radius.pill,
      fontSize: font.xs, fontWeight: 600, maxWidth: '220px',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {display}
    </span>
  )
}

function isEmptyValue(v) {
  if (v === null || v === undefined || v === '') return true
  if (Array.isArray(v) && v.length === 0) return true
  if (typeof v === 'object' && v && Object.keys(v).length === 0) return true
  return false
}

// ─────────────────── helpers ───────────────────

function formatValue(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    try { return JSON.stringify(v) } catch {
      try { return String(v) } catch { return '(objeto)' }
    }
  }
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  try { return String(v) } catch { return '(valor)' }
}

function truncate(s, n) {
  const str = typeof s === 'string' ? s : String(s ?? '')
  if (str.length <= n) return str
  return str.slice(0, n - 1) + '…'
}

function humanize(field) {
  if (!field) return ''
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function formatAbsolute(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
  } catch { return iso }
}

function formatRelative(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  if (diff < 86400 * 7) return `hace ${Math.floor(diff / 86400)} d`
  if (diff < 86400 * 30) return `hace ${Math.floor(diff / (86400 * 7))} sem`
  if (diff < 86400 * 365) return `hace ${Math.floor(diff / (86400 * 30))} mes`
  return `hace ${Math.floor(diff / (86400 * 365))} año`
}
