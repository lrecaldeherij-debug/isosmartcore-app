import { useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  Network, Plus, Pencil, Trash2, X, Save, Loader2, Sparkles,
  Download, GitBranch, LayoutGrid, List, User, Crown, Users,
  Eye, ArrowRight, ShieldCheck, Building2, Briefcase, Search
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

const EMPTY_FORM = {
  title: '',
  code: '',
  area: '',
  level: '',
  parent_id: '',
  dependency: '',
  mission: '',
  current_holder: '',
  current_holder_since: '',
  is_sgc_responsible: false,
  position_index: 0,
}

// ───────────────────── Helpers IA ──────────────────────
function extractFirstJson(text) {
  if (!text) return null
  const i0 = text.indexOf('{'), i1 = text.indexOf('[')
  const start = i0 === -1 ? i1 : (i1 === -1 ? i0 : Math.min(i0, i1))
  if (start === -1) return null
  let depth = 0, inStr = false, esc = false
  const open = text[start], close = open === '[' ? ']' : '}'
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
function parseAiArray(raw) {
  const p = extractFirstJson(raw)
  if (Array.isArray(p)) return p
  if (p && Array.isArray(p.positions)) return p.positions
  if (p && Array.isArray(p.items)) return p.items
  return []
}

// ─────────────────────────────────────────────────────
export default function OrgChart({ alCambiarVista }) {
  const [jobs, setJobs] = useState([])
  const [processes, setProcesses] = useState([])
  const [personnel, setPersonnel] = useState([])
  const [orgProfile, setOrgProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const [view, setView] = useState('tree') // 'tree' | 'area' | 'list'
  const [search, setSearch] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [originalForm, setOriginalForm] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [detailItem, setDetailItem] = useState(null)

  // IA
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaSuggestions, setIaSuggestions] = useState(null)
  const [iaSelected, setIaSelected] = useState(new Set())

  const chartRef = useRef(null)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [jd, pr, ps, cp] = await Promise.all([
      supabase.from('job_descriptions').select('*').order('position_index', { ascending: true }),
      supabase.from('processes').select('id, name, type').order('name'),
      supabase.from('personnel').select('id, full_name, job_title, job_id').order('full_name'),
      supabase.from('company_profile').select('*').maybeSingle(),
    ])
    setJobs(jd.data || [])
    setProcesses(pr.data || [])
    setPersonnel(ps.data || [])
    setOrgProfile(cp.data || null)
    setLoading(false)
  }

  // ───── Tree building ─────
  const jobMap = useMemo(() => Object.fromEntries(jobs.map(j => [j.id, j])), [jobs])

  const tree = useMemo(() => {
    const children = {}
    const roots = []
    for (const j of jobs) {
      if (j.parent_id && jobMap[j.parent_id]) {
        (children[j.parent_id] ||= []).push(j)
      } else {
        roots.push(j)
      }
    }
    for (const k in children) children[k].sort((a, b) => (a.position_index || 0) - (b.position_index || 0))
    roots.sort((a, b) => (a.position_index || 0) - (b.position_index || 0))
    return { roots, children }
  }, [jobs, jobMap])

  const byArea = useMemo(() => {
    const groups = {}
    for (const j of jobs) {
      const k = j.area || 'Sin área'
      if (!groups[k]) groups[k] = []
      groups[k].push(j)
    }
    for (const k in groups) groups[k].sort((a, b) => (a.position_index || 0) - (b.position_index || 0))
    return groups
  }, [jobs])

  const personnelByJob = useMemo(() => {
    const m = {}
    for (const p of personnel) {
      if (p.job_id) (m[p.job_id] ||= []).push(p)
    }
    return m
  }, [personnel])

  // ───── Stats ─────
  const stats = useMemo(() => {
    const total = jobs.length
    const ocupados = jobs.filter(j => j.current_holder || (personnelByJob[j.id]?.length)).length
    const vacantes = total - ocupados
    const cobertura = total ? Math.round((ocupados / total) * 100) : 0
    const areas = new Set(jobs.map(j => j.area).filter(Boolean)).size
    const sgcResp = jobs.filter(j => j.is_sgc_responsible).length
    return { total, ocupados, vacantes, cobertura, areas, sgcResp }
  }, [jobs, personnelByJob])

  // ───── Filtros ─────
  const matchSearch = (j) => {
    if (!search) return true
    const s = search.toLowerCase()
    return `${j.title || ''} ${j.code || ''} ${j.current_holder || ''} ${j.area || ''}`.toLowerCase().includes(s)
  }

  // ───── Helpers ─────
  const getDescendants = (id) => {
    const out = new Set([id])
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop()
      for (const ch of tree.children[cur] || []) {
        if (!out.has(ch.id)) { out.add(ch.id); stack.push(ch.id) }
      }
    }
    return out
  }

  const diffChanges = (orig, curr) => {
    const changes = []
    const keys = new Set([...Object.keys(orig || {}), ...Object.keys(curr || {})])
    keys.forEach(k => {
      const a = JSON.stringify(orig?.[k] ?? null)
      const b = JSON.stringify(curr?.[k] ?? null)
      if (a !== b) changes.push({ field: k, from: orig?.[k] ?? null, to: curr?.[k] ?? null })
    })
    return changes
  }

  // ───── CRUD ─────
  const openNew = (parentId = '') => {
    setForm({ ...EMPTY_FORM, parent_id: parentId })
    setEditingId(null)
    setOriginalForm(null)
    setShowForm(true)
  }

  const openEdit = (job) => {
    const f = {
      ...EMPTY_FORM,
      ...job,
      parent_id: job.parent_id || '',
      current_holder_since: job.current_holder_since || '',
      position_index: job.position_index ?? 0,
      is_sgc_responsible: !!job.is_sgc_responsible,
    }
    setForm(f)
    setOriginalForm(f)
    setEditingId(job.id)
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (editingId && form.parent_id) {
      // Evitar ciclos: el padre no puede ser uno de los descendientes
      const desc = getDescendants(editingId)
      if (desc.has(form.parent_id)) {
        toast.error('No puedes asignar como padre a un cargo que ya depende de éste (crearía un ciclo)')
        return
      }
    }
    const payload = {
      ...form,
      parent_id: form.parent_id || null,
      current_holder_since: form.current_holder_since || null,
      position_index: Number(form.position_index) || 0,
      is_sgc_responsible: !!form.is_sgc_responsible,
    }
    if (editingId) {
      const changes = diffChanges(originalForm, form)
      if (changes.length) {
        payload.change_log = [...(originalForm?.change_log || []), { at: new Date().toISOString(), changes }]
      }
      const { error } = await supabase.from('job_descriptions').update(payload).eq('id', editingId)
      if (error) { toast.error(error.message); return }
      toast.success('Cargo actualizado')
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: form.title }] }]
      const { error } = await supabase.from('job_descriptions').insert([payload])
      if (error) { toast.error(error.message); return }
      toast.success('Cargo creado')
    }
    setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setOriginalForm(null)
    fetchAll()
  }

  const handleDelete = async (id) => {
    const childs = tree.children[id] || []
    const message = childs.length > 0
      ? `Este cargo tiene ${childs.length} subordinado(s). ¿Eliminar igual? Los hijos quedarán sin padre.`
      : '¿Eliminar este cargo?'
    if (!await confirm(message, { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('job_descriptions').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Cargo eliminado')
    fetchAll()
  }

  // ───── Export PNG ─────
  const exportarPNG = async () => {
    if (!chartRef.current) return
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(chartRef.current, { background: '#ffffff', scale: 2 })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `organigrama_${(orgProfile?.company_name || 'empresa').replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.png`
      a.click()
      toast.success('Organigrama exportado')
    } catch (err) {
      toast.error('Error al exportar: ' + err.message)
    }
  }

  // ───── IA: Sugerir estructura ─────
  const sugerirEstructuraIA = async () => {
    setLoadingIA(true); setIaSuggestions(null)
    try {
      const empresa = orgProfile?.company_name || 'la empresa'
      const sector = orgProfile?.sector || ''
      const tamano = orgProfile?.size || ''
      const ctxProc = processes.slice(0, 20).map(p => ({ nombre: p.name, tipo: p.type }))
      const ctxJobs = jobs.map(j => ({ titulo: j.title, area: j.area, nivel: j.level }))

      const prompt = `Eres consultor ISO 9001 experto en diseño organizacional. Diseña una estructura jerárquica completa para ${empresa}${sector ? ' (' + sector + ')' : ''}${tamano ? ' tamaño ' + tamano : ''} adecuada al SGC según cláusula 5.3.

PROCESOS QUE OPERA LA EMPRESA:
${JSON.stringify(ctxProc, null, 2)}

CARGOS YA REGISTRADOS (no los repitas, solo agrega lo que falta):
${JSON.stringify(ctxJobs, null, 2)}

Devuelve SOLO un JSON array de cargos a CREAR, sin markdown. Cada cargo:
- title (string, título del cargo)
- code (string, código corto ej "GG-01")
- area (string, departamento/área — usa nombres consistentes como "Dirección", "Producción", "Calidad", "Comercial", "Administración", "Logística", etc.)
- level (Estratégico | Táctico | Operativo)
- parent_title (string, título exacto del cargo padre — usa los del listado existente o uno que vayas a crear en este mismo JSON)
- mission (string corto, propósito del cargo)
- is_sgc_responsible (boolean, true si es responsable del SGC — normalmente solo uno)

Diseña una estructura coherente:
- Empieza por la cúspide (Dirección/Gerencia General)
- Bajá por áreas funcionales
- Cubrí los procesos del listado
- Marcá UN solo cargo como responsable del SGC (típico: Gerente de Calidad o Responsable SGC)
- Mantené 3-5 niveles jerárquicos máximo
- 8-15 cargos en total`

      const raw = await consultarIA(prompt, 'Devuelve ÚNICAMENTE JSON array válido.')
      console.log('[IA OrgChart] raw:', raw)
      const arr = parseAiArray(raw)
      if (!arr.length) throw new Error('La IA no devolvió cargos parseables')
      setIaSuggestions(arr)
      setIaSelected(new Set(arr.map((_, i) => i)))
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  const saveIaStructure = async () => {
    if (!iaSuggestions) return
    // Insertar en dos pasos: primero todos sin parent_id, después linkear
    const seleccionados = iaSuggestions.filter((_, i) => iaSelected.has(i))
    if (!seleccionados.length) return toast.warning('No hay cargos seleccionados')

    // Paso 1: insertar todos sin parent
    const rows = seleccionados.map((s, idx) => ({
      title: s.title || 'Sin título',
      code: s.code || '',
      area: s.area || '',
      level: ['Estratégico', 'Táctico', 'Operativo'].includes(s.level) ? s.level : 'Operativo',
      mission: s.mission || '',
      is_sgc_responsible: !!s.is_sgc_responsible,
      position_index: idx,
      change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: 'IA OrgChart' }] }]
    }))
    const { data: inserted, error } = await supabase.from('job_descriptions').insert(rows).select('id, title')
    if (error) { toast.error(error.message); return }

    // Paso 2: resolver parent_id por título (incluye jobs existentes + recién insertados)
    const allJobs = [...jobs, ...(inserted || [])]
    const updates = []
    seleccionados.forEach((s, idx) => {
      const newJob = inserted[idx]
      if (!newJob) return
      const parentTitle = (s.parent_title || '').toLowerCase().trim()
      if (!parentTitle) return
      const parent = allJobs.find(j => j.title?.toLowerCase().trim() === parentTitle && j.id !== newJob.id)
      if (parent) updates.push({ id: newJob.id, parent_id: parent.id })
    })
    for (const u of updates) {
      await supabase.from('job_descriptions').update({ parent_id: u.parent_id }).eq('id', u.id)
    }

    toast.success(`${rows.length} cargos creados${updates.length ? ' · ' + updates.length + ' vínculos resueltos' : ''}`)
    setIaSuggestions(null); setIaSelected(new Set())
    fetchAll()
  }

  // ───────────────────── UI ──────────────────────
  return (
    <div className="fade-in" style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Network size={28} color="#0891b2" /> Organigrama
          </h2>
          <p style={{ color: '#64748b', margin: '5px 0 0 0', fontSize: '14px' }}>
            ISO 9001 — 5.3 Estructura organizacional, dependencia jerárquica y responsable del SGC.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={sugerirEstructuraIA} disabled={loadingIA} style={btn('#7c3aed')}>
            {loadingIA ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} IA: sugerir estructura
          </button>
          <button onClick={() => alCambiarVista && alCambiarVista('personal')} style={btn('#6b7280')}>
            <Users size={16} /> Ver Personal
          </button>
          <button onClick={() => alCambiarVista && alCambiarVista('roles')} style={btn('#6b7280')}>
            <Briefcase size={16} /> Roles
          </button>
          <button onClick={exportarPNG} style={btn('#16a34a')}><Download size={16} /> PNG</button>
          <button onClick={() => openNew()} style={btn('#0891b2')}><Plus size={16} /> Cargo</button>
        </div>
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['5.3']} />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <Kpi label="Cargos totales" value={stats.total} color="#0891b2" icon={<Briefcase size={16} />} />
        <Kpi label="Ocupados" value={stats.ocupados} color="#16a34a" icon={<User size={16} />} />
        <Kpi label="Vacantes" value={stats.vacantes} color="#dc2626" icon={<User size={16} />} />
        <Kpi label="Cobertura" value={`${stats.cobertura}%`} color="#7c3aed" icon={<Users size={16} />} />
        <Kpi label="Áreas" value={stats.areas} color="#f59e0b" icon={<Building2 size={16} />} />
        <Kpi label="Resp. SGC" value={stats.sgcResp} color="#16a34a" icon={<ShieldCheck size={16} />} />
      </div>

      {/* IA panel */}
      {iaSuggestions && (
        <IaPanel
          items={iaSuggestions}
          selected={iaSelected}
          onToggle={i => setIaSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })}
          onSave={saveIaStructure}
          onClose={() => { setIaSuggestions(null); setIaSelected(new Set()) }}
        />
      )}

      {/* Tabs vista + búsqueda */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '4px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '2px', background: 'white' }}>
          <button onClick={() => setView('tree')} style={vbtn(view === 'tree')}><GitBranch size={14} /> Árbol</button>
          <button onClick={() => setView('area')} style={vbtn(view === 'area')}><LayoutGrid size={14} /> Por área</button>
          <button onClick={() => setView('list')} style={vbtn(view === 'list')}><List size={14} /> Lista</button>
        </div>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            placeholder="Buscar cargo, titular, área…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 32px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
          />
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <FormCard
          form={form}
          setForm={setForm}
          editing={!!editingId}
          jobs={jobs.filter(j => j.id !== editingId)}
          personnel={personnel}
          onSubmit={handleSubmit}
          onCancel={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM) }}
        />
      )}

      {/* Visualización */}
      {loading ? (
        <p style={{ color: '#64748b' }}>Cargando…</p>
      ) : jobs.length === 0 ? (
        <div style={emptyState}>
          <Network size={40} color="#cbd5e1" />
          <p style={{ color: '#64748b', marginTop: '8px' }}>Sin cargos cargados todavía. Usa IA para sugerir una estructura o creá el primer cargo.</p>
        </div>
      ) : (
        <div ref={chartRef} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px', overflowX: 'auto' }}>
          {view === 'tree' && (
            <TreeView
              roots={tree.roots.filter(matchSearch).length ? tree.roots : tree.roots}
              tree={tree}
              jobMap={jobMap}
              personnelByJob={personnelByJob}
              search={search}
              onClick={setDetailItem}
              onAddChild={openNew}
            />
          )}
          {view === 'area' && <AreaView byArea={byArea} matchSearch={matchSearch} personnelByJob={personnelByJob} onClick={setDetailItem} />}
          {view === 'list' && <ListView jobs={jobs.filter(matchSearch)} jobMap={jobMap} personnelByJob={personnelByJob} onClick={setDetailItem} onEdit={openEdit} onDelete={handleDelete} />}
        </div>
      )}

      {/* Modal Detalle */}
      {detailItem && (
        <DetailModal
          item={detailItem}
          jobMap={jobMap}
          children={tree.children[detailItem.id] || []}
          personnel={personnelByJob[detailItem.id] || []}
          onClose={() => setDetailItem(null)}
          onEdit={() => { openEdit(detailItem); setDetailItem(null) }}
          onAddChild={() => { openNew(detailItem.id); setDetailItem(null) }}
          onDelete={() => { handleDelete(detailItem.id); setDetailItem(null) }}
        />
      )}
    </div>
  )
}

// ─────────────────── Subcomponentes ───────────────────

function Kpi({ label, value, color, icon }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderLeft: `4px solid ${color}`, borderRadius: '8px', padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color, marginBottom: '2px' }}>
        {icon}
        <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: '#64748b' }}>{label}</span>
      </div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>{value}</div>
    </div>
  )
}

function TreeView({ roots, tree, jobMap, personnelByJob, search, onClick, onAddChild }) {
  if (!roots || roots.length === 0) {
    return <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>Sin cargos raíz.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center' }}>
      {roots.map(r => (
        <TreeNode key={r.id} job={r} tree={tree} personnelByJob={personnelByJob} search={search} onClick={onClick} onAddChild={onAddChild} />
      ))}
    </div>
  )
}

function TreeNode({ job, tree, personnelByJob, search, onClick, onAddChild }) {
  const children = tree.children[job.id] || []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <JobCard job={job} personnel={personnelByJob[job.id] || []} onClick={() => onClick(job)} highlight={!!search && `${job.title || ''} ${job.current_holder || ''} ${job.area || ''}`.toLowerCase().includes(search.toLowerCase())} />
      <button onClick={() => onAddChild(job.id)} style={{ marginTop: '4px', background: '#f1f5f9', border: '1px dashed #cbd5e1', color: '#475569', cursor: 'pointer', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
        <Plus size={10} /> subordinado
      </button>
      {children.length > 0 && (
        <>
          <div style={{ width: '2px', height: '20px', background: '#cbd5e1', marginTop: '6px' }} />
          <div style={{ display: 'flex', gap: '20px', position: 'relative', paddingTop: '20px' }}>
            <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '2px', background: '#cbd5e1' }} />
            {children.map(ch => (
              <div key={ch.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '2px', height: '20px', background: '#cbd5e1', marginTop: '-20px', marginBottom: '6px' }} />
                <TreeNode job={ch} tree={tree} personnelByJob={personnelByJob} search={search} onClick={onClick} onAddChild={onAddChild} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function JobCard({ job, personnel, onClick, compact, highlight }) {
  const holder = job.current_holder || (personnel?.[0]?.full_name)
  const vacant = !holder
  const color = job.is_sgc_responsible ? '#16a34a' : job.level === 'Estratégico' ? '#7c3aed' : job.level === 'Táctico' ? '#0891b2' : '#0ea5e9'
  return (
    <div onClick={onClick} style={{
      background: vacant ? '#fef2f2' : 'white',
      border: '2px solid ' + (highlight ? '#f59e0b' : (vacant ? '#fca5a5' : color)),
      borderRadius: '8px', padding: compact ? '8px 10px' : '10px 12px',
      cursor: 'pointer', minWidth: compact ? '160px' : '180px', maxWidth: '220px',
      boxShadow: highlight ? '0 0 0 3px #fde68a' : '0 2px 6px rgba(0,0,0,0.06)',
      transition: 'transform 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {job.code && <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>{job.code}</div>}
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>{job.title}</div>
          {job.area && <div style={{ fontSize: '10px', color: color, marginTop: '2px', fontWeight: 600 }}>{job.area}</div>}
        </div>
        {job.is_sgc_responsible && (
          <div title="Responsable del SGC" style={{ color: '#16a34a' }}>
            <ShieldCheck size={16} />
          </div>
        )}
      </div>
      <div style={{ marginTop: '6px', fontSize: '11px', color: vacant ? '#dc2626' : '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
        {vacant ? <>🚫 VACANTE</> : <><User size={11} /> {holder}</>}
      </div>
      {(personnel?.length > 1) && (
        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>+{personnel.length - 1} más</div>
      )}
    </div>
  )
}

function AreaView({ byArea, matchSearch, personnelByJob, onClick }) {
  const areas = Object.keys(byArea).sort()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
      {areas.map(area => {
        const items = byArea[area].filter(matchSearch)
        if (items.length === 0) return null
        return (
          <div key={area} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building2 size={16} /> {area} <span style={{ color: '#94a3b8', fontWeight: 'normal' }}>· {items.length}</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {items.map(j => (
                <JobCard key={j.id} job={j} personnel={personnelByJob[j.id] || []} compact onClick={() => onClick(j)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListView({ jobs, jobMap, personnelByJob, onClick, onEdit, onDelete }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
          <th style={th}>Código</th>
          <th style={th}>Cargo</th>
          <th style={th}>Área</th>
          <th style={th}>Nivel</th>
          <th style={th}>Reporta a</th>
          <th style={th}>Titular</th>
          <th style={th}>SGC</th>
          <th style={th}></th>
        </tr>
      </thead>
      <tbody>
        {jobs.map(j => {
          const parent = j.parent_id ? jobMap[j.parent_id] : null
          const holder = j.current_holder || personnelByJob[j.id]?.[0]?.full_name
          return (
            <tr key={j.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={td}>{j.code || '—'}</td>
              <td style={{ ...td, fontWeight: 600 }}>{j.title}</td>
              <td style={td}>{j.area || '—'}</td>
              <td style={td}>{j.level || '—'}</td>
              <td style={td}>{parent ? parent.title : <span style={{ color: '#94a3b8' }}>—</span>}</td>
              <td style={td}>{holder || <span style={{ color: '#dc2626', fontWeight: 600 }}>VACANTE</span>}</td>
              <td style={td}>{j.is_sgc_responsible ? <ShieldCheck size={16} color="#16a34a" /> : ''}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                <button onClick={() => onClick(j)} style={miniBtn('#0ea5e9')}><Eye size={11} /></button>
                <button onClick={() => onEdit(j)} style={miniBtn('#6366f1')}><Pencil size={11} /></button>
                <button onClick={() => onDelete(j.id)} style={miniBtn('#dc2626')}><Trash2 size={11} /></button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function FormCard({ form, setForm, editing, jobs, personnel, onSubmit, onCancel }) {
  const set = (patch) => setForm(prev => ({ ...prev, ...patch }))
  const areas = [...new Set(jobs.map(j => j.area).filter(Boolean))].sort()
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
      <h3 style={{ marginTop: 0, color: '#0891b2' }}>{editing ? '✏️ Editar cargo' : '+ Crear cargo'}</h3>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Field label="Título *" flex={2}>
            <input required value={form.title} onChange={e => set({ title: e.target.value })} style={inputStyle} placeholder="Ej: Gerente de Calidad" />
          </Field>
          <Field label="Código">
            <input value={form.code} onChange={e => set({ code: e.target.value })} style={inputStyle} placeholder="GC-01" />
          </Field>
          <Field label="Nivel">
            <select value={form.level} onChange={e => set({ level: e.target.value })} style={inputStyle}>
              <option value="">—</option>
              <option>Estratégico</option><option>Táctico</option><option>Operativo</option>
            </select>
          </Field>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Field label="Área">
            <input list="areas-list" value={form.area} onChange={e => set({ area: e.target.value })} style={inputStyle} placeholder="Ej: Calidad" />
            <datalist id="areas-list">
              {areas.map(a => <option key={a} value={a} />)}
            </datalist>
          </Field>
          <Field label="Reporta a (padre)">
            <select value={form.parent_id} onChange={e => set({ parent_id: e.target.value })} style={inputStyle}>
              <option value="">— Sin padre (nivel raíz)</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.title}{j.area ? ' · ' + j.area : ''}</option>)}
            </select>
          </Field>
          <Field label="Orden entre hermanos">
            <input type="number" value={form.position_index} onChange={e => set({ position_index: e.target.value })} style={inputStyle} />
          </Field>
        </div>
        <Field label="Misión / propósito">
          <textarea rows={2} value={form.mission} onChange={e => set({ mission: e.target.value })} style={inputStyle} placeholder="Propósito del cargo en pocas líneas" />
        </Field>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Field label="Titular actual">
            <input list="holders-list" value={form.current_holder} onChange={e => set({ current_holder: e.target.value })} style={inputStyle} placeholder="Nombre o vacío si vacante" />
            <datalist id="holders-list">
              {personnel.map(p => <option key={p.id} value={p.full_name} />)}
            </datalist>
          </Field>
          <Field label="Asume desde">
            <input type="date" value={form.current_holder_since || ''} onChange={e => set({ current_holder_since: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="¿Responsable del SGC?" flex={0.5}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 9px', fontSize: '13px', color: '#475569' }}>
              <input type="checkbox" checked={!!form.is_sgc_responsible} onChange={e => set({ is_sgc_responsible: e.target.checked })} />
              Sí (cláusula 5.3)
            </label>
          </Field>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button type="submit" style={btn('#16a34a')}><Save size={16} /> {editing ? 'Guardar' : 'Crear'}</button>
          <button type="button" onClick={onCancel} style={btn('#6b7280')}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}

function DetailModal({ item, jobMap, children, personnel, onClose, onEdit, onAddChild, onDelete }) {
  const parent = item.parent_id ? jobMap[item.parent_id] : null
  return createPortal(
    <Backdrop onClose={onClose}>
      <Modal>
        <ModalHeader title={item.title} onClose={onClose}>
          {item.is_sgc_responsible && (
            <span style={badge({ bg: '#dcfce7', color: '#166534' })}><ShieldCheck size={12} /> Resp. SGC</span>
          )}
          {item.level && <span style={badge({ bg: '#e0e7ff', color: '#3730a3' })}>{item.level}</span>}
        </ModalHeader>

        <ModalSection title="📋 Identificación">
          <DetailGrid>
            <D label="Código">{item.code || '—'}</D>
            <D label="Área">{item.area || '—'}</D>
            <D label="Nivel">{item.level || '—'}</D>
            <D label="Reporta a">{parent ? parent.title : '— Raíz'}</D>
          </DetailGrid>
          <D label="Misión / propósito" block>{item.mission || '—'}</D>
        </ModalSection>

        <ModalSection title="👤 Titular">
          <DetailGrid>
            <D label="Titular">{item.current_holder || (personnel?.[0]?.full_name) || <span style={{ color: '#dc2626', fontWeight: 600 }}>VACANTE</span>}</D>
            <D label="Asume desde">{item.current_holder_since ? new Date(item.current_holder_since).toLocaleDateString() : '—'}</D>
          </DetailGrid>
          {personnel?.length > 0 && (
            <D label={`Personal asignado (${personnel.length})`} block>
              <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
                {personnel.map(p => <li key={p.id} style={{ fontSize: '13px' }}>{p.full_name}</li>)}
              </ul>
            </D>
          )}
        </ModalSection>

        {item.functions_json && Array.isArray(item.functions_json) && item.functions_json.length > 0 && (
          <ModalSection title="📌 Funciones">
            <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '13px', color: '#334155' }}>
              {item.functions_json.map((f, i) => <li key={i}>{typeof f === 'string' ? f : (f.title || f.description || JSON.stringify(f))}</li>)}
            </ul>
          </ModalSection>
        )}

        {item.authorities_json && Array.isArray(item.authorities_json) && item.authorities_json.length > 0 && (
          <ModalSection title="⚖️ Autoridades">
            <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '13px', color: '#334155' }}>
              {item.authorities_json.map((f, i) => <li key={i}>{typeof f === 'string' ? f : (f.title || f.description || JSON.stringify(f))}</li>)}
            </ul>
          </ModalSection>
        )}

        {children.length > 0 && (
          <ModalSection title={`👥 Subordinados directos (${children.length})`}>
            <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '13px', color: '#334155' }}>
              {children.map(c => <li key={c.id}>{c.title}{c.current_holder ? ` · ${c.current_holder}` : <span style={{ color: '#dc2626' }}> · VACANTE</span>}</li>)}
            </ul>
          </ModalSection>
        )}

        <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onAddChild} style={btn('#0891b2')}><Plus size={16} /> Subordinado</button>
          <button onClick={onEdit} style={btn('#6366f1')}><Pencil size={16} /> Editar</button>
          <button onClick={onDelete} style={btn('#dc2626')}><Trash2 size={16} /> Eliminar</button>
          <button onClick={onClose} style={btn('#6b7280')}>Cerrar</button>
        </div>
      </Modal>
    </Backdrop>,
    document.body
  )
}

function IaPanel({ items, selected, onToggle, onSave, onClose }) {
  return (
    <div style={{ background: '#f3e8ff', border: '2px solid #c084fc', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0, color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={20} /> IA: {items.length} cargos sugeridos
        </h3>
        <button onClick={onClose} style={btn('#6b7280')}><X size={14} /> Descartar</button>
      </div>
      <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'grid', gap: '6px', marginBottom: '10px' }}>
        {items.map((s, i) => (
          <label key={i} style={{
            display: 'flex', gap: '8px', padding: '8px 10px', background: 'white', borderRadius: '6px',
            cursor: 'pointer', border: '1px solid ' + (selected.has(i) ? '#a855f7' : '#e2e8f0')
          }}>
            <input type="checkbox" checked={selected.has(i)} onChange={() => onToggle(i)} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '13px' }}>
                {s.code && <span style={{ color: '#94a3b8', marginRight: '4px' }}>{s.code}</span>}
                {s.title}
                {s.is_sgc_responsible && <span style={{ marginLeft: '6px', color: '#16a34a' }}>· 🛡 Resp. SGC</span>}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                {s.area && <>🏢 {s.area}</>}
                {s.level && <> · {s.level}</>}
                {s.parent_title && <> · Reporta a: <strong>{s.parent_title}</strong></>}
              </div>
              {s.mission && <div style={{ fontSize: '12px', color: '#334155', marginTop: '4px' }}>{s.mission}</div>}
            </div>
          </label>
        ))}
      </div>
      <button onClick={onSave} style={btn('#7c3aed')}><Save size={16} /> Crear {selected.size} cargos</button>
    </div>
  )
}

// ─────────────────── Primitivas ───────────────────
function Field({ label, children, flex = 1 }) {
  return (
    <div style={{ flex: `${flex} 1 160px`, display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px' }}>
      <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>{label}</label>
      {children}
    </div>
  )
}
function Backdrop({ children, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '720px', maxHeight: '92vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
function Modal({ children }) {
  return <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden' }}>{children}</div>
}
function ModalHeader({ title, onClose, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', gap: '10px' }}>
      <h2 style={{ margin: 0, fontSize: '16px', color: '#1e293b', flex: 1 }}>{title}</h2>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}><X size={20} /></button>
    </div>
  )
}
function ModalSection({ title, children }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
      <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h4>
      {children}
    </div>
  )
}
function DetailGrid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', marginBottom: '8px' }}>{children}</div>
}
function D({ label, children, block }) {
  return (
    <div style={{ marginBottom: block ? '8px' : 0 }}>
      <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '13px', color: '#1e293b', whiteSpace: 'pre-wrap' }}>{children}</div>
    </div>
  )
}

// ─────────────────── Estilos ───────────────────
const inputStyle = { width: '100%', padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }
const emptyState = { textAlign: 'center', padding: '40px 20px', background: 'white', border: '1px dashed #cbd5e1', borderRadius: '10px' }
const th = { padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 600 }
const td = { padding: '8px', verticalAlign: 'middle' }
const btn = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px',
  background: color, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer',
  fontWeight: 600, fontSize: '13px'
})
const miniBtn = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '4px 7px', marginLeft: '4px',
  background: color, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
  fontSize: '11px', fontWeight: 600
})
const vbtn = (active) => ({
  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
  background: active ? '#0891b2' : 'transparent', color: active ? 'white' : '#475569',
  border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600
})
const badge = ({ bg, color }) => ({
  background: bg, color, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', gap: '3px'
})
