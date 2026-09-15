// Línea de contexto de empresa para prompts de IA, desde company_profile.
//
// Columnas reales: name, industry, description, employees_count, main_products,
// strategic_direction, founded_year, website_url. Varios módulos usaban
// company_name / size / purpose / sector, que no existen, así que la IA
// recibía "N/D" y generaba contenido genérico.
export function companyContextLine(profile, { fallback = 'Sin perfil de empresa cargado.' } = {}) {
  if (!profile) return fallback
  const parts = [
    ['Empresa', profile.name],
    ['Sector', profile.industry],
    ['Empleados', profile.employees_count],
    ['Productos/servicios', profile.main_products],
    ['Descripción', profile.description],
    ['Dirección estratégica', profile.strategic_direction],
  ].filter(([, v]) => typeof v === 'string' ? v.trim() : v)
  if (!parts.length) return fallback
  return parts.map(([k, v]) => `${k}: ${String(v).trim()}`).join(' | ')
}
