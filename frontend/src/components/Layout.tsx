import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// ── Logo por estudio ────────────────────────────────────────────────────────
const LOGOS: Record<string, { src: string }> = {
  nest: { src: '/nest-logo-transparent.png' },
}

function getEstudioKey(nombre: string | null | undefined): string | null {
  if (!nombre) return null
  const n = nombre.toLowerCase()
  if (n.includes('nest')) return 'nest'
  return null
}

function EstudioLogoExpanded({ nombre }: { nombre?: string | null }) {
  const key = getEstudioKey(nombre)
  if (key && LOGOS[key]) {
    return (
      <img
        src={LOGOS[key].src}
        alt={nombre ?? 'Estudio'}
        style={{ width: 140, height: 56, objectFit: 'contain' }}
      />
    )
  }
  // Genérico: iniciales del estudio
  const iniciales = (nombre ?? 'E')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
  return (
    <div style={{
      width: 72, height: 72, borderRadius: 16,
      background: 'rgba(255,255,255,0.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 28, fontWeight: 900, color: '#fff',
      letterSpacing: '-1px', fontFamily: 'Gotham, sans-serif',
    }}>
      {iniciales}
    </div>
  )
}

function EstudioLogoCollapsed({ nombre }: { nombre?: string | null }) {
  const key = getEstudioKey(nombre)
  if (key && LOGOS[key]) {
    return (
      <img
        src={LOGOS[key].src}
        alt={nombre ?? 'Estudio'}
        style={{ width: 36, height: 36, objectFit: 'contain' }}
      />
    )
  }
  const inicial = (nombre ?? 'E')[0]?.toUpperCase() ?? 'E'
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 8,
      background: 'rgba(255,255,255,0.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 15, fontWeight: 900, color: '#fff',
      fontFamily: 'Gotham, sans-serif',
    }}>
      {inicial}
    </div>
  )
}

// ── Iconos SVG para nav ─────────────────────────────────────────────────────
const ICONS: Record<string, JSX.Element> = {
  admin: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  clientes: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  descarga: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  ),
  iva: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  dashboard: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  portal: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  estudios: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
    </svg>
  ),
  reportes: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  agente: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
}

const NAV_ITEMS = {
  superadmin: [
    { label: 'Estudios', to: '/superadmin', icon: 'estudios' },
  ],
  admin: [
    { label: 'Administración', to: '/admin/base',               icon: 'admin' },
    { label: 'Descarga Masiva',to: '/contador/descarga-masiva', icon: 'descarga' },
    { label: 'Estimado IVA',   to: '/contador/dashboard-iva',   icon: 'iva' },
    { label: 'Dashboard',      to: '/contador/dashboard',       icon: 'dashboard' },
    { label: 'Agente',         to: '/admin/agente',             icon: 'agente' },
  ],
  contador: [
    { label: 'Descarga Masiva',to: '/contador/descarga-masiva', icon: 'descarga' },
    { label: 'Estimado IVA',   to: '/contador/dashboard-iva',   icon: 'iva' },
    { label: 'Dashboard',      to: '/contador/dashboard',       icon: 'dashboard' },
  ],
  cliente: [
    { label: 'Mi Portal', to: '/cliente', icon: 'portal' },
  ],
}

const ROL_LABEL: Record<string, string> = {
  superadmin: 'Super Admin',
  admin:      'Administrador',
  contador:   'Contador',
  cliente:    'Cliente',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  if (!user || location.pathname === '/login') return <>{children}</>

  const esSuperadmin = user.rol === 'superadmin'

  const navItems = NAV_ITEMS[user.rol as keyof typeof NAV_ITEMS] || []
  const handleLogout = () => { logout(); navigate('/login') }

  const isActive = (to: string) =>
    location.pathname === to || (to !== '/' && location.pathname.startsWith(to + '/'))

  return (
    <div className="min-h-screen flex bg-slate-50">

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside
        className={`fixed top-0 left-0 h-full z-30 flex flex-col transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
        style={{ background: 'linear-gradient(180deg, #1D3070 0%, #162453 100%)' }}
      >
        {/* Logo + toggle */}
        <div className={`flex items-center border-b border-white/10 shrink-0 ${collapsed ? 'justify-center py-2 px-2' : 'justify-between px-3 py-2'}`}>
          {!collapsed && (
            <Link to="/" className="flex items-center justify-center w-full overflow-hidden" style={{ maxHeight: 64 }}>
              {esSuperadmin
                ? <img src="/praxis-logo.png" alt="Praxis AI" style={{ width: 200, height: 'auto', maxHeight: 60, objectFit: 'contain' }} />
                : <EstudioLogoExpanded nombre={user.estudio_nombre} />}
            </Link>
          )}
          {collapsed && (
            <Link to="/" className="flex-shrink-0">
              {esSuperadmin
                ? <img src="/praxis-logo.png" alt="Praxis AI" style={{ width: 40, height: 40, objectFit: 'contain' }} />
                : <EstudioLogoCollapsed nombre={user.estudio_nombre} />}
            </Link>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className={`text-blue-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all ${collapsed ? 'mt-0' : ''}`}
            title={collapsed ? 'Expandir' : 'Colapsar'}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {collapsed
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              }
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-5 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'text-white bg-white/12'
                    : 'text-blue-200 hover:text-white hover:bg-white/8'
                }`}
                style={active ? { boxShadow: 'inset 0 0 0 1px rgba(124,200,216,0.35)', fontFamily: 'Gotham, sans-serif' } : { fontFamily: 'Gotham, sans-serif' }}
              >
                <span className={`shrink-0 ${active ? 'text-accent-300' : 'text-blue-300'}`}>
                  {ICONS[item.icon]}
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-300 shrink-0" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Usuario + logout */}
        <div className="border-t border-white/10 px-2 py-3 space-y-1">
          {!collapsed && (
            <div className="px-3 py-2.5 rounded-xl bg-white/6 mb-1">
              <p className="text-sm font-semibold text-white truncate" style={{ fontFamily: 'Gotham, sans-serif' }}>
                {user.nombre}
              </p>
              <p className="text-[10px] text-accent-300 font-semibold uppercase tracking-widest mt-0.5">
                {ROL_LABEL[user.rol]}
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={collapsed ? 'Cerrar sesión' : undefined}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-blue-300 hover:text-red-300 hover:bg-red-900/20 transition-all duration-200"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      {/* ── Contenido ─────────────────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${collapsed ? 'ml-16' : 'ml-60'}`}>
        <main className="flex-1 px-6 py-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
        <footer className="border-t border-gray-100 py-3 text-center text-xs text-gray-300"
          style={{ fontFamily: 'Gotham, sans-serif', letterSpacing: '0.05em' }}>
          NEST ESTUDIO CONTABLE © {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  )
}
