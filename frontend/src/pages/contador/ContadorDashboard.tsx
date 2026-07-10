import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { contadorApi, Cliente, User } from '../../api/client'
import toast from 'react-hot-toast'

export default function ContadorDashboard() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroCliente, setFiltroCliente]       = useState('')
  const [filtroRepresentado, setFiltroRepresentado] = useState('')
  const [filtroContador, setFiltroContador]     = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    contadorApi.getMisClientes()
      .then((res) => setClientes(res.data))
      .catch(() => toast.error('Error al cargar clientes'))
      .finally(() => setLoading(false))
  }, [])

  const contadoresUnicos: User[] = Array.from(
    new Map(
      clientes.flatMap((c) => c.contadores ?? []).map((u) => [u.id, u])
    ).values()
  ).sort((a, b) => a.nombre.localeCompare(b.nombre))

  // Clientes que pasan el filtro de nombre/CUIT (sin aplicar aún representado ni contador)
  const filtradosPorCliente = clientes.filter((c) => {
    if (!filtroCliente) return true
    const b = filtroCliente.toLowerCase()
    const bN = b.replace(/\D/g, '')
    const cN = c.cuit.replace(/\D/g, '')
    return c.nombre.toLowerCase().includes(b) || (bN ? cN.includes(bN) : c.cuit.includes(b))
  })

  // Representados disponibles según los clientes ya filtrados por cliente
  const representadosDisponibles = Array.from(
    new Set(
      filtradosPorCliente
        .map((c) => c.representado || c.nombre)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b))

  const hayFiltro = filtroCliente || filtroRepresentado || filtroContador

  const filtrados = filtradosPorCliente.filter((c) => {
    // filtro representado (ahora select)
    if (filtroRepresentado) {
      const rep = c.representado || c.nombre
      if (rep !== filtroRepresentado) return false
    }
    // filtro contador
    if (filtroContador) {
      if (!(c.contadores ?? []).some((u) => String(u.id) === filtroContador)) return false
    }
    return true
  })

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Mis Clientes</h1>
        <p className="text-gray-500 text-sm mt-1">
          {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} asignado{clientes.length !== 1 ? 's' : ''}
          {hayFiltro && filtrados.length !== clientes.length && (
            <span className="ml-2 text-primary-600">· mostrando {filtrados.length}</span>
          )}
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          className="input flex-1 min-w-[180px]"
          placeholder="Buscar por razón social o CUIT..."
          value={filtroCliente}
          onChange={(e) => { setFiltroCliente(e.target.value); setFiltroRepresentado('') }}
        />
        {representadosDisponibles.length > 1 && (
          <select
            className="input min-w-[200px]"
            value={filtroRepresentado}
            onChange={(e) => setFiltroRepresentado(e.target.value)}
          >
            <option value="">Todos los representados</option>
            {representadosDisponibles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        )}
        {contadoresUnicos.length > 0 && (
          <select
            className="input min-w-[180px]"
            value={filtroContador}
            onChange={(e) => setFiltroContador(e.target.value)}
          >
            <option value="">Todos los contadores</option>
            {contadoresUnicos.map((u) => (
              <option key={u.id} value={String(u.id)}>{u.nombre}</option>
            ))}
          </select>
        )}
        {hayFiltro && (
          <button
            className="text-xs text-gray-400 hover:text-gray-600 underline shrink-0 self-center"
            onClick={() => { setFiltroCliente(''); setFiltroRepresentado(''); setFiltroContador('') }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-lg">
            {hayFiltro ? 'No se encontraron resultados' : 'No tenés clientes asignados'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((c) => {
            const rep = c.representado && c.representado !== c.nombre ? c.representado : null
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/contador/cliente/${c.id}`)}
                className="card text-left hover:shadow-md hover:border-primary-200 transition-all group border-2 border-transparent"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-700 font-bold text-lg shrink-0">
                    {c.nombre.charAt(0).toUpperCase()}
                  </div>
                  <span className={`badge ${c.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {c.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {/* Nombre del cliente */}
                <h3 className="font-semibold text-gray-900 group-hover:text-primary-700 transition-colors leading-tight">
                  {c.nombre}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5 font-mono">CUIT: {c.cuit}</p>

                {/* Representado AFIP — solo si difiere del nombre */}
                {rep && (
                  <div className="mt-2 flex items-start gap-1.5">
                    <span className="text-xs text-gray-400 shrink-0 mt-0.5">Rep.:</span>
                    <span className="text-xs text-gray-600 font-medium leading-tight">{rep}</span>
                  </div>
                )}

                {c.email && <p className="text-xs text-gray-400 mt-1">{c.email}</p>}

                {(c.contadores ?? []).length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {c.contadores!.map((u) => u.nombre).join(', ')}
                  </p>
                )}

                <div className="mt-3 text-xs text-primary-600 font-medium group-hover:underline">
                  Ver detalle →
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
