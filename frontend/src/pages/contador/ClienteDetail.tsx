import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { contadorApi, Cliente, ArchivoAfip } from '../../api/client'
import toast from 'react-hot-toast'
import { invalidarCacheDashboard } from './Dashboard'
import { invalidarCacheIVA } from './DashboardIVA'

const fmt = (d: Date) => d.toISOString().slice(0, 10)

function fechaDefault() {
  const hoy = new Date()
  const mesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
  return { desde: fmt(mesAnt), hasta: fmt(ultimoDia) }
}

const ATAJOS: { label: string; desde: () => string; hasta: () => string }[] = [
  {
    label: 'Ayer',
    desde: () => { const d = new Date(); d.setDate(d.getDate() - 1); return fmt(d) },
    hasta: () => { const d = new Date(); d.setDate(d.getDate() - 1); return fmt(d) },
  },
  {
    label: 'Últ. 7 días',
    desde: () => { const d = new Date(); d.setDate(d.getDate() - 6); return fmt(d) },
    hasta: () => fmt(new Date()),
  },
  {
    label: 'Últ. 15 días',
    desde: () => { const d = new Date(); d.setDate(d.getDate() - 14); return fmt(d) },
    hasta: () => fmt(new Date()),
  },
  {
    label: 'Últ. 30 días',
    desde: () => { const d = new Date(); d.setDate(d.getDate() - 29); return fmt(d) },
    hasta: () => fmt(new Date()),
  },
  {
    label: 'Este mes',
    desde: () => { const h = new Date(); return fmt(new Date(h.getFullYear(), h.getMonth(), 1)) },
    hasta: () => fmt(new Date()),
  },
  {
    label: 'Mes pasado',
    desde: () => { const h = new Date(); return fmt(new Date(h.getFullYear(), h.getMonth() - 1, 1)) },
    hasta: () => { const h = new Date(); return fmt(new Date(h.getFullYear(), h.getMonth(), 0)) },
  },
  {
    label: 'Este año',
    desde: () => { const h = new Date(); return fmt(new Date(h.getFullYear(), 0, 1)) },
    hasta: () => fmt(new Date()),
  },
  {
    label: 'Año pasado',
    desde: () => { const h = new Date(); return fmt(new Date(h.getFullYear() - 1, 0, 1)) },
    hasta: () => { const h = new Date(); return fmt(new Date(h.getFullYear() - 1, 11, 31)) },
  },
]

export default function ClienteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const clienteId = Number(id)

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [todosArchivos, setTodosArchivos] = useState<ArchivoAfip[]>([])
  const [loading, setLoading] = useState(true)

  const defaults = fechaDefault()
  const [fechaDesde, setFechaDesde] = useState(defaults.desde)
  const [fechaHasta, setFechaHasta] = useState(defaults.hasta)
  const [tiposSeleccionados, setTiposSeleccionados] = useState<string[]>(['emitidos', 'recibidos'])
  const [descargando, setDescargando] = useState(false)

  // Filtros archivos
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroPeriodo, setFiltroPeriodo] = useState('')
  const [filtroBusqueda, setFiltroBusqueda] = useState('')

  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      try {
        const [clientesRes, archivosRes] = await Promise.all([
          contadorApi.getMisClientes(),
          contadorApi.getArchivosCliente(clienteId),
        ])
        setCliente(clientesRes.data.find((x) => x.id === clienteId) || null)
        setTodosArchivos(archivosRes.data)
      } catch {
        toast.error('Error al cargar datos del cliente')
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [clienteId])

  const toggleTipo = (tipo: string) => {
    setTiposSeleccionados((prev) =>
      prev.includes(tipo) ? prev.filter((t) => t !== tipo) : [...prev, tipo]
    )
  }

  const eliminarArchivo = async (archivoId: number, nombreArchivo: string) => {
    if (!confirm(`¿Eliminar "${nombreArchivo}"?`)) return
    try {
      await contadorApi.eliminarArchivo(archivoId)
      setTodosArchivos((prev) => prev.filter((a) => a.id !== archivoId))
      toast.success('Archivo eliminado')
    } catch {
      toast.error('Error al eliminar el archivo')
    }
  }

  const descargarArchivo = async (archivoId: number, nombreArchivo: string) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/contador/archivos/${archivoId}/descargar`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Error al descargar')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombreArchivo
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Error al descargar el archivo')
    }
  }

  const handleDescargar = async () => {
    if (tiposSeleccionados.length === 0) return toast.error('Seleccioná al menos un tipo')
    if (fechaDesde > fechaHasta) return toast.error('La fecha "desde" no puede ser posterior al "hasta"')

    setDescargando(true)
    try {
      const res = await contadorApi.descargarAfip({
        cliente_id: clienteId,
        periodo_desde: fechaDesde,
        periodo_hasta: fechaHasta,
        tipos: tiposSeleccionados,
      })
      if (res.data.exitoso) {
        toast.success(`${res.data.archivos.length} archivo(s) descargado(s) correctamente`)
        invalidarCacheDashboard()
        invalidarCacheIVA()
        setTodosArchivos((prev) => [...res.data.archivos, ...prev])
      } else {
        res.data.errores.forEach((e) => toast.error(e, { duration: 6000 }))
      }
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Error al conectar con AFIP')
    } finally {
      setDescargando(false)
    }
  }

  const archivosFiltrados = todosArchivos.filter((a) => {
    const matchTipo = filtroTipo === 'todos' || a.tipo === filtroTipo
    const matchPeriodo = !filtroPeriodo || a.periodo.includes(filtroPeriodo)
    const busq = filtroBusqueda.toLowerCase()
    const matchBusqueda = !busq ||
      a.nombre_archivo.toLowerCase().includes(busq) ||
      a.periodo.toLowerCase().includes(busq)
    return matchTipo && matchPeriodo && matchBusqueda
  })

  const formatSize = (bytes?: number) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (iso: string) => {
    // La DB guarda hora argentina directamente — mostrar sin conversión de timezone
    const [datePart, timePart] = iso.split('T')
    const [y, m, d] = datePart.split('-')
    const time = timePart ? timePart.slice(0, 5) : ''
    return `${d}/${m}/${y} ${time}`
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!cliente) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">Cliente no encontrado</p>
        <button onClick={() => navigate('/contador')} className="btn-secondary mt-4">Volver</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/contador')} className="text-gray-400 hover:text-gray-600">
          ← Volver
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{cliente.nombre}</h1>
          <p className="text-gray-500 text-sm">
            CUIT: {cliente.cuit}
            {cliente.representado && cliente.representado !== cliente.nombre && (
              <span className="ml-2 text-blue-600">· Representado: {cliente.representado}</span>
            )}
          </p>
        </div>
      </div>

      {/* Panel de descarga AFIP */}
      <div className="card border-2 border-blue-100 bg-blue-50">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Descargar Comprobantes desde AFIP
        </h2>

        {/* Atajos de período */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {ATAJOS.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => { setFechaDesde(a.desde()); setFechaHasta(a.hasta()) }}
              className="px-2.5 py-1 text-xs font-medium rounded-full border border-blue-300 text-blue-700 bg-white hover:bg-blue-50 hover:border-blue-500 transition-colors"
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha desde</label>
            <input
              type="date"
              className="input"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha hasta</label>
            <input
              type="date"
              className="input"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de comprobantes</label>
            <div className="flex gap-4">
              {[
                { valor: 'emitidos', label: 'Emitidos' },
                { valor: 'recibidos', label: 'Recibidos' },
              ].map(({ valor, label }) => (
                <label key={valor} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tiposSeleccionados.includes(valor)}
                    onChange={() => toggleTipo(valor)}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex-1">
            <button
              onClick={handleDescargar}
              disabled={descargando || tiposSeleccionados.length === 0}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {descargando ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Conectando a AFIP...
                </>
              ) : 'Descargar'}
            </button>
            {descargando && (
              <p className="text-xs text-blue-600 mt-1 text-center">Puede demorar hasta 60 segundos</p>
            )}
          </div>
        </div>
      </div>

      {/* Archivos descargados */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Archivos descargados ({todosArchivos.length})
          </h2>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="text"
            className="input py-1 text-sm flex-1 min-w-[160px]"
            placeholder="Buscar por nombre o período..."
            value={filtroBusqueda}
            onChange={(e) => setFiltroBusqueda(e.target.value)}
          />
          <select
            className="input py-1 text-sm"
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
          >
            <option value="todos">Todos los tipos</option>
            <option value="emitidos">Emitidos</option>
            <option value="recibidos">Recibidos</option>
          </select>
          <select
            className="input py-1 text-sm"
            value={filtroPeriodo}
            onChange={(e) => setFiltroPeriodo(e.target.value)}
          >
            <option value="">Todos los períodos</option>
            {[...new Set(todosArchivos.map((a) => a.periodo))].sort().reverse().map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {archivosFiltrados.length === 0 ? (
          <div className="card text-center py-8 text-gray-400">
            {todosArchivos.length === 0
              ? 'No hay archivos descargados aún'
              : 'No hay archivos con los filtros seleccionados'}
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Archivo</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Período</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tamaño</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Descargado</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {archivosFiltrados.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-700">{a.nombre_archivo}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${a.tipo === 'emitidos' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                        {a.tipo === 'emitidos' ? 'Emitidos' : 'Recibidos'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{a.periodo}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatSize(a.tamanio_bytes)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      <div>{formatDate(a.descargado_en)}</div>
                      <div className="text-xs text-gray-400">{a.descargado_por_usuario.nombre}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => descargarArchivo(a.id, a.nombre_archivo)}
                          className="btn-secondary text-sm py-1"
                        >
                          Bajar
                        </button>
                        <button
                          onClick={() => eliminarArchivo(a.id, a.nombre_archivo)}
                          className="text-sm py-1 px-3 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Eliminar
                        </button>
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
