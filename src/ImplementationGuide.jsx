// ImplementationGuide: recorre las cláusulas 4 a 10 de ISO 9001:2015, muestra
// avance real basado en datos en BD, y permite cargar plantillas iniciales
// (función seed_organization en Postgres) si la org está vacía.
//
// Esta es la pantalla principal del owner cuando arranca: le marca qué falta
// para acreditarse y dónde ir.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import {
  CheckCircle2, Circle, ArrowRight, Sparkles, AlertCircle,
  Target, Users, FileText, RefreshCcw, Award, UserCheck,
  ShieldAlert, Briefcase, Search, AlertTriangle, Map, Download,
  Ruler, FlaskConical, Boxes, ClipboardList, Scale
} from 'lucide-react'
import { exportRisksMatrix } from './exports/exportRisksMatrix'
import { exportStakeholdersMatrix } from './exports/exportStakeholdersMatrix'
import { exportQualityManual } from './exports/exportQualityManual'
import { personalizeFromProfile, hasUsefulProfile } from './aiPersonalizer'
import OfficialReportSlot from './OfficialReportSlot'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

// Definición declarativa de cada cláusula: qué tablas la cubren y umbral mínimo
// para considerarla "razonablemente lista".
const CLAUSES = [
  {
    id: '4', title: 'Contexto de la organización', icon: Map, vista: 'contexto',
    description: 'Análisis FODA, partes interesadas, alcance del SGC y mapa de procesos.',
    checks: [
      { label: 'Factores de contexto (FODA)', table: 'context_analysis', min: 4, goTo: 'contexto' },
      { label: 'Partes interesadas', table: 'stakeholders', min: 3, goTo: 'stakeholders' },
      { label: 'Declaración de alcance', table: 'scope_declaration', min: 1, goTo: 'alcance' },
      { label: 'Procesos caracterizados', table: 'processes', min: 3, goTo: 'procesos' },
    ],
  },
  {
    id: '5', title: 'Liderazgo', icon: Award, vista: 'politica',
    description: 'Política de calidad, roles y responsabilidades.',
    checks: [
      { label: 'Política de calidad', table: 'quality_policy', min: 1, goTo: 'politica' },
      { label: 'Perfiles de cargo definidos', table: 'job_descriptions', min: 2, goTo: 'roles' },
    ],
  },
  {
    id: '6', title: 'Planificación', icon: Target, vista: 'riesgos',
    description: 'Riesgos y oportunidades, objetivos de calidad SMART.',
    checks: [
      { label: 'Riesgos identificados', table: 'risk_matrix', min: 3, goTo: 'riesgos' },
      { label: 'Objetivos de calidad', table: 'quality_objectives', min: 2, goTo: 'objetivos' },
    ],
  },
  {
    id: '7', title: 'Apoyo', icon: Users, vista: 'personal',
    description: 'Personal, comunicaciones, documentación.',
    checks: [
      { label: 'Personal registrado', table: 'personnel', min: 1, goTo: 'personal' },
      { label: 'Matriz de comunicaciones', table: 'communication_matrix', min: 1, goTo: 'comunicaciones' },
      { label: 'Documentación del SGC', table: 'documents_versions', min: 3, goTo: 'documentos' },
    ],
  },
  {
    id: '8', title: 'Operación', icon: Briefcase, vista: 'proveedores',
    description: 'Proveedores, pedidos de cliente, producción y liberación.',
    checks: [
      { label: 'Proveedores evaluados', table: 'suppliers', min: 1, goTo: 'proveedores' },
      { label: 'Pedidos / requisitos del cliente', table: 'customer_orders', min: 1, goTo: 'ventas' },
      { label: 'Producción / prestación', table: 'production_orders', min: 1, goTo: 'produccion' },
    ],
  },
  {
    id: '9', title: 'Evaluación del desempeño', icon: Search, vista: 'auditorias',
    description: 'Auditorías internas y revisión por la dirección.',
    checks: [
      { label: 'Auditoría interna realizada', table: 'internal_audits', min: 1, goTo: 'auditorias' },
      { label: 'Revisión por la dirección', table: 'management_review', min: 1, goTo: 'revision_direccion' },
    ],
  },
  {
    id: '10', title: 'Mejora', icon: AlertTriangle, vista: 'no_conformidades',
    description: 'No conformidades, acciones correctivas, mejora continua.',
    checks: [
      { label: 'No conformidades gestionadas', table: 'non_conformities', min: 1, goTo: 'no_conformidades' },
    ],
  },
]

// ─── ISO/IEC 17020, solo si la organización activó el módulo ────────────────
//
// El capítulo 8 de la 17020 se cumple con el SGC ISO 9001 por la vía de la
// cláusula 8.1.3, así que lo que se mide acá es SOLO lo que la 9001 no pide:
// alcance técnico, métodos, ítems, inspectores autorizados e informes.
const ISO17020_CLAUSES = [
  {
    id: '5.2 / 7.2', title: 'Alcance técnico y métodos', icon: Ruler, vista: 'inspeccion',
    description: 'Qué actividades de inspección se ofrecen y con qué método documentado se ejecutan.',
    checks: [
      { label: 'Actividades declaradas en el alcance', table: 'inspection_scopes', min: 1, goTo: 'inspeccion' },
      { label: 'Métodos vigentes', key: 'methods_vigentes', table: 'inspection_methods',
        eq: ['status', 'Vigente'], min: 1, goTo: 'inspeccion' },
    ],
  },
  {
    id: '7.3', title: 'Ítems a inspeccionar', icon: Boxes, vista: 'inspeccion',
    description: 'Identificación única de cada ítem y verificación de que está listo antes de tocarlo.',
    checks: [
      { label: 'Ítems registrados', table: 'inspection_items', min: 1, goTo: 'inspeccion' },
      { label: 'Ítems verificados como listos', key: 'items_listos', table: 'inspection_items',
        eq: ['readiness_verified', true], min: 1, goTo: 'inspeccion' },
    ],
  },
  {
    id: '6.1', title: 'Inspectores autorizados', icon: UserCheck, vista: 'inspectores',
    description: 'Certificación vigente, autorización formal por método y monitoreo en campo.',
    checks: [
      { label: 'Certificaciones cargadas', table: 'inspector_certifications', min: 1, goTo: 'inspectores' },
      { label: 'Autorizaciones activas', key: 'auth_activas', table: 'inspector_authorizations',
        eq: ['status', 'Activa'], min: 1, goTo: 'inspectores' },
      { label: 'Monitoreos registrados', table: 'inspector_monitoring', min: 1, goTo: 'inspectores' },
    ],
  },
  {
    id: '7.4 / 7.6', title: 'Inspecciones e informes', icon: ClipboardList, vista: 'inspeccion',
    description: 'El registro de campo de cada inspección y el informe con dictamen firmado.',
    checks: [
      { label: 'Inspecciones registradas', table: 'inspections', min: 1, goTo: 'inspeccion' },
      { label: 'Informes emitidos', key: 'informes_emitidos', table: 'inspection_reports',
        eq: ['status', 'Emitido'], min: 1, goTo: 'inspeccion' },
    ],
  },
]

// Qué requisito de la 17020 ya queda cubierto con lo que la empresa hace por
// ISO 9001, y con qué módulo. Esto es lo que se le muestra al evaluador.
const CROSSWALK = [
  ['4.1 Imparcialidad', 'Riesgos y oportunidades (6.1) + Política', 'Falta la declaración de imparcialidad y el análisis de riesgos a la imparcialidad', 'riesgos'],
  ['5.1 Organización', 'Organigrama y perfiles de cargo (5.3)', 'Agregar la figura del responsable técnico y su suplente', 'roles'],
  ['6.1 Personal', 'Personal y formación (7.2)', 'Lo específico ya está: certificación por método, autorización y monitoreo', 'inspectores'],
  ['6.2 Instalaciones y equipos', 'Infraestructura y calibración (7.1)', 'Vincular cada equipo de medición con su certificado de calibración', 'calibracion'],
  ['7.1 Método y procedimientos', 'Información documentada (7.5)', 'Los métodos viven en el módulo de Inspección, con validación', 'inspeccion'],
  ['7.5 Registros', 'Control de documentos y registros (7.5)', 'Los registros de inspección ya quedan en el módulo', 'documentos'],
  ['7.6 Informes', 'Liberación del producto (8.6)', 'El informe con dictamen reemplaza al acta de liberación', 'inspeccion'],
  ['8.3 Documentación', 'Documentos del SGC', 'Sirve tal cual, no hay que duplicarlo', 'documentos'],
  ['8.5 Acciones ante riesgos', 'Matriz de riesgos', 'Sumar los riesgos propios de inspección (imparcialidad, competencia)', 'riesgos'],
  ['8.6 Mejora', 'Oportunidades de mejora y no conformidades', 'Sirve tal cual', 'no_conformidades'],
  ['8.7 Acciones correctivas', 'No conformidades y acciones', 'Sirve tal cual', 'no_conformidades'],
  ['8.8 Auditorías internas', 'Auditorías internas (9.2)', 'El programa debe cubrir además los requisitos técnicos de la 17020', 'auditorias'],
  ['8.9 Revisión por la dirección', 'Revisión por la dirección (9.3)', 'Agregar imparcialidad, apelaciones, quejas y monitoreo de inspectores a la agenda', 'revision_direccion'],
]

// Lo que todavía no está en el sistema y lo que se resuelve fuera de él
const PENDIENTES_SISTEMA = [
  'Quejas y apelaciones con revisión independiente (7.5 / 7.6 de la edición 2026)',
  'Registro de riesgos a la imparcialidad y su tratamiento (4.1)',
  'Validez de resultados: reinspecciones, comparaciones y control de datos (7.5)',
]
const PENDIENTES_FUERA = [
  'Seguro de responsabilidad civil dimensionado según el análisis de riesgos (5.2.4)',
  'Condiciones contractuales de inspección con el cliente (5.2.5)',
  'Política de imparcialidad y de remuneración que no premie por resultado (4.1)',
  'Solicitud formal ante el organismo de acreditación con el alcance declarado',
]

export default function ImplementationGuide({ alCambiarVista }) {
  const { org, can } = useOrg()
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [seedingPhase, setSeedingPhase] = useState('')   // '' | 'personalizing' | 'seeding'
  const [msg, setMsg] = useState(null)
  const [profile, setProfile] = useState(null)

  // Cargamos el ADN/perfil de la empresa para decidir si activar personalización IA.
  useEffect(() => {
    if (!org) return
    supabase.from('company_profile').select('*').limit(1).maybeSingle().then(({ data }) => {
      setProfile(data || null)
    })
  }, [org?.id])

  const inspectionOn = !!org?.inspection_module_enabled

  const loadCounts = async () => {
    setLoading(true)
    // Cada check se cuenta por su clave: algunos filtran (métodos vigentes,
    // autorizaciones activas, informes emitidos) y no sirve contar la tabla entera.
    const checks = [
      ...CLAUSES.flatMap(c => c.checks),
      ...(inspectionOn ? ISO17020_CLAUSES.flatMap(c => c.checks) : []),
    ]
    const seen = new Set()
    const result = {}
    await Promise.all(checks.map(async (k) => {
      const key = k.key || k.table
      if (seen.has(key)) return
      seen.add(key)
      let q = supabase.from(k.table).select('id', { count: 'exact', head: true })
      if (k.eq) q = q.eq(k.eq[0], k.eq[1])
      const { count } = await q
      result[key] = count ?? 0
    }))
    setCounts(result)
    setLoading(false)
  }

  useEffect(() => { if (org) loadCounts() }, [org?.id, inspectionOn])

  const totalProgress = useMemo(() => {
    const all = CLAUSES.flatMap(c => c.checks)
    const done = all.filter(k => (counts[k.table] ?? 0) >= k.min).length
    return all.length === 0 ? 0 : Math.round((done / all.length) * 100)
  }, [counts])

  const isOrgEmpty = useMemo(() => {
    return Object.values(counts).every(c => c === 0)
  }, [counts])

  const handleSeed = async () => {
    const useAI = hasUsefulProfile(profile)
    const confirmMsg = useAI
      ? `Vamos a personalizar las plantillas usando los datos de "${profile.name}" (${profile.industry}). Tarda 5-15 segundos. ¿Continuar?`
      : 'Esto cargará plantillas genéricas en los módulos vacíos. Puedes editarlas después. ¿Continuar?'
    if (!await confirm(confirmMsg)) return

    setSeeding(true)
    setMsg(null)
    let customLoaded = 0

    // ---- Fase 1: si hay ADN, pedimos a la IA que personalice FODA/Policy/Stake/Risks
    if (useAI) {
      setSeedingPhase('personalizing')
      const result = await personalizeFromProfile(profile)
      if (result.ok) {
        const { data: customData, error: customErr } = await supabase.rpc('seed_org_custom', {
          target_org_id: org.id,
          custom_data: result.data,
        })
        if (customErr) {
          console.error('seed_org_custom falló:', customErr)
        } else {
          customLoaded = Object.keys(customData || {}).length
        }
      } else {
        console.warn('Personalización IA falló, usando plantilla estática:', result.error)
      }
    }

    // ---- Fase 2: seed estático para los módulos que NO personalizamos (o como fallback)
    setSeedingPhase('seeding')
    const { data, error } = await supabase.rpc('seed_organization', { target_org_id: org.id })
    setSeeding(false)
    setSeedingPhase('')

    if (error) {
      setMsg({ kind: 'err', text: error.message })
    } else {
      const total = Object.keys(data || {}).length + customLoaded
      const tag = useAI && customLoaded > 0 ? ' (con personalización IA)' : ''
      setMsg({ kind: 'ok', text: `Plantillas cargadas en ${total} módulos${tag}. Revisalas y adaptalas.` })
      loadCounts()
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px' }}>
      <h1 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Target size={28} /> Guía de Implementación ISO 9001:2015
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginTop: '-0.5rem' }}>
        Avance del Sistema de Gestión de Calidad para <strong>{org?.name}</strong>.
      </p>

      <ProgressBar value={totalProgress} loading={loading} />

      {can.admin && !loading && (
        <div className="card" style={{
          padding: '1.5rem', marginBottom: '1.5rem',
          borderLeft: `4px solid ${hasUsefulProfile(profile) ? '#7c3aed' : 'var(--primary-color)'}`,
          background: hasUsefulProfile(profile) ? 'linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%)' : undefined,
        }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={20} style={{ color: hasUsefulProfile(profile) ? '#7c3aed' : 'var(--primary-color)' }} />
            {isOrgEmpty
              ? (hasUsefulProfile(profile) ? `Empezar con plantillas personalizadas para ${profile.name}` : 'Empezar con plantillas')
              : (hasUsefulProfile(profile) ? `Completar módulos vacíos (personalizado para ${profile.name})` : 'Completar módulos vacíos con plantillas')
            }
          </h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            {hasUsefulProfile(profile) ? (
              <>
                Detectamos tu ADN cargado (<strong>{profile.industry}</strong>). La IA va a generar FODA,
                Política, Stakeholders y Riesgos adaptados a tu sector y a "{profile.name}". El resto se
                carga con plantillas base. Solo se llenan módulos vacíos — lo que ya tienes queda intacto.
              </>
            ) : (
              isOrgEmpty
                ? 'Tu organización está vacía. Puedes cargar plantillas ISO 9001 ya redactadas (FODA, política, riesgos, objetivos, perfiles, documentos) para tener algo concreto que editar. Tip: carga el ADN de la Empresa primero y las plantillas se personalizan con IA.'
                : 'Esta acción solo cargará plantillas en los módulos que estén vacíos. Los módulos con datos no se modifican. Tip: carga el ADN de la Empresa y las plantillas se personalizan con IA.'
            )}
          </p>
          <button className="btn btn-primary" disabled={seeding} onClick={handleSeed} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {seeding ? (
              seedingPhase === 'personalizing'
                ? <>🤖 Personalizando para {profile?.name}...</>
                : <>Cargando plantillas...</>
            ) : (
              hasUsefulProfile(profile)
                ? <><Sparkles size={16} /> Cargar plantillas personalizadas con IA</>
                : (isOrgEmpty ? 'Cargar plantillas iniciales' : 'Cargar plantillas en módulos vacíos')
            )}
          </button>
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

      <div style={{ display: 'grid', gap: '1rem' }}>
        {CLAUSES.map((c) => (
          <ClauseCard key={c.id} clause={c} counts={counts} loading={loading} onGo={alCambiarVista} />
        ))}
      </div>

      {inspectionOn && (
        <Iso17020Section counts={counts} loading={loading} onGo={alCambiarVista} />
      )}

      <ExportsSection org={org} showMsg={(t, k) => setMsg({ text: t, kind: k })} />
    </div>
  )
}

function Iso17020Section({ counts, loading, onGo }) {
  const [verCruce, setVerCruce] = useState(false)
  const all = ISO17020_CLAUSES.flatMap(c => c.checks)
  const done = all.filter(k => (counts[k.key || k.table] ?? 0) >= k.min).length
  const pct = all.length ? Math.round((done / all.length) * 100) : 0

  return (
    <div style={{ marginTop: '2.5rem' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
        <ShieldAlert size={24} /> ISO/IEC 17020 — organismo de inspección
      </h2>
      <p style={{ color: 'var(--text-secondary)', marginTop: 0, maxWidth: '75ch' }}>
        Las dos normas no se llevan por separado. El <strong>capítulo 8 de la 17020 se cumple con
        el mismo SGC ISO 9001</strong> que ya estás armando arriba (es lo que permite su cláusula
        8.1.3): documentos, auditorías internas, revisión por la dirección, no conformidades y
        acciones correctivas valen para las dos. Lo que la 9001 no pide, y es lo que mide este
        bloque, son los <strong>requisitos técnicos</strong>: qué inspeccionás, con qué método,
        con qué personal autorizado y con qué informe firmado.
      </p>

      <ProgressBar value={pct} loading={loading} />

      <div style={{ display: 'grid', gap: '1rem' }}>
        {ISO17020_CLAUSES.map(c => (
          <ClauseCard key={c.id} clause={c} counts={counts} loading={loading} onGo={onGo} />
        ))}
      </div>

      <div className="card" style={{ padding: '1.25rem', marginTop: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Scale size={20} />
          <h3 style={{ margin: 0, flex: 1 }}>Qué se cruza con lo que ya hacés por ISO 9001</h3>
          <button className="btn" onClick={() => setVerCruce(v => !v)}
            style={{ background: 'transparent', border: '1px solid var(--sidebar-border)' }}>
            {verCruce ? 'Ocultar' : 'Ver el cruce'}
          </button>
        </div>
        {verCruce && (
          <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--sidebar-border)' }}>
                  <th style={{ padding: '0.5rem' }}>Requisito 17020</th>
                  <th style={{ padding: '0.5rem' }}>Lo cubre en ISO 9001</th>
                  <th style={{ padding: '0.5rem' }}>Qué falta agregar</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {CROSSWALK.map(([req, cubre, falta, goTo]) => (
                  <tr key={req} style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
                    <td style={{ padding: '0.5rem', fontWeight: 600 }}>{req}</td>
                    <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{cubre}</td>
                    <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{falta}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      <button className="btn" onClick={() => onGo?.(goTo)}
                        style={{ padding: '0.25rem 0.5rem', background: 'transparent', border: 'none', color: 'var(--primary-color)' }}>
                        <ArrowRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', marginTop: '1rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FlaskConical size={18} /> Todavía no está en el sistema
          </h3>
          <ul style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', paddingLeft: '1.1rem', margin: 0 }}>
            {PENDIENTES_SISTEMA.map(t => <li key={t} style={{ marginBottom: '0.35rem' }}>{t}</li>)}
          </ul>
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Briefcase size={18} /> Se resuelve fuera del software
          </h3>
          <ul style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', paddingLeft: '1.1rem', margin: 0 }}>
            {PENDIENTES_FUERA.map(t => <li key={t} style={{ marginBottom: '0.35rem' }}>{t}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}

function ExportsSection({ org, showMsg }) {
  const [busy, setBusy] = useState(null)

  const run = async (name, fn) => {
    setBusy(name)
    try {
      await fn(org)
    } catch (e) {
      showMsg(`Error al generar PDF: ${e.message}`, 'err')
    } finally {
      setBusy(null)
    }
  }

  const exports = [
    { id: 'manual', label: 'Manual del SGC (consolidado)', desc: 'Política + alcance + procesos + objetivos + contexto + partes interesadas, con sello del documento aprobado.', run: () => run('manual', exportQualityManual) },
    { id: 'risks', label: 'Matriz de Riesgos y Oportunidades', desc: 'ISO 9001 — 6.1. Tabla con criticidad inicial y residual.', run: () => run('risks', exportRisksMatrix) },
    { id: 'stakeholders', label: 'Matriz de Partes Interesadas', desc: 'ISO 9001 — 4.2. Necesidades, expectativas y plan de seguimiento.', run: () => run('stakeholders', exportStakeholdersMatrix) },
  ]

  return (
    <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
      <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Download size={20} /> Reportes y exportaciones (PDF)
      </h3>
      <p style={{ color: 'var(--text-secondary)', marginTop: '-0.25rem' }}>
        Genera documentos auditables a partir de los datos del SGC. El Manual incluye el sello del aprobador y el hash de integridad.
      </p>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {exports.map(e => (
          <div key={e.id} style={{ padding: '0.75rem', border: '1px solid var(--sidebar-border)', borderRadius: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{e.label}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{e.desc}</div>
              </div>
              <button className="btn btn-primary" disabled={busy === e.id} onClick={e.run}>
                {busy === e.id ? 'Generando...' : <><Download size={14} /> PDF</>}
              </button>
            </div>
            <OfficialReportSlot reportKey={e.id} />
          </div>
        ))}
      </div>
    </div>
  )
}

function ProgressBar({ value, loading }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{ fontWeight: 600 }}>Avance global</span>
        <span style={{ fontWeight: 600 }}>{loading ? '—' : `${value}%`}</span>
      </div>
      <div style={{ height: '10px', background: 'var(--sidebar-border)', borderRadius: '5px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${value}%`,
          background: value >= 80 ? 'var(--success-text, #16a34a)' : 'var(--primary-color)',
          transition: 'width 0.4s'
        }} />
      </div>
    </div>
  )
}

function ClauseCard({ clause, counts, loading, onGo }) {
  const Icon = clause.icon
  const done = clause.checks.filter(k => (counts[k.key || k.table] ?? 0) >= k.min).length
  const total = clause.checks.length
  const complete = done === total

  return (
    <div className="card" style={{ padding: '1.25rem', borderLeft: complete ? '4px solid var(--success-text, #16a34a)' : '4px solid var(--sidebar-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <Icon size={22} />
        <h3 style={{ margin: 0, flex: 1 }}>{clause.id}. {clause.title}</h3>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{done}/{total}</span>
      </div>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 0.75rem 0', fontSize: '0.9rem' }}>{clause.description}</p>

      <div style={{ display: 'grid', gap: '0.4rem' }}>
        {clause.checks.map((k, i) => {
          const n = counts[k.key || k.table] ?? 0
          const ok = n >= k.min
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
              {ok
                ? <CheckCircle2 size={16} style={{ color: 'var(--success-text, #16a34a)' }} />
                : <Circle size={16} style={{ color: 'var(--text-tertiary)' }} />}
              <span style={{ flex: 1, color: ok ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {k.label}
              </span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                {loading ? '—' : `${n} / ${k.min}`}
              </span>
              <button
                onClick={() => onGo?.(k.goTo)}
                className="btn"
                style={{ padding: '0.25rem 0.5rem', background: 'transparent', border: 'none', color: 'var(--primary-color)' }}
              >
                <ArrowRight size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
