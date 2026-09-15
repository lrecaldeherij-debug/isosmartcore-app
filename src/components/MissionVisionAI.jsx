import { useState, useEffect } from 'react'
import { Sparkles, Check, RefreshCw } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { consultarIA, parseAiJson, clampString } from '../aiClient'
import { toast } from '../lib/toast'
import { Modal, Button, Field, Input, Textarea, colors, font, radius } from './ui'

const MAX_MISSION = 400
const MAX_VISION = 350
const MAX_NOTE = 260

const SYSTEM = `Eres un consultor experto en planificación estratégica y en ISO 9001:2015
(cláusulas 4.1 contexto y 5.2 política). Redactas misión y visión para empresas reales.

Criterios de una buena MISIÓN (presente, razón de ser):
- Qué hace la empresa, para quién, cómo o con qué diferencial, y qué valor entrega.
- 1 o 2 oraciones, máximo 320 caracteres, primera persona plural ("Brindamos...", "Somos...").

Criterios de una buena VISIÓN (futuro, a dónde quiere llegar):
- Un horizonte temporal explícito (un año concreto) y una aspiración concreta de mercado o posicionamiento.
- Ambiciosa pero creíble para el tamaño y el sector de la empresa.
- 1 o 2 oraciones, máximo 280 caracteres.

Reglas:
- NUNCA inventes datos que no estén en el perfil: certificaciones, cifras, países, años de experiencia, premios.
- Si ya hay un borrador, conserva su intención y sus términos clave; mejóralo, no lo reemplaces por otra idea.
- Evita frases vacías ("líderes de clase mundial", "excelencia", "sinergia") salvo que el perfil las respalde.
- La orientación al cliente y a la calidad debe notarse de forma natural, sin llenar de jerga ISO.
- Español neutro. Responde SOLO con JSON válido, sin markdown.`

function buildPrompt(profile, current, emphasis, foda) {
  const year = new Date().getFullYear()
  return `Perfil de la empresa:
- Nombre: ${profile.name}
- Sector: ${profile.industry}
- Descripción: ${profile.description || '(no provista)'}
- Productos / servicios: ${profile.main_products || '(no provistos)'}
- Tamaño (empleados): ${profile.employees_count || '(no provisto)'}
- Año de fundación: ${profile.founded_year || '(no provisto)'}
${foda.length ? `- Factores del análisis de contexto (FODA): ${foda.join('; ')}` : ''}

Misión actual: ${current.mission?.trim() || '(vacía: redáctala desde cero)'}
Visión actual: ${current.vision?.trim() || '(vacía: redáctala desde cero)'}
${emphasis?.trim() ? `Lo que la dirección quiere destacar: ${emphasis.trim()}` : ''}

Para la visión usa un horizonte entre ${year + 3} y ${year + 5}.

Devuelve este JSON:
{
  "mission": "misión propuesta",
  "mission_notes": "qué le faltaba a la actual y qué mejoraste (o por qué la redactaste así si estaba vacía), máx 220 caracteres",
  "vision": "visión propuesta",
  "vision_notes": "igual que mission_notes, para la visión"
}`
}

export default function MissionVisionAI({ open, onClose, profile, current, orgId, onApply }) {
  const [emphasis, setEmphasis] = useState('')
  const [loading, setLoading] = useState(false)
  const [proposal, setProposal] = useState(null)
  const [applied, setApplied] = useState({ mission: false, vision: false })

  useEffect(() => {
    if (open) { setProposal(null); setApplied({ mission: false, vision: false }) }
  }, [open])

  const generate = async () => {
    setLoading(true)
    try {
      // Contexto opcional: si el FODA ya está cargado, la visión puede apoyarse
      // en fortalezas y oportunidades reales. Si falla, se sigue sin él.
      let foda = []
      if (orgId) {
        const { data } = await supabase
          .from('context_analysis')
          .select('category, factor')
          .eq('org_id', orgId)
          .in('category', ['Fortaleza', 'Oportunidad'])
          .limit(10)
        foda = (data || []).map(f => `${f.category}: ${f.factor}`)
      }

      const raw = await consultarIA(buildPrompt(profile, current, emphasis, foda), SYSTEM)
      const data = parseAiJson(raw)
      const mission = clampString(data?.mission, MAX_MISSION)
      const vision = clampString(data?.vision, MAX_VISION)
      if (!mission || !vision) throw new Error('La IA no devolvió una propuesta válida. Probá de nuevo.')

      setProposal({
        mission,
        vision,
        mission_notes: clampString(data.mission_notes, MAX_NOTE),
        vision_notes: clampString(data.vision_notes, MAX_NOTE),
      })
      setApplied({ mission: false, vision: false })
    } catch (e) {
      toast.error(e.message || 'No se pudo generar la propuesta')
    } finally {
      setLoading(false)
    }
  }

  const apply = (key) => {
    onApply({ [key]: proposal[key] })
    setApplied(a => ({ ...a, [key]: true }))
  }

  const applyBoth = () => {
    onApply({ mission: proposal.mission, vision: proposal.vision })
    toast.success('Misión y visión aplicadas. Recordá guardar el perfil.')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Mejorar misión y visión con IA" maxWidth="900px">
      <Modal.Section title="Orientación (opcional)">
        <Field
          label="¿Qué querés que destaque?"
          hint="Ej: cobertura nacional, seguridad en campo, respuesta en 24 h, trabajo con industria petrolera."
        >
          <Input
            value={emphasis}
            maxLength={200}
            onChange={e => setEmphasis(e.target.value)}
            placeholder="Dejalo vacío si no hay nada en particular"
          />
        </Field>
        <p style={{ fontSize: font.xs, color: colors.textMuted, margin: '4px 0 10px' }}>
          La IA usa el ADN de la empresa{current.mission || current.vision ? ', tu texto actual' : ''} y, si existe, tu análisis FODA.
          No inventa certificaciones ni cifras: revisá la propuesta antes de aplicarla.
        </p>
        <Button
          variant="ai"
          loading={loading}
          icon={proposal ? <RefreshCw size={16} /> : <Sparkles size={16} />}
          onClick={generate}
        >
          {proposal ? 'Generar otra versión' : 'Generar propuesta'}
        </Button>
      </Modal.Section>

      {proposal && (
        <Modal.Section title="Propuesta">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            {[
              { key: 'mission', label: 'Misión', notes: proposal.mission_notes, max: MAX_MISSION },
              { key: 'vision', label: 'Visión', notes: proposal.vision_notes, max: MAX_VISION },
            ].map(({ key, label, notes, max }) => (
              <div key={key} style={{
                flex: '1 1 320px', minWidth: 0,
                border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: '12px',
              }}>
                <div style={{ fontWeight: 700, color: colors.text, marginBottom: '8px' }}>{label}</div>

                <div style={{ fontSize: font.xs, fontWeight: 600, color: colors.textMuted }}>Actual</div>
                <p style={{
                  fontSize: font.sm, color: colors.textMuted, margin: '2px 0 10px',
                  whiteSpace: 'pre-wrap', fontStyle: current[key]?.trim() ? 'normal' : 'italic',
                }}>
                  {current[key]?.trim() || 'Sin redactar'}
                </p>

                <Field label="Propuesta (podés editarla)">
                  <Textarea
                    rows={5}
                    maxLength={max}
                    value={proposal[key]}
                    onChange={e => {
                      const value = e.target.value
                      setProposal(p => ({ ...p, [key]: value }))
                      setApplied(a => ({ ...a, [key]: false }))
                    }}
                  />
                </Field>

                {notes && (
                  <p style={{ fontSize: font.xs, color: colors.textMuted, margin: '0 0 10px' }}>
                    <strong>Qué cambió:</strong> {notes}
                  </p>
                )}

                <Button
                  size="sm"
                  variant={applied[key] ? 'success' : 'secondary'}
                  icon={<Check size={14} />}
                  disabled={!proposal[key]?.trim()}
                  onClick={() => apply(key)}
                >
                  {applied[key] ? 'Aplicada' : `Usar esta ${label.toLowerCase()}`}
                </Button>
              </div>
            ))}
          </div>
        </Modal.Section>
      )}

      <Modal.Footer>
        <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        {proposal && (
          <Button
            variant="primary"
            icon={<Check size={16} />}
            disabled={!proposal.mission?.trim() || !proposal.vision?.trim()}
            onClick={applyBoth}
          >
            Usar ambas
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}
