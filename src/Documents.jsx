import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import { consultarIA } from './aiClient'
import {
  ShieldCheck, Send, Pencil, Trash2, AlertCircle, CheckCircle2, History,
  Download, X, Eye, Filter, Search, BarChart3, Sparkles, Loader2,
  AlertTriangle, Archive, FileText, FileCheck, ExternalLink, FolderOpen,
  List, LayoutGrid, ChevronDown, ChevronRight, Link2, Wand2, Info
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import ModuleSeedBanner from './ModuleSeedBanner'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

const STATUS_COLORS = {
  'Borrador':     { bg: '#fff8e1', fg: '#8a6d00', stripe: '#f5b800' },
  'En Revisión':  { bg: '#e7f0ff', fg: '#1849b8', stripe: '#3b82f6' },
  'Vigente':      { bg: '#e8f5ed', fg: '#0f5132', stripe: '#16a34a' },
  'Obsoleto':     { bg: '#f1f3f5', fg: '#6c757d', stripe: '#adb5bd' },
  'Rechazado':    { bg: '#fde8e8', fg: '#8a1f1f', stripe: '#dc2626' },
}

const TYPE_COLORS = {
  'Política':      '#6610f2',
  'Manual':        '#fd7e14',
  'Procedimiento': '#007bff',
  'Formato':       '#6c757d',
  'Instructivo':   '#20c997',
  'Registro':      '#0ea5e9',
}

const TYPE_OPTIONS = Object.keys(TYPE_COLORS)
const STATUS_OPTIONS = ['Borrador', 'En Revisión', 'Vigente', 'Obsoleto', 'Rechazado']

// Áreas funcionales alineadas a procesos típicos de un SGC ISO 9001
const AREA_OPTIONS = [
  'Dirección / Estratégica',
  'Calidad / SGC',
  'Comercial / Ventas',
  'Operaciones / Producción',
  'Compras / Proveedores',
  'RRHH / Talento Humano',
  'Mantenimiento',
  'Administración / Finanzas',
  'Logística',
  'Otra',
]

// Manual de Codificación digital — patrón {TIPO}-{ÁREA}-{NN}
// Si la empresa tiene su propio manual, puede ignorar el botón "Sugerir" y
// escribir el código a mano.
const TYPE_PREFIX = {
  'Política':      'POL',
  'Manual':        'MAN',
  'Procedimiento': 'PRO',
  'Instructivo':   'INS',
  'Formato':       'FOR',
  'Registro':      'REG',
}
const AREA_PREFIX = {
  'Dirección / Estratégica':    'DIR',
  'Calidad / SGC':              'CAL',
  'Comercial / Ventas':         'VTA',
  'Operaciones / Producción':   'OPS',
  'Compras / Proveedores':      'COM',
  'RRHH / Talento Humano':      'RRHH',
  'Mantenimiento':              'MNT',
  'Administración / Finanzas':  'ADM',
  'Logística':                  'LGT',
  'Otra':                       'OTR',
}

// Genera el próximo código según el patrón, mirando los códigos existentes.
function suggestNextCode(type, area, existingItems) {
  const tp = TYPE_PREFIX[type] || 'DOC'
  const ap = AREA_PREFIX[area] || 'GEN'
  const prefix = `${tp}-${ap}-`
  // Buscar el último número usado con ese prefijo
  let maxN = 0
  for (const item of existingItems) {
    if (!item.code) continue
    const m = String(item.code).match(new RegExp(`^${prefix}(\\d+)$`))
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > maxN) maxN = n
    }
  }
  const next = String(maxN + 1).padStart(2, '0')
  return `${prefix}${next}`
}

// Detecta el host conocido del link para mostrar el icono/etiqueta
function detectLinkProvider(url) {
  if (!url) return null
  const u = url.toLowerCase()
  if (u.includes('drive.google.com') || u.includes('docs.google.com')) return 'Google Drive'
  if (u.includes('sharepoint.com') || u.includes('onedrive')) return 'SharePoint / OneDrive'
  if (u.includes('dropbox.com')) return 'Dropbox'
  if (u.includes('notion.so')) return 'Notion'
  return 'Enlace externo'
}

function defaultForm() {
  return {
    code: '', title: '', type: 'Procedimiento', area: 'Calidad / SGC',
    version: '1.0', link: '',
    document_owner: '', review_date: '', retention_until: '',
    change_summary: '', is_record: false, tags: ''
  }
}

function isDueSoon(dateStr) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const days = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return days <= 30 && days >= 0
}
function isOverdue(dateStr) {
  if (!dateStr) return false
  return new Date(dateStr).getTime() < Date.now()
}

export default function Documents() {
  const { org, can } = useOrg()
  const [items, setItems] = useState([])
  const [approvals, setApprovals] = useState({})
  const [members, setMembers] = useState({})
  const [loading, setLoading] = useState(true)
  const [mostrandoForm, setMostrandoForm] = useState(false)
  const [groupIdParaVersion, setGroupIdParaVersion] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [historialGroupId, setHistorialGroupId] = useState(null)
  const [historialItems, setHistorialItems] = useState([])
  const [detailItem, setDetailItem] = useState(null)
  const [msg, setMsg] = useState(null)
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  // Filtros + vista
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('grouped')   // 'grouped' (por área) | 'list' (plana)
  const [collapsedAreas, setCollapsedAreas] = useState(new Set())

  // IA preview
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaSuggestions, setIaSuggestions] = useState(null)
  const [iaSelected, setIaSelected] = useState(new Set())
  const [savingIa, setSavingIa] = useState(false)

  // Modal: ver patrón de codificación
  const [showCodingModal, setShowCodingModal] = useState(false)

  const [form, setForm] = useState(defaultForm())

  useEffect(() => { fetchAll() }, [])

  const showMsg = (text, kind = 'ok') => {
    setMsg({ text, kind })
    setTimeout(() => setMsg(null), 4000)
  }

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: docs }, { data: apps }, { data: mems }] = await Promise.all([
      supabase.from('documents_versions').select('*').order('created_at', { ascending: false }),
      supabase.from('approvals').select('*').eq('entity_type', 'documents_versions'),
      supabase.from('user_profiles').select('user_id, full_name'),
    ])

    if (docs) {
      const latest = Object.values(docs.reduce((acc, doc) => {
        if (!acc[doc.document_group_id] || new Date(doc.created_at) > new Date(acc[doc.document_group_id].created_at)) {
          acc[doc.document_group_id] = doc
        }
        return acc
      }, {})).sort((a, b) => (a.code || '').localeCompare(b.code || ''))
      setItems(latest)
    }
    setApprovals(Object.fromEntries((apps || []).map(a => [a.id, a])))
    setMembers(Object.fromEntries((mems || []).map(m => [m.user_id, m])))
    setLoading(false)
  }

  const handleNew = () => {
    setGroupIdParaVersion(null)
    setEditingId(null)
    setForm(defaultForm())
    setFile(null)
    setMostrandoForm(true)
  }

  const prepararNuevaVersion = (doc) => {
    setGroupIdParaVersion(doc.document_group_id)
    setEditingId(null)
    setForm({
      code: doc.code,
      title: doc.title,
      type: doc.type,
      area: doc.area || 'Calidad / SGC',
      version: (parseFloat(doc.version) + 0.1).toFixed(1),
      link: doc.content_url || '',
      document_owner: doc.document_owner || '',
      review_date: doc.review_date || '',
      retention_until: doc.retention_until || '',
      change_summary: '',
      is_record: !!doc.is_record,
      tags: (doc.tags || []).join(', '),
    })
    setFile(null)
    setMostrandoForm(true)
  }

  const handleEditDraft = (doc) => {
    setGroupIdParaVersion(null)
    setEditingId(doc.id)
    setForm({
      code: doc.code,
      title: doc.title,
      type: doc.type,
      area: doc.area || 'Calidad / SGC',
      version: doc.version,
      link: doc.content_url || '',
      document_owner: doc.document_owner || '',
      review_date: doc.review_date || '',
      retention_until: doc.retention_until || '',
      change_summary: doc.change_summary || '',
      is_record: !!doc.is_record,
      tags: (doc.tags || []).join(', '),
    })
    setFile(null)
    setMostrandoForm(true)
    setDetailItem(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!org?.id) return showMsg('Organización no cargada', 'err')

    const tagsArr = form.tags
      ? form.tags.split(',').map(t => t.trim()).filter(Boolean)
      : null

    if (editingId) {
      // Editar borrador (no se permite cambiar archivo aquí — para eso "nueva versión")
      const payload = {
        code: form.code,
        title: form.title,
        type: form.type,
        area: form.area || null,
        version: form.version,
        content_url: form.link || null,
        document_owner: form.document_owner || null,
        review_date: form.review_date || null,
        retention_until: form.retention_until || null,
        change_summary: form.change_summary || null,
        is_record: form.is_record,
        tags: tagsArr,
      }
      const { error } = await supabase.from('documents_versions').update(payload).eq('id', editingId)
      if (error) return showMsg(error.message, 'err')
      setMostrandoForm(false); setEditingId(null); setForm(defaultForm())
      fetchAll()
      return
    }

    // Nuevo documento o nueva versión
    const groupId = groupIdParaVersion || self.crypto.randomUUID()
    setUploading(true)

    let storagePath = null
    if (file) {
      const safeName = file.name.replace(/[^\w.\-]+/g, '_')
      const path = `${org.id}/${groupId}/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) {
        setUploading(false)
        return showMsg(`Error al subir: ${upErr.message}`, 'err')
      }
      storagePath = path
    }

    const payload = {
      document_group_id: groupId,
      code: form.code,
      title: form.title,
      type: form.type,
      area: form.area || null,
      version: form.version,
      status: 'Borrador',
      content_url: form.link || null,
      storage_path: storagePath,
      document_owner: form.document_owner || null,
      review_date: form.review_date || null,
      retention_until: form.retention_until || null,
      change_summary: form.change_summary || null,
      is_record: form.is_record,
      tags: tagsArr,
    }

    const { error } = await supabase.from('documents_versions').insert([payload])
    setUploading(false)
    if (error) return showMsg(error.message, 'err')
    setMostrandoForm(false)
    setGroupIdParaVersion(null)
    setForm(defaultForm())
    setFile(null)
    fetchAll()
  }

  const handleDownload = async (item) => {
    if (item.content_url && !item.storage_path) {
      window.open(item.content_url, '_blank', 'noopener,noreferrer'); return
    }
    if (!item.storage_path) return
    const { data, error } = await supabase.storage
      .from('documents').createSignedUrl(item.storage_path, 60)
    if (error) return showMsg(error.message, 'err')
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const handleDelete = async (id) => {
    if (!await confirm('¿Eliminar este borrador?', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('documents_versions').delete().eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Borrador eliminado'); fetchAll() }
  }

  const handleSubmitForApproval = async (doc) => {
    const note = prompt('Nota para el aprobador (opcional):') || null
    const { error } = await supabase.rpc('submit_for_approval', {
      p_entity_type: 'documents_versions',
      p_entity_id: doc.id,
      p_note: note,
    })
    if (error) showMsg(error.message, 'err')
    else { showMsg('Enviado a revisión.'); fetchAll() }
  }

  const handleMarcarObsoleto = async (doc) => {
    if (!await confirm(`¿Marcar "${doc.title}" como Obsoleto? Esto retira el documento del uso operativo.`, { tone: 'warning', confirmText: 'Marcar Obsoleto' })) return
    const { error } = await supabase.from('documents_versions')
      .update({ status: 'Obsoleto' }).eq('id', doc.id)
    if (error) showMsg(error.message, 'err')
    else { showMsg('Documento marcado como obsoleto.'); fetchAll() }
  }

  const verHistorial = async (groupId) => {
    if (historialGroupId === groupId) { setHistorialGroupId(null); return }
    setHistorialGroupId(groupId)
    const { data } = await supabase
      .from('documents_versions').select('*')
      .eq('document_group_id', groupId).order('created_at', { ascending: false })
    setHistorialItems(data || [])
  }

  // ---- IA: sugerir lista de documentos ----
  const handleSugerirConIA = async () => {
    setLoadingIA(true)
    try {
      const { data: profile } = await supabase.from('company_profile').select('*').maybeSingle()
      const profileResumen = profile ? {
        nombre: profile.name, sector: profile.industry, tamano: profile.size,
        ubicacion: profile.location, productos: profile.main_products,
      } : null

      const codigosUsados = items.map(i => i.code)

      const prompt = `
Sugiere la lista mínima de DOCUMENTOS Y REGISTROS de un SGC ISO 9001 (cláusula 7.5) para esta empresa.
Perfil: ${JSON.stringify(profileResumen)}
Códigos ya usados: ${JSON.stringify(codigosUsados)}

Devuelve SOLO un JSON array (sin markdown, sin texto) con 10 a 15 documentos típicos:
- Política de la calidad
- Manual de calidad (si aplica)
- Procedimientos clave (control de documentos, auditoría interna, no conformidades, acciones correctivas)
- Procedimientos del rubro (según sector)
- Instructivos / formatos
- Registros típicos (que son "evidencia de actividad" — marcar is_record:true)

Cada item con este formato exacto:
{
  "code": "PRO-01",
  "title": "Procedimiento de Control de Documentos",
  "type": "Procedimiento" | "Manual" | "Política" | "Formato" | "Instructivo" | "Registro",
  "area": "Dirección / Estratégica" | "Calidad / SGC" | "Comercial / Ventas" | "Operaciones / Producción" | "Compras / Proveedores" | "RRHH / Talento Humano" | "Mantenimiento" | "Administración / Finanzas" | "Logística" | "Otra",
  "is_record": false | true,
  "document_owner": "Rol responsable (ej: Responsable de Calidad)",
  "change_summary": "Versión inicial",
  "tags": ["calidad", "documentos"]
}

Reglas:
- No repitas códigos ya usados.
- Para "Registro", siempre is_record:true. Para los demás, false.
- Asigna el "area" según el departamento dueño natural del documento.
- CÓDIGO obligatorio con este patrón: {TIPO}-{ÁREA}-{NN}
    TIPO: POL=Política, MAN=Manual, PRO=Procedimiento, INS=Instructivo, FOR=Formato, REG=Registro
    ÁREA: DIR=Dirección, CAL=Calidad, VTA=Ventas, OPS=Operaciones, COM=Compras, RRHH=RRHH, MNT=Mantenimiento, ADM=Administración, LGT=Logística, OTR=Otra
    NN: número correlativo (01, 02, 03...) según el TIPO+ÁREA
  Ejemplos: POL-DIR-01, PRO-CAL-03, INS-OPS-02, REG-RRHH-05.
`
      const respuesta = await consultarIA(
        prompt,
        'Eres un consultor experto en ISO 9001 cláusula 7.5 (información documentada). Responde ÚNICAMENTE con el JSON array pedido. Sin markdown, sin texto antes ni después.'
      )
      console.log('[IA Sugerir Documentos] respuesta cruda:', respuesta)

      const arr = parseAiArray(respuesta)
      if (!Array.isArray(arr) || !arr.length) {
        throw new Error(`La IA no devolvió un array. Respuesta: ${String(respuesta).substring(0, 200)}...`)
      }

      const normalized = arr.map(it => ({
        code: it.code || '—',
        title: it.title || '—',
        type: TYPE_OPTIONS.includes(it.type) ? it.type : 'Procedimiento',
        area: AREA_OPTIONS.includes(it.area) ? it.area : 'Calidad / SGC',
        is_record: !!it.is_record,
        document_owner: it.document_owner || '',
        change_summary: it.change_summary || 'Versión inicial',
        tags: Array.isArray(it.tags) ? it.tags : [],
      }))

      setIaSuggestions(normalized)
      setIaSelected(new Set(normalized.map((_, i) => i)))
    } catch (err) {
      showMsg('No pudimos procesarla. ' + (err?.message || ''), 'err')
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
    if (!iaSelected.size) return showMsg('Selecciona al menos un documento.', 'err')
    setSavingIa(true)
    try {
      const payload = iaSuggestions
        .filter((_, i) => iaSelected.has(i))
        .map(it => ({
          document_group_id: self.crypto.randomUUID(),
          code: it.code, title: it.title, type: it.type,
          area: it.area || null,
          version: '1.0', status: 'Borrador',
          document_owner: it.document_owner || null,
          change_summary: it.change_summary || null,
          is_record: it.is_record,
          tags: it.tags?.length ? it.tags : null,
        }))
      const { error } = await supabase.from('documents_versions').insert(payload)
      if (error) throw error
      setIaSuggestions(null); setIaSelected(new Set())
      showMsg(`${payload.length} documentos creados como Borrador.`)
      fetchAll()
    } catch (err) {
      showMsg('Error al guardar: ' + (err?.message || ''), 'err')
    } finally {
      setSavingIa(false)
    }
  }

  // ---- Filtros ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(i =>
      (!filterType || i.type === filterType) &&
      (!filterStatus || i.status === filterStatus) &&
      (!filterArea || (i.area || 'Sin área') === filterArea) &&
      (!q || (i.code || '').toLowerCase().includes(q) || (i.title || '').toLowerCase().includes(q))
    )
  }, [items, filterType, filterStatus, filterArea, search])

  // Agrupar por área, manteniendo orden razonable
  const grouped = useMemo(() => {
    const map = {}
    for (const i of filtered) {
      const area = i.area || 'Sin área asignada'
      if (!map[area]) map[area] = []
      map[area].push(i)
    }
    // Ordenar: las áreas conocidas primero (en el orden de AREA_OPTIONS), después el resto
    const knownOrdered = AREA_OPTIONS.filter(a => map[a]).map(a => [a, map[a]])
    const unknownOrdered = Object.keys(map).filter(a => !AREA_OPTIONS.includes(a)).sort().map(a => [a, map[a]])
    return [...knownOrdered, ...unknownOrdered]
  }, [filtered])

  const stats = useMemo(() => {
    const total = items.length
    const vigentes = items.filter(i => i.status === 'Vigente').length
    const enRevision = items.filter(i => i.status === 'En Revisión').length
    const borradores = items.filter(i => i.status === 'Borrador').length
    const aRevisar = items.filter(i => isDueSoon(i.review_date) || isOverdue(i.review_date)).length
    return { total, vigentes, enRevision, borradores, aRevisar }
  }, [items])

  const toggleArea = (area) => {
    setCollapsedAreas(prev => {
      const next = new Set(prev)
      if (next.has(area)) next.delete(area); else next.add(area)
      return next
    })
  }

  const getTypeColor = (type) => TYPE_COLORS[type] || '#6c757d'

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>📂 Información Documentada</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '5px 0 0 0', fontSize: '14px' }}>
            Control de documentos con workflow de aprobación (ISO 9001 — 7.5)
          </p>
        </div>
        {can.write && !mostrandoForm && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setShowCodingModal(true)} className="btn btn-ghost" title="Ver patrón de codificación">
              <Wand2 size={16} /> Codificación
            </button>
            <button onClick={handleSugerirConIA} className="btn btn-ghost" disabled={loadingIA} title="Sugerir documentos mínimos desde el ADN de la empresa">
              {loadingIA ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              Sugerir con IA
            </button>
            <button onClick={handleNew} className="btn btn-primary">+ Nuevo Documento</button>
          </div>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['7.5']} />

      <ModuleSeedBanner moduleKey="documents" label="documentos clave del SGC" visible={items.length === 0} onSeeded={fetchAll} />

      {/* ===== Dashboard ===== */}
      {!mostrandoForm && stats.total > 0 && (
        <div className="card" style={{ marginTop: '1rem', marginBottom: '1.5rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart3 size={18} /> Resumen
            </h4>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Toggle de vista */}
              <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                <button onClick={() => setViewMode('grouped')}
                  className="btn-ghost"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', background: viewMode === 'grouped' ? '#eef2ff' : 'transparent', color: viewMode === 'grouped' ? '#3730a3' : '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  title="Agrupar por área">
                  <LayoutGrid size={14} /> Por área
                </button>
                <button onClick={() => setViewMode('list')}
                  className="btn-ghost"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', background: viewMode === 'list' ? '#eef2ff' : 'transparent', color: viewMode === 'list' ? '#3730a3' : '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  title="Lista plana">
                  <List size={14} /> Lista
                </button>
              </div>

              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input className="form-input" style={{ padding: '0.35rem 0.5rem 0.35rem 1.8rem', fontSize: '0.85rem', minWidth: '180px' }}
                  placeholder="Buscar por código o título..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Filter size={14} style={{ color: 'var(--text-tertiary)' }} />
              <select className="form-select" style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                value={filterArea} onChange={e => setFilterArea(e.target.value)}>
                <option value="">Todas las áreas</option>
                {AREA_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className="form-select" style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">Todos los tipos</option>
                {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
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
            <KPI label="Vigentes" value={stats.vigentes} color="#16a34a" />
            <KPI label="En revisión" value={stats.enRevision} color="#3b82f6" />
            <KPI label="Borradores" value={stats.borradores} color="#f5b800" />
            <KPI label="A revisar" value={stats.aRevisar} warn={stats.aRevisar > 0} />
          </div>
        </div>
      )}

      {msg && (
        <div style={{
          padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '6px',
          background: msg.kind === 'err' ? 'var(--danger-bg)' : 'var(--success-bg)',
          color: msg.kind === 'err' ? 'var(--danger-text)' : 'var(--success-text)',
          display: 'flex', alignItems: 'center', gap: '0.5rem'
        }}>
          {msg.kind === 'err' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {msg.text}
        </div>
      )}

      {/* ===== Formulario ===== */}
      {mostrandoForm && (
        <div className="card fade-in" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ borderBottom: '1px solid #eee', marginBottom: '1.5rem', paddingBottom: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>
              {editingId ? 'Editar borrador' : groupIdParaVersion ? 'Nueva Versión de Documento' : 'Registrar Documento'}
            </h3>
            <button type="button" onClick={() => { setMostrandoForm(false); setEditingId(null); setFile(null) }} className="btn-ghost">Cancelar</button>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 0 }}>
            Los documentos se crean como <strong>Borrador</strong>. Para que sean Vigentes deben pasar por el flujo de aprobación.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="grid-2-col">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Código *</span>
                  <button type="button"
                    onClick={() => setForm({ ...form, code: suggestNextCode(form.type, form.area, items) })}
                    className="btn-ghost"
                    style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: '#7c3aed' }}
                    title="Sugerir según patrón de codificación">
                    <Wand2 size={12} /> Sugerir
                  </button>
                </label>
                <input required className="form-input" value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value })}
                  placeholder={`Ej: ${TYPE_PREFIX[form.type] || 'PRO'}-${AREA_PREFIX[form.area] || 'CAL'}-01`} />
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Info size={11} /> Patrón sugerido:{' '}
                  <code style={{ background: '#f1f5f9', padding: '0.05rem 0.35rem', borderRadius: '3px', color: '#3730a3' }}>
                    {TYPE_PREFIX[form.type]}-{AREA_PREFIX[form.area]}-NN
                  </code>
                </div>
              </div>
              <div className="form-group" style={{ flex: 3 }}>
                <label className="form-label">Título *</label>
                <input required className="form-input" value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ej: Procedimiento de Ventas" />
              </div>
            </div>

            <div className="grid-2-col">
              <div className="form-group">
                <label className="form-label">Tipo *</label>
                <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Área funcional *</label>
                <select className="form-select" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })}>
                  {AREA_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            <div className="grid-2-col">
              <div className="form-group">
                <label className="form-label">Versión *</label>
                <input required className="form-input" value={form.version}
                  onChange={e => setForm({ ...form, version: e.target.value })} placeholder="1.0" />
              </div>
              <div className="form-group">
                <label className="form-label">Etiquetas (separadas por coma)</label>
                <input className="form-input" value={form.tags}
                  onChange={e => setForm({ ...form, tags: e.target.value })}
                  placeholder="Ej: calidad, ventas, auditoría" />
              </div>
            </div>

            {/* Link de Drive/SharePoint como campo principal */}
            <div className="form-group" style={{
              background: '#eef2ff', padding: '1rem', borderRadius: '8px',
              border: '1px solid #c7d2fe', marginTop: '0.5rem'
            }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#3730a3' }}>
                <Link2 size={16} /> Enlace al documento (Drive / SharePoint / OneDrive) *
              </label>
              <input
                type="url"
                className="form-input"
                value={form.link}
                onChange={e => setForm({ ...form, link: e.target.value })}
                placeholder="https://drive.google.com/file/d/... · https://yourorg.sharepoint.com/..."
                style={{ background: 'white' }}
              />
              <div style={{ fontSize: '0.78rem', color: '#3730a3', marginTop: '0.4rem' }}>
                💡 Lo recomendado en una empresa real: tener el documento en Drive/SharePoint (con permisos, historial nativo) y aquí registrar el catálogo + workflow de aprobación.
                {form.link && (
                  <span> · Detectado: <strong>{detectLinkProvider(form.link)}</strong></span>
                )}
              </div>
            </div>

            <div className="grid-2-col">
              <div className="form-group">
                <label className="form-label">Propietario / Responsable</label>
                <input className="form-input" value={form.document_owner}
                  onChange={e => setForm({ ...form, document_owner: e.target.value })}
                  placeholder="Ej: Responsable de Calidad" />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.7rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_record}
                    onChange={e => setForm({ ...form, is_record: e.target.checked })} />
                  <span style={{ fontSize: '0.9rem' }}>Es un registro (evidencia de actividad)</span>
                </label>
              </div>
            </div>

            <div className="grid-2-col">
              <div className="form-group">
                <label className="form-label">Próxima revisión periódica</label>
                <input type="date" className="form-input" value={form.review_date}
                  onChange={e => setForm({ ...form, review_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Retención hasta (baja documental)</label>
                <input type="date" className="form-input" value={form.retention_until}
                  onChange={e => setForm({ ...form, retention_until: e.target.value })} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Resumen del cambio en esta versión</label>
              <textarea className="form-textarea" rows={2} value={form.change_summary}
                onChange={e => setForm({ ...form, change_summary: e.target.value })}
                placeholder="Qué se modificó respecto a la versión anterior. Esto queda en el historial auditable." />
            </div>

            {!editingId && (
              <details style={{ marginTop: '0.5rem', borderTop: '1px dashed #e2e8f0', paddingTop: '0.75rem' }}>
                <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: '0.85rem' }}>
                  📎 Subir copia local del archivo (opcional, para integridad por hash)
                </summary>
                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                  <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} />
                  {file && (
                    <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.4rem' }}>
                    Útil si quieres un respaldo dentro del SaaS con hash de integridad. En la mayoría de los casos el link al Drive alcanza.
                  </div>
                </div>
              </details>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" onClick={() => { setMostrandoForm(false); setEditingId(null); setFile(null) }} className="btn btn-ghost">Cancelar</button>
              <button type="submit" disabled={uploading} className="btn btn-primary">
                {uploading ? 'Subiendo...' : (editingId ? 'Guardar cambios' : 'Guardar Borrador')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== Lista ===== */}
      {loading ? <p>Cargando biblioteca...</p> : viewMode === 'grouped' ? (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {grouped.map(([area, areaItems]) => {
            const isCollapsed = collapsedAreas.has(area)
            return (
              <div key={area}>
                <div onClick={() => toggleArea(area)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.6rem 0.9rem', background: '#f8fafc',
                    borderRadius: '8px', cursor: 'pointer',
                    borderLeft: '4px solid var(--primary-color)',
                  }}>
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  <FolderOpen size={16} style={{ color: 'var(--primary-color)' }} />
                  <strong style={{ flex: 1 }}>{area}</strong>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{areaItems.length} documento{areaItems.length !== 1 ? 's' : ''}</span>
                </div>
                {!isCollapsed && (
                  <div style={{ display: 'grid', gap: '10px', marginTop: '0.5rem', paddingLeft: '0.5rem' }}>
                    {areaItems.map(item => (
                      <DocCardRender
                        key={item.id} item={item}
                        approvals={approvals} members={members} can={can}
                        getTypeColor={getTypeColor} historialGroupId={historialGroupId} historialItems={historialItems}
                        onDownload={handleDownload}
                        onSubmitApproval={handleSubmitForApproval}
                        onNuevaVersion={prepararNuevaVersion}
                        onEditDraft={handleEditDraft}
                        onMarcarObsoleto={handleMarcarObsoleto}
                        onDetail={setDetailItem}
                        onHistorial={verHistorial}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && items.length > 0 && (
            <p style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
              No hay documentos con esos filtros.
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {filtered.map(item => (
            <DocCardRender
              key={item.id} item={item}
              approvals={approvals} members={members} can={can}
              getTypeColor={getTypeColor} historialGroupId={historialGroupId} historialItems={historialItems}
              showArea
              onDownload={handleDownload}
              onSubmitApproval={handleSubmitForApproval}
              onNuevaVersion={prepararNuevaVersion}
              onEditDraft={handleEditDraft}
              onMarcarObsoleto={handleMarcarObsoleto}
              onDetail={setDetailItem}
              onHistorial={verHistorial}
              onDelete={handleDelete}
            />
          ))}
          {filtered.length === 0 && items.length > 0 && (
            <p style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
              No hay documentos con esos filtros.
            </p>
          )}
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
            background: 'white', maxWidth: '680px', width: '100%', padding: 0,
            maxHeight: '90vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.6)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', borderLeft: `5px solid ${getTypeColor(detailItem.type)}` }}>
              <div>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={18} /> {detailItem.code} · {detailItem.title}
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {detailItem.type} · v{detailItem.version} · {detailItem.status}
                </span>
              </div>
              <button onClick={() => setDetailItem(null)} className="btn-ghost" style={{ padding: '0.25rem' }}><X size={18} /></button>
            </div>
            <div style={{ overflow: 'auto', padding: '1.25rem', display: 'grid', gap: '0.75rem' }}>
              <DetailRow label="Área funcional" value={detailItem.area} />
              <DetailRow label="Propietario" value={detailItem.document_owner} />
              <DetailRow label="Tipo de información" value={detailItem.is_record ? 'Registro (evidencia de actividad)' : 'Documento normativo'} />
              {detailItem.content_url && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Enlace al documento</div>
                  <a href={detailItem.content_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--primary-color)', fontSize: '0.9rem', wordBreak: 'break-all' }}>
                    <ExternalLink size={14} /> {detectLinkProvider(detailItem.content_url)}
                  </a>
                </div>
              )}
              <DetailRow label="Próxima revisión" value={detailItem.review_date} warn={isOverdue(detailItem.review_date) ? 'Vencida' : isDueSoon(detailItem.review_date) ? 'Próxima' : null} />
              <DetailRow label="Retención hasta" value={detailItem.retention_until} />
              <DetailRow label="Etiquetas" value={(detailItem.tags || []).join(', ')} />
              <DetailRow label="Resumen del cambio" value={detailItem.change_summary} />
              {detailItem.content_hash && (
                <DetailRow label="Hash de integridad" value={detailItem.content_hash} mono />
              )}
              {(detailItem.storage_path || detailItem.content_url) && (
                <button onClick={() => handleDownload(detailItem)} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                  <ExternalLink size={14} /> Abrir documento
                </button>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => setDetailItem(null)} className="btn btn-ghost">Cerrar</button>
              {can.write && (detailItem.status === 'Borrador' || detailItem.status === 'Rechazado') && (
                <button onClick={() => handleEditDraft(detailItem)} className="btn btn-primary">
                  <Pencil size={14} /> Editar borrador
                </button>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ===== Modal Manual de Codificación ===== */}
      {showCodingModal && createPortal((
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 1000,
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
                  <Wand2 size={18} style={{ color: '#7c3aed' }} /> Manual de Codificación
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Convención usada por el sistema. Puedes copiarla a tu manual oficial o ignorarla.
                </span>
              </div>
              <button onClick={() => setShowCodingModal(false)} className="btn-ghost" style={{ padding: '0.25rem' }}><X size={18} /></button>
            </div>

            <div style={{ overflow: 'auto', padding: '1.25rem', display: 'grid', gap: '1.25rem' }}>
              <div style={{ background: '#eef2ff', padding: '1rem', borderRadius: '8px', border: '1px solid #c7d2fe' }}>
                <div style={{ fontSize: '0.75rem', color: '#3730a3', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>Patrón</div>
                <code style={{ fontSize: '1.2rem', color: '#1e1b4b', fontWeight: 600 }}>
                  {'{TIPO}-{ÁREA}-{NN}'}
                </code>
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#475569' }}>
                  Ejemplos: <code>PRO-CAL-01</code>, <code>INS-RRHH-12</code>, <code>FOR-VTA-03</code>, <code>REG-OPS-07</code>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#475569' }}>Tipo de documento</h5>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <tbody>
                      {Object.entries(TYPE_PREFIX).map(([k, v]) => (
                        <tr key={k} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.4rem 0.5rem' }}>
                            <code style={{ background: '#f1f5f9', padding: '0.05rem 0.4rem', borderRadius: '3px', color: '#7c3aed', fontWeight: 600 }}>{v}</code>
                          </td>
                          <td style={{ padding: '0.4rem 0.5rem', color: '#334155' }}>{k}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#475569' }}>Área funcional</h5>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <tbody>
                      {Object.entries(AREA_PREFIX).map(([k, v]) => (
                        <tr key={k} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.4rem 0.5rem' }}>
                            <code style={{ background: '#f1f5f9', padding: '0.05rem 0.4rem', borderRadius: '3px', color: '#3730a3', fontWeight: 600 }}>{v}</code>
                          </td>
                          <td style={{ padding: '0.4rem 0.5rem', color: '#334155' }}>{k}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ background: '#fefce8', border: '1px solid #fde68a', padding: '0.9rem 1rem', borderRadius: '8px', fontSize: '0.85rem', color: '#713f12' }}>
                <strong>💡 Si tu empresa ya tiene un Manual de Codificación propio:</strong>
                <p style={{ margin: '0.4rem 0 0 0' }}>
                  Solo ignora el botón <em>"Sugerir"</em> y escribe el código manualmente con tu convención. El sistema acepta cualquier formato — la sugerencia es solo una ayuda para empresas que arrancan desde cero.
                </p>
              </div>

              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.9rem 1rem', borderRadius: '8px', fontSize: '0.85rem', color: '#14532d' }}>
                <strong>🎯 Cómo funciona el botón "Sugerir":</strong>
                <ol style={{ margin: '0.4rem 0 0 1.2rem', padding: 0 }}>
                  <li>Mira el <strong>Tipo</strong> y <strong>Área</strong> que tienes elegidos en el form</li>
                  <li>Busca el último número correlativo usado con ese prefijo</li>
                  <li>Te propone el siguiente (ej: si ya tienes <code>PRO-CAL-03</code>, te propone <code>PRO-CAL-04</code>)</li>
                </ol>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => setShowCodingModal(false)} className="btn btn-primary">Entendido</button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ===== Modal preview IA ===== */}
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
            background: 'white', maxWidth: '900px', width: '100%', padding: 0,
            maxHeight: '90vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={18} style={{ color: '#7c3aed' }} /> Documentos sugeridos por IA
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Revisa las {iaSuggestions.length} sugerencias. Desmarca las que no apliquen.
                </span>
              </div>
              <button onClick={() => { setIaSuggestions(null); setIaSelected(new Set()) }} className="btn-ghost"><X size={18} /></button>
            </div>
            <div style={{ padding: '0.5rem 1.25rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                <strong>{iaSelected.size}</strong> de {iaSuggestions.length} seleccionados
              </span>
              <button type="button" onClick={toggleAllSuggestions} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                {iaSelected.size === iaSuggestions.length ? 'Destildar todos' : 'Tildar todos'}
              </button>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.6rem', width: '40px' }}></th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Código</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Título</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Tipo</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Área</th>
                    <th style={{ padding: '0.6rem', textAlign: 'left' }}>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {iaSuggestions.map((it, i) => {
                    const selected = iaSelected.has(i)
                    return (
                      <tr key={i} onClick={() => toggleSuggestion(i)}
                        style={{
                          borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                          background: selected ? '#eef2ff' : 'transparent', opacity: selected ? 1 : 0.55,
                        }}>
                        <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                          <input type="checkbox" checked={selected} onChange={() => toggleSuggestion(i)} onClick={e => e.stopPropagation()} />
                        </td>
                        <td style={{ padding: '0.6rem', fontWeight: 600 }}>{it.code}</td>
                        <td style={{ padding: '0.6rem' }}>
                          {it.title}
                          {it.is_record && <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', background: '#e0f2fe', color: '#075985', padding: '0.05rem 0.4rem', borderRadius: '999px' }}>Registro</span>}
                        </td>
                        <td style={{ padding: '0.6rem' }}>
                          <span style={{ color: getTypeColor(it.type), fontWeight: 600 }}>{it.type}</span>
                        </td>
                        <td style={{ padding: '0.6rem' }}>
                          <span style={{ fontSize: '0.72rem', background: '#eef2ff', color: '#3730a3', padding: '0.1rem 0.4rem', borderRadius: '999px' }}>{it.area}</span>
                        </td>
                        <td style={{ padding: '0.6rem', color: '#64748b' }}>{it.document_owner}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                💡 Se crean como Borrador. Después subes cada archivo y mandas a revisión.
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => { setIaSuggestions(null); setIaSelected(new Set()) }} className="btn btn-ghost" disabled={savingIa}>Cancelar</button>
                <button onClick={handleSaveSuggestions} className="btn btn-primary" disabled={savingIa || !iaSelected.size}>
                  {savingIa ? <><Loader2 className="animate-spin" size={14} /> Guardando...</> : <>Crear {iaSelected.size} borrador{iaSelected.size !== 1 ? 'es' : ''}</>}
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
function KPI({ label, value, highlight, warn, color }) {
  return (
    <div style={{
      background: highlight ? '#eef2ff' : warn ? '#fef3c7' : '#f8fafc',
      borderRadius: '8px', padding: '0.6rem 0.75rem',
      textAlign: 'center',
      border: highlight ? '1px solid #c7d2fe' : warn ? '1px solid #fde68a' : '1px solid #e2e8f0'
    }}>
      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: warn ? '#92400e' : (color || 'var(--primary-color)') }}>{value}</div>
    </div>
  )
}

function DetailRow({ label, value, mono, warn }) {
  if (!value) return null
  return (
    <div>
      <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '0.92rem', color: '#1e293b', fontFamily: mono ? 'monospace' : 'inherit' }}>
        {value}
        {warn && (
          <span style={{
            marginLeft: '0.5rem', fontSize: '0.7rem', padding: '0.1rem 0.45rem', borderRadius: '999px',
            background: warn === 'Vencida' ? '#fee2e2' : '#fef3c7',
            color: warn === 'Vencida' ? '#991b1b' : '#92400e'
          }}>{warn}</span>
        )}
      </div>
    </div>
  )
}

// ----- Card de documento reutilizable -----
function DocCardRender({
  item, approvals, members, can, getTypeColor, historialGroupId, historialItems,
  showArea, onDownload, onSubmitApproval, onNuevaVersion, onEditDraft,
  onMarcarObsoleto, onDetail, onHistorial, onDelete
}) {
  const sc = STATUS_COLORS[item.status] || STATUS_COLORS['Borrador']
  const approval = item.approval_id ? approvals[item.approval_id] : null
  const approver = item.approved_by ? members[item.approved_by] : null
  const editable = item.status === 'Borrador' || item.status === 'Rechazado'
  const reviewOverdue = item.status === 'Vigente' && isOverdue(item.review_date)
  const reviewDueSoon = item.status === 'Vigente' && isDueSoon(item.review_date) && !reviewOverdue
  const provider = detectLinkProvider(item.content_url)

  return (
    <div>
      <div style={{
        backgroundColor: 'white', padding: '15px', borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        borderLeft: `5px solid ${getTypeColor(item.type)}`,
        ...(reviewOverdue ? { outline: '2px solid #dc2626', outlineOffset: '-1px' } : {})
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
            <div style={{ backgroundColor: '#f0f0f0', padding: '10px', borderRadius: '5px', textAlign: 'center', minWidth: '80px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{item.code}</div>
              <div style={{ fontSize: '11px', color: '#666' }}>v{item.version}</div>
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: '0 0 5px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>{item.title}</span>
                {item.is_record && (
                  <span title="Es un registro (evidencia)" style={{ fontSize: '0.7rem', background: '#e0f2fe', color: '#075985', padding: '0.1rem 0.4rem', borderRadius: '999px' }}>
                    <FileCheck size={10} style={{ verticalAlign: 'middle' }} /> Registro
                  </span>
                )}
              </h4>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '12px', flexWrap: 'wrap' }}>
                <span style={{ color: getTypeColor(item.type), fontWeight: 'bold' }}>{item.type}</span>
                <span style={{
                  background: sc.bg, color: sc.fg, padding: '0.15rem 0.5rem',
                  borderRadius: '4px', fontWeight: 600, border: `1px solid ${sc.stripe}`
                }}>{item.status}</span>
                {showArea && item.area && (
                  <span style={{ background: '#eef2ff', color: '#3730a3', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.72rem' }}>
                    <FolderOpen size={10} style={{ verticalAlign: 'middle' }} /> {item.area}
                  </span>
                )}
                {item.document_owner && (
                  <span style={{ color: '#64748b' }}>· {item.document_owner}</span>
                )}
              </div>
              {reviewOverdue && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <AlertTriangle size={12} /> Revisión vencida ({item.review_date}). Reevaluar urgente.
                </div>
              )}
              {reviewDueSoon && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <AlertTriangle size={12} /> Próxima revisión: {item.review_date}
                </div>
              )}
              {item.status === 'Vigente' && approver && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <ShieldCheck size={14} style={{ color: STATUS_COLORS['Vigente'].stripe }} />
                  Aprobado por <strong>{approver.full_name}</strong> el {new Date(item.approved_at).toLocaleDateString()}
                  {item.content_hash && (
                    <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                      · hash {item.content_hash.substring(0, 10)}…
                    </span>
                  )}
                </div>
              )}
              {item.status === 'En Revisión' && approval && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  Esperando aprobación · solicitado por {members[approval.requested_by]?.full_name || '?'}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '170px', alignItems: 'flex-end' }}>
            {/* Botón ABRIR — protagonista cuando hay link */}
            {(item.content_url || item.storage_path) && (
              <button onClick={() => onDownload(item)}
                style={{
                  padding: '8px 14px', background: '#4f46e5', color: 'white', border: 'none',
                  borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                  display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600
                }}>
                <ExternalLink size={14} /> Abrir {provider ? `· ${provider.split(' ')[0]}` : ''}
              </button>
            )}
            {can.write && editable && (
              <button onClick={() => onSubmitApproval(item)}
                style={{ padding: '6px 10px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Send size={12} /> Enviar a revisión
              </button>
            )}
            {can.write && (item.status === 'Vigente' || item.status === 'Obsoleto') && (
              <button onClick={() => onNuevaVersion(item)}
                style={{ padding: '6px 10px', background: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Pencil size={12} /> Nueva versión
              </button>
            )}
            {can.write && editable && (
              <button onClick={() => onEditDraft(item)}
                style={{ padding: '6px 10px', background: '#e2e6ea', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Pencil size={12} /> Editar borrador
              </button>
            )}
            {can.write && item.status === 'Vigente' && (
              <button onClick={() => onMarcarObsoleto(item)}
                style={{ padding: '6px 10px', background: '#f1f3f5', color: '#6c757d', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Archive size={12} /> Marcar obsoleto
              </button>
            )}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => onDetail(item)}
                style={{ padding: '6px 8px', background: '#e2e6ea', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                title="Ver detalle">
                <Eye size={12} />
              </button>
              <button onClick={() => onHistorial(item.document_group_id)}
                style={{ padding: '6px 8px', background: '#e2e6ea', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                title="Historial">
                <History size={12} />
              </button>
              {can.admin && editable && (
                <button onClick={() => onDelete(item.id)}
                  style={{ padding: '6px 8px', color: 'var(--danger-text)', background: 'none', border: 'none', cursor: 'pointer' }}
                  title="Eliminar">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {historialGroupId === item.document_group_id && (
        <div style={{ marginLeft: '40px', marginTop: '5px', borderLeft: '2px solid #ddd', paddingLeft: '10px' }}>
          {historialItems.length === 0 && <p style={{ fontSize: '12px', color: '#666' }}>Cargando historial...</p>}
          {historialItems.map(hist => {
            const hsc = STATUS_COLORS[hist.status] || STATUS_COLORS['Borrador']
            return (
              <div key={hist.id} style={{ padding: '5px', fontSize: '12px', color: '#555', backgroundColor: hist.id === item.id ? '#e8f0fe' : 'transparent', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontWeight: 'bold', width: '40px' }}>v{hist.version}</span>
                  <span style={{ width: '80px' }}>{new Date(hist.created_at).toLocaleDateString()}</span>
                  <span style={{ flex: 1 }}>{hist.title}</span>
                  <span style={{ background: hsc.bg, color: hsc.fg, padding: '0 0.4rem', borderRadius: '3px' }}>{hist.status}</span>
                  {(hist.storage_path || hist.content_url) && (
                    <button onClick={() => onDownload(hist)} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}>
                      Ver
                    </button>
                  )}
                </div>
                {hist.change_summary && (
                  <div style={{ marginLeft: '50px', fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                    ↳ {hist.change_summary}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ----- Parser tolerante (mismo patrón que CommunicationMatrix) -----
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
