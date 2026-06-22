import React, { useEffect, useRef } from 'react'

export default function ModalLinkEvidence({ open, initialValue = '', onCancel, onSave, loading, inputId = 'evidence-link-input' }) {
  const inputRef = useRef(null)
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus() }, [open])
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ width: 520, maxWidth: '90%', background: 'white', padding: 18, borderRadius: 8, boxShadow: '0 6px 30px rgba(0,0,0,0.2)' }} role="dialog" aria-modal="true">
        <h3 style={{ margin: '0 0 10px 0' }}>Pegar enlace de evidencia</h3>
        <p style={{ margin: '0 0 10px 0', color: '#555', fontSize: 13 }}>Pega una URL pública (Google Drive, Dropbox, etc.). Se intentará convertir enlaces de Drive automáticamente.</p>
        <input ref={inputRef} defaultValue={initialValue} id={inputId} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button onClick={onCancel} style={{ padding: '8px 12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={() => onSave(document.getElementById(inputId).value)} disabled={loading} style={{ padding: '8px 12px', background: '#17a2b8', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            {loading ? 'Guardando...' : 'Guardar enlace'}
          </button>
        </div>
      </div>
    </div>
  )
}
