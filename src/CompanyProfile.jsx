import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import { Building2, Save, Sparkles, Loader2, MapPin, Users, Target, Rocket } from 'lucide-react'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import { useOrg } from './OrgContext'
import { humanizeDbError } from './lib/humanizeDbError'

export default function CompanyProfile() {
  const { org } = useOrg()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingIA, setLoadingIA] = useState(false)
  
  const [profile, setProfile] = useState({
    name: '',
    industry: '',
    description: '',
    employees_count: '1-10',
    strategic_direction: '',
    main_products: '',
    founded_year: '',
    logo_url: '',
    website_url: '',
    id: null
  })

  useEffect(() => {
    if (org?.id) fetchProfile()
  }, [org?.id])

  const fetchProfile = async () => {
    setLoading(true)
    // Filtro EXPLÍCITO por org_id. Antes confiaba en que RLS filtraba solo
    // la org del user, pero cuando el super_admin visita otra org (impersonar)
    // o la policy cross-org está activa, .single() puede traer una fila de
    // otra org o dar error. Con el .eq('org_id') es determinístico.
    const { data, error } = await supabase
      .from('company_profile')
      .select('*')
      .eq('org_id', org.id)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching profile:', error)
    } else if (data) {
      setProfile(data)
    }
    setLoading(false)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!org?.id) {
      toast.error('No hay organización activa. Recargá la página.')
      return
    }
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()

    // Payload explícito: org_id + user_id garantizan que el INSERT respete
    // WITH CHECK y el DEFAULT no falle. Antes se confiaba en el DEFAULT
    // auth_org_id() y esto silenciosamente fallaba sin datos guardados
    // (caso Talleres Mejía — Ago 2026).
    const payload = { ...profile, user_id: user?.id, org_id: org.id }
    delete payload.id

    if (profile.id) {
        const { error } = await supabase.from('company_profile').update(payload).eq('id', profile.id)
        if (error) {
          console.error('[CompanyProfile update]', error)
          toast.error(humanizeDbError(error, { table: 'company_profile' }))
        } else toast.success('Perfil de la empresa actualizado')
    } else {
        const { data: inserted, error } = await supabase
          .from('company_profile')
          .insert([payload])
          .select()
          .single()
        if (error) {
          console.error('[CompanyProfile insert]', error, 'payload:', payload)
          toast.error(humanizeDbError(error, { table: 'company_profile' }))
        } else if (!inserted) {
          console.error('[CompanyProfile insert] guardado devolvió sin filas', payload)
          toast.error('Guardado no confirmado — verificá conexión y volvé a intentar.')
        } else {
            toast.success('Perfil creado · El sistema ahora entiende mejor tu empresa')
            setProfile(inserted) // usamos la fila insertada, ya trae el id nuevo
        }
    }
    setSaving(false)
  }

  const generarPerfilIA = async () => {
    if (!profile.name || !profile.industry) {
        toast.warning('Ingresá al menos el Nombre de la Empresa y el Sector/Industria')
        return
    }

    setLoadingIA(true)
    const prompt = `
        Empresa: "${profile.name}"
        Industria/Sector: "${profile.industry}"
        Productos principales (opcional): "${profile.main_products}"
        Sitio Web para referencia: "${profile.website_url}"
        
        Actúa como un consultor de negocios experto. Genera un perfil profesional para "Entender la organización" en un contexto ISO 9001.
        
        Genera un JSON con:
        1. "description": Una descripción clara y profesional de a qué se dedica la empresa (max 300 caracteres).
        2. "strategic_direction": Una propuesta breve de Misión/Visión enfocada a calidad.
        3. "main_products": Lista sugerida de productos/servicios principales si no se proveyeron.
    `

    const respuesta = await consultarIA(prompt, "Eres un consultor experto en desarrollo organizacional e ISO 9001.")
    
    try {
        let cleanText = respuesta.replace(/```json/g, '').replace(/```/g, '').trim();
        if (cleanText.includes('{')) cleanText = cleanText.substring(cleanText.indexOf('{'));
        if (cleanText.includes('}')) cleanText = cleanText.substring(0, cleanText.lastIndexOf('}') + 1);
        
        const data = JSON.parse(cleanText)
        
        setProfile(prev => ({
            ...prev,
            description: data.description || prev.description,
            strategic_direction: data.strategic_direction || prev.strategic_direction,
            main_products: prev.main_products || data.main_products || ''
        }))
    } catch (e) {
        console.error(e)
        toast.error('La IA generó texto, pero hubo un error de formato')
    }
    setLoadingIA(false)
  }

  if (loading) return <div style={{padding:'40px', textAlign:'center'}}>Cargando perfil...</div>

  return (
    <div className="fade-in" style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      
      {/* HEADER */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        {profile.logo_url ? (
            <img 
                src={profile.logo_url} 
                alt="Logo Empresa" 
                style={{ width: '80px', height: '80px', objectFit: 'contain', marginBottom: '15px' }} 
                onError={(e) => {e.target.onerror = null; e.target.style.display='none';}} // Ocultar si falla
            />
        ) : (
            <div style={{ display: 'inline-flex', padding: '15px', borderRadius: '50%', background: '#e0e7ff', color: '#4338ca', marginBottom:'15px' }}>
                <Building2 size={40} />
            </div>
        )}
        <h1 style={{ margin: '0 0 10px 0', color: '#1e293b' }}>Perfil de la Organización</h1>
        <p style={{ color: '#64748b', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
            Antes de comenzar con el SGC, definamos el ADN de tu empresa. 
            Esta información alimentará a la IA para darte recomendaciones personalizadas en todos los módulos.
        </p>
      </div>

      <div className="card" style={{ padding: '30px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
        <form onSubmit={handleSave}>
           
           <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
               <button 
                  type="button"
                  onClick={generarPerfilIA}
                  disabled={loadingIA || !profile.name}
                  className="btn"
                  style={{ background: 'linear-gradient(90deg, #8b5cf6 0%, #6366f1 100%)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
               >
                   {loadingIA ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                   Autocompletar con IA
               </button>
           </div>

           <div className="grid-2-col" style={{ gap: '2rem' }}>
               {/* LEFT COLUMN */}
               <div>
                   <h3 style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: '10px', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
                       <Building2 size={20} /> Datos Generales
                   </h3>
                   
                   <div style={{ display:'flex', gap:'10px', marginBottom:'15px' }}>
                       <div className="form-group" style={{ flex: 1 }}>
                           <label className="form-label">Logo URL</label>
                           <input 
                             className="form-input"
                             placeholder="https://mi-empresa.com/logo.png"
                             value={profile.logo_url || ''}
                             onChange={e => setProfile({...profile, logo_url: e.target.value})}
                           />
                       </div>
                       <div className="form-group" style={{ flex: 1 }}>
                           <label className="form-label">Sitio Web</label>
                           <input 
                             className="form-input"
                             placeholder="https://www.mi-empresa.com"
                             value={profile.website_url || ''}
                             onChange={e => setProfile({...profile, website_url: e.target.value})}
                           />
                       </div>
                   </div>

                   <div className="form-group">
                       <label className="form-label">Nombre de la Empresa</label>
                       <input 
                         required
                         className="form-input"
                         placeholder="Ej: Constructora Global S.A."
                         value={profile.name}
                         onChange={e => setProfile({...profile, name: e.target.value})}
                       />
                   </div>

                   <div className="form-group">
                       <label className="form-label">Industria / Sector</label>
                       <input 
                         required
                         className="form-input"
                         placeholder="Ej: Construcción, Tecnología, Alimentos..."
                         value={profile.industry}
                         onChange={e => setProfile({...profile, industry: e.target.value})}
                       />
                   </div>

                   <div className="grid-2-col">
                        <div className="form-group">
                            <label className="form-label">Tamaño (Empleados)</label>
                            <select 
                                className="form-select"
                                value={profile.employees_count}
                                onChange={e => setProfile({...profile, employees_count: e.target.value})}
                            >
                                <option value="1-10">1-10 (Micro)</option>
                                <option value="11-50">11-50 (Pequeña)</option>
                                <option value="51-200">51-200 (Mediana)</option>
                                <option value="201+">201+ (Grande)</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Año Fundación</label>
                            <input 
                                className="form-input"
                                type="number"
                                placeholder="Ej: 2010"
                                value={profile.founded_year}
                                onChange={e => setProfile({...profile, founded_year: e.target.value})}
                            />
                        </div>
                   </div>

                    <div className="form-group">
                       <label className="form-label">Productos / Servicios Principales</label>
                       <textarea 
                         className="form-textarea"
                         style={{ height: '80px' }}
                         placeholder="Lista los principales productos o servicios..."
                         value={profile.main_products}
                         onChange={e => setProfile({...profile, main_products: e.target.value})}
                       />
                   </div>

               </div>

               {/* RIGHT COLUMN */}
               <div>
                   <h3 style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: '10px', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
                       <Rocket size={20} /> Identidad Estratégica
                   </h3>

                   <div className="form-group">
                       <label className="form-label">Descripción de la Organización</label>
                       <p style={{fontSize:'0.8rem', color:'#64748b', marginBottom:'5px'}}>¿Qué hacen y para quién?</p>
                       <textarea 
                         className="form-textarea"
                         style={{ height: '120px' }}
                         placeholder="Descripción breve de la actividad económica..."
                         value={profile.description}
                         onChange={e => setProfile({...profile, description: e.target.value})}
                       />
                   </div>

                   <div className="form-group">
                       <label className="form-label">Dirección Estratégica (Misión/Visión Resumida)</label>
                       <p style={{fontSize:'0.8rem', color:'#64748b', marginBottom:'5px'}}>¿Hacia dónde va la empresa?</p>
                       <textarea 
                         className="form-textarea"
                         style={{ height: '120px' }}
                         placeholder="Convertirnos en líderes del mercado mediante..."
                         value={profile.strategic_direction}
                         onChange={e => setProfile({...profile, strategic_direction: e.target.value})}
                       />
                   </div>
               </div>
           </div>

           <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center' }}>
               <button 
                type="submit" 
                disabled={saving}
                className="btn btn-primary"
                style={{ padding: '12px 40px', fontSize: '1.1rem', boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)' }}
               >
                   {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                   {saving ? 'Guardando...' : 'Guardar Perfil de Empresa'}
               </button>
           </div>

        </form>
      </div>
      
      <div style={{ marginTop: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
          🔒 Esta información es privada y se utilizará únicamente para contextualizar tu Sistema de Gestión de Calidad.
      </div>
    </div>
  )
}
