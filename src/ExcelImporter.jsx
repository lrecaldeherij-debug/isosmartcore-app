// Importador genérico de Excel / CSV para cualquier módulo del SaaS.
//
// Flujo:
//   1) Botón "Importar desde Excel" abre modal
//   2) Paso 1: descargar plantilla (encabezados + fila ejemplo)
//   3) Paso 2: subir archivo
//   4) Si los headers del usuario coinciden con la plantilla → preview directo
//      Si NO coinciden → llamamos a la IA para mapear columnas; el usuario revisa/edita
//      el mapeo, luego preview, luego import.
//
// El spec viene de excelTemplates.js.

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import {
  Upload, Download, X, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Sparkles, ArrowRight, ArrowLeft,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import { EXCEL_TEMPLATES, validateRow } from './excelTemplates'
import { toast } from './lib/toast'

export default function ExcelImporter({ templateKey, onImported }) {
  const spec = EXCEL_TEMPLATES[templateKey]
  if (!spec) {
    console.warn(`ExcelImporter: templateKey "${templateKey}" no existe en EXCEL_TEMPLATES`)
    return null
  }

  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState('upload')      // 'upload' | 'mapping' | 'preview' | 'done'
  const [rawRows, setRawRows] = useState([])         // filas tal como vienen del Excel del usuario
  const [userHeaders, setUserHeaders] = useState([])
  const [mapping, setMapping] = useState({})         // { userHeader: systemKey | null }
  const [mappingNotes, setMappingNotes] = useState('')
  const [mappingLoading, setMappingLoading] = useState(false)
  const [rows, setRows] = useState([])               // filas validadas (post mapeo)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)         // { inserted, failed, error? }
  const fileInputRef = useRef(null)

  // ----- 1. Descargar plantilla -----

  const downloadTemplate = () => {
    try {
      const headers = spec.columns.map(c => c.label)
      const example = spec.columns.map(c => c.example ?? '')
      const ws = XLSX.utils.aoa_to_sheet([headers, example])
      const wb = XLSX.utils.book_new()
      const safeName = (spec.label.replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'Hoja1').substring(0, 31)
      XLSX.utils.book_append_sheet(wb, ws, safeName)

      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `plantilla-${templateKey}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error generando plantilla:', err)
      toast.error('No pude generar la plantilla: ' + err.message)
    }
  }

  // ----- 2. Cargar archivo y detectar mapeo necesario -----

  const handleFile = async (file) => {
    if (!file) return
    setResult(null)

    try {
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(ws, { defval: null })

      if (json.length === 0) {
        toast.warning('El archivo no tiene filas de datos')
        return
      }

      const headers = Object.keys(json[0])
      setRawRows(json)
      setUserHeaders(headers)

      const expectedLabels = spec.columns.map(c => c.label)
      const requiredLabels = spec.columns.filter(c => c.required).map(c => c.label)
      const hasAllRequired = requiredLabels.every(lbl => headers.includes(lbl))

      if (hasAllRequired) {
        // Coincide con la plantilla → validamos directo
        validateAndShowPreview(json)
      } else {
        // Necesitamos mapear con IA
        await requestAIMapping(headers, json.slice(0, 3))
      }
    } catch (err) {
      console.error('Error leyendo archivo:', err)
      toast.error('No pude leer el archivo: ' + err.message)
    }
  }

  // ----- 3. Pedir mapeo a la IA -----

  const requestAIMapping = async (headers, sampleRows) => {
    setMappingLoading(true)
    setStage('mapping')

    const fieldList = spec.columns.map(c =>
      `- "${c.key}" (${c.label}${c.required ? ', REQUERIDO' : ''}, tipo: ${c.type}${c.enumValues ? `, valores válidos: ${c.enumValues.join('/')}` : ''})`
    ).join('\n')

    const prompt = `Soy un sistema que importa datos a una base ISO 9001. El usuario subió un archivo con estos encabezados:
${JSON.stringify(headers)}

Aquí 3 filas de muestra:
${JSON.stringify(sampleRows, null, 2)}

Necesito mapear los encabezados del usuario a estos campos del sistema:
${fieldList}

Devolveme SOLO JSON con esta forma exacta:
{
  "mapping": { "<encabezadoDelUsuario>": "<keyDelSistema o null>", ... },
  "notes": "explicación breve de cómo decidiste"
}

Reglas:
- Si un encabezado no encaja en ningún campo, usa null como valor.
- Si dos encabezados podrían mapear al mismo campo, elige el más específico y dejá el otro en null.
- Cubrí TODOS los encabezados del usuario en el objeto mapping (no omitas ninguno).
- Para campos REQUERIDOS, esforzate por encontrar un match razonable.`

    const respuesta = await consultarIA(prompt, 'Eres un asistente que mapea columnas de Excel a campos de base de datos. Responde ÚNICAMENTE con el JSON pedido, sin texto adicional, sin markdown.')
    setMappingLoading(false)

    try {
      let clean = respuesta.replace(/```json/g, '').replace(/```/g, '').trim()
      if (!clean.startsWith('{')) clean = clean.substring(clean.indexOf('{'))
      if (!clean.endsWith('}')) clean = clean.substring(0, clean.lastIndexOf('}') + 1)
      const parsed = JSON.parse(clean)

      // Garantizamos que todos los headers del usuario estén en el mapping
      const finalMapping = {}
      for (const h of headers) {
        finalMapping[h] = parsed.mapping?.[h] ?? null
      }
      setMapping(finalMapping)
      setMappingNotes(parsed.notes || '')
    } catch (e) {
      console.error('Error parseando respuesta IA:', respuesta)
      toast.warning('La IA no devolvió un mapeo válido · Puedes mapear las columnas manualmente')
      // Inicializamos vacío para mapeo manual
      const empty = {}
      for (const h of headers) empty[h] = null
      setMapping(empty)
    }
  }

  // ----- 4. Aplicar el mapeo y validar -----

  const validateAndShowPreview = (sourceRows, customMapping = null) => {
    let processedRows = sourceRows

    if (customMapping) {
      // Re-mapear: cada fila del usuario se transforma a un objeto con labels del spec
      const keyToLabel = {}
      spec.columns.forEach(c => { keyToLabel[c.key] = c.label })

      processedRows = sourceRows.map(raw => {
        const remapped = {}
        for (const [userHeader, systemKey] of Object.entries(customMapping)) {
          if (systemKey && keyToLabel[systemKey]) {
            remapped[keyToLabel[systemKey]] = raw[userHeader]
          }
        }
        return remapped
      })
    }

    const validated = processedRows.map(raw => {
      const { errors, cleaned } = validateRow(raw, spec)
      return { raw, errors, cleaned }
    })
    setRows(validated)
    setStage('preview')
  }

  const confirmMapping = () => {
    validateAndShowPreview(rawRows, mapping)
  }

  // ----- 5. Insert batch -----

  const validRows = rows.filter(r => r.errors.length === 0)
  const invalidRows = rows.filter(r => r.errors.length > 0)

  const confirmImport = async () => {
    if (validRows.length === 0) return
    setImporting(true)
    const payload = validRows.map(r => r.cleaned)
    const { error } = await supabase.from(spec.tableName).insert(payload)
    setImporting(false)
    if (error) {
      setResult({ inserted: 0, failed: validRows.length, error: error.message })
    } else {
      setResult({ inserted: validRows.length, failed: invalidRows.length, error: null })
      if (onImported) onImported()
    }
    setStage('done')
  }

  // ----- Reset & close -----

  const reset = () => {
    setStage('upload')
    setRawRows([])
    setUserHeaders([])
    setMapping({})
    setMappingNotes('')
    setRows([])
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const close = () => {
    setOpen(false)
    reset()
  }

  // ----- Render -----

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
        <FileSpreadsheet size={16} /> Importar desde Excel
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
            background: 'white', maxWidth: '900px', width: '100%', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', padding: '0',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.6)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileSpreadsheet size={20} /> Importar {spec.label}
              </h3>
              <button onClick={close} className="btn-ghost" style={{ padding: '0.25rem' }}>
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>

              {/* Stage: upload */}
              {stage === 'upload' && (
                <>
                  <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>{spec.description}</p>

                  <div style={{
                    background: '#f8fafc', padding: '1rem', borderRadius: '8px',
                    border: '1px solid #e2e8f0', marginBottom: '1.5rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                  }}>
                    <div>
                      <strong>Opción A — Descargá la plantilla</strong>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        Te bajás un .xlsx con las columnas correctas. Lo llenás y lo subes.
                      </p>
                    </div>
                    <button onClick={downloadTemplate} className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      <Download size={16} /> plantilla-{templateKey}.xlsx
                    </button>
                  </div>

                  <div style={{
                    background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                    padding: '1rem', borderRadius: '8px',
                    border: '1px solid #ddd6fe', marginBottom: '1.5rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <Sparkles size={16} style={{ color: '#7c3aed' }} />
                      <strong>Opción B — Sube tu Excel actual</strong>
                    </div>
                    <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Si ya tienes tu propio archivo (Excel, CSV) con columnas distintas, la IA va a mapear tus columnas a los campos del sistema. Tú confirmás antes de importar.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={e => handleFile(e.target.files[0])}
                      style={{ display: 'block' }}
                    />
                  </div>
                </>
              )}

              {/* Stage: mapping (IA) */}
              {stage === 'mapping' && (
                <>
                  {mappingLoading ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                      <Loader2 className="animate-spin" size={32} style={{ color: '#7c3aed' }} />
                      <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>
                        La IA está analizando tus columnas...
                      </p>
                    </div>
                  ) : (
                    <>
                      <div style={{
                        background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                        padding: '1rem', borderRadius: '8px', marginBottom: '1rem',
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                      }}>
                        <Sparkles size={18} style={{ color: '#7c3aed' }} />
                        <div>
                          <strong>Mapeo propuesto por la IA</strong>
                          {mappingNotes && <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{mappingNotes}</p>}
                        </div>
                      </div>

                      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        Revisa cada columna. Cambia el campo destino si la IA se equivocó. Las marcadas como <em>"— Ignorar —"</em> no se importarán.
                      </p>

                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                          <thead style={{ background: '#f8fafc' }}>
                            <tr>
                              <th style={{ padding: '0.75rem', textAlign: 'left' }}>Tu columna</th>
                              <th style={{ padding: '0.75rem', textAlign: 'center', width: '40px' }}></th>
                              <th style={{ padding: '0.75rem', textAlign: 'left' }}>Campo del sistema</th>
                              <th style={{ padding: '0.75rem', textAlign: 'left' }}>Vista previa (1ª fila)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {userHeaders.map(h => (
                              <tr key={h} style={{ borderTop: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '0.75rem', fontWeight: 500 }}>{h}</td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#94a3b8' }}>
                                  <ArrowRight size={16} />
                                </td>
                                <td style={{ padding: '0.75rem' }}>
                                  <select
                                    value={mapping[h] || ''}
                                    onChange={e => setMapping({ ...mapping, [h]: e.target.value || null })}
                                    className="form-select"
                                    style={{ width: '100%', padding: '0.4rem' }}
                                  >
                                    <option value="">— Ignorar —</option>
                                    {spec.columns.map(c => (
                                      <option key={c.key} value={c.key}>
                                        {c.label}{c.required ? ' *' : ''}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                  {rawRows[0]?.[h] ?? <em>—</em>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mostrar campos requeridos que NO están mapeados */}
                      {(() => {
                        const mappedKeys = new Set(Object.values(mapping).filter(Boolean))
                        const missingRequired = spec.columns.filter(c => c.required && !mappedKeys.has(c.key))
                        if (missingRequired.length === 0) return null
                        return (
                          <div style={{
                            marginTop: '1rem', padding: '0.75rem', borderRadius: '6px',
                            background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
                            fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                          }}>
                            <AlertCircle size={16} />
                            <span>
                              Faltan mapear campos requeridos:&nbsp;
                              <strong>{missingRequired.map(c => c.label).join(', ')}</strong>
                            </span>
                          </div>
                        )
                      })()}
                    </>
                  )}
                </>
              )}

              {/* Stage: preview */}
              {stage === 'preview' && (
                <>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
                    Preview de importación
                    <span className="badge badge-success">{validRows.length} válidas</span>
                    {invalidRows.length > 0 && <span className="badge badge-danger">{invalidRows.length} con error</span>}
                  </h4>

                  <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                        <tr>
                          <th style={{ padding: '0.5rem', textAlign: 'left', width: '40px' }}>#</th>
                          {spec.columns.map(c => (
                            <th key={c.key} style={{ padding: '0.5rem', textAlign: 'left' }}>
                              {c.label} {c.required && <span style={{ color: '#ef4444' }}>*</span>}
                            </th>
                          ))}
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Validación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, idx) => {
                          const ok = r.errors.length === 0
                          return (
                            <tr key={idx} style={{ borderTop: '1px solid #f1f5f9', background: ok ? 'white' : '#fef2f2' }}>
                              <td style={{ padding: '0.5rem', color: '#94a3b8' }}>{idx + 1}</td>
                              {spec.columns.map(c => (
                                <td key={c.key} style={{ padding: '0.5rem' }}>{r.raw[c.label] ?? ''}</td>
                              ))}
                              <td style={{ padding: '0.5rem' }}>
                                {ok ? (
                                  <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <CheckCircle2 size={14} /> OK
                                  </span>
                                ) : (
                                  <span style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.25rem' }} title={r.errors.join('; ')}>
                                    <AlertCircle size={14} /> {r.errors.length} error{r.errors.length > 1 ? 'es' : ''}
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {invalidRows.length > 0 && (
                    <details style={{ marginTop: '1rem', background: '#fef2f2', padding: '0.75rem', borderRadius: '6px' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#991b1b' }}>
                        Ver detalle de errores ({invalidRows.length} filas)
                      </summary>
                      <ul style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem' }}>
                        {invalidRows.slice(0, 20).map((r, idx) => (
                          <li key={idx}>Fila {rows.indexOf(r) + 1}: {r.errors.join('; ')}</li>
                        ))}
                        {invalidRows.length > 20 && <li>... y {invalidRows.length - 20} más</li>}
                      </ul>
                    </details>
                  )}
                </>
              )}

              {/* Stage: done */}
              {stage === 'done' && result && (
                <div style={{
                  background: result.error ? '#fef2f2' : '#f0fdf4',
                  border: `1px solid ${result.error ? '#fecaca' : '#bbf7d0'}`,
                  padding: '1.5rem', borderRadius: '8px',
                }}>
                  {result.error ? (
                    <>
                      <h4 style={{ marginTop: 0, color: '#991b1b' }}>❌ Error en la importación</h4>
                      <p style={{ margin: 0 }}>{result.error}</p>
                    </>
                  ) : (
                    <>
                      <h4 style={{ marginTop: 0, color: '#166534' }}>✅ Importación completada</h4>
                      <p style={{ margin: 0 }}>
                        <strong>{result.inserted}</strong> filas insertadas.
                        {result.failed > 0 && <> <strong>{result.failed}</strong> omitidas por errores de validación.</>}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0' }}>
              <div>
                {(stage === 'mapping' || stage === 'preview') && (
                  <button onClick={reset} className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ArrowLeft size={14} /> Subir otro archivo
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {stage !== 'done' && <button onClick={close} className="btn btn-ghost">Cancelar</button>}
                {stage === 'mapping' && !mappingLoading && (() => {
                  const mappedKeys = new Set(Object.values(mapping).filter(Boolean))
                  const requiredOk = spec.columns.filter(c => c.required).every(c => mappedKeys.has(c.key))
                  return (
                    <button onClick={confirmMapping} className="btn btn-primary" disabled={!requiredOk}>
                      Continuar al preview <ArrowRight size={14} />
                    </button>
                  )
                })()}
                {stage === 'preview' && (
                  <button
                    onClick={confirmImport}
                    className="btn btn-primary"
                    disabled={validRows.length === 0 || importing}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    {importing ? <><Loader2 className="animate-spin" size={16} /> Importando...</> : <><Upload size={16} /> Importar {validRows.length} filas</>}
                  </button>
                )}
                {stage === 'done' && <button onClick={close} className="btn btn-primary">Cerrar</button>}
              </div>
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  )
}
