import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  Ruler, Plus, Calendar, AlertCircle, CheckCircle, FileText, X, Eye,
  Pencil, Trash2, Search, Filter, BarChart3, Sparkles, Loader2,
  ExternalLink, AlertTriangle, History
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import ExcelImporter from './ExcelImporter'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

const STATUS_OPTIONS = ['Vigente', 'Vencido', 'Fuera de Servicio']
const RESULT_OPTIONS = ['Conforme', 'Con desviación', 'No conforme']
const EQUIPMENT_TYPES = [
  'Balanza', 'Termómetro', 'Manómetro', 'Caudalímetro', 'Micrómetro',
  'Calibre', 'pH-metro', 'Cronómetro', 'Multímetro', 'Higrómetro',
  'Conductímetro', 'Refractómetro', 'Vernier', 'Otro'
]

const EMPTY_FORM = {
  equipment_name: '', equipment_type: 'Balanza', serial_number: '',
  location: '', used_in_process: '', responsible: '',
  measurement_range: '', tolerance: '',
  last_calibration: '', next_calibration: '',
  calibration_frequency_months: 12,
  calibration_lab: '', certificate_number: '', traceability_pattern: '',
  certificate_url: '',
  status: 'Vigente', deviation_notes: ''
}

function addMonths(dateStr, months) {
  if (!dateStr || !months) return ''
  const m = parseInt(months, 10)
  if (!Number.isFinite(m)) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  d.setMonth(d.getMonth() + m)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().substring(0, 10)
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default function Calibration() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(null)
  const [mostrandoForm, setMostrandoForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [detailItem, setDetailItem] = useState(null)
  const [historyByEquip, setHistoryByEquip] = useState({})

  // Filtros
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')

  // Modal de nueva calibración (registro histórico)
  const [calForEquip, setCalForEquip] = useState(null)
  const [calForm, setCalForm] = useState({
    calibration_date: new Date().toISOString().substring(0, 10),
    next_calibration: '',
    certificate_number: '', certificate_url: '', calibration_lab: '',
    result: 'Conforme', deviation_notes: '', actions_taken: ''
  })
  const [savingCal, setSavingCal] = useState(false)

  // IA preview
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaSuggestions, setIaSuggestions] = useState(null)
  const [iaSelected, setIaSelected] = useState(new Set())
  const [savingIa, setSavingIa] = useState(false)

  const [form, setForm] = useState({ ...EMPTY_FORM })

  useEffect(() => { fetchItems() }, [])

  const fetchItems = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('equipment_calibration')
      .select('*')
      .order('next_calibration', { ascending: true, nullsFirst: false })
    if (error) {
      setTableError(error.message)
      console.warn('Error cargando equipment_calibration:', error)
    } else {
      setTableError(null)
      setItems(data || [])
      if (data?.length) fetchHistoryFor(data.map(d => d.id))
    }
    setLoading(false)
  }

  const fetchHistoryFor = async (equipIds) => {
    if (!equipIds?.length) return
    const { data, error } = await supabase
      .from('calibration_history')
      .select('*')
      .in('equipment_id', equipIds)
      .order('calibration_date', { ascending: false })
    if (error) { console.warn('No pude cargar historial calibración:', error.message); return }
    const grouped = {}
    for (const h of data || []) {
      if (!grouped[h.equipment_id]) grouped[h.equipment_id] = []
      grouped[h.equipment_id].push(h)
    }
    setHistoryByEquip(grouped)
  }

  const resetForm = () => { setForm({ ...EMPTY_FORM }); setEditingId(null) }
  const handleNew = () => { resetForm(); setMostrandoForm(true) }
  const handleCancel = () => { setMostrandoForm(false); resetForm() }

  const handleEdit = (item) => {
    setForm({
      equipment_name: item.equipment_name || '',
      equipment_type: item.equipment_type || 'Balanza',
      serial_number: item.serial_number || '',
      location: item.location || '',
      used_in_process: item.used_in_process || '',
      responsible: item.responsible || '',
      measurement_range: item.measurement_range || '',
      tolerance: item.tolerance || '',
      last_calibration: item.last_calibration || '',
      next_calibration: item.next_calibration || '',
      calibration_frequency_months: item.calibration_frequency_months || 12,
      calibration_lab: item.calibration_lab || '',
      certificate_number: item.certificate_number || '',
      traceability_pattern: item.traceability_pattern || '',
      certificate_url: item.certificate_url || '',
      status: item.status || 'Vigente',
      deviation_notes: item.deviation_notes || '',
    })
    setEditingId(item.id)
    setMostrandoForm(true)
    setDetailItem(null)
  }

  const handleDelete = async (item) => {
    if (!await confirm(`¿Eliminar el equipo "${item.equipment_name}"? Esto también borra su histórico de calibraciones.`)) return
    const { error } = await supabase.from('equipment_calibration').delete().eq('id', item.id)
    if (error) return toast.error(error.message)
    setDetailItem(null)
    fetchItems()
  }

  // Cambia last_calibration o frecuencia → recalcula next_calibration
  const handleLastCalChange = (date) => {
    setForm(f => ({
      ...f,
      last_calibration: date,
      next_calibration: addMonths(date, f.calibration_frequency_months) || f.next_calibration
    }))
  }
  const handleFrequencyChange = (months) => {
    setForm(f => ({
      ...f,
      calibration_frequency_months: months,
      next_calibration: f.last_calibration ? addMonths(f.last_calibration, months) : f.next_calibration
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      equipment_name: form.equipment_name,
      equipment_type: form.equipment_type,
      serial_number: form.serial_number || null,
      location: form.location || null,
      used_in_process: form.used_in_process || null,
      responsible: form.responsible || null,
      measurement_range: form.measurement_range || null,
      tolerance: form.tolerance || null,
      last_calibration: form.last_calibration || null,
      next_calibration: form.next_calibration || null,
      calibration_frequency_months: form.calibration_frequency_months ? parseInt(form.calibration_frequency_months, 10) : null,
      calibration_lab: form.calibration_lab || null,
      certificate_number: form.certificate_number || null,
      traceability_pattern: form.traceability_pattern || null,
      certificate_url: form.certificate_url || null,
      status: form.status,
      deviation_notes: form.deviation_notes || null,
    }

    let error
    if (editingId) {
      ({ error } = await supabase.from('equipment_calibration').update(payload).eq('id', editingId))
    } else {
      ({ error } = await supabase.from('equipment_calibration').insert([payload]))
    }
    if (error) return toast.error(error.message)
    setMostrandoForm(false)
    resetForm()
    fetchItems()
  }

  // ---- Registrar nueva calibración (entra al histórico + actualiza fechas del equipo) ----
  const openCalModal = (item) => {
    setCalForEquip(item)
    setCalForm({
      calibration_date: new Date().toISOString().substring(0, 10),
      next_calibration: addMonths(new Date().toISOString().substring(0, 10), item.calibration_frequency_months || 12),
      certificate_number: '',
      certificate_url: '',
      calibration_lab: item.calibration_lab || '',
      result: 'Conforme',
      deviation_notes: '',
      actions_taken: '',
    })
  }

  const handleSaveCalibration = async () => {
    if (!calForEquip) return
    setSavingCal(true)
    try {
      // 1. Insertar en histórico
      const { error: hErr } = await supabase.from('calibration_history').insert([{
        equipment_id: calForEquip.id,
        calibration_date: calForm.calibration_date,
        next_calibration: calForm.next_calibration || null,
        certificate_number: calForm.certificate_number || null,
        certificate_url: calForm.certificate_url || null,
        calibration_lab: calForm.calibration_lab || null,
        result: calForm.result,
        deviation_notes: calForm.deviation_notes || null,
        actions_taken: calForm.actions_taken || null,
      }])
      if (hErr) throw hErr

      // 2. Actualizar el equipo con las fechas nuevas y status según el resultado
      const newStatus =
        calForm.result === 'No conforme' ? 'Fuera de Servicio' :
        new Date(calForm.next_calibration) < new Date() ? 'Vencido' : 'Vigente'

      const { error: eErr } = await supabase.from('equipment_calibration').update({
        last_calibration: calForm.calibration_date,
        next_calibration: calForm.next_calibration || null,
        certificate_number: calForm.certificate_number || calForEquip.certificate_number,
        certificate_url: calForm.certificate_url || calForEquip.certificate_url,
        calibration_lab: calForm.calibration_lab || calForEquip.calibration_lab,
        status: newStatus,
        deviation_notes: calForm.deviation_notes || null,
      }).eq('id', calForEquip.id)
      if (eErr) throw eErr

      setCalForEquip(null)
      fetchItems()
    } catch (err) {
      toast.error('Error guardando calibración: ' + (err?.message || ''))
    } finally {
      setSavingCal(false)
    }
  }

  // ---- IA: sugerir equipos típicos ----
  const handleSugerirConIA = async () => {
    setLoadingIA(true)
    try {
      const { data: profile } = await supabase.from('company_profile').select('*').maybeSingle()
      const resumen = profile ? {
        nombre: profile.name, sector: profile.industry, tamano: profile.size,
        productos: profile.main_products,
      } : null

      const prompt = `
Sugiere los EQUIPOS DE MEDICIÓN típicos que deben calibrarse en esta empresa según ISO 9001 cláusula 7.1.5.
Perfil: ${JSON.stringify(resumen)}

Devuelve EXCLUSIVAMENTE un JSON array con 6 a 12 equipos. Cada uno con este formato:
{
  "equipment_name": "Nombre del equipo (ej: Balanza de mesa 10kg)",
  "equipment_type": "Balanza" | "Termómetro" | "Manómetro" | "Caudalímetro" | "Micrómetro" | "Calibre" | "pH-metro" | "Cronómetro" | "Multímetro" | "Higrómetro" | "Conductímetro" | "Refractómetro" | "Vernier" | "Otro",
  "location": "Dónde suele estar (ej: Laboratorio QC, Planta producción línea 1)",
  "used_in_process": "Proceso donde se usa (ej: Control de calidad de materia prima)",
  "measurement_range": "Rango (ej: 0-10kg, 0-100°C)",
  "tolerance": "Tolerancia (ej: ±0.1g, ±0.5°C)",
  "calibration_frequency_months": 6 | 12 | 24
}

Reglas:
- Sin texto ni markdown, solo el array.
- Equipos relevantes al sector de la empresa.
`
      const respuesta = await consultarIA(
        prompt,
        'Eres un consultor experto en ISO 9001 cláusula 7.1.5 (recursos de seguimiento y medición). Responde ÚNICAMENTE con el JSON array pedido. Sin markdown ni texto extra.'
      )
      console.log('[IA Sugerir Equipos] respuesta cruda:', respuesta)
      const arr = parseAiArray(respuesta)
      if (!Array.isArray(arr) || !arr.length) {
        throw new Error(`La IA no devolvió un array. Respuesta: ${String(respuesta).substring(0, 200)}...`)
      }
      const normalized = arr.map(it => ({
        equipment_name: it.equipment_name || '—',
        equipment_type: EQUIPMENT_TYPES.includes(it.equipment_type) ? it.equipment_type : 'Otro',
        location: it.location || '',
        used_in_process: it.used_in_process || '',
        measurement_range: it.measurement_range || '',
        tolerance: it.tolerance || '',
        calibration_frequency_months: [6, 12, 24].includes(it.calibration_frequency_months) ? it.calibration_frequency_months : 12,
      }))
      setIaSuggestions(normalized)
      setIaSelected(new Set(normalized.map((_, i) => i)))
    } catch (err) {
      toast.error('No pudimos procesarla. ' + (err?.message || ''))
    } finally {
      setLoadingIA(false)
    }
  }

  const toggleSuggestion = (idx) => {
    setIaSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }
  const toggleAllSuggestions = () => {
    if (iaSelected.size === iaSuggestions.length) setIaSelected(new Set())
    else setIaSelected(new Set(iaSuggestions.map((_, i) => i)))
  }

  const handleSaveSuggestions = async () => {
    if (!iaSelected.size) return toast.warning('Selecciona al menos un equipo')
    setSavingIa(true)
    try {
      const payload = iaSuggestions
        .filter((_, i) => iaSelected.has(i))
        .map(it => ({
          equipment_name: it.equipment_name,
          equipment_type: it.equipment_type,
          location: it.location || null,
          used_in_process: it.used_in_process || null,
          measurement_range: it.measurement_range || null,
          tolerance: it.tolerance || null,
          calibration_frequency_months: it.calibration_frequency_months || 12,
          status: 'Vigente',
        }))
      const { error } = await supabase.from('equipment_calibration').insert(payload)
      if (error) throw error
      setIaSuggestions(null); setIaSelected(new Set())
      fetchItems()
    } catch (err) {
      toast.error('Error al guardar: ' + (err?.message || ''))
    } finally {
      setSavingIa(false)
    }
  }

  // ---- Filtros + dashboard ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(i =>
      (!filterStatus || i.status === filterStatus) &&
      (!filterType || i.equipment_type === filterType) &&
      (!q || (i.equipment_name || '').toLowerCase().includes(q) || (i.serial_number || '').toLowerCase().includes(q))
    )
  }, [items, filterStatus, filterType, search])

  const stats = useMemo(() => {
    const total = items.length
    let vigentes = 0, porVencer = 0, vencidos = 0, sinCert = 0, fueraServicio = 0
    for (const i of items) {
      if (i.status === 'Fuera de Servicio') { fueraServicio++; continue }
      const days = daysUntil(i.next_calibration)
      if (days === null) continue
      if (days < 0) vencidos++
      else if (days <= 30) porVencer++
      else vigentes++
      if (!i.certificate_url && !i.certificate_number) sinCert++
    }
    return { total, vigentes, porVencer, vencidos, sinCert, fueraServicio }
  }, [items])

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>📏 Calibración y Medición</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>Control de recursos de seguimiento (ISO 9001 - 7.1.5)</p>
        </div>
        {!mostrandoForm && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <ExcelImporter templateKey="equipment_calibration" onImported={fetchItems} />
            <button onClick={handleSugerirConIA} className="btn btn-ghost" disabled={loadingIA} title="Sugerir equipos típicos desde el ADN de la empresa">
              {loadingIA ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              Sugerir con IA
            </button>
            <button onClick={handleNew} className="btn btn-primary">
              <Plus size={18} /> Registrar Equipo
            </button>
          </div>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['7.1.5']} />

      {tableError && (
        <div style={{ marginTop: '1rem', padding: '0.9rem 1.1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '0.88rem' }}>
          <strong>⚠ No pudimos cargar la tabla.</strong>
          <p style={{ margin: '0.4rem 0 0 0' }}>{tableError}</p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.82rem' }}>
            Si decía <em>"Could not find the table"</em> faltaría correr la migración <strong>v34</strong> en Supabase.
          </p>
        </div>
      )}

      {/* ===== Dashboard ===== */}
      {!mostrandoForm && stats.total > 0 && (
        <div className="card" style={{ marginTop: '1rem', marginBottom: '1.5rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart3 size={18} /> Resumen
            </h4>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input className="form-input" style={{ padding: '0.35rem 0.5rem 0.35rem 1.8rem', fontSize: '0.85rem', minWidth: '180px' }}
                  placeholder="Buscar por equipo o serie..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Filter size={14} style={{ color: 'var(--text-tertiary)' }} />
              <select className="form-select" style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">Todos los tipos</option>
                {EQUIPMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="form-select" style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">Todos los estados</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
            <KPI label="Total" value={stats.total} highlight />
            <KPI label="Al día" value={stats.vigentes} color="#16a34a" />
            <KPI label="Por vencer" value={stats.porVencer} warn={stats.porVencer > 0} />
            <KPI label="Vencidos" value={stats.vencidos} danger={stats.vencidos > 0} />
            <KPI label="Sin certif." value={stats.sinCert} warn={stats.sinCert > 0} />
            <KPI label="F. servicio" value={stats.fueraServicio} color="#6b7280" />
          </div>
        </div>
      )}

      {/* ===== Formulario ===== */}
      {mostrandoForm && (
        <div className="card fade-in" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ borderBottom: '1px solid #eee', marginBottom: '1.5rem', paddingBottom: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>{editingId ? 'Editar equipo' : 'Registrar Equipo de Medición'}</h3>
            <button onClick={handleCancel} className="btn-ghost">Cancelar</button>
          </div>
          <form onSubmit={handleSubmit}>
            <FormSection title="📋 Identificación del equipo">
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Nombre del equipo *</label>
                  <input required className="form-input" value={form.equipment_name}
                    onChange={e => setForm({ ...form, equipment_name: e.target.value })}
                    placeholder="Ej: Balanza de mesa 10kg Sartorius" />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo *</label>
                  <select className="form-select" value={form.equipment_type}
                    onChange={e => setForm({ ...form, equipment_type: e.target.value })}>
                    {EQUIPMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Número de serie / ID</label>
                  <input className="form-input" value={form.serial_number}
                    onChange={e => setForm({ ...form, serial_number: e.target.value })}
                    placeholder="SN-123456" />
                </div>
                <div className="form-group">
                  <label className="form-label">Ubicación física</label>
                  <input className="form-input" value={form.location}
                    onChange={e => setForm({ ...form, location: e.target.value })}
                    placeholder="Ej: Laboratorio QC, Planta línea 1" />
                </div>
              </div>
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Proceso donde se usa</label>
                  <input className="form-input" value={form.used_in_process}
                    onChange={e => setForm({ ...form, used_in_process: e.target.value })}
                    placeholder="Ej: Control de calidad de materia prima" />
                </div>
                <div className="form-group">
                  <label className="form-label">Responsable del equipo</label>
                  <input className="form-input" value={form.responsible}
                    onChange={e => setForm({ ...form, responsible: e.target.value })}
                    placeholder="Ej: Jefe de Laboratorio" />
                </div>
              </div>
            </FormSection>

            <FormSection title="📐 Características de medición">
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Rango de medición</label>
                  <input className="form-input" value={form.measurement_range}
                    onChange={e => setForm({ ...form, measurement_range: e.target.value })}
                    placeholder="Ej: 0-10 kg, -20 a 100°C" />
                </div>
                <div className="form-group">
                  <label className="form-label">Tolerancia / Incertidumbre</label>
                  <input className="form-input" value={form.tolerance}
                    onChange={e => setForm({ ...form, tolerance: e.target.value })}
                    placeholder="Ej: ±0.1g, ±0.5°C" />
                </div>
              </div>
            </FormSection>

            <FormSection title="📅 Calibración y frecuencia">
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Última calibración</label>
                  <input type="date" className="form-input" value={form.last_calibration}
                    onChange={e => handleLastCalChange(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Frecuencia (meses)</label>
                  <select className="form-select" value={form.calibration_frequency_months}
                    onChange={e => handleFrequencyChange(e.target.value)}>
                    <option value={3}>3 meses (Trimestral)</option>
                    <option value={6}>6 meses (Semestral)</option>
                    <option value={12}>12 meses (Anual)</option>
                    <option value={24}>24 meses (Bianual)</option>
                    <option value={36}>36 meses (Trianual)</option>
                  </select>
                </div>
              </div>
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Próxima calibración (auto)</label>
                  <input type="date" className="form-input" value={form.next_calibration}
                    onChange={e => setForm({ ...form, next_calibration: e.target.value })} />
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                    Se calcula desde "Última calibración" + frecuencia. Puedes ajustarla manualmente.
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <select className="form-select" value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </FormSection>

            <FormSection title="🔬 Trazabilidad (ISO 7.1.5)">
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Laboratorio de calibración</label>
                  <input className="form-input" value={form.calibration_lab}
                    onChange={e => setForm({ ...form, calibration_lab: e.target.value })}
                    placeholder="Ej: INTI, Bureau Veritas, Cesmec" />
                </div>
                <div className="form-group">
                  <label className="form-label">Número de certificado</label>
                  <input className="form-input" value={form.certificate_number}
                    onChange={e => setForm({ ...form, certificate_number: e.target.value })}
                    placeholder="Ej: CERT-2026-0123" />
                </div>
              </div>
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Patrón de referencia (trazabilidad)</label>
                  <input className="form-input" value={form.traceability_pattern}
                    onChange={e => setForm({ ...form, traceability_pattern: e.target.value })}
                    placeholder="Ej: Patrón INTI clase E2, NIST traceable" />
                </div>
                <div className="form-group">
                  <label className="form-label">URL del certificado</label>
                  <input type="url" className="form-input" value={form.certificate_url}
                    onChange={e => setForm({ ...form, certificate_url: e.target.value })}
                    placeholder="https://drive.google.com/..." />
                </div>
              </div>
            </FormSection>

            <FormSection title="⚠️ Desviaciones detectadas (si aplica)">
              <div className="form-group">
                <label className="form-label">Desviaciones y acciones tomadas</label>
                <textarea className="form-textarea" rows={2} value={form.deviation_notes}
                  onChange={e => setForm({ ...form, deviation_notes: e.target.value })}
                  placeholder="Si en la última calibración hubo desvío, anotá impacto sobre mediciones previas + acción correctiva. (ISO 7.1.5)" />
              </div>
            </FormSection>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" onClick={handleCancel} className="btn btn-ghost">Cancelar</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Guardar cambios' : 'Guardar equipo'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ===== Lista de equipos ===== */}
      {!mostrandoForm && (
        <>
          {loading && <p>Cargando equipos...</p>}
          {!loading && items.length === 0 && !tableError && (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#cbd5e1' }}>
              <Ruler size={64} style={{ marginBottom: '1rem', opacity: 0.3 }} />
              <p>No hay equipos registrados. Tocá <strong>+ Registrar Equipo</strong> o <strong>Sugerir con IA</strong> para arrancar.</p>
            </div>
          )}
          <div className="grid-dashboard">
            {filtered.map(item => {
              const days = daysUntil(item.next_calibration)
              const isExpired = item.status !== 'Fuera de Servicio' && days !== null && days < 0
              const isWarning = item.status !== 'Fuera de Servicio' && days !== null && days >= 0 && days <= 30
              const isOK = !isExpired && !isWarning && item.status !== 'Fuera de Servicio'
              const stripeColor = isExpired ? '#ef4444' : isWarning ? '#f59e0b' : item.status === 'Fuera de Servicio' ? '#6b7280' : '#22c55e'

              return (
                <div key={item.id} className="card" style={{ borderTop: `5px solid ${stripeColor}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ background: 'var(--bg-color)', padding: '0.5rem', borderRadius: '8px', color: 'var(--primary-color)' }}>
                      <Ruler size={24} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      {item.status === 'Fuera de Servicio'
                        ? <span className="badge" style={{ background: '#f3f4f6', color: '#6b7280' }}>FUERA DE SERVICIO</span>
                        : isExpired ? <span className="badge badge-danger">VENCIDO</span>
                        : isWarning ? <span className="badge badge-warning">POR VENCER ({days}d)</span>
                        : <span className="badge badge-success">AL DÍA</span>
                      }
                    </div>
                  </div>

                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem' }}>{item.equipment_name}</h3>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 0, marginBottom: '0.6rem' }}>
                    {item.equipment_type}{item.serial_number ? ` · Serie: ${item.serial_number}` : ''}
                    {item.location && <span> · 📍 {item.location}</span>}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.8rem', background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '0.68rem' }}>ÚLTIMA</span>
                      <strong>{item.last_calibration ? new Date(item.last_calibration).toLocaleDateString() : '—'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '0.68rem' }}>PRÓXIMA</span>
                      <strong style={{ color: isExpired ? '#ef4444' : isWarning ? '#92400e' : 'inherit' }}>
                        {item.next_calibration ? new Date(item.next_calibration).toLocaleDateString() : '—'}
                      </strong>
                    </div>
                  </div>

                  {item.deviation_notes && (
                    <div style={{ marginTop: '0.6rem', padding: '0.5rem 0.65rem', background: '#fef3c7', borderRadius: '6px', fontSize: '0.78rem', color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: '0.35rem' }}>
                      <AlertTriangle size={12} style={{ marginTop: '2px', flexShrink: 0 }} />
                      <span><strong>Desvío registrado:</strong> {item.deviation_notes}</span>
                    </div>
                  )}

                  <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {item.certificate_url ? (
                      <a href={item.certificate_url} target="_blank" rel="noreferrer" className="btn-ghost" style={{ padding: '0.3rem 0.5rem', color: 'var(--primary-color)', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <ExternalLink size={12} /> Certificado
                      </a>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertCircle size={12} /> Sin certificado
                      </span>
                    )}
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button onClick={() => openCalModal(item)} className="btn-ghost" title="Registrar nueva calibración" style={{ padding: '0.3rem' }}>
                        <Calendar size={13} />
                      </button>
                      <button onClick={() => setDetailItem(item)} className="btn-ghost" title="Ver detalle" style={{ padding: '0.3rem' }}>
                        <Eye size={13} />
                      </button>
                      <button onClick={() => handleEdit(item)} className="btn-ghost" title="Editar" style={{ padding: '0.3rem' }}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDelete(item)} className="btn-ghost" title="Eliminar" style={{ padding: '0.3rem', color: '#ef4444' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {filtered.length === 0 && items.length > 0 && (
            <p style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
              No hay equipos con esos filtros.
            </p>
          )}
        </>
      )}

      {/* ===== Modal detalle con histórico ===== */}
      {detailItem && createPortal((
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{
            background: 'white', maxWidth: '720px', width: '100%', padding: 0,
            maxHeight: '90vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Ruler size={18} /> {detailItem.equipment_name}
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {detailItem.equipment_type} {detailItem.serial_number ? `· ${detailItem.serial_number}` : ''}
                </span>
              </div>
              <button onClick={() => setDetailItem(null)} className="btn-ghost" style={{ padding: '0.25rem' }}><X size={18} /></button>
            </div>
            <div style={{ overflow: 'auto', padding: '1.25rem', display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <DetailRow label="Ubicación" value={detailItem.location} />
                <DetailRow label="Proceso" value={detailItem.used_in_process} />
                <DetailRow label="Responsable" value={detailItem.responsible} />
                <DetailRow label="Estado" value={detailItem.status} />
                <DetailRow label="Rango" value={detailItem.measurement_range} />
                <DetailRow label="Tolerancia" value={detailItem.tolerance} />
                <DetailRow label="Última calibración" value={detailItem.last_calibration} />
                <DetailRow label="Próxima calibración" value={detailItem.next_calibration} />
                <DetailRow label="Frecuencia" value={detailItem.calibration_frequency_months ? `${detailItem.calibration_frequency_months} meses` : null} />
                <DetailRow label="Laboratorio" value={detailItem.calibration_lab} />
                <DetailRow label="Nº certificado" value={detailItem.certificate_number} />
                <DetailRow label="Patrón de referencia" value={detailItem.traceability_pattern} />
              </div>
              {detailItem.certificate_url && (
                <a href={detailItem.certificate_url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}>
                  <ExternalLink size={14} /> Ver certificado
                </a>
              )}
              {detailItem.deviation_notes && (
                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', padding: '0.75rem', borderRadius: '8px' }}>
                  <strong style={{ fontSize: '0.75rem', color: '#92400e' }}>DESVIACIONES Y ACCIONES</strong>
                  <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.88rem', color: '#713f12' }}>{detailItem.deviation_notes}</p>
                </div>
              )}

              {/* Histórico de calibraciones */}
              <div>
                <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <History size={14} /> Histórico de calibraciones
                </h5>
                {(historyByEquip[detailItem.id]?.length || 0) === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    Sin calibraciones previas registradas todavía.
                  </p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Fecha</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Resultado</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Laboratorio</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Certificado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyByEquip[detailItem.id].map(h => (
                        <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.5rem' }}>{h.calibration_date}</td>
                          <td style={{ padding: '0.5rem' }}>
                            <span style={{
                              fontSize: '0.72rem', padding: '0.1rem 0.4rem', borderRadius: '999px',
                              background: h.result === 'Conforme' ? '#dcfce7' : h.result === 'Con desviación' ? '#fef3c7' : '#fee2e2',
                              color: h.result === 'Conforme' ? '#166534' : h.result === 'Con desviación' ? '#92400e' : '#991b1b'
                            }}>{h.result}</span>
                          </td>
                          <td style={{ padding: '0.5rem', color: '#64748b' }}>{h.calibration_lab || '—'}</td>
                          <td style={{ padding: '0.5rem' }}>
                            {h.certificate_url ? (
                              <a href={h.certificate_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)' }}>
                                <ExternalLink size={12} /> {h.certificate_number || 'link'}
                              </a>
                            ) : (h.certificate_number || '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => handleDelete(detailItem)} className="btn btn-ghost" style={{ color: '#ef4444' }}>
                <Trash2 size={14} /> Eliminar
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => { setDetailItem(null); openCalModal(detailItem) }} className="btn btn-ghost">
                  <Calendar size={14} /> Registrar calibración
                </button>
                <button onClick={() => handleEdit(detailItem)} className="btn btn-primary">
                  <Pencil size={14} /> Editar
                </button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ===== Modal nueva calibración ===== */}
      {calForEquip && createPortal((
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{
            background: 'white', maxWidth: '560px', width: '100%', padding: 0,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={18} /> Registrar calibración
              </h4>
              <button onClick={() => setCalForEquip(null)} className="btn-ghost"><X size={18} /></button>
            </div>
            <div style={{ padding: '1.25rem', display: 'grid', gap: '0.85rem' }}>
              <div style={{ background: '#f8fafc', padding: '0.6rem 0.8rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                <strong>{calForEquip.equipment_name}</strong>
                {calForEquip.serial_number && <span style={{ color: '#64748b' }}> · {calForEquip.serial_number}</span>}
              </div>
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Fecha de calibración</label>
                  <input type="date" className="form-input" value={calForm.calibration_date}
                    onChange={e => setCalForm({
                      ...calForm,
                      calibration_date: e.target.value,
                      next_calibration: addMonths(e.target.value, calForEquip.calibration_frequency_months || 12)
                    })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Próxima calibración</label>
                  <input type="date" className="form-input" value={calForm.next_calibration}
                    onChange={e => setCalForm({ ...calForm, next_calibration: e.target.value })} />
                </div>
              </div>
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Laboratorio</label>
                  <input className="form-input" value={calForm.calibration_lab}
                    onChange={e => setCalForm({ ...calForm, calibration_lab: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Resultado</label>
                  <select className="form-select" value={calForm.result}
                    onChange={e => setCalForm({ ...calForm, result: e.target.value })}>
                    {RESULT_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Nº certificado</label>
                  <input className="form-input" value={calForm.certificate_number}
                    onChange={e => setCalForm({ ...calForm, certificate_number: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">URL certificado</label>
                  <input type="url" className="form-input" value={calForm.certificate_url}
                    onChange={e => setCalForm({ ...calForm, certificate_url: e.target.value })}
                    placeholder="https://drive.google.com/..." />
                </div>
              </div>
              {calForm.result !== 'Conforme' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Desviación detectada</label>
                    <textarea className="form-textarea" rows={2} value={calForm.deviation_notes}
                      onChange={e => setCalForm({ ...calForm, deviation_notes: e.target.value })}
                      placeholder="Qué se midió mal o fuera de tolerancia + impacto en mediciones previas." />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Acciones tomadas</label>
                    <textarea className="form-textarea" rows={2} value={calForm.actions_taken}
                      onChange={e => setCalForm({ ...calForm, actions_taken: e.target.value })}
                      placeholder="Ej: Reverificación de lotes previos, ajuste interno, equipo fuera de servicio..." />
                  </div>
                </>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => setCalForEquip(null)} className="btn btn-ghost" disabled={savingCal}>Cancelar</button>
              <button onClick={handleSaveCalibration} className="btn btn-primary" disabled={savingCal}>
                {savingCal ? <><Loader2 className="animate-spin" size={14} /> Guardando...</> : 'Guardar calibración'}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ===== Modal preview IA ===== */}
      {iaSuggestions && createPortal((
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{
            background: 'white', maxWidth: '880px', width: '100%', padding: 0,
            maxHeight: '90vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={18} style={{ color: '#7c3aed' }} /> Equipos sugeridos por IA
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Revisa los {iaSuggestions.length} equipos. Desmarca los que no apliquen.
                </span>
              </div>
              <button onClick={() => { setIaSuggestions(null); setIaSelected(new Set()) }} className="btn-ghost"><X size={18} /></button>
            </div>
            <div style={{ padding: '0.5rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                <strong>{iaSelected.size}</strong> de {iaSuggestions.length} seleccionados
              </span>
              <button onClick={toggleAllSuggestions} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                {iaSelected.size === iaSuggestions.length ? 'Destildar todos' : 'Tildar todos'}
              </button>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.6rem', width: '40px' }}></th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Equipo</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Tipo</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Rango</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Proceso</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Frec.</th>
                  </tr>
                </thead>
                <tbody>
                  {iaSuggestions.map((it, i) => {
                    const selected = iaSelected.has(i)
                    return (
                      <tr key={i} onClick={() => toggleSuggestion(i)}
                        style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: selected ? '#eef2ff' : 'transparent', opacity: selected ? 1 : 0.55 }}>
                        <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                          <input type="checkbox" checked={selected} onChange={() => toggleSuggestion(i)} onClick={e => e.stopPropagation()} />
                        </td>
                        <td style={{ padding: '0.6rem', fontWeight: 600 }}>{it.equipment_name}</td>
                        <td style={{ padding: '0.6rem' }}>
                          <span style={{ fontSize: '0.72rem', background: '#eef2ff', color: '#3730a3', padding: '0.1rem 0.4rem', borderRadius: '999px' }}>{it.equipment_type}</span>
                        </td>
                        <td style={{ padding: '0.6rem', color: '#64748b' }}>{it.measurement_range}</td>
                        <td style={{ padding: '0.6rem', color: '#64748b' }}>{it.used_in_process}</td>
                        <td style={{ padding: '0.6rem' }}>{it.calibration_frequency_months}m</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                💡 Después agregás fechas, certificados y trazabilidad con el lápiz de cada equipo.
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => { setIaSuggestions(null); setIaSelected(new Set()) }} className="btn btn-ghost" disabled={savingIa}>Cancelar</button>
                <button onClick={handleSaveSuggestions} className="btn btn-primary" disabled={savingIa || !iaSelected.size}>
                  {savingIa ? <><Loader2 className="animate-spin" size={14} /> Guardando...</> : <>Crear {iaSelected.size} equipo{iaSelected.size !== 1 ? 's' : ''}</>}
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
function FormSection({ title, children }) {
  return (
    <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px dashed #e2e8f0' }}>
      <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.88rem', color: '#3730a3' }}>{title}</h4>
      {children}
    </div>
  )
}

function KPI({ label, value, highlight, warn, danger, color }) {
  return (
    <div style={{
      background: highlight ? '#eef2ff' : danger ? '#fee2e2' : warn ? '#fef3c7' : '#f8fafc',
      borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center',
      border: highlight ? '1px solid #c7d2fe' : danger ? '1px solid #fca5a5' : warn ? '1px solid #fde68a' : '1px solid #e2e8f0'
    }}>
      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: danger ? '#991b1b' : warn ? '#92400e' : (color || 'var(--primary-color)') }}>{value}</div>
    </div>
  )
}

function DetailRow({ label, value }) {
  if (!value) return null
  return (
    <div>
      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '0.9rem', color: '#1e293b' }}>{value}</div>
    </div>
  )
}

// ----- Parser tolerante -----
function extractFirstJson(text, openChar, closeChar) {
  if (!text) return null
  const stripped = String(text).replace(/```json/gi, '').replace(/```/g, '')
  const start = stripped.indexOf(openChar)
  if (start === -1) return null
  let depth = 0, inString = false, escape = false
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
function extractAllObjects(text) {
  const stripped = String(text).replace(/```json/gi, '').replace(/```/g, '')
  const objects = []
  let i = 0
  while (i < stripped.length) {
    if (stripped[i] !== '{') { i++; continue }
    let depth = 0, inString = false, escape = false
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
          } catch {}
          i++; closed = true; break
        }
      }
    }
    if (!closed) break
  }
  return objects
}
function parseAiArray(raw) {
  if (!raw) return null
  const arrStr = extractFirstJson(raw, '[', ']')
  if (arrStr) { try { const arr = JSON.parse(arrStr); if (Array.isArray(arr) && arr.length) return arr } catch {} }
  const objStr = extractFirstJson(raw, '{', '}')
  if (objStr) {
    try {
      const obj = JSON.parse(objStr)
      for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key]) && obj[key].length) return obj[key]
      }
    } catch {}
  }
  const all = extractAllObjects(raw)
  if (all.length >= 1) return all
  return null
}
