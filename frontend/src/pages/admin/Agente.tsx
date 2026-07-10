import { useState, useEffect, useRef } from 'react'
import { agenteApi, AgenteConfig, AgenteLog, AgenteLogDetalle, BackupInfo } from '../../api/agente'
import api from '../../api/client'
import toast from 'react-hot-toast'

interface EmailConfig {
  email_institucional: string | null
  smtp_host: string | null
  smtp_port: number
  tiene_password: boolean
}

const $ar = (n: number) =>
  `$ ${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

function BadgeEstado({ d }: { d: AgenteLogDetalle }) {
  if (!d.descarga)
    return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">✗ Error descarga</span>
  if (d.envio)
    return <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700">✓ Reporte enviado</span>
  if (d.error?.includes('Sin email'))
    return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700">Sin email</span>
  if (d.error?.includes('No es día de envío'))
    return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-500" title={d.error}>Fuera de fecha</span>
  if (d.saldo !== undefined && d.saldo <= 0)
    return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">Saldo a favor / neutro</span>
  if (d.error)
    return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700" title={d.error}>✗ Error email</span>
  return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-400">—</span>
}

export default function Agente() {
  const [config, setConfig]     = useState<AgenteConfig | null>(null)
  const [historial, setHistorial] = useState<AgenteLog[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [ejecutando, setEjecutando] = useState(false)
  const [pasoActual, setPasoActual] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pasoRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logIdInicioRef = useRef<number | null>(null)

  const PASOS = [
    'Conectando con AFIP...',
    'Descargando comprobantes emitidos...',
    'Descargando comprobantes recibidos...',
    'Calculando IVA por cliente...',
    'Enviando reportes por email...',
    'Guardando resultados...',
  ]
  const [hora, setHora]         = useState('02:00')
  const [activo, setActivo]     = useState(false)
  const [mailDias, setMailDias] = useState<number[]>([5, 10, 20, 25])
  const [logExpandido, setLogExpandido] = useState<number | null>(null)
  const [backup, setBackup] = useState<BackupInfo | null>(null)
  const [ejecutandoBackup, setEjecutandoBackup] = useState(false)

  // Config correo saliente
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null)
  const [emailForm, setEmailForm] = useState({
    email_institucional: '',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_password: '',
  })

  // Detecta proveedor SMTP a partir del dominio del email
  const detectarProveedor = (email: string) => {
    const dominio = email.split('@')[1]?.toLowerCase() || ''
    if (!dominio) return null
    if (dominio === 'gmail.com')                        return { host: 'smtp.gmail.com',        port: 587, nombre: 'Gmail',           link: 'https://myaccount.google.com/apppasswords', instruccion: 'Necesitás activar la verificación en 2 pasos y luego crear una "Contraseña de aplicación" en tu cuenta Google.' }
    if (dominio.includes('googlemail') || dominio.includes('google')) return { host: 'smtp.gmail.com', port: 587, nombre: 'Google Workspace', link: 'https://myaccount.google.com/apppasswords', instruccion: 'Necesitás activar la verificación en 2 pasos y luego crear una "Contraseña de aplicación" en tu cuenta Google.' }
    if (dominio.includes('outlook') || dominio.includes('hotmail') || dominio.includes('live') || dominio.includes('msn')) return { host: 'smtp.office365.com', port: 587, nombre: 'Microsoft / Outlook', link: 'https://account.microsoft.com/security', instruccion: 'Usá tu contraseña normal de Microsoft. Si tenés verificación en 2 pasos activa, generá una contraseña de aplicación desde Seguridad → Contraseñas de aplicaciones.' }
    if (dominio.includes('zoho'))                       return { host: 'smtp.zoho.com',          port: 587, nombre: 'Zoho Mail',        link: 'https://accounts.zoho.com/home#security/app-password', instruccion: 'En Zoho Mail: Mi cuenta → Seguridad → Contraseñas de aplicación → Agregar.' }
    if (dominio.includes('hostinger'))                  return { host: 'smtp.hostinger.com',     port: 587, nombre: 'Hostinger',        link: 'https://hpanel.hostinger.com', instruccion: 'Usá la contraseña de tu cuenta de email tal como la configuraste en Hostinger. La encontrás en hPanel → Emails.' }
    if (dominio.includes('yahoo'))                      return { host: 'smtp.mail.yahoo.com',    port: 587, nombre: 'Yahoo Mail',       link: 'https://login.yahoo.com/account/security', instruccion: 'En Yahoo: Mi cuenta → Seguridad → Contraseñas de aplicaciones → Crear nueva.' }
    // Dominio propio: usamos smtp.office365.com como fallback más común en Argentina
    return { host: 'smtp.office365.com', port: 587, nombre: 'Microsoft 365 / Outlook', link: null, instruccion: `Usá tu contraseña normal de Microsoft para la cuenta ${email}. Si tenés verificación en dos pasos activa, generá una contraseña de aplicación desde account.microsoft.com → Seguridad.`, manual: false }
  }

  const proveedorDetectado = detectarProveedor(emailForm.email_institucional)
  const [savingEmail, setSavingEmail]   = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)
  const [showSmtpPass, setShowSmtpPass] = useState(false)

  const cargar = async () => {
    setLoading(true)
    try {
      const [cfg, hist, emailCfg, bk] = await Promise.all([
        agenteApi.getConfig(),
        agenteApi.getHistorial(),
        api.get<EmailConfig>('/agente/email-config'),
        agenteApi.getBackup(),
      ])
      setConfig(cfg.data)
      setActivo(cfg.data.activo)
      setHora(cfg.data.hora)
      setMailDias(cfg.data.mail_dias ?? [5, 10, 20, 25])
      setHistorial(hist.data)
      setEmailConfig(emailCfg.data)
      setBackup(bk.data)
      setEmailForm(f => ({
        ...f,
        email_institucional: emailCfg.data.email_institucional || '',
        smtp_host: emailCfg.data.smtp_host || 'smtp.gmail.com',
        smtp_port: emailCfg.data.smtp_port || 587,
      }))
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Error al cargar configuración del agente')
    } finally {
      setLoading(false)
    }
  }

  const guardarEmail = async () => {
    if (!emailForm.email_institucional.trim()) return toast.error('Ingresá el email de envío')
    if (!emailForm.smtp_password.trim() && !emailConfig?.tiene_password)
      return toast.error('Ingresá la contraseña')
    const proveedor = detectarProveedor(emailForm.email_institucional)
    const esManual = (proveedor as any)?.manual
    const dominio = emailForm.email_institucional.split('@')[1] || ''
    const smtpHost = esManual
      ? (`mail.${dominio}`)
      : (proveedor?.host || emailForm.smtp_host)
    setSavingEmail(true)
    try {
      const res = await api.put<EmailConfig>('/agente/email-config', {
        email_institucional: emailForm.email_institucional.trim(),
        smtp_host: smtpHost,
        smtp_port: proveedor?.port || emailForm.smtp_port,
        smtp_password: emailForm.smtp_password.trim(),
      })
      setEmailConfig(res.data)
      setEmailForm(f => ({ ...f, smtp_password: '' }))
      toast.success('Correo configurado. Probá el envío para verificar.')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Error al guardar')
    } finally {
      setSavingEmail(false)
    }
  }

  const probarEmail = async () => {
    setTestingEmail(true)
    try {
      const res = await api.post<{ mensaje: string }>('/agente/test-email')
      toast.success(res.data.mensaje)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Error al enviar email de prueba')
    } finally {
      setTestingEmail(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const guardar = async () => {
    setSaving(true)
    try {
      const diasOrdenados = [...new Set(mailDias)].sort((a, b) => a - b)
      const res = await agenteApi.setConfig({ activo, hora, mail_dias: diasOrdenados })
      setConfig(res.data)
      toast.success(activo ? `Agente activado · Próxima ejecución: ${res.data.proximo_job}` : 'Agente desactivado')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const detenerPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (pasoRef.current) { clearInterval(pasoRef.current); pasoRef.current = null }
  }

  const ejecutarAhora = async () => {
    if (!confirm('¿Ejecutar el agente ahora? Esto descargará AFIP y enviará reportes a todos los clientes con saldo a pagar.')) return
    logIdInicioRef.current = historial[0]?.id ?? null
    setEjecutando(true)
    setPasoActual(0)
    try {
      await agenteApi.ejecutarAhora()
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Error al iniciar agente')
      setEjecutando(false)
      return
    }

    // Avanza pasos cada ~20 segundos (estimación visual)
    pasoRef.current = setInterval(() => {
      setPasoActual(p => Math.min(p + 1, PASOS.length - 1))
    }, 20_000)

    // Polling: verifica cada 8 segundos si apareció un log nuevo
    pollRef.current = setInterval(async () => {
      try {
        const res = await agenteApi.getHistorial()
        const logs = res.data
        const nuevoLog = logs[0]
        if (nuevoLog && nuevoLog.id !== logIdInicioRef.current) {
          detenerPolling()
          setHistorial(logs)
          setEjecutando(false)
          setPasoActual(0)
          const ok = nuevoLog.errores === 0
          toast[ok ? 'success' : 'error'](
            ok
              ? `Agente finalizado — ${nuevoLog.clientes_procesados} clientes, ${nuevoLog.reportes_enviados} reportes enviados`
              : `Agente finalizado con ${nuevoLog.errores} error(es). Revisá el historial.`
          )
        }
      } catch { /* ignore */ }
    }, 8_000)
  }

  const ejecutarBackupAhora = async () => {
    setEjecutandoBackup(true)
    try {
      const res = await agenteApi.ejecutarBackup()
      toast.success((res.data as any).mensaje)
      // Recarga el estado del backup después de unos segundos
      setTimeout(async () => {
        try { const r = await agenteApi.getBackup(); setBackup(r.data) } catch { /* ignore */ }
        setEjecutandoBackup(false)
      }, 5000)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Error al ejecutar backup')
      setEjecutandoBackup(false)
    }
  }

  // Limpia timers si el componente se desmonta
  useEffect(() => () => detenerPolling(), [])

  const ultimoLog = historial[0]

  return (
    <div className="space-y-6">

      {/* Banner de ejecución en curso */}
      {ejecutando && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-3 mb-3">
            <svg className="animate-spin h-5 w-5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <span className="font-semibold text-blue-800 text-sm">Agente en ejecución...</span>
            <span className="ml-auto text-xs text-blue-500">Se actualizará automáticamente al finalizar</span>
          </div>

          {/* Barra de progreso */}
          <div className="w-full bg-blue-100 rounded-full h-1.5 mb-3 overflow-hidden">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-[3000ms] ease-in-out"
              style={{ width: `${Math.round(((pasoActual + 1) / PASOS.length) * 100)}%` }}
            />
          </div>

          {/* Pasos */}
          <div className="flex flex-col gap-1">
            {PASOS.map((paso, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs transition-all ${i < pasoActual ? 'text-blue-400' : i === pasoActual ? 'text-blue-700 font-medium' : 'text-blue-300'}`}>
                {i < pasoActual ? (
                  <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                  </svg>
                ) : i === pasoActual ? (
                  <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"/>
                  </span>
                ) : (
                  <span className="w-3.5 h-3.5 shrink-0"/>
                )}
                {paso}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Agente Automático</h1>
        <p className="text-sm text-gray-500 mt-1">
          Descarga y envía reportes IVA a tus clientes automáticamente cada noche
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : (
        <>
          {/* Panel de configuración */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Config */}
            <div className="card space-y-5">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activo ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                  <svg className={`w-5 h-5 ${activo ? 'text-emerald-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">Configuración del agente</h2>
                  <p className="text-xs text-gray-400">Horario y activación</p>
                </div>
              </div>

              {/* Toggle activo */}
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Agente nocturno</p>
                  <p className="text-xs text-gray-400">Ejecuta automáticamente cada día</p>
                </div>
                <button
                  onClick={() => setActivo(a => !a)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${activo ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Hora */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hora de ejecución (hora Argentina)
                </label>
                <input
                  type="time"
                  className="input"
                  value={hora}
                  onChange={e => setHora(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Recomendado: entre las 01:00 y las 04:00 para no interferir con el uso diario
                </p>
              </div>

              {/* Días de envío de mails */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Días del mes en que se envían mails a clientes
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  El agente descarga <strong>todos los días</strong>, pero solo avisa a los clientes en estas 4 fechas
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="flex flex-col gap-1">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide text-center">
                        Fecha {i + 1}
                      </span>
                      <select
                        className="input text-sm py-1.5 text-center"
                        value={mailDias[i] ?? ''}
                        onChange={e => {
                          const v = parseInt(e.target.value)
                          setMailDias(prev => {
                            const next = [...prev]
                            next[i] = isNaN(v) ? 0 : v
                            return next.filter(d => d > 0).length > 0 ? next : prev
                          })
                        }}
                      >
                        <option value="">—</option>
                        {Array.from({ length: 28 }, (_, d) => d + 1).map(d => (
                          <option key={d} value={d}>Día {d}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                {mailDias.filter(d => d > 0).length > 0 && (
                  <p className="text-xs text-emerald-600 mt-2">
                    ✓ Mails habilitados los días {mailDias.filter(d => d > 0).sort((a,b)=>a-b).join(', ')} de cada mes
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={guardar}
                  disabled={saving}
                  className="btn-primary flex-1"
                >
                  {saving ? 'Guardando...' : 'Guardar configuración'}
                </button>
                <button
                  onClick={ejecutarAhora}
                  disabled={ejecutando}
                  title="Ejecutar ahora sin esperar la hora programada"
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center gap-1.5 ${ejecutando ? 'bg-blue-50 border-blue-200 text-blue-600 cursor-not-allowed' : 'btn-secondary'}`}
                >
                  {ejecutando ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                      Ejecutando
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      Ejecutar ahora
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Estado actual */}
            <div className="card space-y-4">
              <h2 className="font-semibold text-gray-900">Estado actual</h2>

              <div className={`rounded-xl px-4 py-3 border-l-4 ${activo ? 'bg-emerald-50 border-emerald-400' : 'bg-gray-50 border-gray-300'}`}>
                <p className={`text-sm font-semibold ${activo ? 'text-emerald-700' : 'text-gray-500'}`}>
                  {activo ? '● Agente activo' : '○ Agente inactivo'}
                </p>
                {activo && config?.proximo_job && (
                  <p className="text-xs text-emerald-600 mt-0.5">Próxima ejecución: {config.proximo_job}</p>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2 text-gray-600">
                  <span className="text-blue-500 mt-0.5">1.</span>
                  <span>Descarga comprobantes AFIP del mes anterior para <strong>todos los clientes</strong>, cada noche</span>
                </div>
                <div className="flex items-start gap-2 text-gray-600">
                  <span className="text-blue-500 mt-0.5">2.</span>
                  <span>Actualiza la posición IVA visible en el dashboard del contador</span>
                </div>
                <div className="flex items-start gap-2 text-gray-600">
                  <span className="text-emerald-500 mt-0.5">3.</span>
                  <span>
                    Solo en los días configurados, envía el reporte por email a los clientes con saldo a pagar
                    {config?.mail_dias?.length ? (
                      <span className="ml-1 text-emerald-600 font-medium">
                        (días {config.mail_dias.sort((a,b)=>a-b).join(', ')})
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-gray-600">
                  <span className="text-blue-500 mt-0.5">4.</span>
                  <span>Te envía un resumen a vos cada noche con el resultado completo</span>
                </div>
              </div>

              {ultimoLog && (
                <div className="bg-blue-50 rounded-xl px-4 py-3 border border-blue-100">
                  <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">Última ejecución</p>
                  <p className="text-sm text-blue-800 font-medium">
                    {new Date(ultimoLog.ejecutado_en).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Período {ultimoLog.periodo} · {ultimoLog.reportes_enviados} enviado{ultimoLog.reportes_enviados !== 1 ? 's' : ''} · {ultimoLog.errores} error{ultimoLog.errores !== 1 ? 'es' : ''}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Correo saliente */}
          <div className="card space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Correo saliente</h2>
                <p className="text-xs text-gray-400">Desde dónde se envían los reportes a los clientes</p>
              </div>
              {emailConfig?.tiene_password && emailConfig?.email_institucional && (
                <span className="ml-auto px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                  ✓ Configurado
                </span>
              )}
            </div>

            {/* Paso 1: email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email del estudio desde donde se envían los reportes
              </label>
              <input
                type="email"
                className="input"
                placeholder="info@tuestudio.com.ar"
                value={emailForm.email_institucional}
                onChange={e => setEmailForm(f => ({ ...f, email_institucional: e.target.value }))}
              />
            </div>

            {/* Detección automática del proveedor */}
            {emailForm.email_institucional.includes('@') && (
              <div className={`rounded-xl px-4 py-3 border ${proveedorDetectado ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                {proveedorDetectado ? (
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-blue-800">
                      Proveedor detectado: {proveedorDetectado.nombre}
                    </p>
                    <p className="text-xs text-blue-700">{proveedorDetectado.instruccion}</p>
                    {proveedorDetectado.link && (
                      <a
                        href={proveedorDetectado.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 underline font-medium mt-1"
                      >
                        → Ir a generar contraseña de aplicación
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Completá el email para ver las instrucciones de configuración.</p>
                )}
              </div>
            )}

            {/* Paso 2: contraseña */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contraseña
                {emailConfig?.tiene_password && (
                  <span className="ml-2 text-xs text-emerald-600 font-normal">✓ ya configurada — ingresá una nueva para cambiarla</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showSmtpPass ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder={emailConfig?.tiene_password ? 'Dejar vacío para mantener la actual' : 'Contraseña o contraseña de aplicación'}
                  value={emailForm.smtp_password}
                  onChange={e => setEmailForm(f => ({ ...f, smtp_password: e.target.value }))}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                  onClick={() => setShowSmtpPass(s => !s)}
                >
                  {showSmtpPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={guardarEmail}
                disabled={savingEmail}
                className="btn-primary flex-1"
              >
                {savingEmail ? 'Guardando...' : 'Guardar correo saliente'}
              </button>
              {emailConfig?.tiene_password && emailConfig?.email_institucional && (
                <button
                  onClick={probarEmail}
                  disabled={testingEmail}
                  className="btn-secondary px-4"
                  title="Envía un email de prueba a tu cuenta para verificar que funciona"
                >
                  {testingEmail ? (
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                  ) : '✉ Probar envío'}
                </button>
              )}
            </div>
          </div>

          {/* Backup semanal */}
          <div className="card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900">Backup semanal</h2>
                <p className="text-xs text-gray-400">
                  Todos los domingos a las 03:00 se envía un ZIP con la base de datos al correo del estudio
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Último backup */}
              <div className={`rounded-xl px-4 py-3 border-l-4 ${backup?.ultimo ? 'bg-emerald-50 border-emerald-400' : 'bg-gray-50 border-gray-300'}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Último backup realizado</p>
                {backup?.ultimo ? (
                  <>
                    <p className="text-sm font-bold text-emerald-700">{backup.ultimo.fecha_display}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">
                      Enviado a: {backup.ultimo.enviado_a}
                    </p>
                    {backup.ultimo.tamano_bytes && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Tamaño: {(backup.ultimo.tamano_bytes / 1024).toFixed(0)} KB
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Ninguno aún</p>
                )}
              </div>

              {/* Próximo backup */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 border-l-4 border-gray-300">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Próximo backup automático</p>
                {backup?.proximo ? (
                  <p className="text-sm font-bold text-gray-700">{backup.proximo}</p>
                ) : (
                  <p className="text-sm text-gray-400">No programado</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">Todos los domingos a las 03:00 hs (AR)</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={ejecutarBackupAhora}
                disabled={ejecutandoBackup || !emailConfig?.tiene_password}
                className={`btn-secondary flex items-center gap-2 text-sm ${(!emailConfig?.tiene_password) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {ejecutandoBackup ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Generando backup...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Hacer backup ahora
                  </>
                )}
              </button>
              {!emailConfig?.tiene_password && (
                <p className="text-xs text-amber-600">Configurá el correo saliente primero</p>
              )}
            </div>
          </div>

          {/* Historial */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Historial de ejecuciones</h2>

            {historial.length === 0 ? (
              <div className="card text-center py-10 text-gray-400">
                El agente aún no se ejecutó. Activalo y esperá la primera ejecución nocturna,
                o usá el botón ▶ para ejecutar ahora.
              </div>
            ) : (
              <div className="space-y-3">
                {historial.map(log => {
                  const expandido = logExpandido === log.id
                  const fecha = new Date(log.ejecutado_en)
                  return (
                    <div key={log.id} className="card border border-gray-100">
                      {/* Fila resumen */}
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${log.errores === 0 ? 'bg-emerald-100' : 'bg-yellow-100'}`}>
                            {log.errores === 0
                              ? <span className="text-emerald-600 font-bold text-sm">✓</span>
                              : <span className="text-yellow-600 font-bold text-sm">!</span>}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              {' '}
                              <span className="font-normal text-gray-400 text-xs">
                                {fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </p>
                            <p className="text-xs text-gray-400">Período: {log.periodo}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-center">
                          <div>
                            <p className="text-lg font-bold text-gray-800">{log.clientes_procesados}</p>
                            <p className="text-xs text-gray-400">Procesados</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-emerald-600">{log.reportes_enviados}</p>
                            <p className="text-xs text-gray-400">Enviados</p>
                          </div>
                          <div>
                            <p className={`text-lg font-bold ${log.errores > 0 ? 'text-red-500' : 'text-gray-300'}`}>{log.errores}</p>
                            <p className="text-xs text-gray-400">Errores</p>
                          </div>
                          <button
                            onClick={() => setLogExpandido(expandido ? null : log.id)}
                            className="text-xs text-gray-400 hover:text-gray-600 underline shrink-0"
                          >
                            {expandido ? 'Ocultar' : 'Ver detalle'}
                          </button>
                        </div>
                      </div>

                      {/* Detalle expandido */}
                      {expandido && log.detalle && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-gray-400 uppercase">
                                <th className="text-left pb-2">Cliente</th>
                                <th className="text-right pb-2">Saldo</th>
                                <th className="text-center pb-2">Estado</th>
                                <th className="text-left pb-2">Detalle</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {log.detalle.map((d, i) => (
                                <tr key={i}>
                                  <td className="py-2 font-medium text-gray-800">{d.cliente}</td>
                                  <td className="py-2 text-right font-mono text-xs">
                                    {d.saldo !== undefined
                                      ? <span className={d.saldo > 0 ? 'text-red-600' : 'text-emerald-600'}>{$ar(d.saldo)}</span>
                                      : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="py-2 text-center"><BadgeEstado d={d} /></td>
                                  <td className="py-2 text-xs text-gray-400">{d.error ?? ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
