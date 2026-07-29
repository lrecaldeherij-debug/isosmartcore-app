import { useState } from 'react'
import { supabase } from './supabaseClient'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import { colors, families, tracking, weight, font } from './components/ui/tokens'

// Mapea errores crudos de Supabase a mensajes humanos en español + acción
// sugerida. Devuelve { text, action } donde action puede ser 'switch-to-login',
// 'reset-password', 'retry', 'resend-confirmation' o null.
function humanizeAuthError(rawMessage, mode) {
  const m = (rawMessage || '').toLowerCase()

  // Fallo de red — cold start Supabase, sin internet, CORS
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed')) {
    return {
      text: 'El servidor tardó en responder. Puede ser un despertar temporal (cold start). Intenta de nuevo en 15 segundos.',
      action: 'retry',
    }
  }

  // Email ya registrado en signup
  if (mode === 'signup' && (m.includes('already registered') || m.includes('already exists') || m.includes('user already'))) {
    return {
      text: 'Este correo ya tiene un expediente abierto.',
      action: 'switch-to-login',
    }
  }

  // Credenciales inválidas en login
  if (mode === 'login' && (m.includes('invalid login') || m.includes('invalid credentials'))) {
    return {
      text: 'Correo o contraseña incorrectos. Si no recuerdas tu contraseña, puedes restablecerla.',
      action: 'reset-password',
    }
  }

  // Email no confirmado
  if (m.includes('email not confirmed')) {
    return {
      text: 'Tu cuenta existe pero no confirmaste el correo. Revisa tu bandeja (y spam) el link de confirmación.',
      action: 'resend-confirmation',
    }
  }

  // Rate limit
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return {
      text: 'Demasiados intentos seguidos. Esperá un minuto y reintenta.',
      action: null,
    }
  }

  // Contraseña débil
  if (m.includes('password') && (m.includes('short') || m.includes('weak'))) {
    return {
      text: 'La contraseña es demasiado corta. Usa al menos 8 caracteres.',
      action: null,
    }
  }

  // Fallback: devuelve mensaje original con acción null
  return { text: rawMessage, action: null }
}

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
  const [resetSent, setResetSent] = useState(false)

  const handleAuth = async (e) => {
    e.preventDefault()
    if (isRegistering && !acceptTerms) {
      setMensaje({ kind: 'error', text: 'Debes aceptar los Términos y la Política de Privacidad para abrir cuenta.', action: null })
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
            emailRedirectTo: `${window.location.origin}/app`,
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
        const humanized = humanizeAuthError(error.message, isRegistering ? 'signup' : 'login')
        setMensaje({ kind: 'error', text: humanized.text, action: humanized.action })
      } else if (isRegistering && !data.session) {
        setMensaje({ kind: 'success', text: 'Registro recibido. Revisa tu correo para confirmar la cuenta.', action: null })
      } else if (data.session) {
        setMensaje({ kind: 'success', text: 'Acceso autorizado. Abriendo expediente…', action: null })
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
      const humanized = humanizeAuthError(err.message, isRegistering ? 'signup' : 'login')
      setMensaje({ kind: 'error', text: humanized.text, action: humanized.action })
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setMensaje({ kind: 'error', text: 'Ingresa tu correo primero para enviarte el link de restablecimiento.', action: null })
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      setResetSent(true)
      setMensaje({
        kind: 'success',
        text: `Te enviamos un link a ${email.trim()} para restablecer tu contraseña. Revisá tu bandeja (y spam).`,
        action: null,
      })
    } catch (err) {
      const humanized = humanizeAuthError(err.message, 'login')
      setMensaje({ kind: 'error', text: humanized.text, action: humanized.action })
    } finally {
      setLoading(false)
    }
  }

  const handleResendConfirmation = async () => {
    if (!email.trim()) {
      setMensaje({ kind: 'error', text: 'Ingresa tu correo primero para reenviar la confirmación.', action: null })
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/app` },
      })
      if (error) throw error
      setMensaje({
        kind: 'success',
        text: `Reenviamos el correo de confirmación a ${email.trim()}. Revisá tu bandeja.`,
        action: null,
      })
    } catch (err) {
      const humanized = humanizeAuthError(err.message, 'signup')
      setMensaje({ kind: 'error', text: humanized.text, action: humanized.action })
    } finally {
      setLoading(false)
    }
  }

  const switchToLogin = () => {
    setIsRegistering(false)
    setMensaje('')
    setResetSent(false)
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
              <Field label="Razón social / nombre de la empresa" value={companyName} onChange={setCompanyName} placeholder="Nombre de tu empresa" required />
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
              <div>
                <span style={{
                  fontFamily: families.mono, fontSize: '10px',
                  letterSpacing: tracking.wider, textTransform: 'uppercase',
                  marginRight: '8px', fontWeight: weight.bold,
                }}>
                  {isError ? 'RECHAZADO' : 'CONFIRMADO'}
                </span>
                {mensaje.text}
              </div>

              {/* Acciones sugeridas según el tipo de error */}
              {mensaje.action && (
                <div style={{
                  marginTop: '10px', paddingTop: '10px',
                  borderTop: `1px dashed ${isError ? colors.alert : colors.approve}66`,
                  display: 'flex', gap: '8px', flexWrap: 'wrap',
                }}>
                  {mensaje.action === 'switch-to-login' && (
                    <ActionButton onClick={switchToLogin}>
                      Iniciar sesión con este correo →
                    </ActionButton>
                  )}
                  {mensaje.action === 'reset-password' && !resetSent && (
                    <ActionButton onClick={handlePasswordReset} disabled={loading}>
                      Restablecer mi contraseña
                    </ActionButton>
                  )}
                  {mensaje.action === 'resend-confirmation' && (
                    <ActionButton onClick={handleResendConfirmation} disabled={loading}>
                      Reenviar correo de confirmación
                    </ActionButton>
                  )}
                  {mensaje.action === 'retry' && (
                    <ActionButton onClick={handleAuth} disabled={loading}>
                      Reintentar
                    </ActionButton>
                  )}
                </div>
              )}
            </div>
          )}
        </form>

        {/* Link "¿Olvidaste tu contraseña?" (solo modo login) */}
        {!isRegistering && !resetSent && (
          <div style={{ marginTop: '16px', textAlign: 'right' }}>
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={loading}
              style={{
                background: 'none', border: 'none', cursor: loading ? 'wait' : 'pointer',
                color: colors.inkSoft, fontFamily: families.body, fontSize: '13px',
                padding: 0,
                borderBottom: `1px solid ${colors.hairline}`,
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        )}

        {/* Switch login ↔ signup */}
        <div style={{
          marginTop: '32px', paddingTop: '24px',
          borderTop: `1px solid ${colors.hairline}`,
        }}>
          <button
            type="button"
            onClick={() => { setIsRegistering(!isRegistering); setMensaje(''); setResetSent(false) }}
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

function ActionButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: colors.ink, color: colors.paper,
        border: 'none', padding: '8px 14px',
        fontFamily: families.body, fontSize: '12px', fontWeight: weight.semibold,
        letterSpacing: tracking.wide,
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        borderRadius: '2px',
      }}
    >
      {children}
    </button>
  )
}

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
        # {num}
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
