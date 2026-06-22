import { useState, lazy, Suspense } from 'react'
import { HelpCircle } from 'lucide-react'
import { colors } from './tokens'

// Cargamos HelpSupport lazy para no inflar el bundle inicial: el panel
// solo se descarga cuando el usuario abre el botón.
const HelpSupport = lazy(() => import('../../HelpSupport'))

export default function HelpButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ayuda y soporte"
        title="Ayuda y soporte"
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 8000,
          width: '52px', height: '52px', borderRadius: '50%',
          background: colors.seal, color: colors.paper,
          border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(46,31,26,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.08)'
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(46,31,26,0.35)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(46,31,26,0.28)'
        }}
      >
        <HelpCircle size={24} />
      </button>
      {open && (
        <Suspense fallback={null}>
          <HelpSupport onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
