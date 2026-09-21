import React, { useState } from 'react';
import { Info, Lightbulb, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { useOrgOptional } from './OrgContext';

// `iso17020` llega desde CLAUSE_GUIDES y solo se muestra si la organización
// activó el módulo de organismo de inspección: al resto no le sirve de nada.
export default function IsoInfoCard({ clause, title, tips, iso17020 }) {
  const [expanded, setExpanded] = useState(false);
  const org = useOrgOptional()?.org;
  const show17020 = !!org?.inspection_module_enabled && !!iso17020;

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
                <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  {title}
                  {show17020 && <> · <strong>también aplica ISO/IEC 17020 {iso17020.clause}</strong></>}
                </p>
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

            {show17020 && (
              <div style={{ marginTop: '1rem', paddingTop: '0.9rem', borderTop: '1px dashed #cbd5e1' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                    <ShieldAlert size={16} color="#8B2438" />
                    <strong style={{ fontSize: '0.85rem', color: '#475569' }}>
                      Como organismo de inspección (ISO/IEC 17020 {iso17020.clause}):
                    </strong>
                </div>
                <p style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: '#475569', lineHeight: '1.6' }}>
                  {iso17020.note}
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.85rem', color: '#475569', lineHeight: '1.6' }}>
                    {iso17020.tips.map((tip, index) => (
                        <li key={index} style={{ marginBottom: '4px' }}>{tip}</li>
                    ))}
                </ul>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
