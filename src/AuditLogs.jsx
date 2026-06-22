import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function AuditLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) console.log('Error fetching logs:', error)
    else setLogs(data)
    setLoading(false)
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ color: '#333' }}>🛡️ Registro de Auditoría (Audit Logs)</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>Historial inmutable de cambios en el sistema.</p>

      {loading ? (
        <p>Cargando registros...</p>
      ) : (
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
              <tr>
                <th style={{ padding: '12px', textAlign: 'left', color: '#495057' }}>Fecha</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#495057' }}>Usuario (ID)</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#495057' }}>Acción</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#495057' }}>Tabla</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#495057' }}>Detalles</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                  <td style={{ padding: '12px', fontFamily: 'monospace' }}>{log.user_id ? log.user_id.split('-')[0] + '...' : 'Sistema'}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ 
                      backgroundColor: log.action === 'INSERT' ? '#d4edda' : log.action === 'UPDATE' ? '#fff3cd' : '#f8d7da',
                      color: log.action === 'INSERT' ? '#155724' : log.action === 'UPDATE' ? '#856404' : '#721c24',
                      padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px'
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>{log.table_name}</td>
                  <td style={{ padding: '12px' }}>
                    <details>
                      <summary style={{ cursor: 'pointer', color: '#007bff' }}>Ver Cambios</summary>
                      <div style={{ marginTop: '10px', fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '5px' }}>
                        {log.old_data && (
                          <div style={{ marginBottom: '10px' }}>
                            <strong>Anterior:</strong>
                            <pre style={{ margin: '5px 0', overflowX: 'auto' }}>{JSON.stringify(log.old_data, null, 2)}</pre>
                          </div>
                        )}
                        {log.new_data && (
                          <div>
                            <strong>Nuevo:</strong>
                            <pre style={{ margin: '5px 0', overflowX: 'auto' }}>{JSON.stringify(log.new_data, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No hay registros de auditoría disponibles.</div>
          )}
        </div>
      )}
    </div>
  )
}
