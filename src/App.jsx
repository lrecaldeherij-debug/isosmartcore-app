import { useState, useEffect, createContext, useContext, lazy, Suspense, Component } from 'react'
import { Toaster } from 'react-hot-toast'
import { supabase } from './supabaseClient'
import { OrgProvider, useOrg } from './OrgContext'
import { ConfirmRoot } from './lib/confirm'
import { LoadingScreen } from './components/ui/misc'
import { toast } from './lib/toast'
// Eager — necesarios en boot path (auth, splash, públicas)
import Login from './Login'
import PublicSurvey from './PublicSurvey'
import PricingPage from './PricingPage'
import TrialBanner from './TrialBanner'
import AuditorView from './AuditorView'

// Lazy — vistas pesadas que se cargan al navegar
const Dashboard = lazy(() => import('./Dashboard'))
const Onboarding = lazy(() => import('./Onboarding'))
const OrganizationSettings = lazy(() => import('./OrganizationSettings'))
const ImplementationGuide = lazy(() => import('./ImplementationGuide'))
const ApprovalQueue = lazy(() => import('./ApprovalQueue'))
const CompanyProfile = lazy(() => import('./CompanyProfile'))
const ContextAnalysis = lazy(() => import('./ContextAnalysis'))
const Stakeholders = lazy(() => import('./Stakeholders'))
const ScopeDeclaration = lazy(() => import('./ScopeDeclaration'))
const Processes = lazy(() => import('./Processes'))
const QualityPolicy = lazy(() => import('./QualityPolicy'))
const OrgChart = lazy(() => import('./OrgChart'))
const RolesResponsibilities = lazy(() => import('./RolesResponsibilities'))
const RisksOpportunities = lazy(() => import('./RisksOpportunities'))
const QualityObjectives = lazy(() => import('./QualityObjectives'))
const StrategicActionPlan = lazy(() => import('./StrategicActionPlan'))
const Personnel = lazy(() => import('./Personnel'))
const Training = lazy(() => import('./Training'))
const Documents = lazy(() => import('./Documents'))
const ClimateSurveys = lazy(() => import('./ClimateSurveys'))
const CommunicationMatrix = lazy(() => import('./CommunicationMatrix'))
const Calibration = lazy(() => import('./Calibration'))
const CustomerRequirements = lazy(() => import('./CustomerRequirements'))
const ProductionControl = lazy(() => import('./ProductionControl'))
const QCRelease = lazy(() => import('./QCRelease'))
const OperationalIncidents = lazy(() => import('./OperationalIncidents'))
const Suppliers = lazy(() => import('./Suppliers'))
const InternalAudits = lazy(() => import('./InternalAudits'))
const ManagementReview = lazy(() => import('./ManagementReview'))
const NonConformities = lazy(() => import('./NonConformities'))
const ImprovementOpportunities = lazy(() => import('./ImprovementOpportunities'))
const AuditLogs = lazy(() => import('./AuditLogs'))
const BillingSettings = lazy(() => import('./BillingSettings'))
const Team = lazy(() => import('./Team'))
const HelpSupport = lazy(() => import('./HelpSupport'))
import HelpButton from './components/ui/HelpButton'
import { 
  Home, 
  Target, 
  Users, 
  FileText, 
  RefreshCcw, 
  Award, 
  UserCheck, 
  GitMerge, 
  ShieldAlert, 
  TrendingUp, 
  Map, 
  GraduationCap, 
  FolderOpen, 
  Truck, 
  Search, 
  Briefcase, 
  AlertTriangle, 
  Shield, 
  LogOut,
  ChevronDown,
  ChevronRight,
  Menu,
  BarChart3,
  Share2,
  ShoppingCart,
  Factory,
  CheckCircle,
  Ruler,
  AlertOctagon,
  Building2, // Icono para empresa
  Settings,
  ShieldCheck,
  CreditCard,
  HelpCircle
} from 'lucide-react'

// Red de seguridad: cualquier excepción en render que escape de los módulos
// individuales cae acá. Sin esto, React 19 desmonta todo el árbol y el usuario
// ve pantalla en blanco. Acá ve mensaje + botón "Recargar".
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }
  render() {
    if (!this.state.hasError) return this.props.children
    const isDev = typeof import.meta !== 'undefined' && import.meta?.env?.DEV
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', fontFamily: '"Inter", system-ui, sans-serif',
        background: '#F5F1E8', color: '#2E1F1A',
      }}>
        <div style={{
          maxWidth: '520px', width: '100%', textAlign: 'center', padding: '40px 32px',
          border: '1px solid #D8CFB8', background: '#FFFFFF',
        }}>
          <div style={{
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace', fontSize: '11px',
            color: '#8B2438', letterSpacing: '0.1em', marginBottom: '16px',
            textTransform: 'uppercase', fontWeight: 700,
          }}>
            ERROR · EXPEDIENTE
          </div>
          <h1 style={{
            margin: '0 0 12px 0', fontFamily: '"Fraunces", Georgia, serif',
            fontSize: '28px', fontWeight: 600, lineHeight: 1.15, color: '#2E1F1A',
          }}>
            Algo falló al cargar este módulo.
          </h1>
          <p style={{ color: '#5A4A3F', fontSize: '14px', lineHeight: 1.55, marginBottom: '28px' }}>
            No tocamos tus datos guardados. Recarga la página para volver al tablero.
            Si el problema se repite, contactanos.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#8B2438', color: '#F5F1E8',
              border: '1.5px solid #8B2438', padding: '14px 24px',
              borderRadius: '2px', fontWeight: 600, cursor: 'pointer',
              fontSize: '14px', letterSpacing: '0.04em',
            }}
          >
            Recargar
          </button>
          {isDev && this.state.error && (
            <pre style={{
              marginTop: '28px', textAlign: 'left', fontSize: '11px',
              color: '#722619', background: '#F6DCD6', padding: '12px',
              borderRadius: '2px', overflow: 'auto', maxHeight: '220px',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {String(this.state.error?.stack || this.state.error)}
            </pre>
          )}
        </div>
      </div>
    )
  }
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const publicSurveyMatch = window.location.pathname.match(/^\/encuesta\/([A-Za-z0-9]+)\/?$/)
  const auditorMatch = window.location.pathname.match(/^\/auditor\/([A-Za-z0-9]+)\/?$/)
  const isPricingRoute = window.location.pathname === '/pricing' || window.location.pathname === '/precios'

  useEffect(() => {
    if (publicSurveyMatch || auditorMatch || isPricingRoute) { setLoading(false); return }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Ruta pública /encuesta/:token — no requiere login
  if (publicSurveyMatch) return <PublicSurvey token={publicSurveyMatch[1]} />

  // Ruta pública /auditor/:token — modo auditor read-only
  if (auditorMatch) return <AuditorView token={auditorMatch[1]} />

  // Ruta pública /pricing — no requiere login
  if (isPricingRoute) return <>
    <Toaster position="top-right" />
    <ConfirmRoot />
    <PricingPage
      onSignup={() => { window.history.pushState({}, '', '/'); window.location.reload() }}
      onLogin={() => { window.history.pushState({}, '', '/'); window.location.reload() }}
    />
  </>

  if (loading) return <>
    <Toaster position="top-right" />
    <ConfirmRoot />
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-secondary)' }}>⏳ Cargando sistema...</div>
  </>
  if (!session) return <>
    <Toaster position="top-right" />
    <ConfirmRoot />
    <Login />
  </>

  return (
    <OrgProvider session={session}>
      <Toaster position="top-right" />
      <ConfirmRoot />
      <AppShell />
    </OrgProvider>
  )
}

async function handleSignOut() {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    // onAuthStateChange dispara setSession(null) → App re-renderiza al Login
  } catch (err) {
    console.error('signOut error:', err)
    toast.error('No se pudo cerrar sesión: ' + (err?.message || 'error de red') + '. Recarga la página.')
  }
}

function AppShell() {
  const { org, loading: orgLoading, error: orgError, can, refresh } = useOrg()
  const [vistaActual, setVistaActual] = useState('inicio')
  const [onboardingForceCompleted, setOnboardingForceCompleted] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    contexto: false,
    liderazgo: false,
    planificacion: false,
    soporte: false,
    operacion: true,
    evaluacion: false,
    mejora: false,
    sistema: false
  })

  // Solo mostrar loading si todavía no tenemos org cargado. Si refresh() se dispara
  // con un org ya presente (post-onboarding, cambio de plan, etc.) NO desmontamos
  // la UI — los componentes vivos siguen mostrando el org viejo unos ms hasta que
  // llegue el nuevo. Esto evita perder la celebration screen del wizard.
  if (orgLoading && !org) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-secondary)' }}>⏳ Cargando organización...</div>
  if (orgError) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: '1rem' }}>
      <div style={{ color: 'var(--danger-text)' }}>⚠️ {orgError}</div>
      <button className="btn" onClick={handleSignOut}>Cerrar sesión</button>
    </div>
  )

  // Onboarding: mostrar solo si no está completado y el rol puede editarlo (owner/quality_manager)
  const needsOnboarding = org && !org.onboarding_completed_at && !onboardingForceCompleted && (can.admin || can.write)
  if (needsOnboarding) {
    return (
      <Suspense fallback={<LoadingScreen label="Iniciando wizard…" />}>
        <Onboarding onComplete={() => { setOnboardingForceCompleted(true); if (typeof refresh === 'function') refresh() }} />
      </Suspense>
    )
  }

  const navegarA = (vista) => { setVistaActual(vista); setMobileMenuOpen(false) }

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  return (
    <>
      <TrialBanner onUpgrade={() => navegarA('billing')} />
    <div className="app-container">
      {/* BOTÓN MENÚ MOBILE */}
      <button
        className="mobile-menu-toggle"
        onClick={() => setMobileMenuOpen(v => !v)}
        aria-label="Abrir menú"
      >
        ☰
      </button>
      {/* OVERLAY MOBILE */}
      {mobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}
      {/* MENÚ LATERAL */}
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <div style={{ width: '32px', height: '32px', background: 'var(--primary-color)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>ISO</div>
            <h2 className="sidebar-title" style={{ marginLeft: '10px' }}>SmartCore</h2>
          </div>
          {org && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-tertiary)', width: '100%' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {org.name}
              </div>
              <div>Plan {org.plan}</div>
            </div>
          )}
        </div>
        
        <NavContext.Provider value={{ vistaActual, navegarA, expandedSections, toggleSection }}>
        <nav className="nav-menu">
          <NavItem id="perfil_empresa" label="ADN de la Empresa" icon={Building2} />
          <NavItem id="inicio" label="Tablero Principal" icon={Home} />
          <NavItem id="guia" label="Guía de Implementación" icon={Target} />

          <div style={{ margin: '10px 0', borderTop: '1px solid var(--sidebar-border)' }}></div>

          <div className="nav-group-title">Módulos ISO 9001</div>

          <NavGroup title="Contexto (4)" sectionKey="contexto" icon={Map}>
            <NavItem id="contexto" label="Contexto FODA (4.1)" icon={Target} />
            <NavItem id="stakeholders" label="Partes Interesadas (4.2)" icon={Users} />
            <NavItem id="alcance" label="Alcance (4.3)" icon={FileText} />
            <NavItem id="procesos" label="Mapa de Procesos (4.4)" icon={RefreshCcw} />
          </NavGroup>
          
          <NavGroup title="Liderazgo (5)" sectionKey="liderazgo" icon={Award}>
            <NavItem id="politica" label="Política Calidad (5.2)" icon={FileText} />
            <NavItem id="roles" label="Roles y Funciones (5.3)" icon={UserCheck} />
            <NavItem id="organigrama" label="Organigrama (5.3)" icon={GitMerge} />
          </NavGroup>
          
          <NavGroup title="Planificación (6)" sectionKey="planificacion" icon={TrendingUp}>
            <NavItem id="riesgos" label="Riesgos (6.1)" icon={ShieldAlert} />
            <NavItem id="objetivos" label="Objetivos (6.2)" icon={Target} />
            <NavItem id="plan_estrategico" label="Plan Estratégico (6.3)" icon={Map} />
          </NavGroup>

          <NavGroup title="Soporte (7)" sectionKey="soporte" icon={Users}>
            <NavItem id="personal" label="Personal (7.1.2)" icon={UserCheck} />
            <NavItem id="formacion" label="Formación (7.2)" icon={GraduationCap} />
            <NavItem id="clima" label="Clima Laboral (7.1.4)" icon={BarChart3} />
            <NavItem id="comunicaciones" label="Comunicaciones (7.4)" icon={Share2} />
            <NavItem id="calibracion" label="Calibración (7.1.5)" icon={Ruler} />
            <NavItem id="documentos" label="Documentación (7.5)" icon={FolderOpen} />
          </NavGroup>

          <NavGroup title="Operación (8)" sectionKey="operacion" icon={Briefcase}>
            <NavItem id="ventas" label="Pedidos (8.2)" icon={ShoppingCart} />
            <NavItem id="produccion" label="Producción (8.5)" icon={Factory} />
            <NavItem id="liberacion" label="Liberación (8.6)" icon={CheckCircle} />
            <NavItem id="incidentes" label="Cambios e Incidentes (8.5.3/8.5.6)" icon={AlertOctagon} />
            <NavItem id="proveedores" label="Proveedores (8.4)" icon={Truck} />
          </NavGroup>

          <NavGroup title="Evaluación (9)" sectionKey="evaluacion" icon={Search}>
            <NavItem id="auditorias" label="Auditorías Internas (9.2)" icon={Search} />
            <NavItem id="revision_direccion" label="Revisión Dirección (9.3)" icon={Briefcase} />
          </NavGroup>

          <NavGroup title="Mejora (10)" sectionKey="mejora" icon={AlertTriangle}>
            <NavItem id="no_conformidades" label="No Conformidades (10.2)" icon={AlertTriangle} />
            <NavItem id="mejora_continua" label="Mejora Continua (10.3)" icon={TrendingUp} />
          </NavGroup>

          <div className="nav-group-title">Administración</div>
          <NavItem id="aprobaciones" label="Aprobaciones" icon={ShieldCheck} />
          <NavItem id="audit_logs" label="Logs de Auditoría" icon={Shield} />
          <NavItem id="organizacion" label={can.admin ? "Mi Organización" : "Miembros"} icon={Settings} />
          <NavItem id="equipo" label="Equipo y roles" icon={Users} />
          <NavItem id="billing" label="Plan y facturación" icon={CreditCard} />
          <NavItem id="ayuda" label="Ayuda y Soporte" icon={HelpCircle} />

          <button onClick={handleSignOut} className="nav-btn logout">
            <LogOut size={18} />
            <span>Cerrar Sesión</span>
          </button>
        </nav>
        </NavContext.Provider>
      </aside>

      {/* CONTENIDO */}
      <main className="main-content">
        <Suspense fallback={<LoadingScreen label="Cargando módulo…" />}>
        {vistaActual === 'inicio' && <Dashboard alCambiarVista={navegarA} />}
        {vistaActual === 'guia' && <ImplementationGuide alCambiarVista={navegarA} />}
        {vistaActual === 'perfil_empresa' && <CompanyProfile />}
        {vistaActual === 'contexto' && <ContextAnalysis />}
        {vistaActual === 'stakeholders' && <Stakeholders />}
        {vistaActual === 'alcance' && <ScopeDeclaration />}
        {vistaActual === 'procesos' && <Processes />}
        {vistaActual === 'politica' && <QualityPolicy />}
        {vistaActual === 'roles' && <RolesResponsibilities />}
        {vistaActual === 'organigrama' && <OrgChart />}
        {vistaActual === 'riesgos' && <RisksOpportunities />}
        {vistaActual === 'objetivos' && <QualityObjectives />}
        {vistaActual === 'plan_estrategico' && <StrategicActionPlan />}
        {vistaActual === 'personal' && <Personnel />}
        {vistaActual === 'formacion' && <Training />}
        {vistaActual === 'clima' && <ClimateSurveys />}
        {vistaActual === 'comunicaciones' && <CommunicationMatrix />}
        {vistaActual === 'calibracion' && <Calibration />}
        {vistaActual === 'documentos' && <Documents />}
        {vistaActual === 'ventas' && <CustomerRequirements />}
        {vistaActual === 'produccion' && <ProductionControl />}
        {vistaActual === 'liberacion' && <QCRelease />}
        {vistaActual === 'incidentes' && <OperationalIncidents />}
        {vistaActual === 'proveedores' && <Suppliers />}
        {vistaActual === 'auditorias' && <InternalAudits />}
        {vistaActual === 'revision_direccion' && <ManagementReview />}
        {vistaActual === 'no_conformidades' && <NonConformities />}
        {vistaActual === 'mejora_continua' && <ImprovementOpportunities />}
        {vistaActual === 'aprobaciones' && <ApprovalQueue />}
        {vistaActual === 'audit_logs' && <AuditLogs />}
        {vistaActual === 'organizacion' && <OrganizationSettings />}
        {vistaActual === 'billing' && <BillingSettings onUpgrade={() => { window.history.pushState({}, '', '/pricing'); window.location.reload() }} />}
        {vistaActual === 'equipo' && <Team />}
        {vistaActual === 'ayuda' && <HelpSupport embedded={true} />}
        </Suspense>
      </main>
    </div>
    {/* Botón flotante de ayuda — escondido cuando ya estás en la página de ayuda */}
    {vistaActual !== 'ayuda' && <HelpButton />}
    </>
  )
}

// NavItem y NavGroup van AFUERA de AppShell para que React los considere
// componentes estables. Si los definimos adentro, cada cambio de vistaActual
// crea funciones nuevas y desmonta/remonta todo el sidebar — eso resetea el
// scroll cada vez que clickeás un item. Usamos un Context para no tener
// que pasar las mismas props en cada uso.
const NavContext = createContext(null)

function NavItem({ id, label, icon: Icon, onClick }) {
  const { vistaActual, navegarA } = useContext(NavContext)
  return (
    <button
      onClick={() => onClick ? onClick() : navegarA(id)}
      className={`nav-btn ${vistaActual === id ? 'active' : ''}`}
    >
      <Icon className="icon" size={18} />
      <span>{label}</span>
    </button>
  )
}

function NavGroup({ title, sectionKey, icon: GroupIcon, children }) {
  const { expandedSections, toggleSection } = useContext(NavContext)
  return (
    <div className="nav-group">
      <button
        className="nav-btn nav-accordion-trigger"
        onClick={() => toggleSection(sectionKey)}
        style={{ justifyContent: 'space-between', width: '100%', color: 'var(--text-primary)', fontWeight: '600' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <GroupIcon size={18} className="text-secondary" />
          <span>{title}</span>
        </div>
        {expandedSections[sectionKey] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      <div
        className="nav-accordion"
        style={{
          maxHeight: expandedSections[sectionKey] ? '800px' : '0',
          paddingLeft: '1rem',
          opacity: expandedSections[sectionKey] ? 1 : 0
        }}
      >
        <div style={{ paddingLeft: '0.5rem', borderLeft: '1px solid var(--sidebar-border)', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default function AppWithBoundary() {
  return <ErrorBoundary><App /></ErrorBoundary>
}
