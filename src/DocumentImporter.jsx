// Importador genérico de documentos Word/PDF/TXT con extracción IA.
//
// Uso típico en un componente módulo:
//   <DocumentImporter
//     targetModule="policy"
//     label="política de calidad"
//     onImported={(data) => { ... inserta data en la BD ... }}
//   />
//
// El flujo:
//   1) Botón "Importar desde Word/PDF"
//   2) Modal: upload archivo
//   3) Loading "🤖 Leyendo tu documento..."
//   4) Edge Function devuelve JSON estructurado
//   5) Preview EDITABLE (campos pre-llenados con la extracción)
//   6) Confirma → onImported(data) — el módulo padre decide cómo insertar.

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Upload, X, Loader2, Sparkles, AlertCircle, ArrowLeft } from 'lucide-react'
import { supabase } from './supabaseClient'

const ACCEPTED_MIME = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
}
const ACCEPT_ATTR = Object.values(ACCEPTED_MIME).join(',')
const MAX_SIZE_MB = 10

export default function DocumentImporter({ targetModule, label, onImported, renderPreview }) {
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState('upload')   // 'upload' | 'extracting' | 'preview' | 'done'
  const [error, setError] = useState(null)
  const [extracted, setExtracted] = useState(null) // JSON devuelto por la IA
  const [editable, setEditable] = useState(null)   // copia editable por el usuario
  const fileInputRef = useRef(null)

  const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.toString().split(',')[1])
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

  const handleFile = async (file) => {
    if (!file) return
    setError(null)

    if (!ACCEPTED_MIME[file.type]) {
      setError(`Tipo no soportado: ${file.type || file.name}. Aceptamos PDF, DOCX o TXT.`)
      return
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Archivo demasiado grande (máx ${MAX_SIZE_MB} MB).`)
      return
    }

    setStage('extracting')
    try {
      const base64 = await readFileAsBase64(file)
      const { data, error: invokeErr } = await supabase.functions.invoke('import-document', {
        body: {
          file_base64: base64,
          mime_type: file.type,
          filename: file.name,
          target_module: targetModule,
        },
      })

      if (invokeErr) {
        setError(`Error invocando IA: ${invokeErr.message}`)
        setStage('upload')
        return
      }
      if (data?.error) {
        setError(data.error)
        setStage('upload')
        return
      }
      if (!data?.ok || !data?.data) {
        setError('La IA no devolvió datos válidos.')
        setStage('upload')
        return
      }

      setExtracted(data.data)
      setEditable(JSON.parse(JSON.stringify(data.data))) // deep copy editable
      setStage('preview')
    } catch (e) {
      setError(`Error: ${e.message}`)
      setStage('upload')
    }
  }

  const confirmImport = async () => {
    if (!onImported) return
    setStage('done')
    try {
      await onImported(editable)
      setTimeout(() => close(), 1200)
    } catch (e) {
      setError(`Error al guardar: ${e.message}`)
      setStage('preview')
    }
  }

  const reset = () => {
    setStage('upload')
    setError(null)
    setExtracted(null)
    setEditable(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const close = () => {
    setOpen(false)
    reset()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn"
        style={{
          background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
          color: 'white',
          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
        }}
      >
        <Sparkles size={16} /> Importar Word/PDF con IA
      </button>

      {open && createPortal((
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{
            background: 'white', maxWidth: '800px', width: '100%', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', padding: '0',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.6)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={20} style={{ color: '#7c3aed' }} /> Importar {label} con IA
              </h3>
              <button onClick={close} className="btn-ghost" style={{ padding: '0.25rem' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>

              {/* Stage: upload */}
              {stage === 'upload' && (
                <>
                  <div style={{
                    background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                    padding: '1.25rem', borderRadius: '8px', marginBottom: '1.5rem',
                    border: '1px solid #ddd6fe',
                  }}>
                    <p style={{ margin: 0, color: '#4338ca', fontSize: '0.95rem' }}>
                      Sube tu documento existente (la política que ya tienes en Word, un PDF firmado, etc.).
                      La IA lo va a leer, extraer los campos clave y dejarlos pre-llenados para que confirmes.
                    </p>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <strong>Selecciona tu archivo</strong>
                    <p style={{ margin: '0.25rem 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Aceptamos PDF, DOCX y TXT. Máximo {MAX_SIZE_MB} MB.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPT_ATTR}
                      onChange={e => handleFile(e.target.files[0])}
                      style={{ display: 'block' }}
                    />
                  </div>

                  {error && (
                    <div style={{
                      marginTop: '1rem', padding: '0.75rem', borderRadius: '6px',
                      background: '#fef2f2', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}>
                      <AlertCircle size={16} /> {error}
                    </div>
                  )}
                </>
              )}

              {/* Stage: extracting */}
              {stage === 'extracting' && (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <Loader2 className="animate-spin" size={36} style={{ color: '#7c3aed' }} />
                  <h4 style={{ marginTop: '1.25rem' }}>🤖 Leyendo tu documento...</h4>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    La IA está extrayendo los campos. Puede tardar 5-20 segundos según el largo del documento.
                  </p>
                </div>
              )}

              {/* Stage: preview */}
              {stage === 'preview' && editable && (
                <>
                  <div style={{
                    background: '#f0fdf4', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem',
                    border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.9rem',
                  }}>
                    ✅ Extracción lista. Revisa los campos y corrige si la IA se equivocó. Cuando confirmes, se guarda en el módulo.
                  </div>

                  {/* El módulo padre define cómo renderizar el preview editable */}
                  {renderPreview && renderPreview(editable, setEditable)}

                  {/* Fallback: mostrar JSON crudo si no se pasó renderPreview */}
                  {!renderPreview && (
                    <pre style={{
                      background: '#f8fafc', padding: '1rem', borderRadius: '6px',
                      fontSize: '0.85rem', overflow: 'auto', maxHeight: '400px',
                    }}>
                      {JSON.stringify(editable, null, 2)}
                    </pre>
                  )}
                </>
              )}

              {/* Stage: done */}
              {stage === 'done' && (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <div style={{ fontSize: '3rem' }}>✅</div>
                  <h4>Importado correctamente</h4>
                  <p style={{ color: 'var(--text-secondary)' }}>Cerrando...</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0' }}>
              <div>
                {stage === 'preview' && (
                  <button onClick={reset} className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ArrowLeft size={14} /> Subir otro
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {stage !== 'done' && <button onClick={close} className="btn btn-ghost">Cancelar</button>}
                {stage === 'preview' && (
                  <button
                    onClick={confirmImport}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <Upload size={16} /> Confirmar e importar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  )
}
