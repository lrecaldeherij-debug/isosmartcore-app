import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import { consultarIA } from './aiClient'
import {
  Building2, Compass, Award, Workflow, Target, Sparkles, Loader2,
  ChevronRight, ChevronLeft, Check, X, ArrowRight, Trash2, Plus,
  CheckCircle2, Rocket, Shield
} from 'lucide-react'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import { colors, radius, shadow, font, space, families, tracking, weight } from './components/ui/tokens'
import Button from './components/ui/Button'
import Badge from './components/ui/Badge'

// ═══════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════
const STEPS = [
  { id: 0, key: 'company',  title: 'Tu empresa',     icon: Building2, color: '#0891b2',
    subtitle: 'Definamos el ADN para que la IA te ayude mejor' },
  { id: 1, key: 'context',  title: 'Contexto (FODA)', icon: Compass, color: '#7c3aed',
    subtitle: 'Tus 4-6 factores clave: Fortalezas, Debilidades, Oportunidades y Amenazas' },
  { id: 2, key: 'policy',   title: 'Política',        icon: Award,    color: '#dc2626',
    subtitle: 'La promesa de calidad de tu empresa al cliente' },
  { id: 3, key: 'processes', title: 'Procesos',       icon: Workflow, color: '#f59e0b',
    subtitle: 'Los procesos clave que operan tu negocio' },
  { id: 4, key: 'objective', title: 'Primer objetivo', icon: Target,  color: '#16a34a',
    subtitle: 'Una meta medible SMART para arrancar el SGC' },
]

const INDUSTRIES = [
  'Manufactura', 'Servicios', 'Construcción', 'Logística', 'Alimentos',
  'Tecnología', 'Salud', 'Educación', 'Retail', 'Agropecuario', 'Otro'
]
const SIZES = ['1-10', '11-50', '51-200', '201-500', '500+']

// Helpers IA
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

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function Onboarding({ onComplete }) {
  const { org, profile, refresh } = useOrg()
  const [currentStep, setCurrentStep] = useState(() => {
    const saved = org?.onboarding_current_step || 0
    // Si la DB tiene un valor fuera de rango (ej. STEPS.length tras un finishOnboarding
    // que no propagó completed_at), volvemos al primer paso en vez de renderizar undefined
    return Math.max(0, Math.min(saved, STEPS.length - 1))
  })
  const [completing, setCompleting] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [savingStep, setSavingStep] = useState(false)

  // Estado por paso
  const [company, setCompany] = useState({
    name: '', industry: '', main_products: '',
    employees_count: '11-50', location: '', strategic_direction: '',
  })
  const [fodaFactors, setFodaFactors] = useState([])
  const [policyText, setPolicyText] = useState('')
  const [processList, setProcessList] = useState([])
  const [objective, setObjective] = useState({
    name: '', objective: '', indicator: '',
    baseline_value: '', target: '', unit: '%', frequency: 'Mensual',
  })

  // Pre-fill desde datos existentes (resume)
  useEffect(() => {
    (async () => {
      try {
        const [cp, ctx, pol, pr, obj] = await Promise.all([
          supabase.from('company_profile').select('*').maybeSingle(),
          supabase.from('context_analysis').select('*'),
          supabase.from('quality_policy').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('processes').select('*'),
          supabase.from('quality_objectives').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        ])
        if (cp.data) setCompany(prev => ({ ...prev, ...cp.data }))
        if (ctx.data?.length) setFodaFactors(ctx.data.map(f => ({
          id: f.id, category: f.category, type: f.type, factor: f.factor, impact_level: f.impact_level || 'Medio'
        })))
        if (pol.data?.policy_text) setPolicyText(pol.data.policy_text)
        if (pr.data?.length) setProcessList(pr.data.map(p => ({
          id: p.id, name: p.name, process_type: p.process_type, objective: p.objective || ''
        })))
        if (obj.data) setObjective(prev => ({ ...prev, ...obj.data }))
      } catch (err) {
        console.error('Onboarding prefill error:', err)
        toast.error('No pudimos cargar el progreso guardado. Empieza desde el inicio.')
      }
    })()
  }, [])

  const progress = ((currentStep + 1) / STEPS.length) * 100
  const step = STEPS[currentStep]

  // ───── Navegación + persistencia ─────
  const goNext = async () => {
    const next = Math.min(currentStep + 1, STEPS.length - 1)
    await supabase.from('organizations').update({ onboarding_current_step: next }).eq('id', org.id)
    setCurrentStep(next)
  }
  const goBack = () => setCurrentStep(s => Math.max(s - 1, 0))
  const skipStep = async () => {
    if (currentStep === STEPS.length - 1) {
      return finishOnboarding(true)
    }
    await goNext()
  }

  const finishOnboarding = async (skipped = false) => {
    setCompleting(true)
    // 1. Mostramos celebración INMEDIATAMENTE para feedback instantáneo
    setCelebrating(true)

    // 2. Persistir en DB
    const patch = {
      onboarding_completed_at: new Date().toISOString(),
      onboarding_current_step: STEPS.length,
    }
    if (skipped) patch.onboarding_skipped_at = new Date().toISOString()
    const { error } = await supabase.from('organizations').update(patch).eq('id', org.id)
    if (error) {
      toast.error('No se pudo finalizar: ' + error.message)
      setCelebrating(false)
      setCompleting(false)
      return
    }

    // 3. Esperar para que el usuario vea la celebración
    await new Promise(r => setTimeout(r, 2200))

    // 4. Llamar onComplete: parent setea onboardingForceCompleted=true Y refresca.
    //    AppShell ya NO desmonta la UI durante el refresh (org está cargado),
    //    así que la transición Onboarding → Dashboard es suave.
    if (onComplete) onComplete()
  }

  if (celebrating) return <CelebrationScreen company={company} stats={{
    fodaCount: fodaFactors.length,
    processCount: processList.length,
    hasPolicy: !!policyText?.trim(),
    hasObjective: !!(objective.name || objective.objective),
  }} />


  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div style={{
      minHeight: '100vh', background: colors.paper,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* HEADER editorial */}
      <header style={{
        background: colors.paper, borderBottom: `1px solid ${colors.hairline}`,
        padding: '20px 28px',
      }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                border: `1.5px solid ${colors.seal}`, background: colors.paperCool,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: families.mono, fontSize: '9px', fontWeight: weight.bold,
                color: colors.seal, letterSpacing: tracking.wide,
              }}>ISO</div>
              <div>
                <div style={{
                  fontFamily: families.display, fontWeight: weight.semibold,
                  fontSize: '18px', color: colors.ink, lineHeight: 1, letterSpacing: tracking.snug,
                }}>
                  IsoSmartCore
                </div>
                <div style={{
                  fontFamily: families.mono, fontSize: '9px',
                  letterSpacing: tracking.wider, color: colors.inkSoft,
                  textTransform: 'uppercase', marginTop: '2px',
                }}>
                  ALTA DE EXPEDIENTE
                </div>
              </div>
            </div>
            <div style={{
              fontFamily: families.mono, fontSize: '11px',
              letterSpacing: tracking.wider, color: colors.inkSoft, textTransform: 'uppercase',
            }}>
              FOLIO {String(currentStep + 1).padStart(2, '0')}/{String(STEPS.length).padStart(2, '0')}
            </div>
          </div>

          {/* Progress: hairline barra */}
          <div style={{ height: '2px', background: colors.paperEdge, marginBottom: '16px', position: 'relative' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${((currentStep + 1) / STEPS.length) * 100}%`,
              background: colors.seal, transition: 'width 0.4s ease',
            }} />
          </div>

          {/* Step labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const active = i === currentStep
              const done = i < currentStep
              return (
                <div key={s.id} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                  flex: 1, textAlign: 'center',
                  opacity: active || done ? 1 : 0.5,
                  transition: 'opacity 0.2s',
                }}>
                  <div style={{
                    width: '32px', height: '32px',
                    background: done || active ? colors.seal : colors.paperCool,
                    color: done || active ? colors.paper : colors.inkSoft,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1.5px solid ${done || active ? colors.seal : colors.hairline}`,
                    transition: 'all 0.2s',
                  }}>
                    {done ? <Check size={14} strokeWidth={2.5} /> : <Icon size={14} />}
                  </div>
                  <span style={{
                    fontFamily: families.mono, fontSize: '10px',
                    letterSpacing: tracking.wide,
                    color: active ? colors.seal : colors.inkSoft,
                    fontWeight: active ? weight.bold : weight.medium,
                    textTransform: 'uppercase',
                  }}>
                    {s.title}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <main style={{ flex: 1, padding: '48px 20px', overflowY: 'auto' }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          {/* Step header editorial */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              fontFamily: families.mono, fontSize: '11px',
              letterSpacing: tracking.wider, color: colors.seal,
              textTransform: 'uppercase', fontWeight: weight.bold, marginBottom: '12px',
            }}>
              # {String(currentStep + 1).padStart(2, '0')} · PASO {currentStep + 1} DE {STEPS.length}
            </div>
            <h1 style={{
              margin: 0, fontFamily: families.display,
              fontSize: '44px', fontWeight: weight.semibold,
              letterSpacing: tracking.tight, color: colors.ink, lineHeight: 1.05,
            }}>
              {step.title}.
            </h1>
            <p style={{
              marginTop: '14px', fontFamily: families.body, fontSize: '17px',
              color: colors.inkMid, lineHeight: 1.5, maxWidth: '560px', margin: '14px auto 0',
            }}>
              {step.subtitle}
            </p>
          </div>

          {/* Step content */}
          <div style={{
            background: colors.paperCool, border: `1px solid ${colors.hairline}`,
            padding: '32px',
          }}>
            {currentStep === 0 && <StepCompany data={company} setData={setCompany} />}
            {currentStep === 1 && <StepFoda factors={fodaFactors} setFactors={setFodaFactors} company={company} />}
            {currentStep === 2 && <StepPolicy policyText={policyText} setPolicyText={setPolicyText} company={company} fodaFactors={fodaFactors} />}
            {currentStep === 3 && <StepProcesses processList={processList} setProcessList={setProcessList} company={company} />}
            {currentStep === 4 && <StepObjective objective={objective} setObjective={setObjective} company={company} policyText={policyText} processList={processList} />}
          </div>
        </div>
      </main>

      {/* FOOTER ACTIONS */}
      <footer style={{
        background: colors.paper, borderTop: `1px solid ${colors.hairline}`,
        padding: '20px 28px',
      }}>
        <div style={{
          maxWidth: '780px', margin: '0 auto',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {currentStep > 0 && (
              <button onClick={goBack} disabled={savingStep || completing} style={btnGhost(colors)}>
                <ChevronLeft size={14} /> Atrás
              </button>
            )}
            <button onClick={skipStep} disabled={savingStep || completing} style={btnGhost(colors)}>
              {currentStep === STEPS.length - 1 ? 'Saltar y terminar' : 'Saltar este paso'}
            </button>
          </div>

          {currentStep < STEPS.length - 1 ? (
            <button
              style={btnPrimary(colors)}
              disabled={savingStep}
              onClick={async () => {
                if (savingStep) return
                setSavingStep(true)
                try {
                  const ok = await saveCurrentStep(currentStep, org, company, fodaFactors, policyText, processList, objective)
                  if (ok) await goNext()
                } catch (err) {
                  console.error('saveCurrentStep error:', err)
                  toast.error('No pudimos guardar este paso. Vuelve a intentar.')
                } finally {
                  setSavingStep(false)
                }
              }}
              onMouseEnter={e => { if (!savingStep) e.currentTarget.style.background = colors.sealDark }}
              onMouseLeave={e => { if (!savingStep) e.currentTarget.style.background = colors.seal }}
            >
              {savingStep ? 'Guardando…' : 'Siguiente'} <ChevronRight size={16} />
            </button>
          ) : (
            <button
              style={btnPrimary(colors)}
              disabled={completing || savingStep}
              onClick={async () => {
                if (savingStep || completing) return
                setSavingStep(true)
                try {
                  const ok = await saveCurrentStep(currentStep, org, company, fodaFactors, policyText, processList, objective)
                  if (ok) await finishOnboarding(false)
                } catch (err) {
                  console.error('saveCurrentStep (final) error:', err)
                  toast.error('No pudimos guardar el último paso. Vuelve a intentar.')
                } finally {
                  setSavingStep(false)
                }
              }}
              onMouseEnter={e => { if (!completing && !savingStep) e.currentTarget.style.background = colors.sealDark }}
              onMouseLeave={e => { if (!completing && !savingStep) e.currentTarget.style.background = colors.seal }}
            >
              {completing || savingStep ? 'Procesando…' : 'Firmar y archivar'} <Rocket size={16} />
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}

// Botones estilo expediente — locales al wizard
function btnPrimary(c) {
  return {
    background: c.seal, color: c.paper,
    border: `1.5px solid ${c.seal}`,
    padding: '12px 20px', borderRadius: '2px',
    fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '14px',
    letterSpacing: '0.04em', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    transition: 'background 0.15s ease',
  }
}
function btnGhost(c) {
  return {
    background: 'transparent', color: c.ink,
    border: 'none',
    padding: '12px 16px',
    fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: '13px',
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    borderBottom: `1px solid transparent`,
    transition: 'border-color 0.15s ease',
  }
}

// ═══════════════════════════════════════════════════════════
// CELEBRACIÓN POST-WIZARD — estilo expediente
// ═══════════════════════════════════════════════════════════
function CelebrationScreen({ company, stats }) {
  const empresa = company?.name || 'tu empresa'
  const fecha = new Date()
  const folio = `${fecha.getFullYear()}/${String(fecha.getMonth() + 1).padStart(2, '0')}`
  return (
    <div style={{
      minHeight: '100vh', background: colors.paper,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', textAlign: 'center',
    }}>
      {/* Sello "ARCHIVADO" como signature */}
      <div style={{
        border: `3px solid ${colors.approve}`,
        padding: '14px 32px', marginBottom: '40px',
        transform: 'rotate(-4deg)',
        background: colors.paperCool,
        animation: 'sealDrop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>
        <div style={{
          fontFamily: families.mono, fontSize: '11px',
          letterSpacing: tracking.wider, color: colors.approveText,
          textTransform: 'uppercase', fontWeight: weight.bold, marginBottom: '4px',
        }}>
          FOLIO {folio}
        </div>
        <div style={{
          fontFamily: families.display, fontSize: '32px',
          fontWeight: weight.bold, color: colors.approve,
          letterSpacing: tracking.tight, lineHeight: 1,
        }}>
          ARCHIVADO
        </div>
        <div style={{
          fontFamily: families.mono, fontSize: '10px',
          letterSpacing: tracking.wide, color: colors.approveText,
          textTransform: 'uppercase', marginTop: '4px',
        }}>
          {fecha.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </div>
      </div>

      <div style={{
        fontFamily: families.mono, fontSize: '11px',
        letterSpacing: tracking.wider, color: colors.seal,
        textTransform: 'uppercase', fontWeight: weight.semibold, marginBottom: '16px',
      }}>
        ALTA COMPLETADA · EXPEDIENTE EN OPERACIÓN
      </div>

      <h1 style={{
        margin: 0, fontFamily: families.display,
        fontSize: 'clamp(40px, 5vw, 60px)', fontWeight: weight.semibold,
        letterSpacing: tracking.tight, color: colors.ink, lineHeight: 1.05,
        maxWidth: '640px',
      }}>
        Tu SGC<br />
        <span style={{ fontStyle: 'italic', fontWeight: weight.regular, color: colors.seal }}>
          quedó archivado.
        </span>
      </h1>

      <p style={{
        marginTop: '20px', fontFamily: families.body, fontSize: '17px',
        color: colors.inkMid, lineHeight: 1.55, maxWidth: '560px',
      }}>
        <strong style={{ color: colors.ink, fontWeight: weight.semibold }}>{empresa}</strong> ya tiene las bases de su Sistema de Gestión de Calidad ISO 9001. Ahora se mide y se mejora.
      </p>

      <div style={{
        marginTop: '40px', display: 'flex', gap: '0', flexWrap: 'wrap', justifyContent: 'center',
        border: `1px solid ${colors.hairline}`, background: colors.paperCool,
      }}>
        <StatBubble icon={Building2} label="EMPRESA" sub="ADN cargado" first />
        {stats.fodaCount > 0 && <StatBubble icon={Compass} label={`${stats.fodaCount} FACTORES`} sub="FODA documentado" />}
        {stats.hasPolicy && <StatBubble icon={Award} label="POLÍTICA" sub="Borrador firmable" />}
        {stats.processCount > 0 && <StatBubble icon={Workflow} label={`${stats.processCount} PROCESOS`} sub="Mapeados" />}
        {stats.hasObjective && <StatBubble icon={Target} label="1 OBJETIVO" sub="SMART" />}
      </div>

      <div style={{
        marginTop: '40px', display: 'inline-flex', alignItems: 'center', gap: '12px',
        padding: '12px 20px', background: colors.paperCool,
        border: `1px solid ${colors.hairline}`,
        color: colors.inkMid,
      }}>
        <Loader2 size={14} className="spin" />
        <span style={{
          fontFamily: families.mono, fontSize: '11px',
          letterSpacing: tracking.wider, textTransform: 'uppercase', fontWeight: weight.semibold,
        }}>
          PREPARANDO TABLERO DE MANDO…
        </span>
      </div>

      <style>{`
        @keyframes sealDrop {
          0%   { transform: rotate(-12deg) scale(1.5) translateY(-40px); opacity: 0; }
          70%  { transform: rotate(-2deg) scale(1.05); opacity: 1; }
          100% { transform: rotate(-4deg) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function StatBubble({ icon: Icon, label, sub, first }) {
  return (
    <div style={{
      padding: '16px 24px',
      borderLeft: first ? 'none' : `1px solid ${colors.hairline}`,
      display: 'flex', alignItems: 'center', gap: '12px',
      minWidth: '180px',
    }}>
      <div style={{
        width: '32px', height: '32px',
        background: colors.approveLight,
        color: colors.approveText,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${colors.approve}`,
      }}>
        <Icon size={16} />
      </div>
      <div style={{ textAlign: 'left' }}>
        <div style={{
          fontFamily: families.mono, fontSize: '11px',
          fontWeight: weight.bold, color: colors.ink,
          letterSpacing: tracking.wide,
        }}>
          {label}
        </div>
        <div style={{
          fontFamily: families.body, fontSize: '11px',
          color: colors.inkSoft, marginTop: '2px',
        }}>
          {sub}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// PERSISTENCIA POR PASO
// ═══════════════════════════════════════════════════════════
async function saveCurrentStep(currentStep, org, company, fodaFactors, policyText, processList, objective) {
  try {
    if (currentStep === 0) {
      // Empresa
      if (!company.name) { toast.warning('Poné el nombre de la empresa'); return false }
      const { data: existing } = await supabase.from('company_profile').select('id').maybeSingle()
      const payload = { ...company, org_id: org.id }
      delete payload.id
      if (existing) {
        await supabase.from('company_profile').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('company_profile').insert([payload])
      }
    } else if (currentStep === 1) {
      // FODA: sincronizar (borrar los que no están + insertar los nuevos)
      const existing = (await supabase.from('context_analysis').select('id')).data || []
      const existingIds = new Set(existing.map(e => e.id))
      const incomingIds = new Set(fodaFactors.filter(f => f.id).map(f => f.id))
      const toDelete = [...existingIds].filter(id => !incomingIds.has(id))
      if (toDelete.length) {
        await supabase.from('context_analysis').delete().in('id', toDelete)
      }
      const toInsert = fodaFactors.filter(f => !f.id).map(f => ({
        type: f.type || (['Fortaleza', 'Debilidad'].includes(f.category) ? 'Interno' : 'Externo'),
        category: f.category,
        factor: f.factor,
        impact_level: f.impact_level || 'Medio',
      }))
      if (toInsert.length) {
        await supabase.from('context_analysis').insert(toInsert)
      }
    } else if (currentStep === 2) {
      // Política
      if (!policyText.trim()) { toast.warning('Escribe la política o usa la IA para redactarla'); return false }
      const { data: existing } = await supabase.from('quality_policy').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (existing) {
        await supabase.from('quality_policy').update({ policy_text: policyText, status: 'Borrador' }).eq('id', existing.id)
      } else {
        await supabase.from('quality_policy').insert([{ policy_text: policyText, status: 'Borrador' }])
      }
    } else if (currentStep === 3) {
      // Procesos: sincronizar
      const existing = (await supabase.from('processes').select('id, name')).data || []
      const existingMap = new Map(existing.map(e => [e.name.toLowerCase(), e.id]))
      for (const p of processList) {
        if (!p.name) continue
        if (p.id) {
          await supabase.from('processes').update({
            name: p.name, process_type: p.process_type, objective: p.objective
          }).eq('id', p.id)
        } else if (!existingMap.has(p.name.toLowerCase())) {
          await supabase.from('processes').insert([{
            name: p.name, process_type: p.process_type, objective: p.objective
          }])
        }
      }
    } else if (currentStep === 4) {
      // Objetivo
      if (!objective.name && !objective.objective) return true // skip silent if empty
      const payload = {
        name: objective.name || objective.objective?.slice(0, 80),
        objective: objective.objective || objective.name,
        indicator: objective.indicator,
        baseline_value: objective.baseline_value === '' ? null : Number(objective.baseline_value),
        target: objective.target === '' ? null : Number(objective.target),
        unit: objective.unit,
        frequency: objective.frequency,
        year: new Date().getFullYear(),
        category: 'Calidad',
        status: 'Borrador',
        is_specific: true, is_measurable: true, is_achievable: true, is_relevant: true, is_time_bound: true,
      }
      const { data: existing } = await supabase.from('quality_objectives').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (existing && (objective.id === existing.id)) {
        await supabase.from('quality_objectives').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('quality_objectives').insert([payload])
      }
    }
    return true
  } catch (err) {
    toast.error('Error guardando: ' + err.message)
    return false
  }
}

// ═══════════════════════════════════════════════════════════
// PASO 1 — EMPRESA
// ═══════════════════════════════════════════════════════════
function StepCompany({ data, setData }) {
  const set = (patch) => setData(prev => ({ ...prev, ...patch }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Field label="Nombre de la empresa *">
        <input required value={data.name} onChange={e => set({ name: e.target.value })} style={inp} placeholder="Ej: Industrias del Sur S.A." />
      </Field>
      <Row>
        <Field label="Industria / sector">
          <select value={data.industry} onChange={e => set({ industry: e.target.value })} style={inp}>
            <option value="">— Elige una —</option>
            {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Cantidad de empleados">
          <select value={data.employees_count} onChange={e => set({ employees_count: e.target.value })} style={inp}>
            {SIZES.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Ubicación">
          <input value={data.location} onChange={e => set({ location: e.target.value })} style={inp} placeholder="Ej: Quito, Ecuador" />
        </Field>
      </Row>
      <Field label="Productos o servicios principales">
        <textarea rows={2} value={data.main_products} onChange={e => set({ main_products: e.target.value })} style={inp} placeholder="Ej: Fabricación de envases plásticos para industria alimenticia" />
      </Field>
      <Field label="Misión / dirección estratégica (opcional)">
        <textarea rows={2} value={data.strategic_direction} onChange={e => set({ strategic_direction: e.target.value })} style={inp} placeholder="Hacia dónde apunta la empresa en 3-5 años" />
      </Field>
      <Hint>
        Esta información se usa para personalizar TODAS las recomendaciones de IA en los demás módulos. Mientras más completa, mejor.
      </Hint>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// PASO 2 — FODA
// ═══════════════════════════════════════════════════════════
function StepFoda({ factors, setFactors, company }) {
  const [loadingIA, setLoadingIA] = useState(false)

  const addFactor = (category) => {
    const type = ['Fortaleza', 'Debilidad'].includes(category) ? 'Interno' : 'Externo'
    setFactors(prev => [...prev, { category, type, factor: '', impact_level: 'Medio' }])
  }
  const updateFactor = (i, patch) => {
    setFactors(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  }
  const deleteFactor = (i) => setFactors(prev => prev.filter((_, idx) => idx !== i))

  const sugerirIA = async () => {
    if (!company.name) return toast.warning('Completa los datos de empresa primero')
    setLoadingIA(true)
    try {
      const prompt = `Eres consultor ISO 9001. Sugiere un análisis FODA inicial (4-6 factores totales, 1-2 por categoría) para esta empresa:
Nombre: ${company.name}
Industria: ${company.industry || 'no especificada'}
Tamaño: ${company.employees_count || 'no especificado'}
Productos/servicios: ${company.main_products || 'no especificado'}
Ubicación: ${company.location || 'no especificada'}

Devuelve SOLO un JSON array de 4-6 factores, sin markdown. Cada uno:
- category (Fortaleza | Debilidad | Oportunidad | Amenaza)
- factor (string breve y específico, máx 120 chars)
- impact_level (Alto | Medio | Bajo)`
      const raw = await consultarIA(prompt, 'Devuelve ÚNICAMENTE JSON array válido.')
      const arr = extractFirstJson(raw)
      if (!Array.isArray(arr) || !arr.length) throw new Error('La IA no devolvió factores parseables')
      const valid = arr.filter(f =>
        ['Fortaleza', 'Debilidad', 'Oportunidad', 'Amenaza'].includes(f.category) && f.factor
      ).map(f => ({
        category: f.category,
        type: ['Fortaleza', 'Debilidad'].includes(f.category) ? 'Interno' : 'Externo',
        factor: f.factor,
        impact_level: ['Alto', 'Medio', 'Bajo'].includes(f.impact_level) ? f.impact_level : 'Medio',
      }))
      // Agregar a los existentes (no reemplazar)
      setFactors(prev => [...prev, ...valid])
      toast.success(`IA agregó ${valid.length} factores`)
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  const counts = {
    Fortaleza: factors.filter(f => f.category === 'Fortaleza').length,
    Debilidad: factors.filter(f => f.category === 'Debilidad').length,
    Oportunidad: factors.filter(f => f.category === 'Oportunidad').length,
    Amenaza: factors.filter(f => f.category === 'Amenaza').length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Button variant="ai" size="lg" onClick={sugerirIA} loading={loadingIA} icon={<Sparkles size={16} />} style={{ alignSelf: 'flex-start' }}>
        💡 Pide a la IA que arme un FODA inicial
      </Button>

      {factors.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '30px 20px', background: colors.bgMuted,
          border: `1px dashed ${colors.borderStrong}`, borderRadius: radius.lg,
        }}>
          <Compass size={36} color={colors.borderStrong} style={{ margin: '0 auto 8px' }} />
          <p style={{ color: colors.textFaint, margin: 0 }}>Sin factores cargados. Usa la IA o agrega manualmente.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {factors.map((f, i) => (
            <FactorRow key={i} factor={f} onChange={p => updateFactor(i, p)} onDelete={() => deleteFactor(i)} />
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
        {[
          { cat: 'Fortaleza', color: '#16a34a', emoji: '💪' },
          { cat: 'Debilidad', color: '#dc2626', emoji: '⚠️' },
          { cat: 'Oportunidad', color: '#0891b2', emoji: '🚀' },
          { cat: 'Amenaza', color: '#f59e0b', emoji: '⚡' },
        ].map(({ cat, color, emoji }) => (
          <button key={cat} onClick={() => addFactor(cat)} style={{
            padding: '8px 12px', background: 'white',
            border: `1px dashed ${color}66`, color, borderRadius: radius.md,
            cursor: 'pointer', fontSize: font.sm, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
          }}>
            <Plus size={12} /> {emoji} {cat} <span style={{ opacity: 0.6 }}>({counts[cat]})</span>
          </button>
        ))}
      </div>

      <Hint>Con 4 factores ya tienes un FODA usable. Después puedes ampliarlo en el módulo Contexto.</Hint>
    </div>
  )
}

function FactorRow({ factor, onChange, onDelete }) {
  const colorMap = {
    'Fortaleza': '#16a34a',
    'Debilidad': '#dc2626',
    'Oportunidad': '#0891b2',
    'Amenaza': '#f59e0b',
  }
  const color = colorMap[factor.category] || colors.textFaint
  return (
    <div style={{
      display: 'flex', gap: '6px', alignItems: 'center',
      background: 'white', border: `1px solid ${colors.border}`,
      borderLeft: `4px solid ${color}`, borderRadius: radius.md, padding: '8px',
    }}>
      <Badge bg={color + '22'} color={color}>{factor.category}</Badge>
      <input
        value={factor.factor}
        onChange={e => onChange({ factor: e.target.value })}
        placeholder="Describe el factor brevemente"
        style={{ ...inp, border: 'none', padding: '4px 6px', flex: 1 }}
      />
      <select
        value={factor.impact_level || 'Medio'}
        onChange={e => onChange({ impact_level: e.target.value })}
        style={{ ...inp, padding: '4px 6px', width: '90px' }}
      >
        <option>Alto</option><option>Medio</option><option>Bajo</option>
      </select>
      <button onClick={onDelete} style={{
        background: 'none', border: 'none', cursor: 'pointer', color: colors.danger, padding: '4px'
      }} aria-label="Eliminar">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// PASO 3 — POLÍTICA
// ═══════════════════════════════════════════════════════════
function StepPolicy({ policyText, setPolicyText, company, fodaFactors }) {
  const [loadingIA, setLoadingIA] = useState(false)

  const redactarIA = async () => {
    if (!company.name) return toast.warning('Completa los datos de empresa primero')
    setLoadingIA(true)
    try {
      const fortalezas = fodaFactors.filter(f => f.category === 'Fortaleza').map(f => f.factor)
      const prompt = `Eres consultor ISO 9001. Redacta una Política de Calidad concisa y profesional para esta empresa, alineada con ISO 9001:2015 cláusula 5.2.

Empresa: ${company.name}
Industria: ${company.industry || 'general'}
Productos/servicios: ${company.main_products || 'no especificado'}
Tamaño: ${company.employees_count || 'no especificado'}
Misión: ${company.strategic_direction || 'no especificada'}
Fortalezas clave: ${fortalezas.length ? fortalezas.join(', ') : 'no especificadas'}

Devuelve SOLO el texto de la política (sin markdown, sin "**", sin títulos), 5-10 líneas claras. Debe incluir:
- Compromiso con la satisfacción del cliente
- Compromiso con el cumplimiento de requisitos (legales y del cliente)
- Compromiso con la mejora continua del SGC
- Marco para establecer objetivos de calidad
- Mencionar específicamente el sector/productos de la empresa (no genérica)`
      const raw = await consultarIA(prompt, 'Devuelve solo el texto de la política, sin markdown, sin comillas envolventes.')
      const clean = (raw || '').replace(/```/g, '').trim()
      if (!clean) throw new Error('La IA no devolvió texto')
      setPolicyText(clean)
      toast.success('Política redactada · Revísala y edítala')
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Button variant="ai" size="lg" onClick={redactarIA} loading={loadingIA} icon={<Sparkles size={16} />} style={{ alignSelf: 'flex-start' }}>
        💡 Pide a la IA que redacte la política
      </Button>

      <Field label="Política de Calidad">
        <textarea
          rows={9}
          value={policyText}
          onChange={e => setPolicyText(e.target.value)}
          style={inp}
          placeholder="Empresa X se compromete a..."
        />
      </Field>

      <Hint>
        La política debe ser breve (5-10 líneas), específica de tu negocio (no genérica) y comunicable al personal. Después podrás aprobarla formalmente desde el módulo Política.
      </Hint>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// PASO 4 — PROCESOS
// ═══════════════════════════════════════════════════════════
function StepProcesses({ processList, setProcessList, company }) {
  const [loadingIA, setLoadingIA] = useState(false)

  const addProcess = (type = 'Operativo') => {
    setProcessList(prev => [...prev, { name: '', process_type: type, objective: '' }])
  }
  const updateProcess = (i, patch) => setProcessList(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  const deleteProcess = (i) => setProcessList(prev => prev.filter((_, idx) => idx !== i))

  const sugerirIA = async () => {
    if (!company.name) return toast.warning('Completa los datos de empresa primero')
    setLoadingIA(true)
    try {
      const prompt = `Eres consultor ISO 9001. Sugiere los 4-6 procesos CLAVE del mapa de procesos de esta empresa según ISO 9001 cláusula 4.4. Mezcla Estratégicos, Operativos y de Soporte.

Empresa: ${company.name}
Industria: ${company.industry || 'general'}
Productos/servicios: ${company.main_products || 'no especificado'}

Devuelve SOLO un JSON array de 4-6 procesos, sin markdown. Cada uno:
- name (string corto, el nombre del proceso)
- process_type ("Estratégico" | "Operativo" | "Soporte")
- objective (string breve, qué busca lograr ese proceso)`
      const raw = await consultarIA(prompt, 'Devuelve ÚNICAMENTE JSON array válido.')
      const arr = extractFirstJson(raw)
      if (!Array.isArray(arr) || !arr.length) throw new Error('La IA no devolvió procesos parseables')
      const valid = arr.filter(p => p.name).map(p => ({
        name: p.name,
        process_type: ['Estratégico', 'Operativo', 'Soporte'].includes(p.process_type) ? p.process_type : 'Operativo',
        objective: p.objective || '',
      }))
      // No duplicar por nombre
      const existing = new Set(processList.map(p => p.name?.toLowerCase().trim()))
      const news = valid.filter(p => !existing.has(p.name.toLowerCase().trim()))
      setProcessList(prev => [...prev, ...news])
      toast.success(`IA agregó ${news.length} procesos`)
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Button variant="ai" size="lg" onClick={sugerirIA} loading={loadingIA} icon={<Sparkles size={16} />} style={{ alignSelf: 'flex-start' }}>
        💡 Pide a la IA el mapa de procesos típico de tu sector
      </Button>

      {processList.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '30px 20px', background: colors.bgMuted,
          border: `1px dashed ${colors.borderStrong}`, borderRadius: radius.lg,
        }}>
          <Workflow size={36} color={colors.borderStrong} style={{ margin: '0 auto 8px' }} />
          <p style={{ color: colors.textFaint, margin: 0 }}>Sin procesos cargados. Usa la IA o agrega manualmente.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {processList.map((p, i) => (
            <ProcessRow key={i} proc={p} onChange={patch => updateProcess(i, patch)} onDelete={() => deleteProcess(i)} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {[
          { t: 'Estratégico', color: '#7c3aed' },
          { t: 'Operativo', color: '#0891b2' },
          { t: 'Soporte', color: '#f59e0b' },
        ].map(({ t, color }) => (
          <button key={t} onClick={() => addProcess(t)} style={{
            padding: '8px 14px', background: 'white',
            border: `1px dashed ${color}66`, color, borderRadius: radius.md,
            cursor: 'pointer', fontSize: font.sm, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: '4px',
          }}>
            <Plus size={12} /> {t}
          </button>
        ))}
      </div>

      <Hint>Empieza con 4-6 procesos. Después puedes diseñar las caracterizaciones completas (entradas, salidas, riesgos, KPIs) en el módulo Procesos.</Hint>
    </div>
  )
}

function ProcessRow({ proc, onChange, onDelete }) {
  const colorMap = { 'Estratégico': '#7c3aed', 'Operativo': '#0891b2', 'Soporte': '#f59e0b' }
  const color = colorMap[proc.process_type] || colors.textFaint
  return (
    <div style={{
      background: 'white', border: `1px solid ${colors.border}`,
      borderLeft: `4px solid ${color}`, borderRadius: radius.md, padding: '10px',
      display: 'flex', flexDirection: 'column', gap: '6px',
    }}>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <select
          value={proc.process_type}
          onChange={e => onChange({ process_type: e.target.value })}
          style={{ ...inp, padding: '4px 6px', width: '130px', borderColor: color, color }}
        >
          <option>Estratégico</option><option>Operativo</option><option>Soporte</option>
        </select>
        <input
          value={proc.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="Nombre del proceso"
          style={{ ...inp, flex: 1 }}
        />
        <button onClick={onDelete} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: colors.danger, padding: '4px'
        }} aria-label="Eliminar">
          <Trash2 size={14} />
        </button>
      </div>
      <input
        value={proc.objective}
        onChange={e => onChange({ objective: e.target.value })}
        placeholder="¿Qué busca lograr este proceso? (opcional)"
        style={{ ...inp, fontSize: font.sm, padding: '5px 8px' }}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// PASO 5 — OBJETIVO
// ═══════════════════════════════════════════════════════════
function StepObjective({ objective, setObjective, company, policyText, processList }) {
  const [loadingIA, setLoadingIA] = useState(false)
  const set = (patch) => setObjective(prev => ({ ...prev, ...patch }))

  const sugerirIA = async () => {
    if (!policyText && !processList.length) return toast.warning('Completa política y procesos primero')
    setLoadingIA(true)
    try {
      const prompt = `Eres consultor ISO 9001. Propón UN objetivo de calidad SMART para arrancar el SGC de esta empresa según ISO 9001 cláusula 6.2.

Empresa: ${company.name}
Industria: ${company.industry || 'general'}
Política de calidad: ${policyText?.slice(0, 500) || 'no definida'}
Procesos clave: ${processList.map(p => p.name).filter(Boolean).join(', ') || 'no definidos'}

Devuelve SOLO un JSON objeto, sin markdown:
- name (string corto, máx 80 chars, título del objetivo)
- objective (string SMART completo, Específico Medible Alcanzable Relevante Temporal)
- indicator (string, el KPI claro)
- baseline_value (number, valor inicial estimado)
- target (number, meta realista a 12 meses)
- unit ("%" | "puntos" | "NC/mes" | "#" | "$" | "horas" | "días" | "ppm")
- frequency ("Mensual" | "Trimestral" | "Semestral" | "Anual")`
      const raw = await consultarIA(prompt, 'Devuelve ÚNICAMENTE JSON objeto válido.')
      const obj = extractFirstJson(raw)
      if (!obj || typeof obj !== 'object') throw new Error('La IA no devolvió objeto válido')
      setObjective(prev => ({
        ...prev,
        name: obj.name || prev.name,
        objective: obj.objective || prev.objective,
        indicator: obj.indicator || prev.indicator,
        baseline_value: obj.baseline_value ?? prev.baseline_value,
        target: obj.target ?? prev.target,
        unit: obj.unit || prev.unit,
        frequency: obj.frequency || prev.frequency,
      }))
      toast.success('Objetivo redactado · Revísalo')
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Button variant="ai" size="lg" onClick={sugerirIA} loading={loadingIA} icon={<Sparkles size={16} />} style={{ alignSelf: 'flex-start' }}>
        💡 Pide a la IA que arme tu primer objetivo SMART
      </Button>

      <Field label="Nombre corto del objetivo">
        <input value={objective.name} onChange={e => set({ name: e.target.value })} style={inp} placeholder="Ej: Reducir reclamos de clientes" />
      </Field>

      <Field label="Descripción SMART (Específico, Medible, Alcanzable, Relevante, Temporal)">
        <textarea rows={3} value={objective.objective} onChange={e => set({ objective: e.target.value })} style={inp} placeholder="Reducir los reclamos de clientes en un X% durante el próximo año fiscal mediante…" />
      </Field>

      <Row>
        <Field label="Indicador (KPI)">
          <input value={objective.indicator} onChange={e => set({ indicator: e.target.value })} style={inp} placeholder="Ej: % de reclamos resueltos en <48h" />
        </Field>
        <Field label="Frecuencia de medición">
          <select value={objective.frequency} onChange={e => set({ frequency: e.target.value })} style={inp}>
            <option>Mensual</option><option>Trimestral</option><option>Semestral</option><option>Anual</option>
          </select>
        </Field>
      </Row>

      <Row>
        <Field label="Valor inicial (baseline)">
          <input type="number" step="any" value={objective.baseline_value} onChange={e => set({ baseline_value: e.target.value })} style={inp} placeholder="0" />
        </Field>
        <Field label="Meta (target)">
          <input type="number" step="any" value={objective.target} onChange={e => set({ target: e.target.value })} style={inp} placeholder="90" />
        </Field>
        <Field label="Unidad">
          <select value={objective.unit} onChange={e => set({ unit: e.target.value })} style={inp}>
            <option>%</option><option>puntos</option><option>NC/mes</option><option>#</option><option>$</option><option>horas</option><option>días</option><option>ppm</option>
          </select>
        </Field>
      </Row>

      <Hint>Un solo objetivo bien definido al inicio es mejor que 10 vagos. Después podrás cargar más desde el módulo Objetivos.</Hint>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// PRIMITIVAS UI
// ═══════════════════════════════════════════════════════════
function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '160px' }}>
      <label style={{ fontSize: font.sm, fontWeight: 600, color: colors.textMuted }}>{label}</label>
      {children}
    </div>
  )
}
function Row({ children }) {
  return <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>{children}</div>
}
function Hint({ children }) {
  return (
    <div style={{
      background: '#fefce8', border: '1px solid #fde68a',
      borderRadius: radius.md, padding: '10px 12px',
      fontSize: font.sm, color: '#854d0e', display: 'flex', alignItems: 'flex-start', gap: '8px',
    }}>
      <span>💡</span>
      <span>{children}</span>
    </div>
  )
}

const inp = {
  width: '100%', padding: '8px 10px',
  border: `1px solid ${colors.borderStrong}`, borderRadius: radius.md,
  fontSize: font.md, boxSizing: 'border-box', background: 'white',
  color: colors.text, fontFamily: 'inherit',
}
