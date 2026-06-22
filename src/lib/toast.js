// =============================================================================
// Wrapper sobre react-hot-toast con helpers semánticos.
// Reemplaza TODOS los alert() de la app.
//
// Uso:
//   import { toast } from './lib/toast'
//   toast.success('Guardado')
//   toast.error('No se pudo guardar')
//   toast.info('Actualizando…')
//   toast.warning('Verificá los datos')
//   const id = toast.loading('Guardando…')
//   toast.done(id, '✅ Guardado')   // o toast.dismiss(id) para cerrar sin mensaje
//
//   // Async automático:
//   await toast.promise(supabase.from('x').insert(...), {
//     loading: 'Guardando…',
//     success: 'Guardado',
//     error:   (err) => 'Error: ' + err.message,
//   })
// =============================================================================

import hot from 'react-hot-toast'

const baseStyle = {
  fontSize: '13px',
  fontWeight: 500,
  padding: '10px 14px',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
}

export const toast = {
  success: (msg, opts = {}) => hot.success(msg, {
    duration: 3000,
    style: { ...baseStyle, background: '#dcfce7', color: '#166534', border: '1px solid #86efac' },
    iconTheme: { primary: '#16a34a', secondary: '#dcfce7' },
    ...opts,
  }),

  error: (msg, opts = {}) => hot.error(msg, {
    duration: 5000,
    style: { ...baseStyle, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
    iconTheme: { primary: '#dc2626', secondary: '#fee2e2' },
    ...opts,
  }),

  info: (msg, opts = {}) => hot(msg, {
    duration: 3000,
    icon: 'ℹ️',
    style: { ...baseStyle, background: '#e0f2fe', color: '#075985', border: '1px solid #7dd3fc' },
    ...opts,
  }),

  warning: (msg, opts = {}) => hot(msg, {
    duration: 4000,
    icon: '⚠️',
    style: { ...baseStyle, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' },
    ...opts,
  }),

  loading: (msg, opts = {}) => hot.loading(msg, {
    style: { ...baseStyle, background: 'white', color: '#1e293b', border: '1px solid #cbd5e1' },
    ...opts,
  }),

  // Reemplaza un loading toast con un success
  done: (id, msg, opts = {}) => hot.success(msg, {
    id, duration: 3000,
    style: { ...baseStyle, background: '#dcfce7', color: '#166534', border: '1px solid #86efac' },
    ...opts,
  }),

  // Reemplaza un loading toast con un error
  fail: (id, msg, opts = {}) => hot.error(msg, {
    id, duration: 5000,
    style: { ...baseStyle, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
    ...opts,
  }),

  dismiss: (id) => hot.dismiss(id),

  // Promise helper para async ops
  promise: (promise, msgs, opts = {}) => hot.promise(promise, msgs, {
    style: baseStyle,
    success: { style: { ...baseStyle, background: '#dcfce7', color: '#166534', border: '1px solid #86efac' } },
    error: { style: { ...baseStyle, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' } },
    loading: { style: { ...baseStyle, background: 'white', color: '#1e293b', border: '1px solid #cbd5e1' } },
    ...opts,
  }),
}

export default toast
