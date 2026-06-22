import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  Share2, Plus, Trash2, Info, Pencil, X, Eye, ExternalLink,
  Sparkles, Loader2, Filter, BarChart3, Mail, Users
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

const CATEGORY_OPTIONS = ['Rutinaria', 'Gestión']
const CHANNEL_OPTIONS = ['Email', 'Reunión', 'Intranet', 'WhatsApp', 'Cartelera', 'Informe', 'Otro']
const FREQUENCY_OPTIONS = ['Diaria', 'Semanal', 'Mensual', 'Trimestral', 'Anual', 'Por evento']
const EXTERNAL_TARGET_OPTIONS = ['Clientes', 'Proveedores', 'Reguladores', 'Comunidad', 'Otros']

const EMPTY_FORM = {
  type: 'Interna',
  category: 'Rutinaria',
  what: '',
  when: '',
  who_receives: '',
  who_communicates: '',
  responsible_role: '',
  channel: 'Email',
  frequency: 'Mensual',
  external_target: '',
  evidence_url: '',
  notes: '',
  how: '',
}

export default function CommunicationMatrix() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrandoForm, setMostrandoForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [detailItem, setDetailItem] = useState(null)
  const [filterType, setFilterType] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [loadingIA, setLoadingIA] = useState(false)

  // Previsualización de sugerencias IA
  const [iaSuggestions, setIaSuggestions] = useState(null)   // array de items propuestos
  const [iaSelected, setIaSelected] = useState(new Set())    // índices seleccionados
  const [savingIa, setSavingIa] = useState(false)

  const [form, setForm] = useState({ ...EMPTY_FORM })

  useEffect(() => { fetchItems() }, [])

  const [tableError, setTableError] = useState(null)

  const fetchItems = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('communication_matrix')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.warn('Error cargando communication_matrix:', error)
      setTableError(error.message || 'No se pudo cargar la tabla.')
    } else {
      setTableError(null)
      setItems(data || [])
    }
    setLoading(false)
  }

  const resetForm = () => {
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
  }

  const handleNew = () => {
    resetForm()
    setMostrandoForm(true)
  }

  const handleCancel = () => {
    setMostrandoForm(false)
    resetForm()
  }

  const handleEdit = (item) => {
    setForm({
      type: item.type || 'Interna',
      category: item.category || 'Rutinaria',
      what: item.what || '',
      when: item.when || '',
      who_receives: item.who_receives || '',
      who_communicates: item.who_communicates || '',
      responsible_role: item.responsible_role || '',
      channel: item.channel || 'Email',
      frequency: item.frequency || 'Mensual',
      external_target: item.external_target || '',
      evidence_url: item.evidence_url || '',
      notes: item.notes || '',
      how: item.how || '',
    })
    setEditingId(item.id)
    setMostrandoForm(true)
    setDetailItem(null)
  }

  const handleDelete = async (item) => {
    if (!await confirm(`¿Eliminar la comunicación "${item.what}"?`)) return
    const { error } = await supabase.from('communication_matrix').delete().eq('id', item.id)
    if (error) return toast.error(error.message)
    setDetailItem(null)
    fetchItems()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      type: form.type,
      category: form.category,
      what: form.what,
      when: form.when || null,
      who_receives: form.who_receives || null,
      who_communicates: form.who_communicates || null,
      responsible_role: form.responsible_role || null,
      channel: form.channel || null,
      frequency: form.frequency || null,
      external_target: form.type === 'Externa' ? (form.external_target || null) : null,
      evidence_url: form.evidence_url || null,
      notes: form.notes || null,
      how: form.how || form.channel || null,  // mantenemos 'how' poblado para compatibilidad
    }

    let error
    if (editingId) {
      ({ error } = await supabase.from('communication_matrix').update(payload).eq('id', editingId))
    } else {
      ({ error } = await supabase.from('communication_matrix').insert([payload]))
    }
    if (error) return toast.error(error.message)

    setMostrandoForm(false)
    resetForm()
    fetchItems()
  }

  // ---- IA: sugerir matriz desde ADN ----
  const handleSugerirConIA = async () => {
    setLoadingIA(true)
    try {
      // Traemos el perfil de la empresa para personalizar
      const { data: profile } = await supabase.from('company_profile').select('*').maybeSingle()

      const profileResumen = profile ? {
        nombre: profile.name,
        sector: profile.industry,
        tamano: profile.size,
        ubicacion: profile.location,
        productos: profile.main_products,
        clientes_tipicos: profile.typical_clients,
      } : null

      const prompt = `
Sugerí una matriz de comunicaciones ISO 9001 (cláusula 7.4) para esta empresa.
Perfil: ${JSON.stringify(profileResumen)}

Devolvé EXCLUSIVAMENTE un JSON array (sin markdown, sin texto extra) con 8 a 12 comunicaciones que cubran:
- Comunicaciones INTERNAS rutinarias (operativas del día a día)
- Comunicaciones INTERNAS de gestión (estratégicas, revisión por dirección, política de calidad)
- Comunicaciones EXTERNAS a clientes, proveedores y reguladores

Cada item con este formato exacto:
{
  "type": "Interna" | "Externa",
  "category": "Rutinaria" | "Gestión",
  "what": "Qué comunicar (corto)",
  "when": "Cuándo (ej: Cada ingreso, Trimestral, Ante reclamo)",
  "who_receives": "A quién (rol/área/empresa)",
  "who_communicates": "Quién comunica (rol)",
  "responsible_role": "Rol responsable",
  "channel": "Email" | "Reunión" | "Intranet" | "WhatsApp" | "Cartelera" | "Informe" | "Otro",
  "frequency": "Diaria" | "Semanal" | "Mensual" | "Trimestral" | "Anual" | "Por evento",
  "external_target": "Clientes" | "Proveedores" | "Reguladores" | "Comunidad" | "Otros" | ""
}
`
      const respuesta = await consultarIA(
        prompt,
        'Sos un consultor experto en ISO 9001 cláusula 7.4 (comunicación interna y externa). Respondé ÚNICAMENTE con el JSON array pedido, empezando con [ y terminando con ]. Sin markdown, sin texto antes ni después, sin comentarios dentro del JSON.'
      )

      console.log('[IA Sugerir Matriz] respuesta cruda:', respuesta)
      const arr = parseAiArray(respuesta)
      if (!Array.isArray(arr) || !arr.length) {
        throw new Error(`La IA no devolvió un array. Respuesta: ${String(respuesta).substring(0, 200)}...`)
      }

      // Normalizamos cada item para que tenga campos válidos según nuestros selects
      const normalized = arr.map(it => ({
        type: it.type === 'Externa' ? 'Externa' : 'Interna',
        category: CATEGORY_OPTIONS.includes(it.category) ? it.category : 'Rutinaria',
        what: it.what || '—',
        when: it.when || '',
        who_receives: it.who_receives || '',
        who_communicates: it.who_communicates || '',
        responsible_role: it.responsible_role || '',
        channel: CHANNEL_OPTIONS.includes(it.channel) ? it.channel : 'Email',
        frequency: FREQUENCY_OPTIONS.includes(it.frequency) ? it.frequency : 'Mensual',
        external_target: it.type === 'Externa' && EXTERNAL_TARGET_OPTIONS.includes(it.external_target) ? it.external_target : '',
      }))

      // Abrir modal de previsualización con todas pre-seleccionadas
      setIaSuggestions(normalized)
      setIaSelected(new Set(normalized.map((_, i) => i)))
    } catch (err) {
      toast.error('No pudimos procesarla. ' + (err?.message || ''))
    } finally {
      setLoadingIA(false)
    }
  }

  // ---- Guardar las sugerencias seleccionadas ----
  const toggleSuggestion = (idx) => {
    setIaSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const toggleAllSuggestions = () => {
    if (iaSelected.size === iaSuggestions.length) setIaSelected(new Set())
    else setIaSelected(new Set(iaSuggestions.map((_, i) => i)))
  }

  const handleSaveSuggestions = async () => {
    if (!iaSelected.size) return toast.warning('Seleccioná al menos una comunicación')
    setSavingIa(true)
    try {
      const payload = iaSuggestions
        .filter((_, i) => iaSelected.has(i))
        .map(it => ({
          type: it.type,
          category: it.category,
          what: it.what,
          when: it.when || null,
          who_receives: it.who_receives || null,
          who_communicates: it.who_communicates || null,
          responsible_role: it.responsible_role || null,
          channel: it.channel || null,
          frequency: it.frequency || null,
          external_target: it.type === 'Externa' ? (it.external_target || null) : null,
          how: it.channel || null,
        }))
      const { error } = await supabase.from('communication_matrix').insert(payload)
      if (error) throw error
      setIaSuggestions(null)
      setIaSelected(new Set())
      fetchItems()
    } catch (err) {
      toast.error('Error al guardar: ' + (err?.message || ''))
    } finally {
      setSavingIa(false)
    }
  }

  // ---- Filtros + dashboard ----
  const filtered = useMemo(() => {
    return items.filter(i =>
      (!filterType || i.type === filterType) &&
      (!filterCategory || i.category === filterCategory)
    )
  }, [items, filterType, filterCategory])

  const stats = useMemo(() => {
    const total = items.length
    const internas = items.filter(i => i.type === 'Interna').length
    const externas = items.filter(i => i.type === 'Externa').length
    const rutinarias = items.filter(i => i.category === 'Rutinaria').length
    const gestion = items.filter(i => i.category === 'Gestión').length
    const sinEvidencia = items.filter(i => !i.evidence_url).length
    return { total, internas, externas, rutinarias, gestion, sinEvidencia }
  }, [items])

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>📢 Matriz de Comunicaciones</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>Planificación de comunicaciones internas y externas (ISO 9001 - 7.4)</p>
        </div>
        {!mostrandoForm && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleSugerirConIA} className="btn btn-ghost" disabled={loadingIA} title="Sugerir matriz desde el ADN de la empresa">
              {loadingIA ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              Sugerir con IA
            </button>
            <button onClick={handleNew} className="btn btn-primary">
              <Plus size={18} /> Nueva Comunicación
            </button>
          </div>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['7.4']} />

      {tableError && (
        <div style={{
          marginTop: '1rem', padding: '0.9rem 1.1rem',
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: '8px', color: '#991b1b', fontSize: '0.88rem'
        }}>
          <strong>⚠ No pudimos cargar la tabla.</strong>
          <p style={{ margin: '0.4rem 0 0 0' }}>{tableError}</p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.82rem' }}>
            Si decía <em>"Could not find the table 'public.communication_matrix' in the schema cache"</em> es porque falta correr la migración <strong>v31</strong> en Supabase.
          </p>
        </div>
      )}

      {/* ===== Dashboard ===== */}
      {!mostrandoForm && stats.total > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart3 size={18} /> Resumen
            </h4>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Filter size={14} style={{ color: 'var(--text-tertiary)' }} />
              <select className="form-select" style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">Todos los tipos</option>
                <option value="Interna">Interna</option>
                <option value="Externa">Externa</option>
              </select>
              <select className="form-select" style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="">Todas las categorías</option>
                {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
            <KPI label="Total" value={stats.total} highlight />
            <KPI label="Internas" value={stats.internas} />
            <KPI label="Externas" value={stats.externas} />
            <KPI label="Rutinarias" value={stats.rutinarias} />
            <KPI label="Gestión" value={stats.gestion} />
            <KPI label="Sin evidencia" value={stats.sinEvidencia} warn={stats.sinEvidencia > 0} />
          </div>
        </div>
      )}

      {/* ===== Formulario ===== */}
      {mostrandoForm && (
        <div className="card fade-in" style={{ marginBottom: '2rem' }}>
          <div style={{ borderBottom: '1px solid #eee', marginBottom: '1.5rem', paddingBottom: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>{editingId ? 'Editar comunicación' : 'Registrar Comunicación'}</h3>
            <button onClick={handleCancel} className="btn-ghost">Cancelar</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="grid-2-col">
              <div className="form-group">
                <label className="form-label">Tipo *</label>
                <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="Interna">Interna</option>
                  <option value="Externa">Externa</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Categoría *</label>
                <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">¿Qué comunicar? *</label>
              <input required className="form-input" value={form.what}
                onChange={e => setForm({ ...form, what: e.target.value })}
                placeholder="Ej: Política de calidad, Resultados de auditoría interna, Cambios en procedimientos..." />
            </div>

            <div className="grid-2-col">
              <div className="form-group">
                <label className="form-label">¿Cuándo? (descripción)</label>
                <input className="form-input" value={form.when}
                  onChange={e => setForm({ ...form, when: e.target.value })}
                  placeholder="Ej: Cada ingreso de personal, Ante reclamo de cliente..." />
              </div>
              <div className="form-group">
                <label className="form-label">Frecuencia</label>
                <select className="form-select" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                  {FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>

            <div className="grid-2-col">
              <div className="form-group">
                <label className="form-label">¿A quién comunicar? *</label>
                <input required className="form-input" value={form.who_receives}
                  onChange={e => setForm({ ...form, who_receives: e.target.value })}
                  placeholder="Ej: Todo el personal, Clientes corporativos, Proveedor crítico..." />
              </div>
              {form.type === 'Externa' && (
                <div className="form-group">
                  <label className="form-label">Destinatario externo</label>
                  <select className="form-select" value={form.external_target} onChange={e => setForm({ ...form, external_target: e.target.value })}>
                    <option value="">— Seleccionar —</option>
                    {EXTERNAL_TARGET_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="grid-2-col">
              <div className="form-group">
                <label className="form-label">Canal formal *</label>
                <select className="form-select" value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>
                  {CHANNEL_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Detalle del canal (opcional)</label>
                <input className="form-input" value={form.how}
                  onChange={e => setForm({ ...form, how: e.target.value })}
                  placeholder="Ej: Reunión semanal de gerencia, Newsletter mensual..." />
              </div>
            </div>

            <div className="grid-2-col">
              <div className="form-group">
                <label className="form-label">¿Quién comunica? *</label>
                <input required className="form-input" value={form.who_communicates}
                  onChange={e => setForm({ ...form, who_communicates: e.target.value })}
                  placeholder="Ej: Coordinador SGC, Jefe de RRHH..." />
              </div>
              <div className="form-group">
                <label className="form-label">Rol del responsable</label>
                <input className="form-input" value={form.responsible_role}
                  onChange={e => setForm({ ...form, responsible_role: e.target.value })}
                  placeholder="Ej: Responsable de Calidad, Gerente Comercial..." />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Link evidencia (acta, email, post intranet...)</label>
              <input type="url" className="form-input" value={form.evidence_url}
                onChange={e => setForm({ ...form, evidence_url: e.target.value })}
                placeholder="https://drive.google.com/..." />
            </div>

            <div className="form-group">
              <label className="form-label">Observaciones</label>
              <textarea className="form-textarea" rows={2} value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Notas internas, contexto, excepciones..." />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={handleCancel} className="btn btn-ghost">Cancelar</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Guardar cambios' : 'Guardar comunicación'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ===== Tabla ===== */}
      {!mostrandoForm && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: 'var(--shadow-sm)', overflowX: 'auto', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={estilos.th}>Tipo</th>
                <th style={estilos.th}>Categoría</th>
                <th style={estilos.th}>¿Qué?</th>
                <th style={estilos.th}>Canal</th>
                <th style={estilos.th}>Frecuencia</th>
                <th style={estilos.th}>A quién</th>
                <th style={estilos.th}>Quién comunica</th>
                <th style={estilos.th}>Evidencia</th>
                <th style={estilos.th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={estilos.td}>
                    <span className={`badge ${item.type === 'Interna' ? 'badge-neutral' : 'badge-success'}`}>
                      {item.type}
                    </span>
                  </td>
                  <td style={estilos.td}>
                    {item.category && (
                      <span style={{
                        fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '999px',
                        background: item.category === 'Gestión' ? '#fef3c7' : '#dbeafe',
                        color: item.category === 'Gestión' ? '#92400e' : '#1e40af',
                      }}>{item.category}</span>
                    )}
                  </td>
                  <td style={estilos.td}><strong>{item.what}</strong></td>
                  <td style={estilos.td}>{item.channel || item.how || '—'}</td>
                  <td style={estilos.td}>{item.frequency || item.when || '—'}</td>
                  <td style={estilos.td}>
                    {item.who_receives}
                    {item.external_target && <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{item.external_target}</div>}
                  </td>
                  <td style={estilos.td}>
                    {item.who_communicates}
                    {item.responsible_role && <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{item.responsible_role}</div>}
                  </td>
                  <td style={estilos.td}>
                    {item.evidence_url
                      ? <a href={item.evidence_url} target="_blank" rel="noreferrer" title="Ver evidencia" style={{ color: 'var(--primary-color)' }}><ExternalLink size={14} /></a>
                      : <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>—</span>}
                  </td>
                  <td style={estilos.td}>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button onClick={() => setDetailItem(item)} className="btn-ghost" title="Ver detalle" style={{ padding: '0.25rem' }}><Eye size={14} /></button>
                      <button onClick={() => handleEdit(item)} className="btn-ghost" title="Editar" style={{ padding: '0.25rem' }}><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(item)} className="btn-ghost" title="Eliminar" style={{ padding: '0.25rem', color: 'var(--danger-color)' }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan="9" style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                    <Info size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <p>{items.length === 0 ? 'No se han registrado comunicaciones.' : 'No hay comunicaciones con esos filtros.'}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Modal detalle ===== */}
      {detailItem && createPortal((
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{
            background: 'white', maxWidth: '640px', width: '100%', padding: 0,
            maxHeight: '90vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.6)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {detailItem.type === 'Interna' ? <Users size={18} /> : <Mail size={18} />}
                  {detailItem.what}
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {detailItem.type} · {detailItem.category || 'Sin categoría'}
                </span>
              </div>
              <button onClick={() => setDetailItem(null)} className="btn-ghost" style={{ padding: '0.25rem' }}><X size={18} /></button>
            </div>

            <div style={{ overflow: 'auto', padding: '1.25rem', display: 'grid', gap: '0.75rem' }}>
              <DetailRow label="Canal formal" value={detailItem.channel || detailItem.how} />
              <DetailRow label="Frecuencia" value={detailItem.frequency || detailItem.when} />
              <DetailRow label="¿Cuándo? (descripción)" value={detailItem.when} />
              <DetailRow label="¿A quién?" value={detailItem.who_receives} />
              {detailItem.type === 'Externa' && <DetailRow label="Destinatario externo" value={detailItem.external_target} />}
              <DetailRow label="¿Quién comunica?" value={detailItem.who_communicates} />
              <DetailRow label="Rol responsable" value={detailItem.responsible_role} />
              {detailItem.evidence_url && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>EVIDENCIA</div>
                  <a href={detailItem.evidence_url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ padding: '0.4rem 0.75rem' }}>
                    <ExternalLink size={14} /> Abrir evidencia
                  </a>
                </div>
              )}
              {detailItem.notes && (
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
                  <strong style={{ fontSize: '0.75rem', color: '#64748b' }}>OBSERVACIONES</strong>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>{detailItem.notes}</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => handleDelete(detailItem)} className="btn btn-ghost" style={{ color: 'var(--danger-color)' }}>
                <Trash2 size={14} /> Eliminar
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setDetailItem(null)} className="btn btn-ghost">Cerrar</button>
                <button onClick={() => handleEdit(detailItem)} className="btn btn-primary"><Pencil size={14} /> Editar</button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ===== Modal previsualización IA ===== */}
      {iaSuggestions && createPortal((
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{
            background: 'white', maxWidth: '960px', width: '100%', padding: 0,
            maxHeight: '90vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.6)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={18} style={{ color: '#7c3aed' }} /> Propuesta de la IA
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Revisá las {iaSuggestions.length} comunicaciones sugeridas. Destildá las que no apliquen y guardá solo lo que sirve.
                </span>
              </div>
              <button onClick={() => { setIaSuggestions(null); setIaSelected(new Set()) }} className="btn-ghost" style={{ padding: '0.25rem' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '0.5rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                <strong>{iaSelected.size}</strong> de {iaSuggestions.length} seleccionadas
              </span>
              <button type="button" onClick={toggleAllSuggestions} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                {iaSelected.size === iaSuggestions.length ? 'Destildar todas' : 'Tildar todas'}
              </button>
            </div>

            <div style={{ overflow: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.6rem', width: '40px', textAlign: 'center' }}></th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Tipo</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Cat.</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>¿Qué?</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Canal</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Frec.</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>A quién</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Quién comunica</th>
                  </tr>
                </thead>
                <tbody>
                  {iaSuggestions.map((it, i) => {
                    const selected = iaSelected.has(i)
                    return (
                      <tr
                        key={i}
                        onClick={() => toggleSuggestion(i)}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: selected ? '#eef2ff' : 'transparent',
                          cursor: 'pointer',
                          opacity: selected ? 1 : 0.55,
                        }}
                      >
                        <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                          <input type="checkbox" checked={selected} onChange={() => toggleSuggestion(i)} onClick={e => e.stopPropagation()} />
                        </td>
                        <td style={{ padding: '0.6rem' }}>
                          <span className={`badge ${it.type === 'Interna' ? 'badge-neutral' : 'badge-success'}`}>{it.type}</span>
                        </td>
                        <td style={{ padding: '0.6rem' }}>
                          <span style={{
                            fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '999px',
                            background: it.category === 'Gestión' ? '#fef3c7' : '#dbeafe',
                            color: it.category === 'Gestión' ? '#92400e' : '#1e40af',
                          }}>{it.category}</span>
                        </td>
                        <td style={{ padding: '0.6rem' }}><strong>{it.what}</strong></td>
                        <td style={{ padding: '0.6rem', color: '#64748b' }}>{it.channel}</td>
                        <td style={{ padding: '0.6rem', color: '#64748b' }}>{it.frequency}</td>
                        <td style={{ padding: '0.6rem' }}>
                          {it.who_receives}
                          {it.external_target && <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{it.external_target}</div>}
                        </td>
                        <td style={{ padding: '0.6rem' }}>
                          {it.who_communicates}
                          {it.responsible_role && <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{it.responsible_role}</div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                💡 Después podés editar cada una con el lápiz para ajustarla a tu realidad.
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => { setIaSuggestions(null); setIaSelected(new Set()) }} className="btn btn-ghost" disabled={savingIa}>
                  Cancelar
                </button>
                <button onClick={handleSaveSuggestions} className="btn btn-primary" disabled={savingIa || !iaSelected.size}>
                  {savingIa
                    ? <><Loader2 className="animate-spin" size={14} /> Guardando...</>
                    : <>Guardar {iaSelected.size} comunicación{iaSelected.size !== 1 ? 'es' : ''}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  )
}

// ----- Subcomponentes -----
function KPI({ label, value, highlight, warn }) {
  return (
    <div style={{
      background: highlight ? '#eef2ff' : warn ? '#fef3c7' : '#f8fafc',
      borderRadius: '8px', padding: '0.6rem 0.75rem',
      textAlign: 'center',
      border: highlight ? '1px solid #c7d2fe' : warn ? '1px solid #fde68a' : '1px solid #e2e8f0'
    }}>
      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: warn ? '#92400e' : 'var(--primary-color)' }}>{value}</div>
    </div>
  )
}

function DetailRow({ label, value }) {
  if (!value) return null
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '0.95rem', color: '#1e293b' }}>{value}</div>
    </div>
  )
}

const estilos = {
  th: { padding: '0.75rem', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', color: '#64748b' },
  td: { padding: '0.75rem', fontSize: '0.88rem', color: '#334155', verticalAlign: 'top' }
}

// Extrae el primer bloque JSON balanceado del texto (array U objeto),
// empezando por el carácter de apertura indicado y respetando strings/escapes.
function extractFirstJson(text, openChar, closeChar) {
  if (!text) return null
  const stripped = String(text).replace(/```json/gi, '').replace(/```/g, '')
  const start = stripped.indexOf(openChar)
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === openChar) depth++
    else if (ch === closeChar) {
      depth--
      if (depth === 0) return stripped.substring(start, i + 1)
    }
  }
  return null
}

// Extrae TODOS los objetos JSON balanceados del texto (en orden), ignorando
// lo que no sea objeto. Útil cuando la IA devuelve varios { } sueltos sin [ ].
function extractAllObjects(text) {
  const stripped = String(text).replace(/```json/gi, '').replace(/```/g, '')
  const objects = []
  let i = 0
  while (i < stripped.length) {
    if (stripped[i] !== '{') { i++; continue }
    let depth = 0
    let inString = false
    let escape = false
    const start = i
    let closed = false
    for (; i < stripped.length; i++) {
      const ch = stripped[i]
      if (escape) { escape = false; continue }
      if (ch === '\\') { escape = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          try {
            const obj = JSON.parse(stripped.substring(start, i + 1))
            if (obj && typeof obj === 'object') objects.push(obj)
          } catch { /* ignorar fragmento inválido */ }
          i++
          closed = true
          break
        }
      }
    }
    if (!closed) break  // objeto sin cerrar, salir
  }
  return objects
}

// Intenta sacar un array de items de cualquier respuesta razonable de la IA.
// Estrategias en orden: 1) array directo, 2) objeto wrapper con array adentro,
// 3) múltiples objetos sueltos concatenados.
function parseAiArray(raw) {
  if (!raw) return null
  // 1) Array directo [...]
  const arrStr = extractFirstJson(raw, '[', ']')
  if (arrStr) {
    try { const arr = JSON.parse(arrStr); if (Array.isArray(arr) && arr.length) return arr } catch {}
  }
  // 2) Objeto wrapper con una propiedad array
  const objStr = extractFirstJson(raw, '{', '}')
  if (objStr) {
    try {
      const obj = JSON.parse(objStr)
      for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key]) && obj[key].length) return obj[key]
      }
    } catch {}
  }
  // 3) Varios objetos sueltos concatenados (NDJSON-like)
  const all = extractAllObjects(raw)
  if (all.length >= 1) return all
  return null
}
