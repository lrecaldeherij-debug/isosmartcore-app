import React, { useState } from 'react';
import { Info, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';

export default function IsoInfoCard({ clause, title, tips }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card fade-in" style={{ 
      marginBottom: '1.5rem', 
      borderLeft: '4px solid var(--primary-color)',
      backgroundColor: '#f8fafc',
      padding: '1rem'
    }}>
      <div 
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ color: 'var(--primary-color)', background:'#e0e7ff', padding:'8px', borderRadius:'8px' }}>
                <Info size={20} />
            </div>
            <div>
                <h4 style={{ margin: 0, color: '#1e293b', fontSize: '0.95rem' }}>Guía ISO 9001:2015 - Cláusula {clause}</h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>{title}</p>
            </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--primary-color)' }}>
            {expanded ? 'Ocultar Tips' : 'Ver Tips de Ayuda'}
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', animation: 'fadeIn 0.3s ease' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems:'center' }}>
                <Lightbulb size={16} color="#eab308" />
                <strong style={{ fontSize: '0.85rem', color:'#475569' }}>Cómo generar esta información:</strong>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.85rem', color: '#475569', lineHeight: '1.6' }}>
                {tips.map((tip, index) => (
                    <li key={index} style={{ marginBottom: '4px' }}>{tip}</li>
                ))}
            </ul>
        </div>
      )}
    </div>
  );
}
