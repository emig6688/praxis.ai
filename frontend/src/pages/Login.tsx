import { useState, FormEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

// ── Logo Praxis AI ──────────────────────────────────────────────────────────
function PraxisLogo({ size = 260 }: { size?: number }) {
  return (
    <img
      src="/praxis-logo.png"
      alt="Praxis AI — Soluciones Inteligentes para Contadores"
      style={{ width: size, height: 'auto', objectFit: 'contain' }}
    />
  )
}

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const { login, user }         = useAuth()
  const navigate                = useNavigate()

  useEffect(() => {
    if (user) {
      const dest =
        user.rol === 'superadmin' ? '/superadmin' :
        user.rol === 'admin'      ? '/admin'       :
        user.rol === 'contador'   ? '/contador'    : '/cliente'
      navigate(dest, { replace: true })
    }
  }, [user, navigate])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Credenciales incorrectas'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(160deg, #080E1C 0%, #0D1929 55%, #091420 100%)' }}
    >
      {/* Subtle background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, #2EC4B6 0%, transparent 70%)' }} />
      </div>

      <div className="relative z-10 w-full max-w-[900px] flex flex-col lg:flex-row items-center gap-12 lg:gap-20">

        {/* ── Branding ── */}
        <div className="flex flex-col items-center text-center flex-1">
          <PraxisLogo size={300} />
        </div>

        {/* ── Divider vertical ── */}
        <div className="hidden lg:block w-px h-64 opacity-10" style={{ background: '#8BA5C8' }} />

        {/* ── Formulario ── */}
        <div className="w-full max-w-sm flex-1">
          <h2
            className="text-2xl mb-1"
            style={{ color: '#E8EDF8', fontFamily: 'Gotham, sans-serif', fontWeight: 900 }}
          >
            Iniciar sesión
          </h2>
          <p className="text-sm mb-8 opacity-40" style={{ color: '#8BA5C8', fontFamily: 'Gotham, sans-serif', letterSpacing: '0.04em' }}>
            Acceso restringido al personal autorizado
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-[10px] font-semibold uppercase tracking-widest mb-2"
                style={{ color: '#8BA5C8', fontFamily: 'Gotham, sans-serif' }}
              >
                Email
              </label>
              <input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#E8EDF8',
                  fontFamily: 'Open Sans, sans-serif',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#2EC4B6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(46,196,182,0.12)' }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.boxShadow = 'none' }}
              />
            </div>

            <div>
              <label
                className="block text-[10px] font-semibold uppercase tracking-widest mb-2"
                style={{ color: '#8BA5C8', fontFamily: 'Gotham, sans-serif' }}
              >
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#E8EDF8',
                  fontFamily: 'Open Sans, sans-serif',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#2EC4B6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(46,196,182,0.12)' }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.boxShadow = 'none' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 mt-2 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #2EC4B6 0%, #1BA8A0 100%)',
                color: '#080E1C',
                fontFamily: 'Gotham, sans-serif',
                letterSpacing: '0.06em',
                boxShadow: '0 4px 20px rgba(46,196,182,0.25)',
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Ingresando...
                </span>
              ) : 'INGRESAR'}
            </button>
          </form>

          <p
            className="text-center text-[9px] tracking-widest uppercase mt-8 opacity-25"
            style={{ color: '#8BA5C8', fontFamily: 'Gotham, sans-serif' }}
          >
            Praxis AI © {new Date().getFullYear()} — Todos los derechos reservados
          </p>
        </div>
      </div>
    </div>
  )
}
