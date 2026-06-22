import { useState } from 'react'
import { Check, ArrowRight } from 'lucide-react'
import { PLANS, PLAN_ORDER, formatPrice } from './lib/plans'
import { colors, radius, shadow, font, families, tracking, weight } from './components/ui/tokens'

/**
 * PricingPage — Dirección "Expediente certificado".
 *
 * El subject es ISO 9001. La página entera está construida como una papelería
 * oficial: papel cremoso, tinta sepia, hairline rules, sellos de aprobación.
 * El display usa Fraunces (serif con axis "soft") para peso editorial.
 * El mono (IBM Plex) marca códigos de documento — refleja la realidad ISO.
 *
 * Props: idénticas al diseño anterior.
 *   - onSignup(planId, cycle)
 *   - onLogin()
 *   - currentPlanId
 */
export default function PricingPage({ onSignup, onLogin, currentPlanId }) {
  const [cycle, setCycle] = useState('monthly')

  return (
    <div style={{ minHeight: '100vh', background: colors.paper, color: colors.ink }}>
      {/* ─── Top bar de expediente ─── */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '18px 32px', borderBottom: `1px solid ${colors.hairline}`,
        background: colors.paper, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
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
        </div>
        {onLogin && (
          <button
            onClick={onLogin}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: colors.ink, fontFamily: families.body, fontWeight: weight.medium,
              fontSize: font.base, padding: '8px 14px',
              borderBottom: `1px solid ${colors.ink}`,
            }}
          >
            Iniciar sesión
          </button>
        )}
      </header>

      {/* ─── Hero: tesis editorial ─── */}
      <section style={{ padding: '80px 24px 40px', maxWidth: '960px', margin: '0 auto' }}>
        <div style={{
          fontFamily: families.mono, fontSize: '11px',
          letterSpacing: tracking.wider, textTransform: 'uppercase',
          color: colors.seal, fontWeight: weight.semibold, marginBottom: '24px',
        }}>
          NORMA · ISO 9001:2015 — CALIDAD CERTIFICABLE
        </div>

        <h1 style={{
          margin: 0, fontFamily: families.display,
          fontSize: 'clamp(48px, 7vw, 76px)', fontWeight: weight.semibold,
          lineHeight: 1.02, letterSpacing: tracking.tight, color: colors.ink,
        }}>
          Tu sistema de gestión,<br />
          <span style={{ fontStyle: 'italic', fontWeight: weight.regular, color: colors.seal }}>
            certificable.
          </span>
        </h1>

        <p style={{
          marginTop: '28px', maxWidth: '600px',
          fontFamily: families.body, fontSize: '18px', lineHeight: 1.55,
          color: colors.inkMid, fontWeight: weight.regular,
        }}>
          Implementá ISO 9001:2015 sin la consultoría que no podés pagar. Una IA que aprende del ADN de tu empresa redacta tu política, tu mapa de procesos, tu matriz de riesgos. Vos firmás.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '40px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'inline-flex', background: colors.paperCool,
            border: `1px solid ${colors.hairline}`, borderRadius: '2px', padding: '3px',
          }}>
            <CycleButton active={cycle === 'monthly'} onClick={() => setCycle('monthly')}>
              Mensual
            </CycleButton>
            <CycleButton active={cycle === 'yearly'} onClick={() => setCycle('yearly')}>
              Anual <span style={{ marginLeft: '6px', color: colors.approve, fontWeight: weight.bold }}>−17%</span>
            </CycleButton>
          </div>
          <div style={{
            fontFamily: families.mono, fontSize: '11px', color: colors.inkSoft,
            letterSpacing: tracking.wide,
          }}>
            14 DÍAS SIN TARJETA · CANCELÁS CUANDO QUIERAS
          </div>
        </div>
      </section>

      {/* ─── Cards de planes ─── */}
      <section style={{ padding: '20px 24px 80px', maxWidth: '1180px', margin: '0 auto' }}>
        <SectionEyebrow num="01" label="PLANES DEL EXPEDIENTE" />

        <div style={{
          display: 'grid', gap: '0', marginTop: '20px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          border: `1px solid ${colors.hairline}`,
          background: colors.paperCool,
        }}>
          {PLAN_ORDER.map((id, i) => (
            <PlanCard
              key={id}
              plan={PLANS[id]}
              index={i}
              cycle={cycle}
              isCurrent={currentPlanId === id}
              onSelect={() => onSignup && onSignup(id, cycle)}
              isLast={i === PLAN_ORDER.length - 1}
            />
          ))}
        </div>
      </section>

      {/* ─── FAQ como sección de "consultas frecuentes" del expediente ─── */}
      <section style={{ padding: '60px 24px', borderTop: `1px solid ${colors.hairline}` }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <SectionEyebrow num="02" label="CONSULTAS FRECUENTES" />
          <h2 style={{
            fontFamily: families.display, fontSize: '40px',
            fontWeight: weight.semibold, lineHeight: 1.1,
            letterSpacing: tracking.snug, color: colors.ink, marginTop: '16px', marginBottom: '40px',
          }}>
            Lo que más nos preguntan.
          </h2>

          {FAQS.map((f, i) => (
            <FaqItem key={i} num={String(i + 1).padStart(2, '0')} q={f.q} a={f.a} isLast={i === FAQS.length - 1} />
          ))}
        </div>
      </section>

      {/* ─── Footer estilo expediente ─── */}
      <footer style={{
        padding: '32px 24px', borderTop: `1px solid ${colors.hairline}`,
        background: colors.paperWarm,
      }}>
        <div style={{
          maxWidth: '1180px', margin: '0 auto',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          flexWrap: 'wrap', gap: '12px',
        }}>
          <div style={{
            fontFamily: families.mono, fontSize: '11px',
            letterSpacing: tracking.wider, color: colors.inkSoft, textTransform: 'uppercase',
          }}>
            EXP·ISC·2026·001 — FOLIO {new Date().getFullYear()}/01
          </div>
          <div style={{
            fontFamily: families.body, fontSize: '13px', color: colors.inkMid,
          }}>
            Editado y firmado en Asunción, Paraguay
          </div>
        </div>
      </footer>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Subcomponentes
// ═══════════════════════════════════════════════════════════════════════════

/** Sello visual minimalista — círculo con texto ISO */
function SealMark({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `1.5px solid ${colors.seal}`, background: colors.paperCool,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: families.mono, fontSize: '9px', fontWeight: weight.bold,
      color: colors.seal, letterSpacing: tracking.wide,
    }}>
      ISO
    </div>
  )
}

/** Eyebrow con número de sección — encoda jerarquía del documento */
function SectionEyebrow({ num, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: '14px',
      paddingBottom: '12px', borderBottom: `1px solid ${colors.hairline}`,
    }}>
      <span style={{
        fontFamily: families.mono, fontSize: '13px',
        fontWeight: weight.bold, color: colors.seal,
      }}>
        § {num}
      </span>
      <span style={{
        fontFamily: families.mono, fontSize: '11px',
        letterSpacing: tracking.wider, color: colors.inkSoft,
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
    </div>
  )
}

function PlanCard({ plan, index, cycle, isCurrent, onSelect, isLast }) {
  const price = cycle === 'monthly' ? plan.price_monthly : Math.round(plan.price_yearly / 12)
  const savings = cycle === 'yearly' ? (plan.price_monthly * 12) - plan.price_yearly : 0
  const isPopular = plan.is_popular

  return (
    <div style={{
      padding: '32px 28px',
      borderRight: isLast ? 'none' : `1px solid ${colors.hairline}`,
      background: isPopular ? colors.paperWarm : 'transparent',
      position: 'relative',
      display: 'flex', flexDirection: 'column', gap: '20px',
      minHeight: '520px',
    }}>
      {/* Signature: sello rotado para el popular */}
      {isPopular && (
        <div style={{
          position: 'absolute', top: '20px', right: '20px',
          transform: 'rotate(-8deg)',
          border: `1.5px solid ${colors.seal}`,
          padding: '4px 10px', borderRadius: '2px',
          fontFamily: families.mono, fontSize: '10px', fontWeight: weight.bold,
          color: colors.seal, letterSpacing: tracking.wider,
        }}>
          ELEGIDO
        </div>
      )}

      {/* Signature: sello para plan actual del usuario */}
      {isCurrent && (
        <div style={{
          position: 'absolute', top: '20px', right: '20px',
          transform: 'rotate(-6deg)',
          border: `1.5px solid ${colors.approve}`,
          padding: '4px 10px', borderRadius: '2px',
          fontFamily: families.mono, fontSize: '10px', fontWeight: weight.bold,
          color: colors.approve, letterSpacing: tracking.wider,
        }}>
          SU PLAN ACTUAL
        </div>
      )}

      {/* Número de plan tipo expediente */}
      <div style={{
        fontFamily: families.mono, fontSize: '11px',
        letterSpacing: tracking.wider, color: colors.inkSoft,
      }}>
        PLAN N° {String(index + 1).padStart(2, '0')}
      </div>

      {/* Nombre del plan en display serif */}
      <h3 style={{
        margin: 0, fontFamily: families.display,
        fontSize: '32px', fontWeight: weight.semibold,
        letterSpacing: tracking.tight, color: colors.ink, lineHeight: 1,
      }}>
        {plan.name}
      </h3>

      {/* Precio: el número en display, el sufijo en mono */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span style={{
            fontFamily: families.display, fontSize: '54px',
            fontWeight: weight.semibold, letterSpacing: tracking.tight,
            color: colors.ink, lineHeight: 1,
          }}>
            {formatPrice(price)}
          </span>
          <span style={{
            fontFamily: families.mono, fontSize: '12px',
            color: colors.inkSoft, letterSpacing: tracking.wide,
            textTransform: 'uppercase',
          }}>
            /MES
          </span>
        </div>
        {cycle === 'yearly' && savings > 0 && (
          <div style={{
            fontFamily: families.mono, fontSize: '11px',
            color: colors.approve, fontWeight: weight.semibold,
            marginTop: '6px', letterSpacing: tracking.wide,
          }}>
            AHORRO ANUAL · {formatPrice(savings)}
          </div>
        )}
        {cycle === 'monthly' && (
          <div style={{
            fontFamily: families.mono, fontSize: '11px',
            color: colors.inkSoft, marginTop: '6px', letterSpacing: tracking.wide,
          }}>
            FACTURACIÓN MENSUAL · USD
          </div>
        )}
      </div>

      {/* CTA: documental, no flashy. Para popular, fondo lleno. */}
      <button
        onClick={onSelect}
        style={{
          background: isPopular ? colors.seal : 'transparent',
          color: isPopular ? colors.paper : colors.ink,
          border: `1.5px solid ${isPopular ? colors.seal : colors.ink}`,
          padding: '14px 20px', borderRadius: '2px',
          fontFamily: families.body, fontWeight: weight.semibold,
          fontSize: font.base, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', transition: 'all 0.15s ease',
          letterSpacing: tracking.wide,
        }}
        onMouseEnter={e => {
          if (!isPopular) { e.currentTarget.style.background = colors.ink; e.currentTarget.style.color = colors.paper }
          else { e.currentTarget.style.background = colors.sealDark }
        }}
        onMouseLeave={e => {
          if (!isPopular) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.ink }
          else { e.currentTarget.style.background = colors.seal }
        }}
      >
        <span>{plan.cta}</span>
        <ArrowRight size={16} />
      </button>

      {/* Features con check minimalista */}
      <div style={{ borderTop: `1px solid ${colors.hairline}`, paddingTop: '18px', marginTop: 'auto' }}>
        <div style={{
          fontFamily: families.mono, fontSize: '10px',
          letterSpacing: tracking.wider, color: colors.inkSoft,
          textTransform: 'uppercase', marginBottom: '14px',
        }}>
          INCLUYE
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '11px' }}>
          {plan.features.map((f, i) => (
            <li key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              fontFamily: families.body, fontSize: '13.5px',
              color: colors.ink, lineHeight: 1.45,
            }}>
              <Check size={14} color={colors.approve} style={{ flexShrink: 0, marginTop: '3px' }} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function CycleButton({ active, children, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? colors.paper : 'transparent',
      color: active ? colors.ink : colors.inkSoft,
      border: 'none', padding: '8px 18px', borderRadius: '2px',
      fontFamily: families.body, fontWeight: weight.semibold,
      fontSize: '13px', cursor: 'pointer',
      boxShadow: active ? '0 1px 2px rgba(46,31,26,0.08)' : 'none',
      display: 'inline-flex', alignItems: 'center', letterSpacing: tracking.snug,
    }}>
      {children}
    </button>
  )
}

function FaqItem({ num, q, a, isLast }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      borderBottom: isLast ? 'none' : `1px solid ${colors.hairline}`,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
          padding: '20px 0', cursor: 'pointer',
          display: 'flex', alignItems: 'baseline', gap: '20px',
        }}
      >
        <span style={{
          fontFamily: families.mono, fontSize: '12px', color: colors.inkSoft,
          letterSpacing: tracking.wider, flexShrink: 0, minWidth: '24px',
        }}>
          {num}
        </span>
        <span style={{
          fontFamily: families.display, fontSize: '20px',
          fontWeight: weight.semibold, color: colors.ink,
          letterSpacing: tracking.snug, flex: 1, lineHeight: 1.3,
        }}>
          {q}
        </span>
        <span style={{
          fontFamily: families.mono, fontSize: '20px', color: colors.inkSoft,
          flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(45deg)' : 'rotate(0)',
        }}>
          +
        </span>
      </button>
      {open && (
        <div style={{
          padding: '0 0 24px 44px',
          fontFamily: families.body, fontSize: '15px', color: colors.inkMid,
          lineHeight: 1.65,
        }}>
          {a}
        </div>
      )}
    </div>
  )
}

const FAQS = [
  { q: '¿Necesito tarjeta de crédito para empezar?', a: 'No. El trial de 14 días no requiere tarjeta. Empezás a usar la app de inmediato y solo agregás método de pago si decidís continuar.' },
  { q: '¿Puedo cambiar de plan después?', a: 'Sí, en cualquier momento desde la sección de facturación. El cambio se prorratea automáticamente para que pagues exactamente por lo que usás.' },
  { q: '¿Qué pasa cuando termina el trial sin suscribir?', a: 'Tu cuenta queda en modo solo lectura. No perdés ningún dato: política, procesos, riesgos, todo queda intacto. Cuando suscribís, recuperás acceso completo.' },
  { q: '¿La IA cuesta extra?', a: 'No. Los prompts de IA están incluidos en cada plan según la cuota mensual. Si llegás al límite podés subir de plan o esperar al siguiente ciclo.' },
  { q: '¿Hay descuento por pago anual?', a: 'Sí, 2 meses gratis (≈17% de descuento) si pagás anualmente. Lo seleccionás con el toggle de arriba.' },
]
