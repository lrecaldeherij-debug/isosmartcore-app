import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  FileText, Pencil, X, Save, Sparkles, Loader2, History, ShieldCheck, Send,
  AlertTriangle, CheckCircle2, Award, Calendar, ExternalLink, Plus, Trash2,
  ScrollText, MapPin, Network, Ban
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import ModuleSeedBanner from './ModuleSeedBanner'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

// ─────── Constantes ───────
const STATUS_OPTIONS = ['Borrador', 'Aprobada', 'Comunicada', 'Obsoleta']

const STATUS_COLORS = {
  'Borrador':   { bg: '#e0e7ff', color: '#3730a3', border: '#c7d2fe' },
  'Aprobada':   { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
  'Comunicada': { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  'Obsoleta':   { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
}

// Cláusulas ISO 9001 que típicamente se pueden excluir/justificar
const ISO_CLAUSE_OPTIONS = [
  '8.3 Diseño y desarrollo',
  '8.5.3 Propiedad del cliente',
  '8.5.5 Actividades posteriores a la entrega',
  '7.1.5 Calibración',
  '8.4 Procesos externos',
  '7.1.4 Ambiente del proceso',
  '7.1.6 Conocimientos organizacionales',
  '8.5.6 Cambios en producción'
]

const EMPTY_FORM = {
  considerations_41_42: '',
  processes_covered: '',
  products_services: '',
  geographic_location: '',
  exclusions_83_etc: '',
  scope_statement: '',
  status: 'Borrador',
  revision: 'v1.0',
  next_review_date: '',
  approved_by: '', approved_role: '', approved_at: '',
  document_url: '',
  linked_processes_ids: [],
  iso_exclusions: []
}

// ─────── Helpers IA ───────
function extractFirstJson(text) {
  if (!text) return null
  const start = text.indexOf('{') !== -1 ? text.indexOf('{') : text.indexOf('[')
  if (start === -1) return null
  let depth = 0, inStr = false, esc = false
  const open = text[start], close = open === '{' ? '}' : ']'
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === open) depth++
    else if (c === close) { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)) } catch { return null } } }
  }
  return null
}

// ─────── Componente ───────
export default function ScopeDeclaration() {
  const [scope, setScope] = useState(null)
  const [processes, setProcesses] = useState([])
  const [companyProfile, setCompanyProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const [showHistory, setShowHistory] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const [validationResult, setValidationResult] = useState(null)
  const [loadingIA, setLoadingIA] = useState(false)
  const [loadingValidate, setLoadingValidate] = useState(false)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [main, pr, prof] = await Promise.all([
      supabase.from('scope_declaration').select('*').limit(1).maybeSingle(),
      supabase.from('processes').select('id, name, process_type').order('name'),
      supabase.from('company_profile').select('*').limit(1).maybeSingle()
    ])
    if (main.data) {
      setScope(main.data)
      setForm({
        ...EMPTY_FORM,
        ...Object.fromEntries(Object.entries(main.data).map(([k, v]) => [k, v ?? EMPTY_FORM[k] ?? ''])),
        linked_processes_ids: Array.isArray(main.data.linked_processes_ids) ? main.data.linked_processes_ids : [],
        iso_exclusions: Array.isArray(main.data.iso_exclusions) ? main.data.iso_exclusions : []
      })
    } else {
      setScope(null); setForm(EMPTY_FORM)
    }
    setProcesses(pr.data || [])
    setCompanyProfile(prof.data || null)
    setLoading(false)
  }

  // ─────── Toggle proceso vinculado ───────
  const toggleProcess = (id) => {
    const current = form.linked_processes_ids || []
    setForm({
      ...form,
      linked_processes_ids: current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    })
  }

  // ─────── Exclusiones estructuradas ───────
  const addExclusion = () => {
    setForm({ ...form, iso_exclusions: [...form.iso_exclusions, { clause: '', justification: '' }] })
  }
  const updateExclusion = (i, field, value) => {
    const next = [...form.iso_exclusions]
    next[i] = { ...next[i], [field]: value }
    setForm({ ...form, iso_exclusions: next })
  }
  const removeExclusion = (i) => {
    setForm({ ...form, iso_exclusions: form.iso_exclusions.filter((_, idx) => idx !== i) })
  }

  // ─────── IA Redactar declaración ───────
  const redactarConIA = async () => {
    setLoadingIA(true)
    try {
      const ctx = companyProfile
        ? `Empresa: ${companyProfile.company_name || ''} | Sector: ${companyProfile.industry || ''} | Productos: ${companyProfile.main_products || ''}`
        : ''
      const procNames = (form.linked_processes_ids || [])
        .map(id => processes.find(p => p.id === id)?.name).filter(Boolean).join(', ')
      const exclusionesText = (form.iso_exclusions || [])
        .map(e => `- ${e.clause}: ${e.justification}`).join('\n') || 'Ninguna'

      const prompt = `Eres consultor ISO 9001. Redacta la declaración FORMAL del Alcance del SGC según ISO 4.3.

CONTEXTO EMPRESA: ${ctx}

ENTRADAS:
- Consideraciones (4.1/4.2): ${form.considerations_41_42 || 'N/D'}
- Procesos cubiertos: ${procNames || form.processes_covered || 'N/D'}
- Productos/Servicios: ${form.products_services || 'N/D'}
- Ubicación geográfica: ${form.geographic_location || 'N/D'}
- Exclusiones:
${exclusionesText}

Requisitos ISO 4.3:
- Mencionar productos/servicios cubiertos
- Mencionar ubicaciones
- Listar exclusiones con justificación
- Si no hay exclusiones, decir "se aplican todos los requisitos de la norma"

Devuelve SOLO JSON, sin markdown:
{ "scope_statement": "Texto en 1 párrafo profesional, 6-10 líneas" }`
      const raw = await consultarIA(prompt, 'Devuelve únicamente JSON válido.')
      const data = extractFirstJson(raw)
      if (!data?.scope_statement) throw new Error('IA no devolvió declaración')
      setForm({ ...form, scope_statement: data.scope_statement })
    } catch (e) {
      toast.error('Error IA: ' + e.message)
    }
    setLoadingIA(false)
  }

  // ─────── IA Validar exclusiones ───────
  const validarExclusionesIA = async () => {
    if (!form.iso_exclusions?.length) return toast.warning('No hay exclusiones cargadas para validar')
    setLoadingValidate(true); setShowValidation(true); setValidationResult(null)
    try {
      const exclusionesText = form.iso_exclusions.map((e, i) => `${i + 1}. Cláusula: ${e.clause}\n   Justificación: ${e.justification}`).join('\n')
      const ctx = companyProfile ? `Empresa: ${companyProfile.industry || 'N/D'} | Productos: ${companyProfile.main_products || 'N/D'}` : ''

      const prompt = `Eres auditor ISO 9001. Evalúa si estas EXCLUSIONES son defendibles ante un auditor de certificación.

CONTEXTO: ${ctx}

EXCLUSIONES:
${exclusionesText}

REGLAS ISO 4.3:
- Una exclusión es válida solo si NO afecta la capacidad de la organización para entregar productos/servicios conformes
- La justificación debe ser específica y verificable
- 8.3 Diseño se puede excluir solo si la empresa NO diseña (usa diseños del cliente o estándar)
- 7.1.5 Calibración rara vez se excluye salvo en servicios muy específicos

Devuelve SOLO JSON, sin markdown:
{
  "evaluations": [
    { "clause": "...", "valid": true | false, "verdict": "explicación breve", "recommendation": "qué cambiar si no es válida" }
  ],
  "global_assessment": "resumen del cumplimiento ISO 4.3"
}`
      const raw = await consultarIA(prompt, 'Devuelve únicamente JSON válido.')
      const data = extractFirstJson(raw)
      if (!data) throw new Error('IA no devolvió evaluación')
      setValidationResult(data)
    } catch (e) {
      toast.error('Error IA: ' + e.message)
      setShowValidation(false)
    }
    setLoadingValidate(false)
  }

  // ─────── Guardar / Aprobar / Comunicar ───────
  const handleSave = async () => {
    const payload = { ...form }
    ;['next_review_date', 'approved_at'].forEach(k => { if (!payload[k]) payload[k] = null })
    payload.last_reviewed = new Date().toISOString().slice(0, 10)

    const changes = []
    if (scope) {
      Object.keys(payload).forEach(k => {
        if (JSON.stringify(scope[k] ?? '') !== JSON.stringify(payload[k] ?? '')) {
          changes.push({ field: k, from: scope[k] ?? null, to: payload[k] ?? null })
        }
      })
    } else {
      changes.push({ field: 'created', from: null, to: 'alcance inicial' })
    }
    payload.change_log = [...(scope?.change_log || []), { at: new Date().toISOString(), changes }]

    const { error } = scope
      ? await supabase.from('scope_declaration').update(payload).eq('id', scope.id)
      : await supabase.from('scope_declaration').insert([payload])
    if (error) return toast.error(error.message)
    setEditing(false); fetchAll()
  }

  const handleAprobar = async () => {
    if (!scope) return toast.warning('Guarda primero el alcance')
    const aprobador = window.prompt('Nombre de quien aprueba:', scope.approved_by || '')
    if (!aprobador) return
    const rol = window.prompt('Cargo:', scope.approved_role || 'Director General') || 'Director General'
    const updates = {
      status: 'Aprobada',
      approved_by: aprobador, approved_role: rol,
      approved_at: new Date().toISOString().slice(0, 10),
      change_log: [...(scope.change_log || []), { at: new Date().toISOString(), changes: [{ field: 'status', from: scope.status, to: 'Aprobada' }, { field: 'approved_by', from: scope.approved_by, to: aprobador }] }]
    }
    const { error } = await supabase.from('scope_declaration').update(updates).eq('id', scope.id)
    if (error) return toast.error(error.message)
    fetchAll()
  }

  const handleMarcarComunicada = async () => {
    if (!scope) return
    const updates = {
      status: 'Comunicada',
      change_log: [...(scope.change_log || []), { at: new Date().toISOString(), changes: [{ field: 'status', from: scope.status, to: 'Comunicada' }] }]
    }
    const { error } = await supabase.from('scope_declaration').update(updates).eq('id', scope.id)
    if (error) return toast.error(error.message)
    fetchAll()
  }

  const today = new Date().toISOString().slice(0, 10)
  const reviewVencida = scope?.next_review_date && scope.next_review_date < today
  const st = STATUS_COLORS[scope?.status] || STATUS_COLORS['Borrador']

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1f2937', margin: 0 }}>
            <ScrollText size={22} /> Alcance del SGC
          </h2>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: 13 }}>ISO 4.3 — Determinación de límites y exclusiones</p>
        </div>
        {scope && !editing && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {scope.status === 'Borrador' && (
              <button onClick={handleAprobar} style={{ padding: '8px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                <ShieldCheck size={16} /> Aprobar
              </button>
            )}
            {scope.status === 'Aprobada' && (
              <button onClick={handleMarcarComunicada} style={{ padding: '8px 14px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                <Send size={16} /> Marcar Comunicada
              </button>
            )}
            <button onClick={() => setShowHistory(true)} style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <History size={16} /> Histórico
            </button>
            <button onClick={() => setEditing(true)} style={{ padding: '8px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <Pencil size={16} /> Editar
            </button>
          </div>
        )}
        {!scope && !editing && (
          <button onClick={() => setEditing(true)} style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            + Iniciar declaración
          </button>
        )}
      </div>

      <IsoInfoCard
        clause="4.3"
        title="Determinación del alcance del SGC"
        tips={[
          "Define qué productos/servicios cubre el SGC y qué ubicaciones físicas aplica.",
          "Considera el contexto (4.1) y los requisitos de las partes interesadas (4.2).",
          "Si excluyes alguna cláusula (típicamente 8.3), justifica por qué — usa la IA para validar.",
          "El alcance debe estar disponible como información documentada accesible."
        ]}
      />
      <ModuleSeedBanner moduleKey="scope" label="alcance del SGC" visible={!loading && !scope && !editing} onSeeded={fetchAll} />

      {/* Banners estado */}
      {scope && !editing && (
        <div style={{ marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ padding: '10px 16px', background: st.bg, color: st.color, border: `1px solid ${st.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
            <Award size={16} /> {scope.status} · {scope.revision}
          </div>
          {scope.approved_at && (
            <div style={{ padding: '10px 16px', background: '#dcfce7', color: '#166534', borderRadius: 10, fontSize: 12 }}>
              <CheckCircle2 size={14} style={{ verticalAlign: 'middle' }} /> Aprobada el {scope.approved_at} por <strong>{scope.approved_by}</strong> ({scope.approved_role})
            </div>
          )}
          {reviewVencida && (
            <div style={{ padding: '10px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: 10, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} /> <strong>Revisión vencida</strong> ({scope.next_review_date})
            </div>
          )}
        </div>
      )}

      {/* DECLARACIÓN OFICIAL (lectura) */}
      {scope && !editing && (
        <div style={{ marginTop: 16, padding: 30, background: 'white', border: '2px solid #0ea5e9', borderRadius: 14 }}>
          <div style={{ fontSize: 11, color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>Declaración Oficial del Alcance</div>
          <p style={{ fontSize: 16, color: '#1e40af', fontWeight: 500, lineHeight: 1.7, margin: 0, fontStyle: 'italic', textAlign: 'center' }}>
            {scope.scope_statement || '— Sin declaración aún —'}
          </p>
          {scope.document_url && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <a href={scope.document_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#0ea5e9', fontSize: 13, fontWeight: 600 }}>
                <FileText size={14} /> Ver documento firmado <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Matriz 4 columnas (lectura) */}
      {scope && !editing && (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <Block icon={Network} color="#0ea5e9" label="A. Consideraciones (4.1/4.2)" value={scope.considerations_41_42} />
          <Block icon={Network} color="#16a34a" label="B. Procesos cubiertos" value={
            scope.linked_processes_ids?.length
              ? scope.linked_processes_ids.map(id => processes.find(p => p.id === id)?.name).filter(Boolean).join(', ')
              : scope.processes_covered
          } />
          <Block icon={FileText} color="#16a34a" label="Productos/Servicios" value={scope.products_services} />
          <Block icon={MapPin} color="#f59e0b" label="C. Ubicación geográfica" value={scope.geographic_location} />
          <div style={{ gridColumn: '1 / -1', padding: 14, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: '#991b1b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Ban size={12} /> D. Exclusiones ISO con justificación
            </div>
            {(!scope.iso_exclusions?.length && !scope.exclusions_83_etc) && (
              <div style={{ fontSize: 13, color: '#991b1b' }}>Sin exclusiones — se aplican todos los requisitos.</div>
            )}
            {scope.iso_exclusions?.length > 0 && (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', color: '#991b1b' }}><th style={{ padding: 4 }}>Cláusula</th><th style={{ padding: 4 }}>Justificación</th></tr></thead>
                <tbody>
                  {scope.iso_exclusions.map((e, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #fecaca' }}>
                      <td style={{ padding: 4, fontWeight: 600 }}>{e.clause}</td>
                      <td style={{ padding: 4 }}>{e.justification}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!scope.iso_exclusions?.length && scope.exclusions_83_etc && (
              <div style={{ fontSize: 13, color: '#991b1b' }}>{scope.exclusions_83_etc}</div>
            )}
          </div>
        </div>
      )}

      {/* FORM */}
      {editing && (
        <div style={{ marginTop: 16, padding: 24, background: 'white', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid #f1f5f9' }}>
            <h3 style={{ margin: 0, color: '#1f2937' }}>{scope ? 'Editar' : 'Nuevo'} alcance</h3>
            <button onClick={() => setEditing(false)} style={{ padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
          </div>

          <FormSection title="A. Consideraciones (4.1 / 4.2)">
            <TextArea rows={3} value={form.considerations_41_42} onChange={v => setForm({ ...form, considerations_41_42: v })}
              placeholder="Qué factores del contexto y qué requisitos de partes interesadas considerás" />
          </FormSection>

          <FormSection title="B. Procesos cubiertos">
            {processes.length > 0 ? (
              <>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Selecciona los procesos del SGC cubiertos:</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 6, maxHeight: 200, overflowY: 'auto', padding: 8, background: '#f9fafb', borderRadius: 8 }}>
                  {processes.map(p => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: 4, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.linked_processes_ids.includes(p.id)} onChange={() => toggleProcess(p.id)} />
                      <span>{p.name} <span style={{ color: '#94a3b8', fontSize: 10 }}>({p.process_type})</span></span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <TextArea rows={2} label="Procesos cubiertos (texto)" value={form.processes_covered} onChange={v => setForm({ ...form, processes_covered: v })} />
            )}
          </FormSection>

          <FormSection title="Productos y servicios">
            <TextArea rows={2} value={form.products_services} onChange={v => setForm({ ...form, products_services: v })} />
          </FormSection>

          <FormSection title="C. Ubicación geográfica">
            <TextArea rows={2} value={form.geographic_location} onChange={v => setForm({ ...form, geographic_location: v })} placeholder="Sucursales, plantas, oficinas" />
          </FormSection>

          <FormSection title="D. Exclusiones ISO" accent="#dc2626">
            <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#991b1b', marginBottom: 10 }}>
              💡 ISO 4.3 exige justificar cada cláusula que excluyes. Usa el botón <strong>"Validar exclusiones con IA"</strong> antes de aprobar.
            </div>
            {form.iso_exclusions.map((ex, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 6, marginBottom: 6, alignItems: 'flex-start' }}>
                <select value={ex.clause} onChange={e => updateExclusion(i, 'clause', e.target.value)}
                  style={{ padding: 8, border: '1px solid #fecaca', borderRadius: 6, fontSize: 12 }}>
                  <option value="">— cláusula —</option>
                  {ISO_CLAUSE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <textarea value={ex.justification} onChange={e => updateExclusion(i, 'justification', e.target.value)}
                  rows={2} placeholder="Justificación por qué no aplica a la organización"
                  style={{ padding: 8, border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }} />
                <button type="button" onClick={() => removeExclusion(i)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={addExclusion}
                style={{ padding: '6px 12px', background: 'white', border: '1px dashed #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={12} /> Agregar exclusión
              </button>
              {form.iso_exclusions.length > 0 && (
                <button type="button" onClick={validarExclusionesIA} disabled={loadingValidate}
                  style={{ padding: '6px 12px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {loadingValidate ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  Validar exclusiones con IA
                </button>
              )}
            </div>
          </FormSection>

          <FormSection title="Declaración oficial" accent="#0ea5e9">
            <button type="button" onClick={redactarConIA} disabled={loadingIA}
              style={{ marginBottom: 8, padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              {loadingIA ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Redactar declaración con IA
            </button>
            <textarea value={form.scope_statement} onChange={e => setForm({ ...form, scope_statement: e.target.value })}
              rows={6} placeholder="Declaración final del alcance..."
              style={{ width: '100%', padding: 14, border: '2px solid #0ea5e9', borderRadius: 10, fontSize: 14, lineHeight: 1.6, color: '#1e40af', fontWeight: 500, fontFamily: 'inherit' }} />
          </FormSection>

          <FormSection title="Workflow y aprobación">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <SelectField label="Estado" value={form.status} options={STATUS_OPTIONS} onChange={v => setForm({ ...form, status: v })} />
              <Field label="Revisión" value={form.revision} onChange={v => setForm({ ...form, revision: v })} placeholder="v1.0" />
              <Field label="Próxima revisión" type="date" value={form.next_review_date} onChange={v => setForm({ ...form, next_review_date: v })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
              <Field label="Aprobada por" value={form.approved_by} onChange={v => setForm({ ...form, approved_by: v })} />
              <Field label="Cargo" value={form.approved_role} onChange={v => setForm({ ...form, approved_role: v })} />
              <Field label="Fecha aprobación" type="date" value={form.approved_at} onChange={v => setForm({ ...form, approved_at: v })} />
            </div>
            <div style={{ marginTop: 10 }}>
              <Field label="Documento firmado (Drive)" value={form.document_url} onChange={v => setForm({ ...form, document_url: v })} placeholder="https://drive.google.com/..." />
            </div>
          </FormSection>

          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setEditing(false)} style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
            <button onClick={handleSave} style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Save size={16} /> Guardar
            </button>
          </div>
        </div>
      )}

      {/* MODAL HISTORIA */}
      {showHistory && createPortal(
        <ModalShell onClose={() => setShowHistory(false)} title="Histórico de cambios" wide>
          {(!scope?.change_log || scope.change_log.length === 0) && <p style={{ fontSize: 13, color: '#9ca3af' }}>Sin cambios registrados.</p>}
          {scope?.change_log?.slice().reverse().map((entry, i) => (
            <div key={i} style={{ marginBottom: 14, padding: 12, background: '#f9fafb', borderLeft: '3px solid #0ea5e9', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}><Calendar size={11} style={{ verticalAlign: 'middle' }} /> {new Date(entry.at).toLocaleString()}</div>
              {entry.changes?.map((c, j) => (
                <div key={j} style={{ fontSize: 12, padding: '3px 0', color: '#374151' }}>
                  <strong>{c.field}</strong>: <span style={{ color: '#dc2626' }}>{String(c.from || '—').slice(0, 80)}</span> → <span style={{ color: '#16a34a' }}>{String(c.to || '—').slice(0, 80)}</span>
                </div>
              ))}
            </div>
          ))}
        </ModalShell>,
        document.body
      )}

      {/* MODAL VALIDACIÓN EXCLUSIONES IA */}
      {showValidation && createPortal(
        <ModalShell onClose={() => setShowValidation(false)} title="Validación de exclusiones (IA auditor)" wide>
          {loadingValidate && <div style={{ textAlign: 'center', padding: 30 }}><Loader2 size={32} className="animate-spin" /> Validando...</div>}
          {validationResult && (
            <div>
              <div style={{ padding: 14, borderRadius: 10, background: '#f0f9ff', border: '1px solid #bae6fd', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0c4a6e', marginBottom: 4 }}>EVALUACIÓN GLOBAL:</div>
                <div style={{ fontSize: 13, color: '#0c4a6e' }}>{validationResult.global_assessment}</div>
              </div>
              {validationResult.evaluations?.map((e, i) => (
                <div key={i} style={{ marginBottom: 10, padding: 12, background: e.valid ? '#f0fdf4' : '#fef2f2', border: `1px solid ${e.valid ? '#bbf7d0' : '#fecaca'}`, borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <strong style={{ fontSize: 13 }}>{e.clause}</strong>
                    <span style={{ padding: '2px 8px', borderRadius: 10, background: e.valid ? '#16a34a' : '#dc2626', color: 'white', fontSize: 11, fontWeight: 700 }}>
                      {e.valid ? '✓ VÁLIDA' : '✗ DEFENSA DÉBIL'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}><strong>Veredicto:</strong> {e.verdict}</div>
                  {!e.valid && e.recommendation && (
                    <div style={{ fontSize: 12, color: '#991b1b' }}><strong>💡 Recomendación:</strong> {e.recommendation}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ModalShell>,
        document.body
      )}
    </div>
  )
}

// ─────── Helpers UI ───────
function Block({ icon: Icon, color, label, value }) {
  return (
    <div style={{ padding: 14, background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, color, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Icon size={12} /> {label}
      </div>
      <div style={{ fontSize: 13, color: '#111827' }}>{value || <span style={{ color: '#9ca3af' }}>—</span>}</div>
    </div>
  )
}

function FormSection({ title, children, accent }) {
  return (
    <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px dashed #e5e7eb' }}>
      <h4 style={{ margin: '0 0 10px 0', color: accent || '#1f2937', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</h4>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required = false, placeholder = '' }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
      <input type={type} value={value ?? ''} required={required} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
    </div>
  )
}

function TextArea({ label, value, onChange, rows = 3, placeholder = '' }) {
  return (
    <div>
      {label && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>}
      <textarea value={value ?? ''} rows={rows} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
    </div>
  )
}

function SelectField({ label, value, options, onChange }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: 'white' }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function ModalShell({ title, onClose, children, wide = false }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)',
      backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 14, maxWidth: wide ? 720 : 560, width: '100%',
          maxHeight: '92vh', overflowY: 'auto', padding: 24, position: 'relative',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: '#111827' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
