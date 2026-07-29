import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Eye, EyeOff, ArrowRight, CheckCircle } from 'lucide-react'
import { colors, families, tracking, weight } from './components/ui/tokens'

// =============================================================================
// ResetPassword — página pública que aterrizás desde el link del email.
//
// Flujo Supabase:
//  1. Usuario pide reset desde Login → supabase.auth.resetPasswordForEmail()
//  2. Supabase envía email con link a /reset-password#access_token=...&type=recovery
//  3. El SDK de Supabase detecta el hash y establece una sesión temporal
//  4. Esta página permite escribir contraseña nueva → auth.updateUser({password})
//  5. Login exitoso → redirect a /app
//
// Detección de estado inicial: si onAuthStateChange emite PASSWORD_RECOVERY,
// significa que el token del hash es válido. Sin eso, mostramos error.
// =============================================================================

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)      // token válido detectado
  const [expired, setExpired] = useState(false)  // token inválido/expirado
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Escuchar el evento PASSWORD_RECOVERY que dispara el SDK cuando detecta
    // el hash del recovery link.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })

    // Fallback: si después de 3s no dispara PASSWORD_RECOVERY, chequear si
    // hay al menos una sesión activa (token válido). Si no, marcar expirado.
    const timer = setTimeout(async () => {
      if (!ready) {
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          setReady(true)
        } else {
          setExpired(true)
        }
      }
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [ready])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== passwordConfirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password })
      if (updErr) throw updErr
      setDone(true)
      setTimeout(() => {
        window.location.href = '/app'
      }, 2000)
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la contraseña.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.paper, color: colors.ink,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
      fontFamily: families.body,
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: colors.paperCool,
        border: `1px solid ${colors.hairline}`,
        padding: '40px 32px',
      }}>
        {/* Header con sello */}
        <a href="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: '12px',
          textDecoration: 'none', marginBottom: '32px',
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            border: `1.5px solid ${colors.seal}`, background: colors.paper,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: families.mono, fontSize: 9, fontWeight: weight.bold,
            color: colors.seal, letterSpacing: tracking.wide,
          }}>ISO</div>
          <div style={{
            fontFamily: families.display, fontSize: 18, fontWeight: weight.semibold,
            color: colors.ink,
          }}>IsoSmartCore</div>
        </a>

        <div style={{
          fontFamily: families.mono, fontSize: 11,
          letterSpacing: tracking.wider, color: colors.seal,
          textTransform: 'uppercase', fontWeight: weight.semibold, marginBottom: 12,
        }}>
          # 00 · RESTABLECER ACCESO
        </div>

        <h1 style={{
          margin: '0 0 24px 0', fontFamily: families.display,
          fontSize: 32, fontWeight: weight.semibold, lineHeight: 1.1,
          letterSpacing: tracking.tight, color: colors.ink,
        }}>
          Nueva contraseña.
        </h1>

        {/* Estado: link expirado o inválido */}
        {expired && !ready && !done && (
          <div style={{
            padding: '16px',
            border: `1px solid ${colors.alert}`,
            background: colors.alertLight,
            color: colors.alertText,
            fontSize: 14, lineHeight: 1.5,
          }}>
            <strong>Link expirado o inválido.</strong>
            <div style={{ marginTop: 8 }}>
              Los links de restablecimiento vencen en 1 hora. Volvé al login y solicitá uno nuevo.
            </div>
            <a href="/app" style={{
              display: 'inline-block', marginTop: 12,
              color: colors.alertText, textDecoration: 'none',
              borderBottom: `1px solid ${colors.alertText}`,
              fontWeight: weight.semibold,
            }}>Ir al login →</a>
          </div>
        )}

        {/* Estado: cargando validación del token */}
        {!ready && !expired && !done && (
          <div style={{
            color: colors.inkSoft, fontSize: 14,
            textAlign: 'center', padding: '24px 0',
          }}>
            Verificando el link…
          </div>
        )}

        {/* Estado: éxito */}
        {done && (
          <div style={{
            padding: '16px',
            border: `1px solid ${colors.approve}`,
            background: colors.approveLight,
            color: colors.approveText,
            fontSize: 14, lineHeight: 1.5,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <CheckCircle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Contraseña actualizada.</strong>
              <div style={{ marginTop: 4 }}>
                Redirigiendo al expediente en 2 segundos…
              </div>
            </div>
          </div>
        )}

        {/* Formulario */}
        {ready && !done && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <PasswordField
              label="Contraseña nueva"
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggleShow={() => setShowPassword(v => !v)}
              placeholder="Al menos 8 caracteres"
            />
            <PasswordField
              label="Confirmar contraseña"
              value={passwordConfirm}
              onChange={setPasswordConfirm}
              show={showPassword}
              onToggleShow={() => setShowPassword(v => !v)}
              placeholder="Escribí la misma"
            />

            {error && (
              <div style={{
                padding: '12px 14px',
                border: `1px solid ${colors.alert}`,
                background: colors.alertLight,
                color: colors.alertText,
                fontSize: 13, lineHeight: 1.5,
              }}>
                <span style={{
                  fontFamily: families.mono, fontSize: 10,
                  letterSpacing: tracking.wider, textTransform: 'uppercase',
                  marginRight: 8, fontWeight: weight.bold,
                }}>RECHAZADO</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
                background: loading ? colors.inkSoft : colors.seal,
                color: colors.paper,
                border: 'none',
                padding: '14px 20px',
                fontFamily: families.body, fontSize: 15, fontWeight: weight.semibold,
                letterSpacing: tracking.wide,
                cursor: loading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span>{loading ? 'Guardando…' : 'Actualizar contraseña'}</span>
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>
        )}

        <div style={{
          marginTop: 24, paddingTop: 16,
          borderTop: `1px solid ${colors.hairline}`,
          fontFamily: families.mono, fontSize: 10,
          letterSpacing: tracking.wider, color: colors.inkSoft,
          textTransform: 'uppercase', textAlign: 'center',
        }}>
          FOLIO {new Date().getFullYear()}/{String(new Date().getMonth() + 1).padStart(2, '0')} · QUITO · ECUADOR
        </div>
      </div>
    </div>
  )
}

function PasswordField({ label, value, onChange, show, onToggleShow, placeholder }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{
        fontFamily: families.mono, fontSize: 10,
        letterSpacing: tracking.wider, color: colors.inkSoft,
        textTransform: 'uppercase', fontWeight: weight.semibold,
      }}>{label}</span>
      <div style={{
        display: 'flex', alignItems: 'center',
        borderBottom: `1.5px solid ${colors.hairlineStrong}`,
        paddingBottom: 8,
      }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontFamily: families.body, fontSize: 16, color: colors.ink,
            padding: '4px 0',
          }}
        />
        <button
          type="button"
          onClick={onToggleShow}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: colors.inkSoft, padding: '0 4px', display: 'flex',
          }}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  )
}
