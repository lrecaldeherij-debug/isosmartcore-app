import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  Sparkles, Loader2, Save, FileText, X, Pencil, ShieldCheck, Send,
  History, AlertTriangle, Award, Calendar, Target, ExternalLink, CheckCircle2
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import ModuleSeedBanner from './ModuleSeedBanner'
import DocumentImporter from './DocumentImporter'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

// ─────── Constantes ───────
const STATUS_OPTIONS = ['Borrador', 'Aprobada', 'Comunicada', 'Obsoleta']
const COMM_METHODS = ['Email masivo', 'Mural / Cartelera', 'Intranet', 'Reunión / Asamblea', 'Capacitación', 'Inducción nuevo personal', 'Otro']

const STATUS_COLORS = {
  'Borrador':   { bg: '#e0e7ff', color: '#3730a3', border: '#c7d2fe' },
  'Aprobada':   { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
  'Comunicada': { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  'Obsoleta':   { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
}

const EMPTY_FORM = {
  what_we_do: '', who_is_customer: '', value_proposition: '', commitments: '',
  final_policy_statement: '',
  status: 'Borrador', revision: 'v1.0',
  next_review_date: '',
  approved_by: '', approved_role: '', approved_at: '',
  alignment_with_objectives: '',
  document_url: ''
}

const EMPTY_COMM = {
  communicated_at: new Date().toISOString().slice(0, 10),
  communication_method: 'Email masivo',
  communication_audience: '',
  communication_evidence_url: ''
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
export default function QualityPolicy() {
  const [policy, setPolicy] = useState(null)
  const [objectives, setObjectives] = useState([])
  const [companyProfile, setCompanyProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const [showCommModal, setShowCommModal] = useState(false)
  const [commForm, setCommForm] = useState(EMPTY_COMM)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showAlignModal, setShowAlignModal] = useState(false)
  const [alignResult, setAlignResult] = useState(null)

  const [loadingIA, setLoadingIA] = useState(false)
  const [loadingAlign, setLoadingAlign] = useState(false)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const { data } = await supabase.from('quality_policy').select('*').limit(1).maybeSingle()
    if (data) {
      setPolicy(data)
      setForm({ ...EMPTY_FORM, ...Object.fromEntries(Object.keys(EMPTY_FORM).map(k => [k, data[k] ?? EMPTY_FORM[k]])) })
    } else {
      setPolicy(null); setForm(EMPTY_FORM)
    }

    const { data: objs } = await supabase.from('quality_objectives').select('id, objective, target_value, current_value').limit(50)
    setObjectives(objs || [])

    const { data: profile } = await supabase.from('company_profile').select('*').limit(1).maybeSingle()
    setCompanyProfile(profile || null)

    setLoading(false)
  }

  // ─────── IA: Redactar política contextualizada ───────
  const redactarPoliticaIA = async () => {
    if (!form.what_we_do || !form.who_is_customer) {
      return toast.warning('Completá al menos qué hace la empresa y a quién sirve')
    }
    setLoadingIA(true)
    try {
      const ctx = companyProfile
        ? `Sector: ${companyProfile.industry || 'N/D'} | Tamaño: ${companyProfile.size || 'N/D'} | Productos: ${companyProfile.main_products || 'N/D'} | Propósito: ${companyProfile.purpose || 'N/D'}`
        : 'Sin perfil de empresa cargado.'

      const prompt = `Sos consultor ISO 9001 experto en políticas de calidad. Redactá la Política de Calidad formal.

CONTEXTO EMPRESA: ${ctx}

DATOS APORTADOS:
- Actividad: ${form.what_we_do}
- Cliente: ${form.who_is_customer}
- Propuesta de valor: ${form.value_proposition || 'N/D'}
- Compromisos adicionales: ${form.commitments || 'N/D'}

REQUISITOS ISO 5.2.1 (TODOS DEBEN ESTAR EN LA POLÍTICA):
1. Apropiada al propósito y contexto
2. Marco de referencia para objetivos de calidad
3. Compromiso de cumplir requisitos aplicables (legales y del cliente)
4. Compromiso con la mejora continua del SGC

Devolvé SOLO JSON, sin markdown:
{ "politica_redactada": "Texto completo en 1 párrafo de 6-10 líneas, profesional, en primera persona plural" }`
      const raw = await consultarIA(prompt, 'Devolvé únicamente JSON válido.')
      const data = extractFirstJson(raw)
      if (!data?.politica_redactada) throw new Error('IA no devolvió política')
      setForm({ ...form, final_policy_statement: data.politica_redactada })
    } catch (e) {
      toast.error('Error IA: ' + e.message)
    }
    setLoadingIA(false)
  }

  // ─────── IA: Verificar alineación con objetivos ───────
  const verificarAlineacionIA = async () => {
    if (!form.final_policy_statement) return toast.warning('Definí primero la declaración de política')
    if (!objectives.length) return toast.warning('No hay objetivos de calidad cargados para verificar alineación')
    setLoadingAlign(true); setAlignResult(null); setShowAlignModal(true)
    try {
      const prompt = `Sos auditor ISO 9001. Verificá si la siguiente Política de Calidad sirve como MARCO DE REFERENCIA para los objetivos cargados (requisito ISO 5.2.1.b).

POLÍTICA:
"${form.final_policy_statement}"

OBJETIVOS DE CALIDAD:
${objectives.map((o, i) => `${i + 1}. ${o.objective} (meta: ${o.target_value || 'N/D'})`).join('\n')}

Devolvé SOLO JSON, sin markdown:
{
  "alineacion_global": "Alta" | "Media" | "Baja",
  "veredicto": "explicación breve",
  "objetivos_alineados": [<indices alineados>],
  "objetivos_no_alineados": [<indices no alineados>],
  "sugerencias": ["sugerencia para mejorar la política o reformular objetivos"]
}`
      const raw = await consultarIA(prompt, 'Devolvé únicamente JSON válido.')
      const data = extractFirstJson(raw)
      if (!data) throw new Error('IA no devolvió análisis')
      setAlignResult(data)
    } catch (e) {
      toast.error('Error IA: ' + e.message)
      setShowAlignModal(false)
    }
    setLoadingAlign(false)
  }

  // ─────── Guardar política ───────
  const handleSave = async () => {
    const payload = { ...form }
    ;['next_review_date', 'approved_at'].forEach(k => { if (!payload[k]) payload[k] = null })
    payload.last_reviewed = new Date().toISOString().slice(0, 10)

    // change_log
    const changes = []
    if (policy) {
      Object.keys(payload).forEach(k => {
        if (JSON.stringify(policy[k] ?? '') !== JSON.stringify(payload[k] ?? '')) {
          changes.push({ field: k, from: policy[k] ?? null, to: payload[k] ?? null })
        }
      })
    } else {
      changes.push({ field: 'created', from: null, to: 'política inicial' })
    }
    payload.change_log = [...(policy?.change_log || []), { at: new Date().toISOString(), changes }]

    const { error } = policy
      ? await supabase.from('quality_policy').update(payload).eq('id', policy.id)
      : await supabase.from('quality_policy').insert([payload])
    if (error) return toast.error(error.message)
    setEditing(false); fetchAll()
  }

  const handleAprobar = async () => {
    if (!policy) return toast.warning('Guardá primero la política')
    const aprobador = window.prompt('Nombre de quien aprueba (Alta Dirección):', policy.approved_by || '')
    if (!aprobador) return
    const rol = window.prompt('Cargo:', policy.approved_role || 'Director General') || 'Director General'
    const updates = {
      status: 'Aprobada',
      approved_by: aprobador,
      approved_role: rol,
      approved_at: new Date().toISOString().slice(0, 10),
      change_log: [...(policy.change_log || []), { at: new Date().toISOString(), changes: [{ field: 'status', from: policy.status, to: 'Aprobada' }, { field: 'approved_by', from: policy.approved_by, to: aprobador }] }]
    }
    const { error } = await supabase.from('quality_policy').update(updates).eq('id', policy.id)
    if (error) return toast.error(error.message)
    fetchAll()
  }

  // ─────── Comunicación ───────
  const registrarComunicacion = async (e) => {
    e.preventDefault()
    if (!policy) return toast.warning('Aprobá la política primero')
    const updates = {
      ...commForm,
      status: 'Comunicada',
      change_log: [...(policy.change_log || []), {
        at: new Date().toISOString(),
        changes: [
          { field: 'status', from: policy.status, to: 'Comunicada' },
          { field: 'communicated_at', from: policy.communicated_at, to: commForm.communicated_at },
          { field: 'communication_method', from: policy.communication_method, to: commForm.communication_method }
        ]
      }]
    }
    const { error } = await supabase.from('quality_policy').update(updates).eq('id', policy.id)
    if (error) return toast.error(error.message)
    setShowCommModal(false); setCommForm(EMPTY_COMM); fetchAll()
  }

  const today = new Date().toISOString().slice(0, 10)
  const reviewVencida = policy?.next_review_date && policy.next_review_date < today
  const st = STATUS_COLORS[policy?.status] || STATUS_COLORS['Borrador']

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1f2937', margin: 0 }}>
            <FileText size={22} /> Política de Calidad
          </h2>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: 13 }}>ISO 5.2 — Compromiso de la Alta Dirección</p>
        </div>
        {!editing && policy && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {policy.status === 'Borrador' && (
              <button onClick={handleAprobar}
                style={{ padding: '8px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                <ShieldCheck size={16} /> Aprobar
              </button>
            )}
            {policy.status === 'Aprobada' && (
              <button onClick={() => setShowCommModal(true)}
                style={{ padding: '8px 14px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                <Send size={16} /> Registrar comunicación
              </button>
            )}
            <button onClick={() => setShowHistoryModal(true)}
              style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <History size={16} /> Histórico
            </button>
            <button onClick={() => setEditing(true)}
              style={{ padding: '8px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <Pencil size={16} /> Editar
            </button>
          </div>
        )}
        {!editing && !policy && (
          <div style={{ display: 'flex', gap: 8 }}>
            <DocumentImporter
              targetModule="policy" label="política de calidad"
              onImported={async (data) => {
                const payload = {
                  what_we_do: data.what_we_do || '', who_is_customer: data.who_is_customer || '',
                  value_proposition: data.value_proposition || '', commitments: data.commitments || '',
                  final_policy_statement: data.final_policy_statement || '', status: 'Borrador'
                }
                const { error } = await supabase.from('quality_policy').insert([payload])
                if (error) throw new Error(error.message)
                await fetchAll()
              }}
              renderPreview={(data, setData) => (
                <div style={{ display: 'grid', gap: 10 }}>
                  {[
                    ['what_we_do', 'A. ¿Qué hacemos?'],
                    ['who_is_customer', 'B. ¿A quién servimos?'],
                    ['value_proposition', 'C. Propuesta de valor'],
                    ['commitments', 'D. Compromisos'],
                    ['final_policy_statement', 'E. Declaración final']
                  ].map(([k, label]) => (
                    <div key={k}>
                      <label style={{ fontWeight: 600, fontSize: 12 }}>{label}</label>
                      <textarea value={data[k] || ''} onChange={e => setData({ ...data, [k]: e.target.value })}
                        style={{ width: '100%', minHeight: k === 'final_policy_statement' ? 100 : 60, padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
                    </div>
                  ))}
                </div>
              )}
            />
            <button onClick={() => setEditing(true)}
              style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              + Crear política
            </button>
          </div>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['5.2']} />
      <ModuleSeedBanner moduleKey="policy" label="política de calidad" visible={!loading && !policy && !editing} onSeeded={fetchAll} />

      {/* Banner estado + alertas */}
      {policy && !editing && (
        <div style={{ marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ padding: '10px 16px', background: st.bg, color: st.color, border: `1px solid ${st.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
            <Award size={16} /> {policy.status} · {policy.revision}
          </div>
          {policy.approved_at && (
            <div style={{ padding: '10px 16px', background: '#dcfce7', color: '#166534', borderRadius: 10, fontSize: 12 }}>
              <CheckCircle2 size={14} style={{ verticalAlign: 'middle' }} /> Aprobada el {policy.approved_at} por <strong>{policy.approved_by}</strong> ({policy.approved_role})
            </div>
          )}
          {policy.communicated_at && (
            <div style={{ padding: '10px 16px', background: '#dbeafe', color: '#1e40af', borderRadius: 10, fontSize: 12 }}>
              <Send size={14} style={{ verticalAlign: 'middle' }} /> Comunicada el {policy.communicated_at} vía <strong>{policy.communication_method}</strong>
            </div>
          )}
          {reviewVencida && (
            <div style={{ padding: '10px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: 10, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} /> <strong>Revisión vencida</strong> ({policy.next_review_date}) — actualizá la política
            </div>
          )}
        </div>
      )}

      {/* DECLARACIÓN OFICIAL (vista lectura) */}
      {policy && !editing && (
        <div style={{ marginTop: 16, padding: 30, background: 'white', border: '2px solid #0ea5e9', borderRadius: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700, marginBottom: 16 }}>Declaración Oficial</div>
          <p style={{ fontSize: 17, color: '#1e40af', fontWeight: 500, lineHeight: 1.7, margin: 0, fontStyle: 'italic' }}>
            {policy.final_policy_statement || '— Sin declaración. Editá para redactarla. —'}
          </p>
          {policy.document_url && (
            <a href={policy.document_url} target="_blank" rel="noreferrer" style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 6, color: '#0ea5e9', fontSize: 13, fontWeight: 600 }}>
              <FileText size={14} /> Ver documento oficial firmado <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {/* Building blocks + alineación (vista lectura) */}
      {policy && !editing && (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Block label="A. ¿Qué hacemos?" value={policy.what_we_do} />
          <Block label="B. ¿A quién servimos?" value={policy.who_is_customer} />
          <Block label="C. Propuesta de valor" value={policy.value_proposition} />
          <Block label="D. Compromisos" value={policy.commitments} />
          {policy.alignment_with_objectives && (
            <div style={{ gridColumn: '1 / -1', padding: 14, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: '#0c4a6e', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>
                <Target size={12} style={{ verticalAlign: 'middle' }} /> Alineación con objetivos (ISO 5.2.1.b)
              </div>
              <div style={{ fontSize: 13, color: '#0c4a6e' }}>{policy.alignment_with_objectives}</div>
            </div>
          )}
        </div>
      )}

      {/* FORM */}
      {editing && (
        <div style={{ marginTop: 16, padding: 24, background: 'white', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '2px solid #f1f5f9' }}>
            <h3 style={{ margin: 0, color: '#1f2937' }}>{policy ? 'Editar política' : 'Nueva política'}</h3>
            <button onClick={() => setEditing(false)} style={{ padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
              <X size={20} />
            </button>
          </div>

          <FormSection title="Building blocks (contexto)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <TextArea label="A. ¿Qué hacemos?" rows={3} value={form.what_we_do} onChange={v => setForm({ ...form, what_we_do: v })} placeholder="Ej: Fabricamos repuestos industriales de alta precisión..." />
              <TextArea label="B. ¿A quién servimos?" rows={3} value={form.who_is_customer} onChange={v => setForm({ ...form, who_is_customer: v })} placeholder="Ej: Industria petrolera y minera..." />
              <TextArea label="C. Propuesta de valor" rows={3} value={form.value_proposition} onChange={v => setForm({ ...form, value_proposition: v })} />
              <TextArea label="D. Compromisos (legales, mejora)" rows={3} value={form.commitments} onChange={v => setForm({ ...form, commitments: v })} />
            </div>
          </FormSection>

          <FormSection title="Declaración oficial" accent="#0ea5e9">
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button type="button" onClick={redactarPoliticaIA} disabled={loadingIA}
                style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {loadingIA ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Redactar con IA (usa perfil empresa)
              </button>
              <button type="button" onClick={verificarAlineacionIA} disabled={loadingAlign || !form.final_policy_statement}
                style={{ padding: '8px 14px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: !form.final_policy_statement ? 0.5 : 1 }}>
                {loadingAlign ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />}
                Verificar alineación con objetivos
              </button>
            </div>
            <textarea value={form.final_policy_statement} onChange={e => setForm({ ...form, final_policy_statement: e.target.value })}
              rows={6} placeholder="La política aparecerá aquí..."
              style={{ width: '100%', padding: 14, border: '2px solid #0ea5e9', borderRadius: 10, fontSize: 15, lineHeight: 1.6, color: '#1e40af', fontWeight: 500, fontFamily: 'inherit' }} />
          </FormSection>

          <FormSection title="Workflow y revisión">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <SelectField label="Estado" value={form.status} options={STATUS_OPTIONS} onChange={v => setForm({ ...form, status: v })} />
              <Field label="Revisión" value={form.revision} onChange={v => setForm({ ...form, revision: v })} placeholder="v1.0" />
              <Field label="Próxima revisión" type="date" value={form.next_review_date} onChange={v => setForm({ ...form, next_review_date: v })} />
            </div>
          </FormSection>

          <FormSection title="Aprobación formal">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <Field label="Aprobada por" value={form.approved_by} onChange={v => setForm({ ...form, approved_by: v })} placeholder="Nombre" />
              <Field label="Cargo" value={form.approved_role} onChange={v => setForm({ ...form, approved_role: v })} placeholder="Director General" />
              <Field label="Fecha aprobación" type="date" value={form.approved_at} onChange={v => setForm({ ...form, approved_at: v })} />
            </div>
          </FormSection>

          <FormSection title="Alineación con objetivos (ISO 5.2.1.b)">
            <TextArea rows={3} value={form.alignment_with_objectives} onChange={v => setForm({ ...form, alignment_with_objectives: v })}
              placeholder="Explicá cómo la política sirve de marco para los objetivos de calidad cargados." />
          </FormSection>

          <FormSection title="Documento oficial">
            <Field label="Link del documento firmado (Drive)" value={form.document_url} onChange={v => setForm({ ...form, document_url: v })} placeholder="https://drive.google.com/..." />
          </FormSection>

          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setEditing(false)} style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
            <button onClick={handleSave} style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Save size={16} /> Guardar
            </button>
          </div>
        </div>
      )}

      {/* MODAL COMUNICACIÓN */}
      {showCommModal && createPortal(
        <ModalShell onClose={() => setShowCommModal(false)} title="Registrar comunicación de la política">
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>ISO 5.2.2 exige que la política esté disponible y comunicada. Registrá cuándo, cómo y a quién.</p>
          <form onSubmit={registrarComunicacion}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Fecha de comunicación *" type="date" required value={commForm.communicated_at} onChange={v => setCommForm({ ...commForm, communicated_at: v })} />
              <SelectField label="Método" value={commForm.communication_method} options={COMM_METHODS} onChange={v => setCommForm({ ...commForm, communication_method: v })} />
            </div>
            <div style={{ marginTop: 10 }}>
              <Field label="Audiencia" value={commForm.communication_audience} onChange={v => setCommForm({ ...commForm, communication_audience: v })} placeholder="Ej: Todo el personal / Solo gerencias / Nuevos ingresos" />
            </div>
            <div style={{ marginTop: 10 }}>
              <Field label="Evidencia (link a captura, lista firmada, etc.)" value={commForm.communication_evidence_url} onChange={v => setCommForm({ ...commForm, communication_evidence_url: v })} placeholder="https://..." />
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button type="submit" style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Registrar y marcar Comunicada</button>
              <button type="button" onClick={() => setShowCommModal(false)} style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
            </div>
          </form>
        </ModalShell>,
        document.body
      )}

      {/* MODAL HISTORIA */}
      {showHistoryModal && createPortal(
        <ModalShell onClose={() => setShowHistoryModal(false)} title="Histórico de revisiones" wide>
          {(!policy?.change_log || policy.change_log.length === 0) && <p style={{ fontSize: 13, color: '#9ca3af' }}>Sin cambios registrados todavía.</p>}
          {policy?.change_log?.slice().reverse().map((entry, i) => (
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

      {/* MODAL ALINEACIÓN IA */}
      {showAlignModal && createPortal(
        <ModalShell onClose={() => setShowAlignModal(false)} title="Análisis de alineación política ↔ objetivos">
          {loadingAlign && <div style={{ textAlign: 'center', padding: 30 }}><Loader2 size={32} className="animate-spin" /> Analizando...</div>}
          {alignResult && (
            <div>
              <div style={{ padding: 14, borderRadius: 10, background: alignResult.alineacion_global === 'Alta' ? '#dcfce7' : alignResult.alineacion_global === 'Media' ? '#fef3c7' : '#fee2e2', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Alineación: {alignResult.alineacion_global}</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>{alignResult.veredicto}</div>
              </div>
              {alignResult.objetivos_alineados?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <strong style={{ fontSize: 12 }}>✅ Objetivos alineados:</strong>
                  <ul style={{ margin: 4, fontSize: 13 }}>
                    {alignResult.objetivos_alineados.map(i => <li key={i}>{objectives[i - 1]?.objective}</li>)}
                  </ul>
                </div>
              )}
              {alignResult.objetivos_no_alineados?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <strong style={{ fontSize: 12 }}>⚠️ Objetivos NO alineados:</strong>
                  <ul style={{ margin: 4, fontSize: 13, color: '#dc2626' }}>
                    {alignResult.objetivos_no_alineados.map(i => <li key={i}>{objectives[i - 1]?.objective}</li>)}
                  </ul>
                </div>
              )}
              {alignResult.sugerencias?.length > 0 && (
                <div>
                  <strong style={{ fontSize: 12 }}>💡 Sugerencias:</strong>
                  <ul style={{ margin: 4, fontSize: 13 }}>
                    {alignResult.sugerencias.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </ModalShell>,
        document.body
      )}
    </div>
  )
}

// ─────── Helpers UI ───────
function Block({ label, value }) {
  return (
    <div style={{ padding: 14, background: 'white', border: '1px solid #e5e7eb', borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, marginBottom: 6 }}>{label}</div>
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
