// Helper reutilizable para mostrar arrays de items extraídos por la IA, con edición en línea.
//
// Soporta:
//   - inputs tipo text/textarea/select/number según `type`
//   - agregar / eliminar filas
//   - cada celda es editable
//
// Uso:
//   <ArrayPreviewTable
//     items={data.context}
//     setItems={next => setData({ ...data, context: next })}
//     emptyTemplate={{ type: 'Interno', category: 'Fortaleza', factor: '', description: '', strategy: '' }}
//     columns={[
//       { key: 'type', label: 'Tipo', type: 'select', options: ['Interno','Externo'], width: '100px' },
//       { key: 'category', label: 'Categoría', type: 'select', options: ['Fortaleza','Debilidad','Oportunidad','Amenaza'] },
//       { key: 'factor', label: 'Factor', type: 'text' },
//       { key: 'description', label: 'Descripción', type: 'textarea' },
//       { key: 'strategy', label: 'Estrategia', type: 'textarea' },
//     ]}
//   />

import { Plus, Trash2 } from 'lucide-react'

export default function ArrayPreviewTable({ items, setItems, emptyTemplate, columns }) {
  const safeItems = Array.isArray(items) ? items : []

  const updateCell = (idx, key, value) => {
    const next = [...safeItems]
    next[idx] = { ...next[idx], [key]: value }
    setItems(next)
  }

  const removeRow = (idx) => {
    const next = safeItems.filter((_, i) => i !== idx)
    setItems(next)
  }

  const addRow = () => {
    setItems([...safeItems, { ...emptyTemplate }])
  }

  const renderCell = (col, item, idx) => {
    const value = item[col.key] ?? ''
    const common = {
      value,
      onChange: e => updateCell(idx, col.key, col.type === 'number' ? Number(e.target.value) : e.target.value),
      style: { width: '100%', padding: '0.4rem', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '4px' },
    }
    if (col.type === 'select') {
      return (
        <select {...common} className="form-select">
          {col.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }
    if (col.type === 'textarea') {
      return <textarea {...common} rows={2} className="form-textarea" />
    }
    if (col.type === 'number') {
      return <input type="number" min={col.min ?? 0} max={col.max ?? 10} {...common} className="form-input" />
    }
    return <input type="text" {...common} className="form-input" />
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ maxHeight: '500px', overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
            <tr>
              <th style={{ padding: '0.5rem', width: '40px', textAlign: 'left' }}>#</th>
              {columns.map(c => (
                <th key={c.key} style={{ padding: '0.5rem', textAlign: 'left', width: c.width }}>{c.label}</th>
              ))}
              <th style={{ padding: '0.5rem', width: '50px' }}></th>
            </tr>
          </thead>
          <tbody>
            {safeItems.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>
                  Sin filas. Click en "Agregar fila" para empezar.
                </td>
              </tr>
            )}
            {safeItems.map((item, idx) => (
              <tr key={idx} style={{ borderTop: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                <td style={{ padding: '0.5rem', color: '#94a3b8' }}>{idx + 1}</td>
                {columns.map(c => (
                  <td key={c.key} style={{ padding: '0.5rem' }}>{renderCell(c, item, idx)}</td>
                ))}
                <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                  <button
                    onClick={() => removeRow(idx)}
                    className="btn-ghost"
                    title="Eliminar fila"
                    style={{ color: '#ef4444', padding: '0.25rem' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '0.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
        <button
          onClick={addRow}
          className="btn btn-ghost"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}
        >
          <Plus size={14} /> Agregar fila
        </button>
      </div>
    </div>
  )
}
