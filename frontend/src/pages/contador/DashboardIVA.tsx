import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { contadorApi, IVAClienteData } from '../../api/client'
import { getCachedIVA, setCachedIVA, ivaStale, invalidarCacheIVA } from '../../api/cache'
import { $ar, mesActual } from '../../utils/format'
import toast from 'react-hot-toast'

export { invalidarCacheIVA }

function TarjetaResumen({ label, valor, color }: { label: string; valor: number; color: string }) {
  return (
    <div className={`card border-l-4 ${color}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{$ar(valor)}</p>
    </div>
  )
}

function DetalleAlicuotas({ datos, label }: { datos: IVAClienteData['detalle_ventas']; label: string }) {
  const items = [
    { k: 'iva_21', l: '21%' },
    { k: 'iva_105', l: '10.5%' },
    { k: 'iva_27', l: '27%' },
    { k: 'iva_5', l: '5%' },
    { k: 'iva_25', l: '2.5%' },
  ] as const
  const conValor = items.filter((i) => (datos[i.k] ?? 0) !== 0)
  if (conValor.length === 0) return <span className="text-gray-400 text-xs">Sin datos</span>
  return (
    <div className="text-xs space-y-0.5">
      {conValor.map((i) => (
        <div key={i.k} className="flex justify-between gap-4">
          <span className="text-gray-500">IVA {i.l}</span>
          <span className="font-mono">{$ar(datos[i.k])}</span>
        </div>
      ))}
    </div>
  )
}

export default function DashboardIVA() {
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState(mesActual())
  const cached = getCachedIVA(periodo)
  const [datos, setDatos] = useState<IVAClienteData[]>(cached?.data ?? [])
  const [loading, setLoading] = useState(!cached)
  const [expandido, setExpandido] = useState<number | null>(null)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroRep, setFiltroRep] = useState('')

  const cargar = async (p: string, bg = false) => {
    if (!bg) setLoading(true)
    try {
      const res = await contadorApi.getDashboardIVA(p)
      setCachedIVA(p, res.data)
      setDatos(res.data)
    } catch {
      toast.error('Error al cargar dashboard IVA')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const entry = getCachedIVA(periodo)
    if (!ivaStale(periodo)) { setDatos(entry!.data); setLoading(false); return }
    const hasCached = !!entry
    if (hasCached) setDatos(entry!.data)
    cargar(periodo, hasCached)
  }, [periodo])

  const totalVentas = datos.reduce((s, d) => s + d.iva_ventas, 0)
  const totalCompras = datos.reduce((s, d) => s + d.iva_compras, 0)
  const saldoTotal = totalVentas - totalCompras
  // Datos filtrados por cliente (base para el select de representado)
  const filtradosPorCliente = datos.filter((d) => {
    if (!filtroCliente) return true
    const b = filtroCliente.toLowerCase()
    return d.cliente_nombre.toLowerCase().includes(b)
  })

  const representadosDisponibles = Array.from(
    new Set(filtradosPorCliente.map((d) => d.cliente_representado).filter(Boolean))
  ).sort() as string[]

  const datosFiltrados = filtradosPorCliente.filter((d) => {
    if (filtroRep && d.cliente_representado !== filtroRep) return false
    return true
  })

  const conDatos = datosFiltrados.filter((d) => d.tiene_emitidos || d.tiene_recibidos)
  const sinDatos = datosFiltrados.filter((d) => !d.tiene_emitidos && !d.tiene_recibidos)

  const hayFiltro = filtroCliente || filtroRep

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/contador')} className="text-gray-400 hover:text-gray-600">
            ← Volver
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Estimado IVA</h1>
            <p className="text-sm text-gray-500">Estimado de posición fiscal por cliente</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Período:</label>
          <input
            type="month"
            className="input py-1.5 text-sm"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
          />
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TarjetaResumen label="Total IVA Ventas (Débito Fiscal)" valor={totalVentas} color="border-blue-500" />
        <TarjetaResumen label="Total IVA Compras (Crédito Fiscal)" valor={totalCompras} color="border-green-500" />
        <div className={`card border-l-4 ${saldoTotal > 0 ? 'border-red-500 bg-red-50' : saldoTotal < 0 ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300'}`}>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Saldo Estimado Total</p>
          <p className={`text-2xl font-bold mt-1 ${saldoTotal > 0 ? 'text-red-700' : saldoTotal < 0 ? 'text-emerald-700' : 'text-gray-700'}`}>
            {$ar(Math.abs(saldoTotal))}
          </p>
          <p className={`text-sm font-medium mt-0.5 ${saldoTotal > 0 ? 'text-red-600' : saldoTotal < 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
            {saldoTotal > 0 ? '▲ A pagar a AFIP' : saldoTotal < 0 ? '▼ Saldo a favor' : 'Sin movimientos'}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <input
          className="input flex-1 min-w-[180px]"
          placeholder="Buscar cliente..."
          value={filtroCliente}
          onChange={(e) => { setFiltroCliente(e.target.value); setFiltroRep('') }}
        />
        {representadosDisponibles.length > 1 && (
          <select
            className="input min-w-[200px]"
            value={filtroRep}
            onChange={(e) => setFiltroRep(e.target.value)}
          >
            <option value="">Todos los representados</option>
            {representadosDisponibles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        )}
        {hayFiltro && (
          <button
            className="text-xs text-gray-400 hover:text-gray-600 underline self-center"
            onClick={() => { setFiltroCliente(''); setFiltroRep('') }}
          >
            Limpiar
          </button>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      )}

      {!loading && conDatos.length === 0 && datos.length > 0 && (
        <div className="card text-center py-10 text-gray-400">
          No hay archivos descargados para el período <strong>{periodo}</strong>.<br />
          Descargá los comprobantes desde la ficha de cada cliente primero.
        </div>
      )}

      {!loading && conDatos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Detalle por cliente
          </h2>

          {conDatos.map((d) => (
            <div
              key={d.cliente_id}
              className={`card border-l-4 ${
                d.alerta === 'pagar' ? 'border-red-400' :
                d.alerta === 'favor' ? 'border-emerald-400' : 'border-gray-200'
              }`}
            >
              {/* Fila principal */}
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                {/* Nombre + alerta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => navigate(`/contador/cliente/${d.cliente_id}`)}
                      className="font-semibold text-gray-900 hover:text-primary-600 text-left"
                    >
                      {d.cliente_nombre}
                    </button>
                    {d.alerta === 'pagar' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                        ⚠ A pagar
                      </span>
                    )}
                    {d.alerta === 'favor' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                        ✓ Saldo a favor
                      </span>
                    )}
                    {!d.tiene_emitidos && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">Sin emitidos</span>
                    )}
                    {!d.tiene_recibidos && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">Sin recibidos</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    CUIT {d.cliente_cuit}
                    {d.periodos_usados.length > 0 && (
                      <span className="ml-2">· Períodos: {d.periodos_usados.join(', ')}</span>
                    )}
                  </p>
                  {d.cliente_representado && (
                    <p className="text-xs text-primary-600 mt-0.5 font-medium">
                      Rep. AFIP: {d.cliente_representado}
                    </p>
                  )}
                </div>

                {/* Cifras */}
                <div className="grid grid-cols-3 gap-4 text-right shrink-0">
                  <div>
                    <p className="text-xs text-gray-400">IVA Ventas</p>
                    <p className="font-semibold text-blue-700">{$ar(d.iva_ventas)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">IVA Compras</p>
                    <p className="font-semibold text-green-700">{$ar(d.iva_compras)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Saldo estimado</p>
                    <p className={`font-bold text-lg ${d.saldo > 0 ? 'text-red-600' : d.saldo < 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
                      {d.saldo > 0 ? '+' : ''}{$ar(d.saldo)}
                    </p>
                  </div>
                </div>

                {/* Toggle detalle */}
                <button
                  onClick={() => setExpandido(expandido === d.cliente_id ? null : d.cliente_id)}
                  className="text-xs text-gray-400 hover:text-gray-600 shrink-0 underline"
                >
                  {expandido === d.cliente_id ? 'Ocultar' : 'Ver detalle'}
                </button>
              </div>

              {/* Detalle expandido */}
              {expandido === d.cliente_id && (
                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs font-semibold text-blue-700 mb-2 uppercase tracking-wide">
                      Débito Fiscal — Ventas
                    </p>
                    <DetalleAlicuotas datos={d.detalle_ventas} label="Ventas" />
                    <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs">
                      <span className="text-gray-500">Total facturado</span>
                      <span className="font-mono font-semibold">{$ar(d.imp_total_ventas)}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-green-700 mb-2 uppercase tracking-wide">
                      Crédito Fiscal — Compras
                    </p>
                    <DetalleAlicuotas datos={d.detalle_compras} label="Compras" />
                    <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs">
                      <span className="text-gray-500">Total comprado</span>
                      <span className="font-mono font-semibold">{$ar(d.imp_total_compras)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Clientes sin datos */}
      {!loading && sinDatos.length > 0 && (
        <div className="text-sm text-gray-400">
          <p className="mb-1 font-medium">Sin archivos para este período:</p>
          <p>{sinDatos.map((d) => d.cliente_nombre).join(' · ')}</p>
        </div>
      )}
    </div>
  )
}
