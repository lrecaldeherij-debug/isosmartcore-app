// Especificación de columnas para cada importador Excel.
//
// Cada entrada define:
//   - tableName: tabla destino en Supabase
//   - label: nombre amigable del módulo
//   - columns: array con { key, label, required, type, example, validator? }
//       key       -> nombre de columna en la DB
//       label     -> encabezado que ve el usuario en el Excel
//       required  -> bloquea la fila si falta
//       type      -> 'text' | 'number' | 'date' | 'enum'
//       example   -> valor de muestra que aparece en la plantilla descargable
//       validator -> función opcional (value) => string|null (error message)
//       enumValues -> para type='enum', lista de valores válidos

export const EXCEL_TEMPLATES = {
  personnel: {
    tableName: 'personnel',
    label: 'Personal / Empleados',
    description: 'Empleados activos de la organización (ISO 7.1.2 / 7.2).',
    columns: [
      { key: 'full_name',             label: 'Nombre completo',   required: true,  type: 'text',  example: 'María García' },
      { key: 'document_id',           label: 'Documento (CI/DNI)',required: false, type: 'text',  example: '1.234.567-8' },
      { key: 'start_date',            label: 'Fecha ingreso (YYYY-MM-DD)', required: false, type: 'date', example: '2022-03-15' },
      { key: 'email',                 label: 'Email',             required: false, type: 'text',  example: 'maria@empresa.com' },
      { key: 'phone',                 label: 'Teléfono',          required: false, type: 'text',  example: '+598 99 123 456' },
      { key: 'job_title',             label: 'Cargo',             required: true,  type: 'text',  example: 'Responsable de Calidad' },
      { key: 'education',             label: 'Formación (Título)',required: false, type: 'text',  example: 'Ing. Industrial' },
      { key: 'education_institution', label: 'Institución',       required: false, type: 'text',  example: 'Universidad de la República' },
      { key: 'education_year',        label: 'Año título',        required: false, type: 'number', example: 2018 },
      { key: 'experience',            label: 'Experiencia',       required: false, type: 'text',  example: '5 años en SGC' },
      { key: 'skills',                label: 'Competencias',      required: false, type: 'text',  example: 'Auditoría interna, gestión documental' },
      { key: 'evidence_url',          label: 'Link evidencia',    required: false, type: 'text',  example: 'https://drive.google.com/...' },
      { key: 'status',                label: 'Estado',            required: false, type: 'enum',  example: 'Competente', enumValues: ['Competente', 'En Formación', 'Brecha Detectada', 'Pendiente evaluación'] },
    ],
  },

  training_records: {
    tableName: 'training_records',
    label: 'Capacitaciones',
    description: 'Sesiones de formación realizadas (ISO 7.2).',
    columns: [
      { key: 'training_name',  label: 'Tema',              required: true,  type: 'text',   example: 'Auditoría interna ISO 9001' },
      { key: 'training_date',  label: 'Fecha (YYYY-MM-DD)',required: true,  type: 'date',   example: '2026-03-15' },
      { key: 'duration_hours', label: 'Duración (hs)',     required: false, type: 'number', example: 8 },
      { key: 'trainer',        label: 'Instructor',        required: false, type: 'text',   example: 'Bureau Veritas' },
      { key: 'participants',   label: 'Asistentes',        required: false, type: 'text',   example: 'María García, Juan Pérez' },
    ],
  },

  equipment_calibration: {
    tableName: 'equipment_calibration',
    label: 'Calibración de Equipos',
    description: 'Instrumentos de medición y su estado de calibración (ISO 7.1.5).',
    columns: [
      { key: 'equipment_name',     label: 'Equipo',                  required: true,  type: 'text', example: 'Termómetro digital A1' },
      { key: 'serial_number',      label: 'Nº de serie',             required: false, type: 'text', example: 'TD-001-2023' },
      { key: 'last_calibration',   label: 'Última calibración',      required: false, type: 'date', example: '2026-01-10' },
      { key: 'next_calibration',   label: 'Próxima calibración',     required: false, type: 'date', example: '2027-01-10' },
      { key: 'calibration_status', label: 'Estado',                  required: false, type: 'enum', example: 'Vigente', enumValues: ['Vigente', 'Vencida', 'En proceso'] },
    ],
  },

  suppliers: {
    tableName: 'suppliers',
    label: 'Proveedores',
    description: 'Proveedores calificados de la organización (ISO 8.4).',
    columns: [
      { key: 'supplier_name',     label: 'Razón social',       required: true,  type: 'text',   example: 'Insumos Industriales S.A.' },
      { key: 'service_provided',  label: 'Bien / Servicio',    required: true,  type: 'text',   example: 'Materia prima química' },
      { key: 'evaluation_score',  label: 'Calificación (0-100)', required: false, type: 'number', example: 85 },
      { key: 'evaluation_date',   label: 'Última evaluación',  required: false, type: 'date',   example: '2026-04-01' },
      { key: 'status',            label: 'Estado',             required: false, type: 'enum',   example: 'Aprobado', enumValues: ['Aprobado', 'En evaluación', 'Suspendido'] },
    ],
  },
}

// Validación de una fila contra el spec.
// Retorna { errors: string[], cleaned: object }
export function validateRow(row, spec) {
  const errors = []
  const cleaned = {}

  for (const col of spec.columns) {
    const raw = row[col.label]
    const isEmpty = raw === undefined || raw === null || raw === ''

    if (col.required && isEmpty) {
      errors.push(`Falta "${col.label}"`)
      continue
    }
    if (isEmpty) continue

    if (col.type === 'number') {
      const n = Number(raw)
      if (Number.isNaN(n)) errors.push(`"${col.label}" debe ser número (recibido: ${raw})`)
      else cleaned[col.key] = n
    } else if (col.type === 'date') {
      // Acepta string YYYY-MM-DD o Date object de SheetJS
      let dateStr
      if (raw instanceof Date) {
        dateStr = raw.toISOString().substring(0, 10)
      } else {
        dateStr = String(raw).trim()
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          errors.push(`"${col.label}" debe ser fecha YYYY-MM-DD (recibido: ${raw})`)
          continue
        }
      }
      cleaned[col.key] = dateStr
    } else if (col.type === 'enum') {
      const v = String(raw).trim()
      if (!col.enumValues.includes(v)) {
        errors.push(`"${col.label}" debe ser uno de: ${col.enumValues.join(', ')} (recibido: ${v})`)
      } else {
        cleaned[col.key] = v
      }
    } else {
      cleaned[col.key] = String(raw).trim()
    }
  }

  return { errors, cleaned }
}
