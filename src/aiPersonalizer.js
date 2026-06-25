// Personalizador IA: toma el ADN de la empresa (company_profile) y le pide al
// proveedor de IA que genere FODA, Política, Stakeholders y Riesgos adaptados
// a ESA empresa específica.
//
// Devuelve un objeto compatible con la RPC seed_org_custom(v21).
// Si la IA falla, el caller puede caer al seed estático (seed_organization).

import { consultarIA } from './aiClient'

// Profile mínimo viable para activar IA. Si no se cumple, mejor no llamar a la IA.
export function hasUsefulProfile(profile) {
  if (!profile) return false
  if (!profile.name || profile.name.trim().length < 2) return false
  if (!profile.industry || profile.industry.trim().length < 2) return false
  return true
}

const SYSTEM_INSTRUCTION = `Eres un consultor experto en ISO 9001:2015 que ayuda a empresas a implementar
su Sistema de Gestión de Calidad. Te van a pasar el perfil de una empresa y tienes que generar
plantillas iniciales ADAPTADAS a esa empresa, no genéricas. Tu objetivo es que el cliente abra
el sistema y sienta que el contenido es para ÉL, no para "cualquier empresa".

Reglas:
- Usa SIEMPRE el nombre real de la empresa, nunca "[Nombre de la Organización]".
- Adapta los riesgos al sector específico (lácteos → cadena de frío; software → seguridad; etc).
- Adapta los stakeholders a regulators reales del sector cuando los conozcas (SENASA, ANMAT, etc).
- El FODA debe reflejar tamaño, sector y dirección estratégica de la empresa.
- La política de calidad debe leer natural, como si la hubiera escrito un humano que conoce la empresa.
- Responde SOLO con JSON válido, sin texto adicional, sin markdown.`

function buildPrompt(profile) {
  return `Perfil de la empresa:
- Nombre: ${profile.name}
- Sector / industria: ${profile.industry}
- Descripción: ${profile.description || '(no provista)'}
- Tamaño (empleados): ${profile.employees_count || '(no provisto)'}
- Productos / servicios principales: ${profile.main_products || '(no provisto)'}
- Dirección estratégica: ${profile.strategic_direction || '(no provista)'}
- Año de fundación: ${profile.founded_year || '(no provisto)'}

Genera las siguientes secciones, adaptadas a ESTA empresa, en JSON estricto:

{
  "context": [
    // 8 items: 4 internos (2 Fortalezas + 2 Debilidades) y 4 externos (2 Oportunidades + 2 Amenazas).
    // Cada item: { "type": "Interno"|"Externo", "category": "Fortaleza"|"Debilidad"|"Oportunidad"|"Amenaza",
    //              "factor": "título corto", "description": "1-2 frases", "strategy": "qué hacer" }
  ],
  "stakeholders": [
    // 6 partes interesadas relevantes para esta empresa. Incluye organismos reguladores ESPECÍFICOS del sector.
    // Cada item: { "name", "expectations", "influence_level": "Alto"|"Medio"|"Bajo",
    //              "is_sgc_requirement": true|false, "follow_up_frequency": "Mensual"|"Trimestral"|"Semestral"|"Anual"|"Continua",
    //              "planning_in_sgc", "evaluation_method", "responsible", "status": "Pendiente" }
  ],
  "policy": {
    // Política de calidad redactada con el NOMBRE REAL de la empresa.
    "what_we_do": "actividad principal en una frase",
    "who_is_customer": "tipo de cliente",
    "value_proposition": "qué diferencia ofrece",
    "commitments": "compromisos de calidad concretos para este sector",
    "final_policy_statement": "declaración formal completa, 2-3 oraciones, con el nombre real de la empresa"
  },
  "risks": [
    // 5 riesgos ESPECÍFICOS del sector y tamaño de la empresa. NO genéricos.
    // Cada item: { "process_area", "risk_description", "probability_initial": 1-10, "impact_initial": 1-10,
    //              "control_measure", "responsible", "status": "En proceso" }
  ]
}

Recuerda: SOLO el JSON, sin markdown, sin explicaciones.`
}

// Limpia y parsea respuesta JSON de la IA (que a veces incluye ```json fences).
function tryParseJSON(text) {
  let clean = (text || '').replace(/```json/gi, '').replace(/```/g, '').trim()
  const firstBrace = clean.indexOf('{')
  const lastBrace = clean.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace < 0) throw new Error('Respuesta de IA sin JSON')
  clean = clean.substring(firstBrace, lastBrace + 1)
  try {
    return JSON.parse(clean)
  } catch (err) {
    throw new Error('JSON inválido en la respuesta de la IA: ' + (err?.message || 'parse error'))
  }
}

// Validación liviana: chequea estructura mínima.
function isValidCustomData(data) {
  if (!data || typeof data !== 'object') return false
  const checks = [
    Array.isArray(data.context) && data.context.length > 0,
    Array.isArray(data.stakeholders) && data.stakeholders.length > 0,
    data.policy && typeof data.policy === 'object',
    Array.isArray(data.risks) && data.risks.length > 0,
  ]
  // Aceptamos si AL MENOS 3 de las 4 secciones están bien
  return checks.filter(Boolean).length >= 3
}

/**
 * Llama a la IA con el perfil y devuelve la data personalizada.
 * @param {Object} profile - registro de company_profile
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
 */
export async function personalizeFromProfile(profile) {
  if (!hasUsefulProfile(profile)) {
    return { ok: false, error: 'Perfil de empresa insuficiente para personalizar' }
  }

  const prompt = buildPrompt(profile)
  const raw = await consultarIA(prompt, SYSTEM_INSTRUCTION)

  // El cliente devuelve { error: ... } como JSON-string en caso de fallo de red
  if (raw.startsWith('{"error"') || raw.includes('❌')) {
    return { ok: false, error: raw }
  }

  let parsed
  try {
    parsed = tryParseJSON(raw)
  } catch (e) {
    console.error('No pude parsear JSON de la IA:', raw)
    return { ok: false, error: 'La IA no devolvió JSON válido' }
  }

  if (!isValidCustomData(parsed)) {
    return { ok: false, error: 'La IA devolvió data incompleta' }
  }

  return { ok: true, data: parsed }
}
