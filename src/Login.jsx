import { useState } from 'react'
import { supabase } from './supabaseClient'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import { colors, families, tracking, weight, font } from './components/ui/tokens'

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)

  const handleAuth = async (e) => {
    e.preventDefault()
    if (isRegistering && !acceptTerms) {
      setMensaje({ kind: 'error', text: 'Debes aceptar los Términos y la Política de Privacidad para abrir cuenta.' })
      return
    }
    setLoading(true)
    setMensaje('')

    try {
      let result
      if (isRegistering) {
        result = await supabase.auth.signUp({
          email, password,
          options: {
            data: {
              company_name: companyName.trim(),
              full_name: fullName.trim(),
              terms_accepted_at: new Date().toISOString(),
              terms_version: '1.0',
              privacy_version: '1.0',
            },
          },
        })
      } else {
        result = await supabase.auth.signInWithPassword({ email, password })
      }

      const { data, error } = result
      if (error) {
        setMensaje({ kind: 'error', text: error.message })
      } else if (isRegistering && !data.session) {
        setMensaje({ kind: 'success', text: 'Registro recibido. Revisa tu correo para confirmar la cuenta.' })
      } else if (data.session) {
        setMensaje({ kind: 'success', text: 'Acceso autorizado. Abriendo expediente…' })
        if (isRegistering) {
          await supabase.from('legal_acceptances').insert({
            user_id: data.session.user.id,
            terms_version: '1.0',
            privacy_version: '1.0',
            user_agent: navigator.userAgent.slice(0, 500),
          }).then(() => {}).catch(err => console.warn('legal_acceptances insert falló:', err))
        }
        setTimeout(() => window.location.reload(), 1200)
      }
    } catch (err) {
      setMensaje({ kind: 'error', text: 'Error de conexión: ' + err.message })
    } finally {
      setLoading(false)
    }
  }

  const isError = mensaje?.kind === 'error'
  const isSuccess = mensaje?.kind === 'success'

  return (
    <div style={{
      minHeight: '100vh', display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      background: colors.paper, color: colors.ink,
    }}>
      {/* ─── Lado izquierdo: portada del expediente ─── */}
      <aside style={{
        padding: '56px 56px 40px',
        borderRight: `1px solid ${colors.hairline}`,
        background: colors.paperWarm,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        minHeight: '100vh',
      }}
      className="login-aside"
      >
        {/* Header con sello — clickeable para volver a la landing */}
        <div>
          <a href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: '14px',
            textDecoration: 'none',
          }}>
            <SealMark />
            <div>
              <div style={{
                fontFamily: families.display, fontWeight: weight.semibold,
                fontSize: '20px', color: colors.ink, lineHeight: 1, letterSpacing: tracking.snug,
              }}>
                IsoSmartCore
              </div>
              <div style={{
                fontFamily: families.mono, fontSize: '10px',
                letterSpacing: tracking.wider, color: colors.inkSoft,
                textTransform: 'uppercase', marginTop: '3px',
              }}>
                EXP·ISC·2026
              </div>
            </div>
          </a>
        </div>

        {/* Hero editorial */}
        <div style={{ maxWidth: '480px' }}>
          <div style={{
            fontFamily: families.mono, fontSize: '11px',
            letterSpacing: tracking.wider, color: colors.seal,
            textTransform: 'uppercase', fontWeight: weight.semibold, marginBottom: '20px',
          }}>
            NORMA · ISO 9001:2015
          </div>
          <h1 style={{
            margin: 0, fontFamily: families.display,
            fontSize: 'clamp(40px, 4.5vw, 56px)', fontWeight: weight.semibold,
            lineHeight: 1.05, letterSpacing: tracking.tight, color: colors.ink,
          }}>
            El expediente<br />
            <span style={{ fontStyle: 'italic', fontWeight: weight.regular, color: colors.seal }}>
              de tu calidad.
            </span>
          </h1>
          <p style={{
            marginTop: '24px', fontFamily: families.body, fontSize: '16px',
            lineHeight: 1.6, color: colors.inkMid, maxWidth: '440px',
          }}>
            Política, procesos, riesgos, objetivos. Un solo lugar para todo lo que tu certificadora va a auditar.
          </p>
        </div>

        {/* Footer del lado izquierdo */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '12px',
        }}>
          <div style={{
            fontFamily: families.mono, fontSize: '10px',
            letterSpacing: tracking.wider, color: colors.inkSoft, textTransform: 'uppercase',
          }}>
            FOLIO {new Date().getFullYear()}/{String(new Date().getMonth() + 1).padStart(2, '0')} · QUITO · ECUADOR
          </div>
          <div style={{
            display: 'flex', gap: '16px', flexWrap: 'wrap',
            fontFamily: families.mono, fontSize: '10px',
            letterSpacing: tracking.wider, textTransform: 'uppercase',
          }}>
            <a href="/legal/privacidad" style={{ color: colors.inkSoft, textDecoration: 'none', borderBottom: `1px solid ${colors.hairline}` }}>Privacidad</a>
            <a href="/legal/terminos" style={{ color: colors.inkSoft, textDecoration: 'none', borderBottom: `1px solid ${colors.hairline}` }}>Términos</a>
            <a href="/legal/cookies" style={{ color: colors.inkSoft, textDecoration: 'none', borderBottom: `1px solid ${colors.hairline}` }}>Cookies</a>
          </div>
        </div>
      </aside>

      {/* ─── Lado derecho: formulario de acceso ─── */}
      <main style={{
        padding: '56px 56px 40px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        maxWidth: '520px', width: '100%', margin: '0 auto',
      }}>
        <SectionEyebrow num={isRegistering ? '01' : '00'} label={isRegistering ? 'ALTA DE EXPEDIENTE' : 'ACCESO AL EXPEDIENTE'} />

        <h2 style={{
          margin: '24px 0 6px 0', fontFamily: families.display,
          fontSize: '40px', fontWeight: weight.semibold, lineHeight: 1.05,
          letterSpacing: tracking.tight, color: colors.ink,
        }}>
          {isRegistering ? 'Abrir cuenta.' : 'Continuar.'}
        </h2>
        <p style={{
          margin: '0 0 36px 0', fontFamily: families.body, fontSize: '15px',
          color: colors.inkMid, lineHeight: 1.55,
        }}>
          {isRegistering
            ? 'Catorce días de prueba. Sin tarjeta. La firma del trial es solo de palabra.'
            : 'Acceso con tu correo y la contraseña que registraste al inicio.'}
        </p>

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {isRegistering && (
            <>
              <Field label="Razón social / nombre de la empresa" value={companyName} onChange={setCompanyName} placeholder="Herzoil Cia Ltda" required />
              <Field label="Tu nombre completo" value={fullName} onChange={setFullName} placeholder="Juan Pérez" required />
            </>
          )}
          <Field label="Correo electrónico" type="email" value={email} onChange={setEmail} placeholder="tu@empresa.com" required />
          <Field
            label="Contraseña"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            required
            adornment={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: colors.inkSoft, padding: '0 4px', display: 'flex',
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
          />

          {isRegistering && (
            <label style={{
              display: 'flex', gap: '10px', alignItems: 'flex-start',
              fontSize: '13px', color: colors.inkMid,
              fontFamily: families.body, lineHeight: 1.5,
              cursor: 'pointer',
              padding: '4px 0',
            }}>
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={e => setAcceptTerms(e.target.checked)}
                style={{
                  marginTop: '3px', accentColor: colors.seal,
                  width: '16px', height: '16px', cursor: 'pointer',
                }}
              />
              <span>
                He leído y acepto los{' '}
                <a href="/legal/terminos" target="_blank" rel="noopener" style={{
                  color: colors.seal, textDecoration: 'none',
                  borderBottom: `1px solid ${colors.seal}`,
                }}>Términos y Condiciones</a>
                {' '}y la{' '}
                <a href="/legal/privacidad" target="_blank" rel="noopener" style={{
                  color: colors.seal, textDecoration: 'none',
                  borderBottom: `1px solid ${colors.seal}`,
                }}>Política de Privacidad</a>
                .
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '8px',
              background: loading ? colors.inkSoft : colors.seal,
              color: colors.paper, border: `1.5px solid ${loading ? colors.inkSoft : colors.seal}`,
              padding: '15px 20px', borderRadius: '2px',
              fontFamily: families.body, fontSize: '15px', fontWeight: weight.semibold,
              letterSpacing: tracking.wide, cursor: loading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = colors.sealDark }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = colors.seal }}
          >
            <span>{loading ? 'Procesando…' : isRegistering ? 'Crear expediente' : 'Acceder al expediente'}</span>
            {!loading && <ArrowRight size={16} />}
          </button>

          {mensaje && (
            <div style={{
              padding: '14px 16px',
              border: `1px solid ${isError ? colors.alert : colors.approve}`,
              background: isError ? colors.alertLight : colors.approveLight,
              color: isError ? colors.alertText : colors.approveText,
              fontFamily: families.body, fontSize: '13px', lineHeight: 1.5,
              borderRadius: '2px',
            }}>
              <span style={{
                fontFamily: families.mono, fontSize: '10px',
                letterSpacing: tracking.wider, textTransform: 'uppercase',
                marginRight: '8px', fontWeight: weight.bold,
              }}>
                {isError ? 'RECHAZADO' : 'CONFIRMADO'}
              </span>
              {mensaje.text}
            </div>
          )}
        </form>

        {/* Switch login ↔ signup */}
        <div style={{
          marginTop: '32px', paddingTop: '24px',
          borderTop: `1px solid ${colors.hairline}`,
        }}>
          <button
            type="button"
            onClick={() => { setIsRegistering(!isRegistering); setMensaje('') }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: colors.ink, fontFamily: families.body, fontSize: '14px',
              padding: 0, display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}
          >
            <span style={{ color: colors.inkSoft }}>
              {isRegistering ? '¿Ya tienes expediente abierto?' : '¿Sin expediente todavía?'}
            </span>
            <span style={{
              fontWeight: weight.semibold,
              borderBottom: `1px solid ${colors.ink}`,
            }}>
              {isRegistering ? 'Iniciar sesión' : 'Abre uno gratis'}
            </span>
          </button>
        </div>
      </main>

      {/* Mobile: apila vertical */}
      <style>{`
        @media (max-width: 880px) {
          .login-aside { min-height: auto !important; padding: 32px 24px !important; }
          [class^="login-"], [class*=" login-"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Subcomponentes
// ═══════════════════════════════════════════════════════════════════════════

function SealMark({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `1.5px solid ${colors.seal}`, background: colors.paper,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: families.mono, fontSize: '9px', fontWeight: weight.bold,
      color: colors.seal, letterSpacing: tracking.wide,
    }}>
      ISO
    </div>
  )
}

function SectionEyebrow({ num, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: '14px',
      paddingBottom: '10px', borderBottom: `1px solid ${colors.hairline}`,
    }}>
      <span style={{
        fontFamily: families.mono, fontSize: '13px',
        fontWeight: weight.bold, color: colors.seal,
      }}>
        § {num}
      </span>
      <span style={{
        fontFamily: families.mono, fontSize: '11px',
        letterSpacing: tracking.wider, color: colors.inkSoft, textTransform: 'uppercase',
      }}>
        {label}
      </span>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', required, adornment }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{
        fontFamily: families.mono, fontSize: '10px',
        letterSpacing: tracking.wider, color: colors.inkSoft,
        textTransform: 'uppercase', fontWeight: weight.semibold,
      }}>
        {label}
      </span>
      <div style={{
        display: 'flex', alignItems: 'center',
        borderBottom: `1.5px solid ${colors.hairlineStrong}`,
        paddingBottom: '8px', transition: 'border-color 0.15s ease',
      }}
      onFocus={e => e.currentTarget.style.borderBottomColor = colors.seal}
      onBlur={e => e.currentTarget.style.borderBottomColor = colors.hairlineStrong}
      >
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontFamily: families.body, fontSize: '16px',
            color: colors.ink, padding: '4px 0',
          }}
        />
        {adornment}
      </div>
    </label>
  )
}
