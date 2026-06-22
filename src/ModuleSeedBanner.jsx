// Banner reutilizable para sembrar plantillas en un módulo específico.
//
// Aparece cuando: el usuario es owner Y el módulo está vacío (visible=true).
// Llama a la RPC seed_module(org_id, module_key) — definida en v20.
//
// Uso típico al final del header de cada componente módulo:
//   <ModuleSeedBanner
//     moduleKey="risks"
//     label="matriz de riesgos"
//     visible={!loading && items.length === 0}
//     onSeeded={fetchItems}
//   />

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

export default function ModuleSeedBanner({ moduleKey, label, visible, onSeeded }) {
  const { org, can } = useOrg()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  if (!visible || !can.admin || !org) return null

  const handleSeed = async () => {
    if (!await confirm(`Esto cargará una plantilla pre-redactada de ${label}. Podés editarla o eliminarla después. ¿Continuar?`)) return
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.rpc('seed_module', {
      target_org_id: org.id,
      module_key: moduleKey,
    })
    setLoading(false)
    if (err) setError(err.message)
    else if (onSeeded) onSeeded()
  }

  return (
    <div className="card fade-in" style={{
      padding: '1.25rem',
      marginBottom: '1.5rem',
      borderLeft: '4px solid var(--primary-color)',
      backgroundColor: '#f8fafc',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Sparkles size={20} style={{ color: 'var(--primary-color)' }} />
        <div>
          <strong>Empezar con plantilla</strong>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Este módulo está vacío. Cargá una plantilla ISO 9001 ya redactada y editala a tu realidad.
          </p>
          {error && (
            <p style={{ margin: '0.5rem 0 0 0', color: 'var(--danger-text)', fontSize: '0.85rem' }}>
              Error: {error}
            </p>
          )}
        </div>
      </div>
      <button className="btn btn-primary" onClick={handleSeed} disabled={loading} style={{ flexShrink: 0 }}>
        {loading ? <><Loader2 className="animate-spin" size={16} /> Cargando...</> : 'Cargar plantilla'}
      </button>
    </div>
  )
}
