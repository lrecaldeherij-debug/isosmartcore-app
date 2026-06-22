import { useState } from 'react'
import { supabase } from './supabaseClient'
import { toast } from './lib/toast'

export default function RiskForm({ alGuardar, alCancelar }) {
  const [form, setForm] = useState({
    risk_description: '',
    probability_initial: 3, // Escala 1-5 default
    impact_initial: 3      // Escala 1-5 default
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    // score_initial es columna generada en la DB (probability_initial * impact_initial)
    // → no se envía; Postgres la calcula sola.
    const { error } = await supabase.from('risk_matrix').insert([form])

    setLoading(false)
    if (error) {
      toast.error('Error al registrar el riesgo: ' + error.message)
    } else {
      alGuardar() // Llama a la función que recarga la lista en el padre
    }
  }

  return (
    <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
      <h3>Registrar Nuevo Riesgo / Oportunidad</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{display:'block', marginBottom:'5px', fontWeight:'bold'}}>Descripción:</label>
          <textarea 
            required
            style={{ width: '100%', padding: '8px', border:'1px solid #ccc', borderRadius:'4px', height: '60px' }} 
            value={form.risk_description} 
            onChange={e => setForm({...form, risk_description: e.target.value})} 
            placeholder="Ej: Falla del servidor principal por falta de mantenimiento."
          />
        </div>

        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold'}}>Probabilidad (1-5):</label>
            <input 
              type="number" 
              required 
              min="1" 
              max="5" 
              style={{ width: '100%', padding: '8px', border:'1px solid #ccc', borderRadius:'4px' }} 
              value={form.probability_initial} 
              onChange={e => setForm({...form, probability_initial: parseInt(e.target.value)})} 
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{display:'block', marginBottom:'5px', fontWeight:'bold'}}>Impacto (1-5):</label>
            <input 
              type="number" 
              required 
              min="1" 
              max="5" 
              style={{ width: '100%', padding: '8px', border:'1px solid #ccc', borderRadius:'4px' }} 
              value={form.impact_initial} 
              onChange={e => setForm({...form, impact_initial: parseInt(e.target.value)})} 
            />
          </div>
          <div style={{ flex: 1, paddingTop: '28px' }}>
            <p style={{ margin: 0, fontWeight: 'bold' }}>Nivel de Riesgo: {form.probability_initial * form.impact_initial}</p>
          </div>
        </div>

        <button type="submit" disabled={loading} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', marginRight: '10px' }}>
          {loading ? 'Guardando...' : 'Guardar Riesgo'}
        </button>
        <button type="button" onClick={alCancelar} style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
          Cancelar
        </button>
      </form>
    </div>
  )
}