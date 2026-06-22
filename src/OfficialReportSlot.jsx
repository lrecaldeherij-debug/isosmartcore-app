// OfficialReportSlot: para cada reporte de la sección "Reportes y exportaciones",
// permite que el cliente suba SU versión oficial firmada (PDF/DOCX).
// El sistema sigue generando el auto-PDF en vivo; este componente agrega
// el archivo "oficial" como evidencia documentada (ISO 7.5).
//
// Uso:
//   <OfficialReportSlot reportKey="manual" />
//   <OfficialReportSlot reportKey="risks" />

import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import {
  Upload, Download, FileCheck2, Clock, X, RefreshCcw, History, Trash2, Loader2, AlertCircle,
} from 'lucide-react'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

const BUCKET = 'documents'

export default function OfficialReportSlot({ reportKey }) {
  const { org, can } = useOrg()
  const [active, setActive] = useState(null)
  const [history, setHistory] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [notes, setNotes] = useState('')
  const [versionLabel, setVersionLabel] = useState('')
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (org?.id) fetchActive()
  }, [org?.id, reportKey])

  const fetchActive = async () => {
    const { data } = await supabase
      .from('report_artifacts')
      .select('*')
      .eq('report_key', reportKey)
      .eq('is_active', true)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setActive(data)
  }

  const fetchHistory = async () => {
    const { data } = await supabase
      .from('report_artifacts')
      .select('*')
      .eq('report_key', reportKey)
      .order('uploaded_at', { ascending: false })
    setHistory(data || [])
  }

  const openUpload = () => {
    setError(null)
    setNotes('')
    setVersionLabel('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    setShowUpload(true)
  }

  const handleUpload = async (file) => {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
      const uuid = crypto.randomUUID()
      const path = `${org.id}/reports/${reportKey}/${uuid}.${ext}`

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        contentType: file.type || 'application/octet-stream',
      })
      if (upErr) throw upErr

      // Desactivar versiones previas
      await supabase
        .from('report_artifacts')
        .update({ is_active: false })
        .eq('report_key', reportKey)
        .eq('is_active', true)

      // Insertar nuevo registro
      const { data: { user } } = await supabase.auth.getUser()
      const { error: insErr } = await supabase.from('report_artifacts').insert({
        report_key: reportKey,
        storage_path: path,
        original_filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        version_label: versionLabel || null,
        notes: notes || null,
        uploaded_by: user?.id,
      })
      if (insErr) throw insErr

      await fetchActive()
      setShowUpload(false)
    } catch (e) {
      console.error(e)
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (artifact) => {
    setDownloading(true)
    try {
      const { data, error: dlErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(artifact.storage_path, 60)
      if (dlErr) throw dlErr
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast.error('No se pudo abrir el archivo: ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  const handleDelete = async (artifact) => {
    if (!await confirm(`¿Eliminar la versión "${artifact.original_filename}"? Se borra del historial y de Storage.`)) return
    try {
      await supabase.storage.from(BUCKET).remove([artifact.storage_path])
      await supabase.from('report_artifacts').delete().eq('id', artifact.id)
      await fetchActive()
      await fetchHistory()
    } catch (e) {
      toast.error('Error al eliminar: ' + e.message)
    }
  }

  const openHistory = async () => {
    await fetchHistory()
    setHistoryOpen(true)
  }

  const fmtDate = (s) => s ? new Date(s).toLocaleString() : '—'
  const fmtSize = (b) => !b ? '' : b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/1024/1024).toFixed(1)} MB`

  return (
    <div style={{
      marginTop: '0.5rem',
      paddingTop: '0.5rem',
      borderTop: '1px dashed var(--sidebar-border)',
      fontSize: '0.85rem',
    }}>
      {active ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <FileCheck2 size={14} style={{ color: '#16a34a' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Versión oficial:</span>
          <strong>{active.original_filename}</strong>
          {active.version_label && (
            <span style={{ color: 'var(--text-tertiary)' }}>({active.version_label})</span>
          )}
          <span style={{ color: 'var(--text-tertiary)' }}>· {fmtDate(active.uploaded_at)}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
            <button
              onClick={() => handleDownload(active)}
              className="btn btn-ghost btn-sm"
              disabled={downloading}
              title="Descargar versión oficial"
              style={{ padding: '0.25rem 0.5rem', color: 'var(--primary-color)' }}
            >
              {downloading ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
            </button>
            {can.write && (
              <>
                <button onClick={openUpload} className="btn btn-ghost btn-sm" title="Reemplazar versión" style={{ padding: '0.25rem 0.5rem' }}>
                  <RefreshCcw size={14} />
                </button>
                <button onClick={openHistory} className="btn btn-ghost btn-sm" title="Historial" style={{ padding: '0.25rem 0.5rem' }}>
                  <History size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        can.write && (
          <button
            onClick={openUpload}
            className="btn btn-ghost btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--primary-color)' }}
          >
            <Upload size={14} /> Subir versión oficial firmada
          </button>
        )
      )}

      {/* Modal de upload */}
      {showUpload && createPortal((
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{ background: 'white', maxWidth: '500px', width: '100%', padding: '0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: 0 }}>Subir versión oficial</h4>
              <button onClick={() => setShowUpload(false)} className="btn-ghost" style={{ padding: '0.25rem' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '1.25rem', display: 'grid', gap: '1rem' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Archivo firmado (PDF, DOCX, etc.)</label>
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.xlsx,.xls" style={{ display: 'block', marginTop: '0.25rem' }} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Etiqueta de versión (opcional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ej: v2.0 firmada por GG — 2026-06"
                  value={versionLabel}
                  onChange={e => setVersionLabel(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Notas (opcional)</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Quién firmó, qué cambió respecto a la versión anterior..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
              {error && (
                <div style={{ padding: '0.5rem 0.75rem', background: '#fef2f2', color: '#991b1b', borderRadius: '4px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <AlertCircle size={14} /> {error}
                </div>
              )}
              <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: 0 }}>
                Esta versión queda como "oficial". Las anteriores pasan al historial pero no se borran (trazabilidad).
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => setShowUpload(false)} className="btn btn-ghost">Cancelar</button>
              <button
                onClick={() => handleUpload(fileInputRef.current?.files?.[0])}
                className="btn btn-primary"
                disabled={uploading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
              >
                {uploading ? <><Loader2 className="animate-spin" size={14} /> Subiendo...</> : <><Upload size={14} /> Subir</>}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Modal de historial */}
      {historyOpen && createPortal((
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{ background: 'white', maxWidth: '700px', width: '100%', padding: '0', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={18} /> Historial de versiones
              </h4>
              <button onClick={() => setHistoryOpen(false)} className="btn-ghost" style={{ padding: '0.25rem' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '1rem 1.25rem', overflowY: 'auto' }}>
              {history.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)' }}>Sin versiones todavía.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Archivo</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Etiqueta</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Subido</th>
                      <th style={{ padding: '0.5rem' }}>Tamaño</th>
                      <th style={{ padding: '0.5rem' }}>Estado</th>
                      <th style={{ padding: '0.5rem' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.5rem' }}>{h.original_filename}</td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{h.version_label || '—'}</td>
                        <td style={{ padding: '0.5rem' }}>{fmtDate(h.uploaded_at)}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>{fmtSize(h.size_bytes)}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                          {h.is_active ? (
                            <span className="badge badge-success">Oficial</span>
                          ) : (
                            <span className="badge badge-neutral">Histórico</span>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                          <button onClick={() => handleDownload(h)} className="btn-ghost" title="Descargar" style={{ padding: '0.25rem', color: 'var(--primary-color)' }}>
                            <Download size={14} />
                          </button>
                          {can.write && (
                            <button onClick={() => handleDelete(h)} className="btn-ghost" title="Eliminar" style={{ padding: '0.25rem', color: '#ef4444' }}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  )
}
