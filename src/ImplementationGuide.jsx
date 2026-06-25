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
  ShieldAlert, Briefcase, Search, AlertTriangle, Map, Download
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

  const loadCounts = async () => {
    setLoading(true)
    const tables = [...new Set(CLAUSES.flatMap(c => c.checks.map(k => k.table)))]
    const result = {}
    await Promise.all(tables.map(async (t) => {
      const { count } = await supabase.from(t).select('id', { count: 'exact', head: true })
      result[t] = count ?? 0
    }))
    setCounts(result)
    setLoading(false)
  }

  useEffect(() => { if (org) loadCounts() }, [org?.id])

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

      <ExportsSection org={org} showMsg={(t, k) => setMsg({ text: t, kind: k })} />
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
  const done = clause.checks.filter(k => (counts[k.table] ?? 0) >= k.min).length
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
          const n = counts[k.table] ?? 0
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
