import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { contadorApi, IVAClienteData, ResultadoEnvioReporte } from '../../api/client'
import { $ar, mesAnterior } from '../../utils/format'
import toast from 'react-hot-toast'

export default function Reportes() {
  const navigate = useNavigate()
  const [periodo, setPeriodo]   = useState(mesAnterior())
  const [datos, setDatos]       = useState<IVAClienteData[]>([])
  const [loading, setLoading]   = useState(false)
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [resultados, setResultados] = useState<ResultadoEnvioReporte[] | null>(null)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroEnvio, setFiltroEnvio]   = useState<'todos' | 'enviado' | 'error' | 'pendiente'>('todos')

  const cargar = async () => {
    setLoading(true)
    setResultados(null)
    setSeleccionados(new Set())
    try {
      const res = await contadorApi.getDashboardIVA(periodo)
      setDatos(res.data)
    } catch {
      toast.error('Error al cargar datos de IVA')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [periodo])

  // Solo clientes con descargas Y saldo a pagar
  const datosConDatos = datos.filter(d =>
    (d.tiene_emitidos || d.tiene_recibidos) && d.saldo > 0
  )

  const datosFiltrados = datosConDatos.filter(d => {
    if (filtroCliente && !d.cliente_nombre.toLowerCase().includes(filtroCliente.toLowerCase())) return false
    if (filtroEnvio !== 'todos') {
      const res = resultados?.find(r => r.cliente_id === d.cliente_id)
      if (filtroEnvio === 'enviado'   && !(res?.enviado === true))  return false
      if (filtroEnvio === 'error'     && !(res?.enviado === false)) return false
      if (filtroEnvio === 'pendiente' && res !== undefined)         return false
    }
    return true
  })

  const toggleSeleccion = (id: number) => {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const seleccionarTodos = () => {
    const ids = datosFiltrados.map(d => d.cliente_id)
    const todosSeleccionados = ids.every(id => seleccionados.has(id))
    if (todosSeleccionados) {
      setSeleccionados(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSeleccionados(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.add(id))
        return next
      })
    }
  }

  const todosSeleccionados = datosFiltrados.length > 0 &&
    datosFiltrados.every(d => seleccionados.has(d.cliente_id))

  const handleEnviar = async () => {
    if (seleccionados.size === 0) return toast.error('Seleccioná al menos un cliente')
    if (!confirm(`¿Enviar reporte de IVA a ${seleccionados.size} cliente${seleccionados.size !== 1 ? 's' : ''}?`))
      return

    setEnviando(true)
    setResultados(null)
    try {
      const res = await contadorApi.enviarReportesIva({
        periodo,
        cliente_ids: Array.from(seleccionados),
      })
      setResultados(res.data)
      const ok  = res.data.filter(r => r.enviado).length
      const err = res.data.filter(r => !r.enviado).length
      if (err === 0)  toast.success(`${ok} reporte${ok !== 1 ? 's' : ''} enviado${ok !== 1 ? 's' : ''} correctamente`)
      else            toast(`${ok} enviado${ok !== 1 ? 's' : ''} · ${err} con error`, { icon: '⚠️' })
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Error al enviar reportes')
    } finally {
      setEnviando(false)
    }
  }

  const saldoTotal = datos.reduce((s, d) => s + d.saldo, 0)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/contador')} className="text-gray-400 hover:text-gray-600">
            ← Volver
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reportes IVA</h1>
            <p className="text-sm text-gray-500">Informá la posición fiscal a tus clientes por email</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Período:</label>
          <input
            type="month"
            className="input py-1.5 text-sm"
            value={periodo}
            onChange={e => setPeriodo(e.target.value)}
          />
        </div>
      </div>

      {/* Resumen rápido */}
      {!loading && datos.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card border-l-4 border-red-400">
            <p className="text-xs text-gray-500 uppercase font-medium">A informar (a pagar)</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{datosConDatos.length}</p>
          </div>
          <div className="card border-l-4 border-gray-300">
            <p className="text-xs text-gray-500 uppercase font-medium">Sin posición fiscal</p>
            <p className="text-2xl font-bold text-gray-400 mt-1">
              {datos.filter(d => !d.tiene_emitidos && !d.tiene_recibidos).length}
            </p>
          </div>
          <div className="card border-l-4 border-emerald-400">
            <p className="text-xs text-gray-500 uppercase font-medium">Saldo a favor</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {datos.filter(d => (d.tiene_emitidos || d.tiene_recibidos) && d.saldo < 0).length}
            </p>
          </div>
        </div>
      )}

      {/* Barra de acción */}
      <div className="flex items-center gap-3 flex-wrap bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
        <input
          className="input py-1.5 text-sm flex-1 min-w-[180px]"
          placeholder="Buscar cliente..."
          value={filtroCliente}
          onChange={e => setFiltroCliente(e.target.value)}
        />
        {resultados && (
          <select
            className="input py-1.5 text-sm shrink-0"
            value={filtroEnvio}
            onChange={e => setFiltroEnvio(e.target.value as typeof filtroEnvio)}
          >
            <option value="todos">Todos los resultados</option>
            <option value="enviado">✓ Enviados</option>
            <option value="error">✗ Con error</option>
            <option value="pendiente">— Sin enviar</option>
          </select>
        )}
        <span className="text-sm text-gray-500 shrink-0">
          {seleccionados.size > 0
            ? `${seleccionados.size} seleccionado${seleccionados.size !== 1 ? 's' : ''}`
            : 'Ninguno seleccionado'}
        </span>
        <button
          className="btn-secondary text-sm py-1.5 shrink-0"
          onClick={seleccionarTodos}
          disabled={datosFiltrados.length === 0}
        >
          {todosSeleccionados ? 'Deseleccionar todos' : 'Seleccionar todos'}
        </button>
        <button
          onClick={handleEnviar}
          disabled={enviando || seleccionados.size === 0}
          className="btn-primary text-sm py-1.5 shrink-0 flex items-center gap-2"
        >
          {enviando ? (
            <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>Enviando...</>
          ) : (
            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Informar reporte ({seleccionados.size})</>
          )}
        </button>
      </div>

      {/* Tabla de clientes */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : datosFiltrados.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          {datos.length === 0
            ? 'No hay datos de IVA para el período seleccionado. Descargá los comprobantes primero.'
            : datosConDatos.length === 0
            ? 'Ningún cliente tiene saldo a pagar para este período.'
            : 'Sin resultados para la búsqueda.'}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={todosSeleccionados}
                    onChange={seleccionarTodos}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">IVA Ventas</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">IVA Compras</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo estimado</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Resultado envío</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {datosFiltrados.map(d => {
                const resultado = resultados?.find(r => r.cliente_id === d.cliente_id)
                const seleccionado = seleccionados.has(d.cliente_id)
                return (
                  <tr
                    key={d.cliente_id}
                    className={`hover:bg-gray-50 transition-colors ${seleccionado ? 'bg-blue-50/40' : ''}`}
                    onClick={() => toggleSeleccion(d.cliente_id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={seleccionado}
                        onChange={() => toggleSeleccion(d.cliente_id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 text-sm">{d.cliente_nombre}</p>
                      <p className="text-xs text-gray-400 font-mono">{d.cliente_cuit}</p>
                      {d.cliente_representado && (
                        <p className="text-xs text-primary-600 mt-0.5">Rep. AFIP: {d.cliente_representado}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">
                        Período: {(() => {
                          const [y, m] = periodo.split('-')
                          return new Date(+y, +m - 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
                        })()}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-blue-700">
                      {$ar(d.iva_ventas)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-emerald-700">
                      {$ar(d.iva_compras)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold font-mono text-sm ${
                        d.saldo > 0 ? 'text-red-600' : d.saldo < 0 ? 'text-emerald-600' : 'text-gray-400'
                      }`}>
                        {d.saldo > 0 ? '+' : ''}{$ar(d.saldo)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {d.saldo > 0 ? (
                        <span className="px-2 py-0.5 text-xs rounded-full font-semibold bg-red-100 text-red-700">⚠ A pagar</span>
                      ) : d.saldo < 0 ? (
                        <span className="px-2 py-0.5 text-xs rounded-full font-semibold bg-emerald-100 text-emerald-700">✓ A favor</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">Neutro</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {resultado ? (
                        resultado.enviado ? (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓ Enviado</span>
                        ) : (
                          <span
                            className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 font-semibold cursor-help"
                            title={resultado.error ?? ''}
                          >
                            ✗ Error
                          </span>
                        )
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalle de resultados si hubo errores */}
      {resultados && resultados.some(r => !r.enviado) && (
        <div className="card border border-red-200 bg-red-50 space-y-2">
          <p className="text-sm font-semibold text-red-700">Errores al enviar</p>
          {resultados.filter(r => !r.enviado).map(r => (
            <div key={r.cliente_id} className="text-xs text-red-600 bg-white rounded px-3 py-2 border border-red-100">
              <span className="font-semibold">{r.cliente_nombre}:</span> {r.error}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
