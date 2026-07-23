import { useState } from 'react'
import {
  ArrowRight, Check, Sparkles, FileText, Users, ShieldCheck,
  Workflow, Award, TrendingUp, Shield, GitMerge, BarChart3,
  Search, AlertTriangle, Clock, Zap, Target, ChevronDown, ChevronUp,
} from 'lucide-react'
import { colors, radius, font, families, tracking, weight } from './components/ui/tokens'
import { PLANS, PLAN_ORDER, formatPrice } from './lib/plans'

// =============================================================================
// Landing pública para prospects. Mantiene la dirección "Expediente certificado"
// del resto del producto. El objetivo comercial es que el visitante entienda:
// (1) qué problema resolvemos, (2) por qué somos distintos, (3) precio, (4) CTA
// para trial gratis.
//
// Props:
//   - onSignup(): navegar al signup (Login modo registro)
//   - onLogin(): navegar al login
//   - onSeePricing(): navegar a /pricing (opcional)
// =============================================================================

export default function Landing({ onSignup, onLogin, onSeePricing }) {
  return (
    <div style={{
      minHeight: '100vh', background: colors.paper, color: colors.ink,
      fontFamily: families.body,
    }}>
      <TopBar onLogin={onLogin} onSignup={onSignup} onSeePricing={onSeePricing} />
      <Hero onSignup={onSignup} onSeePricing={onSeePricing} />
      <Problem />
      <Solution />
      <Modules />
      <HowItWorks />
      <PlansTeaser onSignup={onSignup} onSeePricing={onSeePricing} />
      <Faq />
      <FinalCta onSignup={onSignup} />
      <Footer />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TOPBAR
// ═══════════════════════════════════════════════════════════════════════════

function TopBar({ onLogin, onSignup, onSeePricing }) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20,
      background: colors.paper,
      borderBottom: `1px solid ${colors.hairline}`,
      padding: '16px 32px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '14px', textDecoration: 'none' }}>
        <SealMark size={28} />
        <div>
          <div style={{
            fontFamily: families.display, fontWeight: weight.semibold,
            fontSize: '20px', color: colors.ink, letterSpacing: tracking.snug, lineHeight: 1,
          }}>
            IsoSmartCore
          </div>
          <div style={{
            fontFamily: families.mono, fontSize: '10px',
            letterSpacing: tracking.wider, color: colors.inkSoft,
            textTransform: 'uppercase', marginTop: '2px',
          }}>
            EXP·ISC·2026
          </div>
        </div>
      </a>

      <nav style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {onSeePricing && (
          <button onClick={onSeePricing} style={navLinkStyle}>Precios</button>
        )}
        <button onClick={onLogin} style={navLinkStyle}>Iniciar sesión</button>
        <button
          onClick={onSignup}
          style={{
            background: colors.seal, color: colors.paper, border: 'none',
            padding: '10px 18px', borderRadius: '2px',
            fontFamily: families.body, fontSize: '14px', fontWeight: weight.semibold,
            letterSpacing: tracking.wide, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.background = colors.sealDark}
          onMouseLeave={e => e.currentTarget.style.background = colors.seal}
        >
          Prueba gratis <ArrowRight size={14} />
        </button>
      </nav>
    </header>
  )
}

const navLinkStyle = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: colors.ink, fontFamily: families.body, fontSize: '14px',
  fontWeight: weight.medium, padding: '6px 4px',
  borderBottom: '1px solid transparent',
  transition: 'border-color 0.15s ease',
}

// ═══════════════════════════════════════════════════════════════════════════
// HERO
// ═══════════════════════════════════════════════════════════════════════════

function Hero({ onSignup, onSeePricing }) {
  return (
    <section style={{ padding: '80px 24px 60px', maxWidth: '1080px', margin: '0 auto' }}>
      <div style={{
        fontFamily: families.mono, fontSize: '11px',
        letterSpacing: tracking.wider, textTransform: 'uppercase',
        color: colors.seal, fontWeight: weight.semibold, marginBottom: '24px',
      }}>
        NORMA · ISO 9001:2015 — SISTEMA DE GESTIÓN DE CALIDAD
      </div>

      <h1 style={{
        margin: 0, fontFamily: families.display,
        fontSize: 'clamp(48px, 7vw, 84px)', fontWeight: weight.semibold,
        lineHeight: 1.02, letterSpacing: tracking.tight, color: colors.ink,
        maxWidth: '920px',
      }}>
        El expediente de tu <span style={{ fontStyle: 'italic', fontWeight: weight.regular, color: colors.seal }}>calidad</span>,<br />
        listo para auditar.
      </h1>

      <p style={{
        marginTop: '32px', maxWidth: '660px',
        fontFamily: families.body, fontSize: '20px', lineHeight: 1.55,
        color: colors.inkMid,
      }}>
        Implementa ISO 9001:2015 sin la consultoría que no puedes pagar. Una IA que aprende del ADN de tu empresa redacta tu política, tu mapa de procesos y tu matriz de riesgos. Tú firmas.
      </p>

      <div style={{ display: 'flex', gap: '16px', marginTop: '44px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={onSignup}
          style={{
            background: colors.seal, color: colors.paper, border: `1.5px solid ${colors.seal}`,
            padding: '16px 28px', borderRadius: '2px',
            fontFamily: families.body, fontSize: '16px', fontWeight: weight.semibold,
            letterSpacing: tracking.wide, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.background = colors.sealDark}
          onMouseLeave={e => e.currentTarget.style.background = colors.seal}
        >
          Abre tu expediente gratis <ArrowRight size={16} />
        </button>
        {onSeePricing && (
          <button
            onClick={onSeePricing}
            style={{
              background: 'transparent', color: colors.ink,
              border: `1.5px solid ${colors.ink}`,
              padding: '16px 28px', borderRadius: '2px',
              fontFamily: families.body, fontSize: '16px', fontWeight: weight.semibold,
              letterSpacing: tracking.wide, cursor: 'pointer',
            }}
          >
            Ver planes
          </button>
        )}
      </div>

      <div style={{
        marginTop: '20px',
        fontFamily: families.mono, fontSize: '11px', color: colors.inkSoft,
        letterSpacing: tracking.wide, textTransform: 'uppercase',
      }}>
        14 DÍAS GRATIS · SIN TARJETA · CANCELAS CUANDO QUIERAS
      </div>

      {/* Meta line */}
      <div style={{
        marginTop: '64px', paddingTop: '24px',
        borderTop: `1px solid ${colors.hairline}`,
        display: 'flex', gap: '40px', flexWrap: 'wrap',
        fontFamily: families.mono, fontSize: '11px',
        letterSpacing: tracking.wider, color: colors.inkSoft, textTransform: 'uppercase',
      }}>
        <div>26 MÓDULOS · TODAS LAS CLÁUSULAS 4-10</div>
        <div>IA CONTEXTUAL · GEMINI</div>
        <div>EXPORTS PDF AUDITABLES</div>
        <div>MODO AUDITOR READ-ONLY</div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PROBLEMA
// ═══════════════════════════════════════════════════════════════════════════

function Problem() {
  const pains = [
    {
      icon: <Clock size={20} />,
      title: 'La consultoría cuesta más que la certificación.',
      body: 'Entre $8.000 y $25.000 por armar el SGC desde cero. Meses de reuniones, plantillas genéricas de Word y una carpeta que nadie mantiene actualizada después de la certificación.',
    },
    {
      icon: <FileText size={20} />,
      title: 'Word y Excel no son un sistema de gestión.',
      body: 'La política vive en un PDF. Los procesos en otro. Los riesgos en un Excel que nadie abrió en 6 meses. Cuando llega el auditor, empieza el pánico de reconstruir la trazabilidad.',
    },
    {
      icon: <AlertTriangle size={20} />,
      title: 'La norma exige evidencia, no buenas intenciones.',
      body: 'ISO 9001:2015 pide información documentada, cambios trazables, revisiones firmadas y acciones cerradas. Sin herramienta que lo capture, la evidencia se pierde entre correos.',
    },
  ]

  return (
    <section style={{ padding: '80px 24px', background: colors.paperCool, borderTop: `1px solid ${colors.hairline}` }}>
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <SectionEyebrow num="01" label="EL PROBLEMA" />
        <h2 style={sectionTitleStyle}>
          Certificarse en ISO 9001 <span style={italicAccentStyle}>no debería doler tanto.</span>
        </h2>

        <div style={{
          display: 'grid', gap: '24px', marginTop: '48px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        }}>
          {pains.map((p, i) => (
            <div key={i} style={{
              background: colors.paper, border: `1px solid ${colors.hairline}`,
              padding: '28px 24px', borderRadius: '2px',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: colors.sealLight, color: colors.seal,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '20px',
              }}>{p.icon}</div>
              <h3 style={{
                margin: '0 0 12px 0', fontFamily: families.display,
                fontSize: '20px', fontWeight: weight.semibold,
                lineHeight: 1.25, color: colors.ink,
              }}>{p.title}</h3>
              <p style={{
                margin: 0, fontFamily: families.body, fontSize: '15px',
                lineHeight: 1.6, color: colors.inkMid,
              }}>{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SOLUCIÓN — 4 pilares
// ═══════════════════════════════════════════════════════════════════════════

function Solution() {
  const pillars = [
    {
      num: '01',
      icon: <Sparkles size={22} />,
      title: 'IA que conoce tu empresa.',
      body: 'Cargas los datos de tu negocio una vez (sector, tamaño, productos, ubicación) y la IA personaliza cada plantilla al ADN de tu operación. No plantillas genéricas: sugerencias específicas de tu industria.',
    },
    {
      num: '02',
      icon: <Workflow size={22} />,
      title: 'Todos los módulos de la norma.',
      body: 'Contexto, política, procesos, riesgos, objetivos, personal, formación, documentación, auditorías, revisión por la dirección, no conformidades, mejora continua. Las 18 cláusulas certificables cubiertas.',
    },
    {
      num: '03',
      icon: <ShieldCheck size={22} />,
      title: 'Trazabilidad que resiste al auditor.',
      body: 'Cada cambio queda registrado con quién, cuándo y por qué. Reportes PDF auditables por módulo. Modo Auditor read-only con link temporal para que la certificadora revise sin crearle cuenta.',
    },
    {
      num: '04',
      icon: <Users size={22} />,
      title: 'Roles reales del SGC.',
      body: 'Owner, Quality Manager, Auditor y Viewer. Cada uno con permisos específicos alineados a la norma. Aprobaciones formales. Cambio de estado con firma digital y fecha.',
    },
  ]

  return (
    <section style={{ padding: '80px 24px' }}>
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <SectionEyebrow num="02" label="LA SOLUCIÓN" />
        <h2 style={sectionTitleStyle}>
          Un solo lugar para todo lo que <span style={italicAccentStyle}>tu certificadora va a pedir.</span>
        </h2>

        <div style={{
          display: 'grid', gap: '0', marginTop: '48px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          border: `1px solid ${colors.hairline}`,
        }}>
          {pillars.map((p, i) => (
            <div key={p.num} style={{
              padding: '36px 32px',
              borderRight: i % 2 === 0 ? `1px solid ${colors.hairline}` : 'none',
              borderBottom: i < 2 ? `1px solid ${colors.hairline}` : 'none',
              background: colors.paper,
            }}>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'baseline', marginBottom: '16px' }}>
                <span style={{
                  fontFamily: families.mono, fontSize: '13px',
                  fontWeight: weight.bold, color: colors.seal,
                }}>§ {p.num}</span>
                <span style={{ color: colors.seal }}>{p.icon}</span>
              </div>
              <h3 style={{
                margin: '0 0 12px 0', fontFamily: families.display,
                fontSize: '24px', fontWeight: weight.semibold,
                lineHeight: 1.2, color: colors.ink,
              }}>{p.title}</h3>
              <p style={{
                margin: 0, fontFamily: families.body, fontSize: '16px',
                lineHeight: 1.65, color: colors.inkMid,
              }}>{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULOS — grid con las cláusulas ISO
// ═══════════════════════════════════════════════════════════════════════════

function Modules() {
  const clauses = [
    { code: '4.1', name: 'Contexto FODA', icon: <Target size={16} /> },
    { code: '4.2', name: 'Partes Interesadas', icon: <Users size={16} /> },
    { code: '4.3', name: 'Alcance del SGC', icon: <FileText size={16} /> },
    { code: '4.4', name: 'Mapa de Procesos', icon: <Workflow size={16} /> },
    { code: '5.2', name: 'Política de Calidad', icon: <FileText size={16} /> },
    { code: '5.3', name: 'Roles y Organigrama', icon: <GitMerge size={16} /> },
    { code: '6.1', name: 'Riesgos y Oportunidades', icon: <Shield size={16} /> },
    { code: '6.2', name: 'Objetivos de Calidad', icon: <Target size={16} /> },
    { code: '7.1.2', name: 'Recursos Humanos', icon: <Users size={16} /> },
    { code: '7.1.4', name: 'Clima Laboral', icon: <BarChart3 size={16} /> },
    { code: '7.1.5', name: 'Calibración', icon: <ShieldCheck size={16} /> },
    { code: '7.2', name: 'Formación', icon: <Award size={16} /> },
    { code: '7.4', name: 'Comunicaciones', icon: <FileText size={16} /> },
    { code: '7.5', name: 'Documentación', icon: <FileText size={16} /> },
    { code: '8.2', name: 'Requisitos del Cliente', icon: <Users size={16} /> },
    { code: '8.4', name: 'Proveedores', icon: <Workflow size={16} /> },
    { code: '8.5', name: 'Producción y Control', icon: <Workflow size={16} /> },
    { code: '8.6', name: 'Liberación', icon: <Check size={16} /> },
    { code: '9.2', name: 'Auditorías Internas', icon: <Search size={16} /> },
    { code: '9.3', name: 'Revisión por la Dirección', icon: <BarChart3 size={16} /> },
    { code: '10.2', name: 'No Conformidades', icon: <AlertTriangle size={16} /> },
    { code: '10.3', name: 'Mejora Continua', icon: <TrendingUp size={16} /> },
  ]

  return (
    <section style={{ padding: '80px 24px', background: colors.paperCool, borderTop: `1px solid ${colors.hairline}` }}>
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <SectionEyebrow num="03" label="COBERTURA DE LA NORMA" />
        <h2 style={sectionTitleStyle}>
          22 módulos cubren <span style={italicAccentStyle}>toda la cláusula 4 a 10.</span>
        </h2>
        <p style={{
          marginTop: '20px', maxWidth: '640px',
          fontFamily: families.body, fontSize: '17px', lineHeight: 1.6,
          color: colors.inkMid,
        }}>
          Cada módulo está alineado a la cláusula que le corresponde. Si el auditor pregunta por 8.4 (proveedores), abres el módulo y ves criterios de evaluación, matriz de riesgos y evidencia cargada. Sin buscar en carpetas.
        </p>

        <div style={{
          display: 'grid', gap: '8px', marginTop: '40px',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        }}>
          {clauses.map(c => (
            <div key={c.code} style={{
              background: colors.paper, border: `1px solid ${colors.hairline}`,
              padding: '14px 16px', borderRadius: '2px',
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <div style={{ color: colors.seal, flexShrink: 0 }}>{c.icon}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: families.mono, fontSize: '10px',
                  letterSpacing: tracking.wide, color: colors.inkSoft,
                }}>ISO {c.code}</div>
                <div style={{
                  fontFamily: families.body, fontSize: '14px',
                  fontWeight: weight.medium, color: colors.ink,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{c.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CÓMO FUNCIONA
// ═══════════════════════════════════════════════════════════════════════════

function HowItWorks() {
  const steps = [
    {
      num: '01',
      title: 'Cargas el ADN de tu empresa.',
      body: 'Sector, productos, tamaño, ubicación, estructura organizativa. Cinco minutos. Este dato alimenta a la IA para que las sugerencias posteriores sean específicas de tu negocio y no genéricas.',
    },
    {
      num: '02',
      title: 'La IA propone; tú editas y firmas.',
      body: 'FODA inicial, política de calidad, mapa de procesos, matriz de riesgos, objetivos SMART, plan de auditorías. Cada sugerencia queda en modo borrador hasta que la revisas y apruebas formalmente.',
    },
    {
      num: '03',
      title: 'Invitas al equipo con roles reales.',
      body: 'Responsable de Calidad edita el sistema. Auditor solo lee. Owner controla la organización. Cada acción queda registrada con quién, cuándo y qué cambió. Trazabilidad para pasar la certificación.',
    },
    {
      num: '04',
      title: 'Exportas evidencia para el auditor.',
      body: 'PDF profesional por módulo, con historial de cambios. O compartes un link temporal read-only para que la certificadora revise directamente en la plataforma sin crearle cuenta.',
    },
  ]

  return (
    <section style={{ padding: '80px 24px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <SectionEyebrow num="04" label="CÓMO FUNCIONA" />
        <h2 style={sectionTitleStyle}>
          De cero SGC a <span style={italicAccentStyle}>expediente auditable</span> en cuatro pasos.
        </h2>

        <div style={{ marginTop: '48px' }}>
          {steps.map((s, i) => (
            <div key={s.num} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '32px',
              padding: '32px 0',
              borderBottom: i < steps.length - 1 ? `1px solid ${colors.hairline}` : 'none',
            }}>
              <div style={{
                fontFamily: families.display, fontSize: '48px',
                fontWeight: weight.semibold, color: colors.seal, lineHeight: 1,
                letterSpacing: tracking.tight, alignSelf: 'start',
              }}>{s.num}</div>
              <div>
                <h3 style={{
                  margin: '0 0 12px 0', fontFamily: families.display,
                  fontSize: '26px', fontWeight: weight.semibold,
                  lineHeight: 1.25, color: colors.ink,
                }}>{s.title}</h3>
                <p style={{
                  margin: 0, fontFamily: families.body, fontSize: '16px',
                  lineHeight: 1.7, color: colors.inkMid,
                }}>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PLANES — teaser
// ═══════════════════════════════════════════════════════════════════════════

function PlansTeaser({ onSignup, onSeePricing }) {
  return (
    <section style={{ padding: '80px 24px', background: colors.paperCool, borderTop: `1px solid ${colors.hairline}` }}>
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <SectionEyebrow num="05" label="PLANES" />
        <h2 style={sectionTitleStyle}>
          Un precio para cada tamaño de <span style={italicAccentStyle}>expediente.</span>
        </h2>

        <div style={{
          display: 'grid', gap: '0', marginTop: '48px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          border: `1px solid ${colors.hairline}`, background: colors.paper,
        }}>
          {PLAN_ORDER.map((id, i) => {
            const plan = PLANS[id]
            const isLast = i === PLAN_ORDER.length - 1
            return (
              <div key={id} style={{
                padding: '32px 24px',
                borderRight: !isLast ? `1px solid ${colors.hairline}` : 'none',
                position: 'relative',
                background: plan.is_popular ? colors.paperWarm : 'transparent',
              }}>
                {plan.is_popular && (
                  <div style={{
                    position: 'absolute', top: -12, left: 24,
                    background: colors.seal, color: colors.paper,
                    fontFamily: families.mono, fontSize: '10px',
                    fontWeight: weight.bold, letterSpacing: tracking.wider,
                    padding: '4px 10px', textTransform: 'uppercase',
                  }}>MÁS ELEGIDO</div>
                )}
                <div style={{
                  fontFamily: families.mono, fontSize: '11px',
                  letterSpacing: tracking.wider, color: colors.inkSoft,
                  textTransform: 'uppercase',
                }}>{plan.name}</div>
                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{
                    fontFamily: families.display, fontSize: '44px',
                    fontWeight: weight.semibold, color: colors.ink, lineHeight: 1,
                    letterSpacing: tracking.tight,
                  }}>{formatPrice(plan.price_monthly)}</span>
                  <span style={{
                    fontFamily: families.body, fontSize: '13px',
                    color: colors.inkSoft,
                  }}>/mes</span>
                </div>
                <ul style={{ margin: '20px 0 0 0', padding: 0, listStyle: 'none' }}>
                  {(plan.features || []).slice(0, 4).map((f, j) => (
                    <li key={j} style={{
                      display: 'flex', gap: '8px', alignItems: 'flex-start',
                      padding: '5px 0',
                      fontFamily: families.body, fontSize: '13px',
                      color: colors.inkMid, lineHeight: 1.4,
                    }}>
                      <Check size={14} color={colors.seal} style={{ marginTop: 2, flexShrink: 0 }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: '14px', marginTop: '32px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={onSignup}
            style={{
              background: colors.seal, color: colors.paper, border: 'none',
              padding: '14px 24px', borderRadius: '2px',
              fontFamily: families.body, fontSize: '15px', fontWeight: weight.semibold,
              letterSpacing: tracking.wide, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
            }}
          >
            Empezar prueba gratis <ArrowRight size={14} />
          </button>
          {onSeePricing && (
            <button
              onClick={onSeePricing}
              style={{
                background: 'transparent', color: colors.ink,
                border: 'none', cursor: 'pointer',
                fontFamily: families.body, fontSize: '15px', fontWeight: weight.medium,
                padding: '14px 8px', borderBottom: `1px solid ${colors.ink}`,
              }}
            >
              Ver comparación completa
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// FAQ
// ═══════════════════════════════════════════════════════════════════════════

const FAQS = [
  {
    q: '¿Cuánto tarda armar el SGC desde cero?',
    a: 'Con IsoSmartCore, entre 2 y 6 semanas de trabajo activo del Responsable de Calidad. La IA acelera la redacción (política, procesos, riesgos, objetivos) y los módulos guían qué falta. Sin la herramienta, lo mismo lleva 4-8 meses o el costo de un consultor.',
  },
  {
    q: '¿Sirve para certificarnos en ISO 9001:2015 real?',
    a: 'Sí. Los 22 módulos cubren todas las cláusulas certificables de la norma. Los exports PDF y el historial de cambios generan la información documentada que exigen los organismos certificadores. IsoSmartCore es la herramienta de gestión; la certificación la otorga un organismo acreditado (Bureau Veritas, SGS, ICONTEC, etc.).',
  },
  {
    q: '¿La IA reemplaza a un consultor ISO?',
    a: 'No. La IA sugiere borradores personalizados a tu empresa; el juicio profesional, las decisiones de scope y la responsabilidad del SGC siguen siendo humanas. Muchas empresas usan IsoSmartCore junto con un consultor externo, y el consultor termina 3-5x más rápido porque la base ya está armada.',
  },
  {
    q: '¿Qué pasa con mis datos si dejo de pagar?',
    a: 'Podés exportar todo tu SGC en PDF y CSV en cualquier momento desde el panel. Si cancelás, mantenemos tus datos 12 meses adicionales por si querés reactivar. Después los eliminamos definitivamente. Nunca los usamos para entrenar IA ni los compartimos con terceros.',
  },
  {
    q: '¿Puedo invitar a un auditor externo a revisar sin darle cuenta?',
    a: 'Sí. El modo Auditor genera un link temporal con acceso solo-lectura al expediente completo, con fecha de vencimiento configurable y revocación instantánea. El auditor navega la información sin registrarse ni ver tu factura.',
  },
  {
    q: '¿Funciona para empresas fuera de Ecuador?',
    a: 'Sí. La norma ISO 9001:2015 es la misma en todo el mundo. Actualmente la plataforma está en español y los precios en USD. Vendemos a PyMEs de Latinoamérica y España indistintamente.',
  },
]

function Faq() {
  const [openIdx, setOpenIdx] = useState(0)
  return (
    <section style={{ padding: '80px 24px' }}>
      <div style={{ maxWidth: '820px', margin: '0 auto' }}>
        <SectionEyebrow num="06" label="CONSULTAS FRECUENTES" />
        <h2 style={sectionTitleStyle}>
          Lo que más <span style={italicAccentStyle}>nos preguntan.</span>
        </h2>

        <div style={{ marginTop: '40px' }}>
          {FAQS.map((f, i) => {
            const isOpen = openIdx === i
            return (
              <div key={i} style={{
                borderBottom: `1px solid ${colors.hairline}`,
                padding: '20px 0',
              }}>
                <button
                  onClick={() => setOpenIdx(isOpen ? -1 : i)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    width: '100%', textAlign: 'left', padding: 0,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    gap: '20px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'baseline', flex: 1 }}>
                    <span style={{
                      fontFamily: families.mono, fontSize: '12px',
                      color: colors.seal, fontWeight: weight.bold,
                      flexShrink: 0,
                    }}>§ {String(i + 1).padStart(2, '0')}</span>
                    <span style={{
                      fontFamily: families.display, fontSize: '19px',
                      fontWeight: weight.semibold, color: colors.ink,
                      lineHeight: 1.35,
                    }}>{f.q}</span>
                  </div>
                  <div style={{ color: colors.inkSoft, flexShrink: 0 }}>
                    {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </button>
                {isOpen && (
                  <div style={{
                    marginTop: '14px', paddingLeft: '40px',
                    fontFamily: families.body, fontSize: '15px',
                    lineHeight: 1.7, color: colors.inkMid,
                  }}>{f.a}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CTA FINAL
// ═══════════════════════════════════════════════════════════════════════════

function FinalCta({ onSignup }) {
  return (
    <section style={{
      padding: '80px 24px',
      background: colors.paperWarm,
      borderTop: `1px solid ${colors.hairline}`,
    }}>
      <div style={{ maxWidth: '780px', margin: '0 auto', textAlign: 'center' }}>
        <SealMark size={40} />
        <h2 style={{
          margin: '32px 0 20px 0', fontFamily: families.display,
          fontSize: 'clamp(38px, 5vw, 56px)', fontWeight: weight.semibold,
          lineHeight: 1.05, letterSpacing: tracking.tight, color: colors.ink,
        }}>
          Abre tu <span style={italicAccentStyle}>expediente.</span>
        </h2>
        <p style={{
          margin: '0 0 36px 0', fontFamily: families.body,
          fontSize: '18px', lineHeight: 1.6, color: colors.inkMid,
        }}>
          Catorce días gratis. Sin tarjeta. Si al final no ves valor, cancelas sin llamada.
        </p>
        <button
          onClick={onSignup}
          style={{
            background: colors.seal, color: colors.paper, border: 'none',
            padding: '18px 36px', borderRadius: '2px',
            fontFamily: families.body, fontSize: '17px', fontWeight: weight.semibold,
            letterSpacing: tracking.wide, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.background = colors.sealDark}
          onMouseLeave={e => e.currentTarget.style.background = colors.seal}
        >
          Empezar ahora <ArrowRight size={16} />
        </button>
        <div style={{
          marginTop: '20px',
          fontFamily: families.mono, fontSize: '11px', color: colors.inkSoft,
          letterSpacing: tracking.wide, textTransform: 'uppercase',
        }}>
          14 DÍAS GRATIS · SIN TARJETA · CANCELAS CUANDO QUIERAS
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// FOOTER
// ═══════════════════════════════════════════════════════════════════════════

function Footer() {
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  return (
    <footer style={{
      padding: '48px 24px 32px',
      borderTop: `1px solid ${colors.hairline}`,
      background: colors.paper,
    }}>
      <div style={{
        maxWidth: '1080px', margin: '0 auto',
        display: 'grid', gap: '24px',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <SealMark size={26} />
            <div style={{
              fontFamily: families.display, fontWeight: weight.semibold,
              fontSize: '18px', color: colors.ink,
            }}>IsoSmartCore</div>
          </div>
          <div style={{
            fontFamily: families.body, fontSize: '13px', color: colors.inkMid, lineHeight: 1.6,
          }}>
            Sistema de gestión de calidad ISO 9001:2015 para PyMEs. Certificable, mantenible, tuyo.
          </div>
        </div>

        <div>
          <div style={{ ...footerLabelStyle, marginBottom: '14px' }}>PRODUCTO</div>
          <a href="/pricing" style={footerLinkStyle}>Planes y precios</a>
          <a href="/app" style={footerLinkStyle}>Iniciar sesión</a>
          <a href="/app" style={footerLinkStyle}>Prueba gratis</a>
        </div>

        <div>
          <div style={{ ...footerLabelStyle, marginBottom: '14px' }}>LEGAL</div>
          <a href="/legal/privacidad" style={footerLinkStyle}>Privacidad</a>
          <a href="/legal/terminos" style={footerLinkStyle}>Términos</a>
          <a href="/legal/cookies" style={footerLinkStyle}>Cookies</a>
        </div>

        <div>
          <div style={{ ...footerLabelStyle, marginBottom: '14px' }}>CONTACTO</div>
          <a href="mailto:soporte@isosmartcore.com" style={footerLinkStyle}>soporte@isosmartcore.com</a>
          <a href="mailto:legal@isosmartcore.com" style={footerLinkStyle}>legal@isosmartcore.com</a>
        </div>
      </div>

      <div style={{
        maxWidth: '1080px', margin: '32px auto 0',
        paddingTop: '24px', borderTop: `1px solid ${colors.hairline}`,
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
        fontFamily: families.mono, fontSize: '10px',
        letterSpacing: tracking.wider, color: colors.inkSoft, textTransform: 'uppercase',
      }}>
        <div>FOLIO {year}/{month} · QUITO · ECUADOR</div>
        <div>© {year} IsoSmartCore · Todos los derechos reservados</div>
      </div>
    </footer>
  )
}

const footerLabelStyle = {
  fontFamily: families.mono, fontSize: '10px',
  letterSpacing: tracking.wider, color: colors.inkSoft,
  textTransform: 'uppercase', fontWeight: weight.semibold,
}

const footerLinkStyle = {
  display: 'block', padding: '5px 0',
  fontFamily: families.body, fontSize: '14px',
  color: colors.inkMid, textDecoration: 'none',
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers compartidos
// ═══════════════════════════════════════════════════════════════════════════

const sectionTitleStyle = {
  margin: '16px 0 0 0', fontFamily: families.display,
  fontSize: 'clamp(36px, 4.5vw, 52px)', fontWeight: weight.semibold,
  lineHeight: 1.08, letterSpacing: tracking.tight, color: colors.ink,
  maxWidth: '820px',
}

const italicAccentStyle = {
  fontStyle: 'italic', fontWeight: weight.regular, color: colors.seal,
}

function SectionEyebrow({ num, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: '14px',
    }}>
      <span style={{
        fontFamily: families.mono, fontSize: '13px',
        fontWeight: weight.bold, color: colors.seal,
      }}>§ {num}</span>
      <span style={{
        fontFamily: families.mono, fontSize: '11px',
        letterSpacing: tracking.wider, color: colors.inkSoft, textTransform: 'uppercase',
      }}>{label}</span>
    </div>
  )
}

function SealMark({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `1.5px solid ${colors.seal}`, background: colors.paper,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: families.mono, fontSize: size > 32 ? '11px' : '9px',
      fontWeight: weight.bold, color: colors.seal, letterSpacing: tracking.wide,
    }}>
      ISO
    </div>
  )
}
