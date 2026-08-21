// =============================================================================
// PublicCampaignPanel — sección de campañas de encuesta PÚBLICAS (QR + link
// único para todos los empleados, respuestas 100% anónimas).
//
// Se monta dentro de ClimateSurveys.jsx como un bloque independiente.
//
// Flujo del super_admin / quality manager:
//   1. Click "Nueva campaña QR" → modal con nombre + descripción + fecha límite
//   2. Al guardar, se crea la campaña con public_slug autogenerado
//   3. Panel de detalle muestra: QR grande, link corto, botón "Copiar link
//      para WhatsApp", botón "Descargar PDF imprimible"
//   4. Cierre manual o automático por fecha
//
// El QR apunta a /e/<slug>. La ruta pública es servida por PublicSurvey.jsx
// (mismo componente que /encuesta/:token, diferenciado por prop).
// =============================================================================

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import jsPDF from 'jspdf'
import { supabase } from './supabaseClient'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import { useOrg } from './OrgContext'
import {
  QrCode, Plus, Copy, Download, X, Clock, Users,
  MessageSquare, CheckCircle, Loader2, ExternalLink, XCircle
} from 'lucide-react'

const APP_BASE_URL = typeof window !== 'undefined' ? window.location.origin : ''

// Convierte "Clima Q3 2026" → "clima-q3-2026". Base para el slug público.
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // combining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

// Sufijo aleatorio corto para hacer únicos slugs con el mismo nombre base
function randomSuffix() {
  return Math.random().toString(36).slice(2, 6)
}

export default function PublicCampaignPanel() {
  const { org } = useOrg()
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [detail, setDetail] = useState(null)  // campaña seleccionada
  const [creating, setCreating] = useState(false)

  // Estado del form de creación
  const [form, setForm] = useState({
    name: '',
    description: '',
    expires_at: '',
  })

  useEffect(() => { fetchCampaigns() }, [])

  const fetchCampaigns = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('survey_campaigns')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
    if (error) toast.error('Error cargando campañas: ' + error.message)
    else setCampaigns(data || [])
    setLoading(false)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('El nombre es obligatorio')
    setCreating(true)

    // Slug: base del nombre + sufijo random para evitar colisiones
    const baseSlug = slugify(form.name) || 'encuesta'
    const publicSlug = `${baseSlug}-${randomSuffix()}`

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      survey_type: 'climate',
      status: 'active',
      is_public: true,
      public_slug: publicSlug,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    }
    const { data, error } = await supabase
      .from('survey_campaigns')
      .insert([payload])
      .select('*')
      .single()
    setCreating(false)

    if (error) return toast.error('No se pudo crear: ' + error.message)
    toast.success('Campaña creada. Compartí el QR o el link con tu equipo.')
    setShowCreate(false)
    setForm({ name: '', description: '', expires_at: '' })
    fetchCampaigns()
    setDetail(data)  // Abrir el panel de QR inmediatamente
  }

  const handleClose = async (camp) => {
    if (!await confirm(
      `¿Cerrar la campaña "${camp.name}"? No se aceptarán más respuestas después de esto (podés reabrirla desde la BD si necesitás).`,
      { tone: 'warning', confirmText: 'Cerrar campaña' }
    )) return
    const { error } = await supabase
      .from('survey_campaigns')
      .update({ status: 'closed' })
      .eq('id', camp.id)
    if (error) return toast.error('No se pudo cerrar: ' + error.message)
    toast.success('Campaña cerrada.')
    fetchCampaigns()
    if (detail?.id === camp.id) setDetail({ ...detail, status: 'closed' })
  }

  return (
    <div style={{
      background: '#fefce8', border: '2px solid #fde047', borderRadius: '10px',
      padding: '16px', marginBottom: '20px',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: '10px', flexWrap: 'wrap', marginBottom: '12px',
      }}>
        <div>
          <h3 style={{
            margin: 0, fontSize: '15px', color: '#854d0e',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <QrCode size={18} />
            Campañas públicas por QR (respuestas anónimas)
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#854d0e' }}>
            Un QR + link único para todos los empleados. Sin login, sin email, sin nombre. Ideal para taller/fábrica.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} style={btn('#ca8a04')}>
          <Plus size={16} /> Nueva campaña QR
        </button>
      </div>

      {loading ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#78716c' }}>Cargando…</p>
      ) : campaigns.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#78716c', fontStyle: 'italic' }}>
          Sin campañas públicas activas. Creá una para generar el QR y compartirlo con tu equipo.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
          {campaigns.map(c => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onOpenDetail={() => setDetail(c)}
              onClose={() => handleClose(c)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          form={form}
          setForm={setForm}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          creating={creating}
        />
      )}

      {detail && (
        <DetailModal
          campaign={detail}
          orgName={org?.name}
          onClose={() => setDetail(null)}
          onReloadCounts={fetchCampaigns}
        />
      )}
    </div>
  )
}

function CampaignCard({ campaign, onOpenDetail, onClose }) {
  const isActive = campaign.status === 'active'
  const expired = campaign.expires_at && new Date(campaign.expires_at) < new Date()
  const stateLabel = !isActive ? 'Cerrada' : expired ? 'Vencida' : 'Activa'
  const stateColor = !isActive || expired ? '#78716c' : '#16a34a'

  return (
    <div style={{
      background: 'white', border: `1px solid ${stateColor}`, borderRadius: '8px',
      padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
            {campaign.name}
          </div>
          {campaign.description && (
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              {campaign.description}
            </div>
          )}
        </div>
        <span style={{
          fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
          padding: '2px 8px', borderRadius: '999px',
          background: stateColor + '22', color: stateColor,
        }}>
          {stateLabel}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#475569' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <MessageSquare size={12} /> {campaign.anonymous_count || 0} respuestas
        </span>
        {campaign.expires_at && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} /> {new Date(campaign.expires_at).toLocaleDateString()}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
        <button onClick={onOpenDetail} style={{ ...btn('#0891b2'), flex: 1, fontSize: '12px', padding: '6px 10px' }}>
          <QrCode size={14} /> Ver QR y link
        </button>
        {isActive && (
          <button onClick={onClose} style={{ ...btn('#dc2626'), fontSize: '12px', padding: '6px 10px' }}>
            <XCircle size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function CreateModal({ form, setForm, onSubmit, onCancel, creating }) {
  const set = (patch) => setForm(prev => ({ ...prev, ...patch }))
  return createPortal(
    <Backdrop onClose={onCancel}>
      <Modal>
        <ModalHeader title="Nueva campaña pública (QR)" onClose={onCancel} />
        <form onSubmit={onSubmit} style={{ padding: '16px' }}>
          <Field label="Nombre de la campaña *">
            <input
              required autoFocus value={form.name}
              onChange={e => set({ name: e.target.value })}
              placeholder="Ej: Clima Laboral Q3 2026"
              style={inp}
            />
          </Field>
          <Field label="Descripción (opcional)">
            <textarea
              rows={2} value={form.description}
              onChange={e => set({ description: e.target.value })}
              placeholder="Contexto breve que se mostrará al respondiente. Ej: encuesta trimestral, evalúa condiciones de trabajo…"
              style={inp}
            />
          </Field>
          <Field label="Fecha de cierre (opcional)">
            <input
              type="date" value={form.expires_at}
              onChange={e => set({ expires_at: e.target.value })}
              style={inp}
              min={new Date().toISOString().slice(0, 10)}
            />
            <small style={{ color: '#64748b', fontSize: '11px' }}>
              Si no ponés fecha, la campaña queda abierta hasta que la cierres manualmente.
            </small>
          </Field>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancel} style={btn('#6b7280')}>Cancelar</button>
            <button type="submit" disabled={creating} style={btn('#16a34a')}>
              {creating ? <><Loader2 size={14} className="spin" /> Creando…</> : <><CheckCircle size={14} /> Crear y generar QR</>}
            </button>
          </div>
        </form>
      </Modal>
    </Backdrop>,
    document.body
  )
}

function DetailModal({ campaign, orgName, onClose, onReloadCounts }) {
  const publicUrl = `${APP_BASE_URL}/e/${campaign.public_slug}`
  const [copied, setCopied] = useState(false)
  const [liveCount, setLiveCount] = useState(campaign.anonymous_count || 0)

  // Refrescar el contador cada 10s mientras el modal está abierto
  useEffect(() => {
    const tick = async () => {
      const { data } = await supabase
        .from('survey_campaigns')
        .select('anonymous_count')
        .eq('id', campaign.id)
        .single()
      if (data) setLiveCount(data.anonymous_count || 0)
    }
    tick()
    const id = setInterval(tick, 10000)
    return () => clearInterval(id)
  }, [campaign.id])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      toast.success('Link copiado')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No se pudo copiar. Copiá manualmente el link.')
    }
  }

  const copyForWhatsApp = async () => {
    const msg = `📊 *${campaign.name}*\n\n${campaign.description || 'Encuesta anónima de clima laboral.'}\n\n🔒 Tu respuesta es 100% anónima. Toma 3 minutos.\n\n👉 ${publicUrl}`
    try {
      await navigator.clipboard.writeText(msg)
      toast.success('Mensaje copiado. Pegalo en el grupo de WhatsApp.')
    } catch {
      toast.error('No se pudo copiar.')
    }
  }

  const downloadPDF = () => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4')  // 210 x 297
      // Fondo
      doc.setFillColor(254, 252, 232)  // amarillo suave
      doc.rect(0, 0, 210, 297, 'F')

      // Header
      doc.setFontSize(11)
      doc.setTextColor(133, 77, 14)
      doc.setFont('helvetica', 'bold')
      doc.text((orgName || 'Empresa').toUpperCase(), 20, 25)

      doc.setFontSize(28)
      doc.setTextColor(30, 41, 59)
      doc.text('Encuesta de Clima Laboral', 20, 45, { maxWidth: 170 })

      doc.setFontSize(16)
      doc.setTextColor(100, 116, 139)
      doc.setFont('helvetica', 'normal')
      doc.text(campaign.name, 20, 60, { maxWidth: 170 })

      // QR — jsPDF necesita un data URL. Renderizamos el SVG a canvas primero.
      const svgEl = document.getElementById(`qr-${campaign.id}`)
      if (svgEl) {
        const svgData = new XMLSerializer().serializeToString(svgEl)
        const canvas = document.createElement('canvas')
        canvas.width = 800
        canvas.height = 800
        const ctx = canvas.getContext('2d')
        const img = new Image()
        img.onload = () => {
          ctx.fillStyle = 'white'
          ctx.fillRect(0, 0, 800, 800)
          ctx.drawImage(img, 0, 0, 800, 800)
          const qrDataUrl = canvas.toDataURL('image/png')
          doc.addImage(qrDataUrl, 'PNG', 55, 80, 100, 100)  // centrado y grande
          finish()
        }
        img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
      } else {
        finish()
      }

      function finish() {
        // Instrucciones abajo del QR
        doc.setFontSize(11)
        doc.setTextColor(71, 85, 105)
        doc.setFont('helvetica', 'bold')
        doc.text('Escaneá el código con tu celular', 105, 195, { align: 'center' })
        doc.setFont('helvetica', 'normal')
        doc.text('o entrá manualmente a:', 105, 202, { align: 'center' })
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.setTextColor(30, 41, 59)
        doc.text(publicUrl.replace(/^https?:\/\//, ''), 105, 212, { align: 'center' })

        // Beneficios
        doc.setFontSize(11)
        doc.setTextColor(22, 163, 74)
        doc.setFont('helvetica', 'bold')
        doc.text('🔒 100% anónima', 105, 235, { align: 'center' })
        doc.setTextColor(71, 85, 105)
        doc.setFont('helvetica', 'normal')
        doc.text('No pedimos tu nombre, teléfono ni email.', 105, 242, { align: 'center' })

        doc.setTextColor(22, 163, 74)
        doc.setFont('helvetica', 'bold')
        doc.text('⏱ Solo 3 minutos', 105, 252, { align: 'center' })

        if (campaign.expires_at) {
          doc.setTextColor(220, 38, 38)
          doc.setFont('helvetica', 'bold')
          doc.text(`📅 Cierra: ${new Date(campaign.expires_at).toLocaleDateString()}`, 105, 262, { align: 'center' })
        }

        // Footer
        doc.setFontSize(8)
        doc.setTextColor(148, 163, 184)
        doc.setFont('helvetica', 'normal')
        doc.text('Generado por IsoSmartCore — Sistema de Gestión ISO 9001', 105, 285, { align: 'center' })

        doc.save(`encuesta_${campaign.public_slug}.pdf`)
        toast.success('PDF descargado. Imprimilo y pegalo en la cartelera.')
      }
    } catch (err) {
      toast.error('Error al generar PDF: ' + err.message)
    }
  }

  const isActive = campaign.status === 'active'

  return createPortal(
    <Backdrop onClose={onClose}>
      <Modal>
        <ModalHeader title={campaign.name} onClose={onClose} />
        <div style={{ padding: '16px' }}>
          {/* Estado y contador en vivo */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 12px', background: '#f0fdf4', borderRadius: '6px',
            marginBottom: '14px', gap: '10px', flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534' }}>
              <Users size={18} />
              <strong style={{ fontSize: '18px' }}>{liveCount}</strong>
              <span style={{ fontSize: '13px' }}>respuestas recibidas</span>
            </div>
            <span style={{ fontSize: '11px', color: '#166534' }}>Actualiza cada 10s</span>
          </div>

          {/* QR */}
          <div style={{ textAlign: 'center', padding: '10px 0 16px' }}>
            <div style={{
              display: 'inline-block', padding: '16px', background: 'white',
              border: '1px solid #e2e8f0', borderRadius: '10px',
            }}>
              <QRCodeSVG
                id={`qr-${campaign.id}`}
                value={publicUrl}
                size={220}
                level="M"
                includeMargin={false}
              />
            </div>
          </div>

          {/* Link */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
              Link público
            </label>
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              <input
                readOnly value={publicUrl}
                style={{ ...inp, fontFamily: 'monospace', fontSize: '12px' }}
                onClick={e => e.target.select()}
              />
              <button onClick={copyLink} style={btn('#0891b2')} title="Copiar">
                {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
              </button>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ ...btn('#7c3aed'), textDecoration: 'none' }} title="Abrir en nueva pestaña">
                <ExternalLink size={14} />
              </a>
            </div>
          </div>

          {/* Acciones */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
            <button onClick={copyForWhatsApp} style={{ ...btn('#25d366'), flex: 1, minWidth: '200px' }}>
              <MessageSquare size={16} /> Copiar mensaje para WhatsApp
            </button>
            <button onClick={downloadPDF} style={{ ...btn('#dc2626'), flex: 1, minWidth: '200px' }}>
              <Download size={16} /> Descargar PDF imprimible
            </button>
          </div>

          {!isActive && (
            <div style={{
              marginTop: '14px', padding: '10px 12px',
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '6px', fontSize: '13px', color: '#991b1b',
            }}>
              Esta campaña está <strong>cerrada</strong>. El link ya no acepta respuestas nuevas.
            </div>
          )}
        </div>
      </Modal>
    </Backdrop>,
    document.body
  )
}

// ─────────── Primitivas UI ───────────
const btn = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px',
  background: color, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer',
  fontWeight: 600, fontSize: '13px',
})
const inp = {
  width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1',
  borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box',
  fontFamily: 'inherit',
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Backdrop({ children, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '540px', maxHeight: '92vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

function Modal({ children }) {
  return (
    <div style={{
      background: 'white', borderRadius: '12px',
      boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

function ModalHeader({ title, onClose }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
    }}>
      <h2 style={{ margin: 0, fontSize: '16px', color: '#1e293b' }}>{title}</h2>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}>
        <X size={20} />
      </button>
    </div>
  )
}
