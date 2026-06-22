// =============================================================================
// Design tokens — dirección "Expediente certificado"
//
// Filosofía: la app es papelería oficial. Papel cremoso, tinta sepia, sello
// burgundy de aprobación. Tipografía editorial deliberada. Hairlines en vez
// de bordes pesados. Sombras como pliegues de papel, no cards flotantes.
//
// Backward compat: las keys públicas siguen existiendo, solo cambia el hex.
// =============================================================================

// ─── Paleta base "Expediente" ───
// Crema cálida en vez de blanco; sepia en vez de gris frío; burgundy de sello.
const RAW = {
  // Papel
  paper:        '#F5F1E8',   // fondo principal — papel cremoso
  paperWarm:    '#EFEAD9',   // hover sutil sobre papel
  paperCool:    '#FAF7EE',   // background de cards (un punto más claro)
  paperEdge:    '#E3DCC8',   // borde de papel, sutil

  // Tinta (todos los textos)
  ink:          '#2E1F1A',   // tinta principal — sepia oscuro
  inkMid:       '#5A4A3F',   // tinta semi-clara
  inkSoft:      '#8A7A6B',   // tinta para labels secundarios
  inkGhost:     '#B5A89A',   // tinta muy clara — placeholders

  // Sello principal (acento)
  seal:         '#8B2438',   // burgundy de sello — acento principal
  sealLight:    '#F2DDDF',   // tinte claro para badges/highlights
  sealDark:     '#6B1B2C',   // hover de sello
  sealText:     '#561622',   // texto sobre sealLight

  // Verde aprobación — semántico de éxito
  approve:      '#4A6B3A',   // verde de "estampado aprobado"
  approveLight: '#DEEAD3',
  approveText:  '#2F4824',

  // Dorado — premium / detalles importantes
  gold:         '#B8884A',
  goldLight:    '#F0E5CE',
  goldText:     '#7A5A2C',

  // Tinta roja para errores (distinta de seal para no confundir acento de error)
  alert:        '#A53B2B',
  alertLight:   '#F6DCD6',
  alertText:    '#722619',

  // Línea hairline (todos los bordes, dividers, rules)
  hairline:     '#D8CFB8',   // hairline editorial
  hairlineStrong: '#B5A789', // separadores fuertes (entre secciones grandes)
}

// ─── Exports backward-compatible ───
// Las keys legacy mapean a los colores nuevos.
export const colors = {
  // Marca (las apps existentes llaman a primary)
  primary:      RAW.seal,
  primaryDark:  RAW.sealDark,
  primaryLight: RAW.sealLight,

  // Acentos por dominio ISO
  ai:           RAW.gold,        // IA ahora es dorado (premium feel)
  aiLight:      RAW.goldLight,
  risk:         RAW.alert,
  opportunity:  RAW.approve,

  // Semánticos
  success:      RAW.approve,
  successLight: RAW.approveLight,
  successText:  RAW.approveText,
  warning:      RAW.gold,
  warningLight: RAW.goldLight,
  warningText:  RAW.goldText,
  danger:       RAW.alert,
  dangerLight:  RAW.alertLight,
  dangerText:   RAW.alertText,
  info:         RAW.inkMid,       // info ya no es cyan, es tinta sobria
  infoLight:    RAW.paperWarm,
  infoText:     RAW.ink,

  // Tinta / textos
  text:         RAW.ink,
  textMuted:    RAW.inkMid,
  textFaint:    RAW.inkSoft,
  textGhost:    RAW.inkGhost,

  // Bordes (todos hairlines)
  border:       RAW.hairline,
  borderStrong: RAW.hairlineStrong,

  // Backgrounds
  bg:           RAW.paperCool,    // bg de cards
  bgMuted:      RAW.paperWarm,
  bgSubtle:     RAW.paperEdge,

  // Aliases nuevos del sistema "Expediente"
  ...RAW,
}

// ─── Tipografía: 3 familias deliberadas ───
//
// display: Fraunces — serif moderna con axis "soft", para hero/headings.
//          Sentís el peso editorial sin ser anticuado.
// body:    Inter — neutral, legible en tablas/forms (no compite con display)
// mono:    IBM Plex Mono — para códigos de documento (MAN-01 / R02 / 2026),
//          números tabulares, refs técnicas. Da aire de papelería oficial.
export const families = {
  display: '"Fraunces", "GT Sectra", Georgia, serif',
  body:    '"Inter", system-ui, -apple-system, sans-serif',
  mono:    '"IBM Plex Mono", "Söhne Mono", ui-monospace, Menlo, monospace',
}

// Escala tipográfica con personalidad editorial.
// El display arranca mucho más grande (hero literal) — el contraste con body
// es lo que da la sensación de "documento serio".
export const font = {
  // Body / UI
  xs:   '11px',
  sm:   '12px',
  md:   '13px',
  base: '14px',
  lg:   '15px',
  xl:   '17px',
  '2xl': '20px',

  // Display (siempre usar con families.display)
  '3xl':  '28px',
  '4xl':  '36px',
  '5xl':  '52px',   // hero subtitle
  '6xl':  '76px',   // hero headline
}

// Tracking (letter-spacing) — editorial usa tracking negativo en displays grandes
export const tracking = {
  tight:   '-0.04em',   // displays >=4xl
  snug:    '-0.02em',   // displays sm
  normal:  '0',
  wide:    '0.04em',    // eyebrow labels en mayúsculas
  wider:   '0.12em',    // microcaps tipo "SECCIÓN 01"
}

// Pesos — usamos pocos pero deliberados
export const weight = {
  regular: 400,
  medium:  500,
  semibold: 600,
  bold:    700,
  black:   900,         // solo display
}

// ─── Espaciado ───
export const space = {
  xs:   '4px',
  sm:   '6px',
  md:   '8px',
  lg:   '12px',
  xl:   '16px',
  '2xl': '20px',
  '3xl': '24px',
  '4xl': '36px',
  '5xl': '56px',
  '6xl': '80px',
}

// ─── Bordes radius ───
// "Expediente" usa esquinas muy mínimas. Documentos no son redondeados.
export const radius = {
  none: '0',
  sm:   '2px',
  md:   '4px',
  lg:   '6px',
  xl:   '8px',
  '2xl': '10px',
  pill: '999px',
}

// ─── Sombras: papel, no cards flotantes ───
// Pliegues sutiles + algo de calidez (sepia tint en el shadow).
export const shadow = {
  sm: '0 1px 0 rgba(46,31,26,0.04), 0 1px 2px rgba(46,31,26,0.05)',
  md: '0 1px 0 rgba(46,31,26,0.05), 0 2px 8px rgba(46,31,26,0.06)',
  lg: '0 4px 12px rgba(46,31,26,0.08), 0 0 0 1px rgba(216,207,184,0.5)',
  xl: '0 24px 60px rgba(46,31,26,0.18)',

  // Signature: "stamp" — usado en sellos de aprobación (rotación + sombra)
  stamp: '0 0 0 2px rgba(139,36,56,0.9), inset 0 0 0 1px rgba(255,255,255,0.3)',
}

// ─── Signature: elementos visuales únicos del sistema "Expediente" ───
// Estos no son tokens crudos — son patrones que componentes pueden usar para
// mantener la personalidad coherente.
export const signature = {
  // Eyebrow label — sobre cada sección importante
  eyebrow: {
    fontFamily: families.mono,
    fontSize: '11px',
    letterSpacing: tracking.wider,
    textTransform: 'uppercase',
    color: RAW.inkSoft,
    fontWeight: weight.medium,
  },
  // Document number — para refs tipo "EXP-2026-001"
  docNumber: {
    fontFamily: families.mono,
    fontSize: '11px',
    letterSpacing: tracking.wide,
    color: RAW.inkMid,
  },
  // Hairline rule — divider editorial
  hairlineRule: {
    height: '1px',
    background: RAW.hairline,
    border: 'none',
  },
}

// Backward-compat: variantes de color por nombre semántico
export const variantColors = {
  primary:   colors.primary,
  secondary: colors.textMuted,
  success:   colors.success,
  danger:    colors.danger,
  warning:   colors.warning,
  info:      colors.info,
  ai:        colors.ai,
  ghost:     'transparent',
  neutral:   colors.bgSubtle,
}
