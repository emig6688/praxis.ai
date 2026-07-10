import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { contadorApi, ResultadoMasivo, ArchivoAfipConCliente, Cliente, User } from '../../api/client'
import toast from 'react-hot-toast'
import { invalidarCacheDashboard } from './Dashboard'
import { invalidarCacheIVA } from './DashboardIVA'

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (d: Date) => d.toISOString().slice(0, 10)

function fechaDefault() {
  const hoy = new Date()
  return {
    desde: fmt(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
    hasta: fmt(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
  }
}

const ATAJOS = [
  { label: 'Ayer',         desde: () => { const d = new Date(); d.setDate(d.getDate()-1); return fmt(d) },  hasta: () => { const d = new Date(); d.setDate(d.getDate()-1); return fmt(d) } },
  { label: 'Últ. 7 días',  desde: () => { const d = new Date(); d.setDate(d.getDate()-6); return fmt(d) },  hasta: () => fmt(new Date()) },
  { label: 'Últ. 15 días', desde: () => { const d = new Date(); d.setDate(d.getDate()-14); return fmt(d) }, hasta: () => fmt(new Date()) },
  { label: 'Últ. 30 días', desde: () => { const d = new Date(); d.setDate(d.getDate()-29); return fmt(d) }, hasta: () => fmt(new Date()) },
  { label: 'Este mes',     desde: () => { const h = new Date(); return fmt(new Date(h.getFullYear(), h.getMonth(), 1)) },    hasta: () => fmt(new Date()) },
  { label: 'Mes pasado',   desde: () => { const h = new Date(); return fmt(new Date(h.getFullYear(), h.getMonth()-1, 1)) }, hasta: () => { const h = new Date(); return fmt(new Date(h.getFullYear(), h.getMonth(), 0)) } },
  { label: 'Este año',     desde: () => { const h = new Date(); return fmt(new Date(h.getFullYear(), 0, 1)) },              hasta: () => fmt(new Date()) },
  { label: 'Año pasado',   desde: () => { const h = new Date(); return fmt(new Date(h.getFullYear()-1, 0, 1)) },            hasta: () => { const h = new Date(); return fmt(new Date(h.getFullYear()-1, 11, 31)) } },
]

const fmtSize = (b?: number) => !b ? '-' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`

const fmtDate = (iso: string) => {
  const [dp, tp] = iso.split('T')
  const [y, m, d] = dp.split('-')
  return `${d}/${m}/${y} ${tp?.slice(0,5) ?? ''}`
}

// ── componente ────────────────────────────────────────────────────────────────
export default function DescargaMasiva() {
  const navigate = useNavigate()
  const defaults = fechaDefault()

  // descarga
  const [fechaDesde, setFechaDesde] = useState(defaults.desde)
  const [fechaHasta, setFechaHasta] = useState(defaults.hasta)
  const [tipos, setTipos] = useState<string[]>(['emitidos', 'recibidos'])
  const [descargando, setDescargando] = useState(false)
  const [resultados, setResultados] = useState<ResultadoMasivo[] | null>(null)

  // clientes (para filtros de descarga)
  const [clientes, setClientes] = useState<Cliente[]>([])

  // archivos persistidos
  const [archivos, setArchivos] = useState<ArchivoAfipConCliente[]>([])
  const [cargandoArchivos, setCargandoArchivos] = useState(true)

  // ── filtros DESCARGA ──────────────────────────────────────────────────────
  const [filtroDescTexto, setFiltroDescTexto]       = useState('')
  const [filtroDescContador, setFiltroDescContador] = useState('')
  const [filtroDescRep, setFiltroDescRep]           = useState('')

  // ── filtros ARCHIVO TABLE ─────────────────────────────────────────────────
  const [filtroBusqueda, setFiltroBusqueda] = useState('')
  const [filtroCliente, setFiltroCliente]   = useState('')
  const [filtroTipo, setFiltroTipo]         = useState('todos')
  const [filtroPeriodo, setFiltroPeriodo]   = useState('')

  // ── cargar clientes y archivos al montar ──────────────────────────────────
  useEffect(() => {
    contadorApi.getMisClientes().then(r => setClientes(r.data)).catch(() => {})
    contadorApi.getTodosArchivos()
      .then(r => setArchivos(r.data))
      .catch(() => toast.error('Error al cargar archivos'))
      .finally(() => setCargandoArchivos(false))
  }, [])

  const toggleTipo = (t: string) =>
    setTipos(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  // Contadores únicos de todos los clientes (para el dropdown de descarga)
  const contadoresUnicos: User[] = Array.from(
    new Map(
      clientes.flatMap(c => c.contadores ?? []).map(u => [u.id, u])
    ).values()
  ).sort((a, b) => a.nombre.localeCompare(b.nombre))

  // Clientes filtrados por texto (base para derivar representados disponibles)
  const clientesFiltradosPorTexto = clientes.filter(c => {
    const busq = filtroDescTexto.toLowerCase()
    const matchTexto = !busq ||
      c.nombre.toLowerCase().includes(busq) ||
      c.cuit.includes(busq)
    const matchContador = !filtroDescContador ||
      (c.contadores ?? []).some(u => String(u.id) === filtroDescContador)
    return matchTexto && matchContador
  })

  // Representados únicos disponibles según clientes ya filtrados por texto/contador
  const representadosDescDisponibles = Array.from(
    new Set(clientesFiltradosPorTexto.map(c => c.representado).filter(Boolean))
  ).sort() as string[]

  // Clientes que pasan TODOS los filtros de descarga
  const clientesFiltradosParaDescarga = clientesFiltradosPorTexto.filter(c =>
    !filtroDescRep || c.representado === filtroDescRep
  )

  const hayFiltroDesc = !!filtroDescTexto || !!filtroDescContador || !!filtroDescRep

  // ── descarga masiva ───────────────────────────────────────────────────────
  const handleDescargar = async () => {
    if (tipos.length === 0) return toast.error('Seleccioná al menos un tipo')
    if (fechaDesde > fechaHasta) return toast.error('"Desde" no puede ser posterior a "Hasta"')
    if (hayFiltroDesc && clientesFiltradosParaDescarga.length === 0)
      return toast.error('No hay clientes que coincidan con el filtro')

    setDescargando(true)
    setResultados(null)
    try {
      const payload: any = { periodo_desde: fechaDesde, periodo_hasta: fechaHasta, tipos }
      if (hayFiltroDesc) {
        payload.cliente_ids = clientesFiltradosParaDescarga.map(c => c.id)
      }
      const res = await contadorApi.descargarAfipMasivo(payload)
      setResultados(res.data)
      const nuevos = res.data.flatMap(r => r.archivos)
      if (nuevos.length) {
        invalidarCacheDashboard()
        invalidarCacheIVA()
        const updated = await contadorApi.getTodosArchivos()
        setArchivos(updated.data)
      }
      const ok = res.data.filter(r => r.exitoso).length
      const err = res.data.filter(r => !r.exitoso).length
      if (err === 0) toast.success(`${ok} cliente${ok !== 1 ? 's' : ''} descargado${ok !== 1 ? 's' : ''} correctamente`)
      else toast(`${ok} OK · ${err} con errores`, { icon: '⚠️' })
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Error al conectar con AFIP')
    } finally {
      setDescargando(false)
    }
  }

  const descargarArchivo = async (archivoId: number, nombreArchivo: string) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/contador/archivos/${archivoId}/descargar`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = nombreArchivo; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Error al descargar') }
  }

  const eliminarArchivo = async (archivoId: number) => {
    if (!confirm('¿Eliminar este archivo?')) return
    try {
      await contadorApi.eliminarArchivo(archivoId)
      setArchivos(prev => prev.filter(a => a.id !== archivoId))
      toast.success('Archivo eliminado')
    } catch { toast.error('Error al eliminar') }
  }

  // ── opciones únicas para dropdowns de tabla ───────────────────────────────
  const clientesUnicos = Array.from(
    new Map(archivos.map(a => [a.cliente_cuit, { cuit: a.cliente_cuit, nombre: a.cliente_nombre }])).values()
  ).sort((a, b) => a.nombre.localeCompare(b.nombre))

  const periodosUnicos = [...new Set(archivos.map(a => a.periodo))].sort().reverse()

  // ── filtrado tabla archivos ───────────────────────────────────────────────
  const filtrados = archivos.filter(a => {
    const busq = filtroBusqueda.toLowerCase()
    const matchBusq = !busq ||
      a.nombre_archivo.toLowerCase().includes(busq) ||
      a.cliente_nombre.toLowerCase().includes(busq) ||
      a.cliente_cuit.includes(busq) ||
      a.periodo.includes(busq)
    const matchCliente = !filtroCliente || a.cliente_cuit === filtroCliente
    const matchTipo = filtroTipo === 'todos' || a.tipo === filtroTipo
    const matchPeriodo = !filtroPeriodo || a.periodo.includes(filtroPeriodo)
    return matchBusq && matchCliente && matchTipo && matchPeriodo
  })

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/contador')} className="text-gray-400 hover:text-gray-600">← Volver</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Descarga Masiva</h1>
          <p className="text-gray-500 text-sm">Descargá comprobantes de todos tus clientes en un solo paso</p>
        </div>
      </div>

      {/* Panel de descarga */}
      <div className="card border-2 border-blue-100 bg-blue-50 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Período de descarga</h2>

        {/* Atajos */}
        <div className="flex flex-wrap gap-1.5">
          {ATAJOS.map(a => (
            <button key={a.label} type="button"
              onClick={() => { setFechaDesde(a.desde()); setFechaHasta(a.hasta()) }}
              className="px-2.5 py-1 text-xs font-medium rounded-full border border-blue-300 text-blue-700 bg-white hover:bg-blue-50 hover:border-blue-500 transition-colors"
            >{a.label}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha desde</label>
            <input type="date" className="input" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha hasta</label>
            <input type="date" className="input" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
          </div>
        </div>

        {/* Filtros de clientes para descarga */}
        <div className="bg-white rounded-lg border border-blue-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Filtrar clientes para descarga
            {hayFiltroDesc && (
              <span className="ml-2 text-blue-600 normal-case font-normal">
                → {clientesFiltradosParaDescarga.length} de {clientes.length} clientes
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              className="input py-1 text-sm flex-1 min-w-[180px]"
              placeholder="Buscar por razón social o CUIT..."
              value={filtroDescTexto}
              onChange={e => { setFiltroDescTexto(e.target.value); setFiltroDescRep('') }}
            />
            {representadosDescDisponibles.length > 1 && (
              <select
                className="input py-1 text-sm min-w-[200px]"
                value={filtroDescRep}
                onChange={e => setFiltroDescRep(e.target.value)}
              >
                <option value="">Todos los representados</option>
                {representadosDescDisponibles.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            )}
            {contadoresUnicos.length > 0 && (
              <select
                className="input py-1 text-sm min-w-[200px]"
                value={filtroDescContador}
                onChange={e => setFiltroDescContador(e.target.value)}
              >
                <option value="">Todos los contadores</option>
                {contadoresUnicos.map(u => (
                  <option key={u.id} value={String(u.id)}>{u.nombre}</option>
                ))}
              </select>
            )}
            {hayFiltroDesc && (
              <button
                className="text-xs text-gray-400 hover:text-gray-600 underline shrink-0"
                onClick={() => { setFiltroDescTexto(''); setFiltroDescContador(''); setFiltroDescRep('') }}
              >
                Limpiar filtro
              </button>
            )}
          </div>
          {hayFiltroDesc && clientesFiltradosParaDescarga.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {clientesFiltradosParaDescarga.slice(0, 8).map(c => (
                <span key={c.id} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">{c.nombre}</span>
              ))}
              {clientesFiltradosParaDescarga.length > 8 && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">+{clientesFiltradosParaDescarga.length - 8} más</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
            <div className="flex gap-4">
              {[{ v: 'emitidos', l: 'Emitidos' }, { v: 'recibidos', l: 'Recibidos' }].map(({ v, l }) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={tipos.includes(v)} onChange={() => toggleTipo(v)} className="rounded" />
                  <span className="text-sm font-medium">{l}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <button onClick={handleDescargar} disabled={descargando || tipos.length === 0}
              className="btn-primary w-full flex items-center justify-center gap-2">
              {descargando ? (
                <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>Descargando...</>
              ) : hayFiltroDesc
                ? `Descargar ${clientesFiltradosParaDescarga.length} cliente${clientesFiltradosParaDescarga.length !== 1 ? 's' : ''} (filtrado)`
                : 'Descargar para todos los clientes'}
            </button>
            {descargando && <p className="text-xs text-blue-600 mt-1 text-center">Puede demorar varios minutos. No cerres esta ventana.</p>}
          </div>
        </div>
      </div>

      {/* Resumen última descarga */}
      {resultados && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-4">
            <div className="card border-l-4 border-blue-400">
              <p className="text-xs text-gray-500 uppercase font-medium">Procesados</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{resultados.length}</p>
            </div>
            <div className="card border-l-4 border-emerald-400">
              <p className="text-xs text-gray-500 uppercase font-medium">Con éxito</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{resultados.filter(r => r.exitoso).length}</p>
            </div>
            <div className={`card border-l-4 ${resultados.some(r => !r.exitoso) ? 'border-red-400' : 'border-gray-200'}`}>
              <p className="text-xs text-gray-500 uppercase font-medium">Con errores</p>
              <p className={`text-2xl font-bold mt-1 ${resultados.some(r => !r.exitoso) ? 'text-red-600' : 'text-gray-400'}`}>
                {resultados.filter(r => !r.exitoso).length}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            {resultados.map(r => (
              <div key={r.cliente_id} className={`card py-2.5 px-4 flex items-center justify-between gap-3 border-l-4 ${r.exitoso ? 'border-emerald-400' : 'border-red-400'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span>{r.exitoso ? '✅' : '❌'}</span>
                  <div className="min-w-0">
                    <button onClick={() => navigate(`/contador/cliente/${r.cliente_id}`)}
                      className="font-medium text-gray-900 hover:text-primary-600 text-left truncate block">
                      {r.cliente_nombre}
                    </button>
                    {r.exitoso
                      ? <p className="text-xs text-gray-400">{r.archivos.length} archivo{r.archivos.length !== 1 ? 's' : ''}</p>
                      : <p className="text-xs text-red-500 truncate">{r.errores.join(' · ')}</p>}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${r.exitoso ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {r.exitoso ? 'OK' : 'Error'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Archivos guardados ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Archivos descargados{!cargandoArchivos && ` (${filtrados.length}${filtrados.length !== archivos.length ? ` de ${archivos.length}` : ''})`}
          </h2>
        </div>

        {/* Filtros tabla */}
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="text"
            className="input py-1 text-sm flex-1 min-w-[180px]"
            placeholder="Buscar por nombre, CUIT, archivo o período..."
            value={filtroBusqueda}
            onChange={e => setFiltroBusqueda(e.target.value)}
          />
          <select className="input py-1 text-sm min-w-[180px]" value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clientesUnicos.map(c => (
              <option key={c.cuit} value={c.cuit}>{c.nombre} · {c.cuit}</option>
            ))}
          </select>
          <select className="input py-1 text-sm" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="todos">Todos los tipos</option>
            <option value="emitidos">Emitidos</option>
            <option value="recibidos">Recibidos</option>
          </select>
          <select className="input py-1 text-sm" value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)}>
            <option value="">Todos los períodos</option>
            {periodosUnicos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {cargandoArchivos ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="card text-center py-8 text-gray-400">
            {archivos.length === 0 ? 'No hay archivos descargados aún' : 'Sin resultados para los filtros seleccionados'}
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">CUIT</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Archivo</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Período</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tamaño</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Descargado</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-700">
                      <button onClick={() => navigate(`/contador/cliente/${a.cliente_id}`)}
                        className="hover:text-primary-600 text-left">
                        {a.cliente_nombre}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500">{a.cliente_cuit}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-400 max-w-[160px] truncate" title={a.nombre_archivo}>{a.nombre_archivo}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${a.tipo === 'emitidos' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                        {a.tipo === 'emitidos' ? 'Emitidos' : 'Recibidos'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{a.periodo}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{fmtSize(a.tamanio_bytes)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      <div>{fmtDate(a.descargado_en)}</div>
                      <div className="text-gray-300">{a.descargado_por_usuario?.nombre}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => descargarArchivo(a.id, a.nombre_archivo)}
                          className="btn-secondary text-sm py-1">Bajar</button>
                        <button onClick={() => eliminarArchivo(a.id)}
                          className="text-sm py-1 px-3 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
