import { useState, useEffect } from 'react'
import { contadorApi, EvolucionClienteData, User } from '../../api/client'
import { getCachedEvolucion, setCachedEvolucion, evolucionStale, invalidarCacheDashboard } from '../../api/cache'
import { $ar, $arFull, mesLabel } from '../../utils/format'
import toast from 'react-hot-toast'

export { invalidarCacheDashboard }

// ── Gráfico de barras SVG ────────────────────────────────────────────────────
interface BarDatum { label: string; ventas: number; compras: number; saldo: number }
interface TooltipState { x: number; y: number; d: BarDatum; tipo: 'ventas' | 'compras' | 'saldo' }

function BarChart({ data }: { data: BarDatum[] }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  if (data.length === 0) return (
    <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sin datos para el período</div>
  )

  const W = 800, H = 280
  const mx = { t: 16, r: 24, b: 56, l: 84 }
  const cW = W - mx.l - mx.r
  const cH = H - mx.t - mx.b

  const maxY = Math.max(...data.flatMap(d => [d.ventas, d.compras]), 1)
  const y = (v: number) => cH - Math.max(0, v / maxY) * cH
  const slotW = cW / data.length
  const bW = Math.min(slotW * 0.33, 36)

  const ticks = 4
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => (maxY / ticks) * i)

  const linePoints = data.map((d, i) => {
    const cx = mx.l + i * slotW + slotW / 2
    const cy = mx.t + y(Math.abs(d.saldo))
    return `${cx},${cy}`
  }).join(' ')

  const handleMouse = (e: React.MouseEvent<SVGElement>, d: BarDatum, tipo: TooltipState['tipo']) => {
    const rect = (e.currentTarget.closest('svg') as SVGSVGElement).getBoundingClientRect()
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, d, tipo })
  }

  return (
    <div className="w-full overflow-x-auto relative">
      {/* Tooltip flotante */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            transform: tooltip.x > W * 0.65 ? 'translateX(-110%)' : undefined,
          }}
        >
          <div className="bg-gray-900 text-white rounded-xl shadow-xl px-3.5 py-2.5 text-xs min-w-[180px]"
            style={{ fontFamily: 'Open Sans, sans-serif' }}>
            <p className="font-semibold text-gray-200 mb-1.5 border-b border-gray-700 pb-1.5">{tooltip.d.label}</p>
            <div className="space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-blue-300">IVA Ventas</span>
                <span className="font-mono text-white">{$arFull(tooltip.d.ventas)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-emerald-300">IVA Compras</span>
                <span className="font-mono text-white">{$arFull(tooltip.d.compras)}</span>
              </div>
              <div className="flex justify-between gap-4 pt-1 border-t border-gray-700 mt-1">
                <span className={tooltip.d.saldo > 0 ? 'text-red-300' : tooltip.d.saldo < 0 ? 'text-emerald-300' : 'text-gray-400'}>
                  Saldo estimado
                </span>
                <span className={`font-mono font-bold ${tooltip.d.saldo > 0 ? 'text-red-400' : tooltip.d.saldo < 0 ? 'text-emerald-400' : 'text-gray-400'}`}>
                  {tooltip.d.saldo > 0 ? '+' : ''}{$arFull(tooltip.d.saldo)}
                </span>
              </div>
              <p className={`text-center text-[10px] mt-0.5 font-semibold ${tooltip.d.saldo > 0 ? 'text-red-400' : tooltip.d.saldo < 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                {tooltip.d.saldo > 0 ? '▲ A pagar a AFIP' : tooltip.d.saldo < 0 ? '▼ Saldo a favor' : 'Sin movimientos'}
              </p>
            </div>
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[480px]"
        style={{ fontFamily: 'inherit' }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid + Y axis */}
        <g>
          {tickVals.map((v, i) => {
            const yy = mx.t + y(v)
            return (
              <g key={i}>
                <line x1={mx.l} y1={yy} x2={mx.l + cW} y2={yy} stroke="#e5e7eb" strokeWidth={1} />
                <text x={mx.l - 8} y={yy} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#9ca3af">
                  {$ar(v)}
                </text>
              </g>
            )
          })}
        </g>

        {/* Bars + hit areas */}
        {data.map((d, i) => {
          const cx = mx.l + i * slotW + slotW / 2
          const ventasH = Math.max(0, (d.ventas / maxY) * cH)
          const comprasH = Math.max(0, (d.compras / maxY) * cH)
          const isActive = tooltip?.d.label === d.label
          return (
            <g key={d.label}>
              {/* Zona hover de toda la columna */}
              <rect
                x={mx.l + i * slotW} y={mx.t} width={slotW} height={cH}
                fill="transparent"
                onMouseMove={e => handleMouse(e, d, 'ventas')}
                style={{ cursor: 'crosshair' }}
              />
              {/* IVA Ventas */}
              <rect
                x={cx - bW - 2} y={mx.t + cH - ventasH}
                width={bW} height={ventasH}
                fill="#3b82f6" rx={3}
                opacity={isActive ? 1 : 0.82}
                style={{ transition: 'opacity .15s' }}
              />
              {/* IVA Compras */}
              <rect
                x={cx + 2} y={mx.t + cH - comprasH}
                width={bW} height={comprasH}
                fill="#10b981" rx={3}
                opacity={isActive ? 1 : 0.82}
                style={{ transition: 'opacity .15s' }}
              />
              {/* X label */}
              <text x={cx} y={mx.t + cH + 18} textAnchor="middle" fontSize={11}
                fill={isActive ? '#374151' : '#6b7280'} fontWeight={isActive ? 600 : 400}>
                {d.label}
              </text>
              {/* Saldo dot */}
              <circle
                cx={cx}
                cy={mx.t + y(Math.abs(d.saldo))}
                r={isActive ? 7 : 5}
                fill={d.saldo > 0 ? '#ef4444' : d.saldo < 0 ? '#10b981' : '#d1d5db'}
                stroke="white"
                strokeWidth={isActive ? 2 : 1.5}
                style={{ transition: 'r .1s' }}
              />
            </g>
          )
        })}

        {/* Saldo line */}
        {data.length > 1 && (
          <polyline
            points={linePoints}
            fill="none"
            stroke="#f97316"
            strokeWidth={2}
            strokeDasharray="5 3"
            opacity={0.8}
          />
        )}

        {/* Eje X base */}
        <line x1={mx.l} y1={mx.t + cH} x2={mx.l + cW} y2={mx.t + cH} stroke="#d1d5db" strokeWidth={1} />

        {/* Leyenda */}
        {[
          { color: '#3b82f6', label: 'IVA Ventas (Débito)' },
          { color: '#10b981', label: 'IVA Compras (Crédito)' },
          { color: '#f97316', label: 'Saldo estimado', dashed: true },
        ].map((item, i) => (
          <g key={item.label} transform={`translate(${mx.l + i * 200}, ${H - 16})`}>
            {item.dashed
              ? <line x1={0} y1={-4} x2={14} y2={-4} stroke={item.color} strokeWidth={2} strokeDasharray="4 2" />
              : <rect x={0} y={-10} width={14} height={10} fill={item.color} rx={2} />
            }
            <text x={18} y={-2} fontSize={11} fill="#6b7280">{item.label}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ── Tarjeta resumen ──────────────────────────────────────────────────────────
function Tarjeta({ label, valor, sub, color }: { label: string; valor: number; sub?: string; color: string }) {
  return (
    <div className={`card border-l-4 ${color}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{$arFull(valor)}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Dashboard() {
  const cached = getCachedEvolucion()
  const [data, setData] = useState(cached)
  const [loading, setLoading] = useState(cached === null)
  const [refreshing, setRefreshing] = useState(false)

  const [modo, setModo] = useState<'total' | 'cliente' | 'contador'>('total')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroContador, setFiltroContador] = useState('')
  const [filtroRepresentado, setFiltroRepresentado] = useState('')

  useEffect(() => {
    if (!evolucionStale()) return
    if (getCachedEvolucion()) setRefreshing(true)
    contadorApi.getDashboardEvolucion()
      .then(r => { setCachedEvolucion(r.data); setData(r.data) })
      .catch(() => toast.error('Error al cargar dashboard'))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [])

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  )

  if (!data) return null

  const { periodos, clientes } = data

  // Contadores únicos de todos los clientes
  const contadoresUnicos: User[] = Array.from(
    new Map(
      clientes.flatMap(c => c.contadores ?? []).map(u => [u.id, u])
    ).values()
  ).sort((a, b) => a.nombre.localeCompare(b.nombre))

  // Base para el dropdown de representados: solo los clientes ya filtrados por modo/cliente/contador
  const clientesBaseRep = (() => {
    if (modo === 'cliente' && filtroCliente)
      return clientes.filter(c => String(c.cliente_id) === filtroCliente)
    if (modo === 'contador' && filtroContador)
      return clientes.filter(c => c.contadores?.some(u => String(u.id) === filtroContador))
    return clientes
  })()

  const representadosUnicos: string[] = Array.from(
    new Set(clientesBaseRep.map(c => c.cliente_representado || c.cliente_nombre).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b))

  // ── Selección de clientes según modo y filtros ─────────────────────────────
  let clientesSeleccionados: EvolucionClienteData[] = clientes

  if (modo === 'cliente' && filtroCliente) {
    clientesSeleccionados = clientes.filter(c => String(c.cliente_id) === filtroCliente)
  } else if (modo === 'contador' && filtroContador) {
    clientesSeleccionados = clientes.filter(c =>
      (c.contadores ?? []).some(u => String(u.id) === filtroContador)
    )
  }

  // Filtro por representado aplica en cualquier modo
  if (filtroRepresentado.trim()) {
    const q = filtroRepresentado.toLowerCase()
    clientesSeleccionados = clientesSeleccionados.filter(c =>
      (c.cliente_representado || c.cliente_nombre).toLowerCase().includes(q)
    )
  }

  // ── Datos del gráfico: suma por período ────────────────────────────────────
  const chartData: BarDatum[] = periodos.map(p => {
    const ventas = clientesSeleccionados.reduce((s, c) => s + (c.por_periodo[p]?.iva_ventas ?? 0), 0)
    const compras = clientesSeleccionados.reduce((s, c) => s + (c.por_periodo[p]?.iva_compras ?? 0), 0)
    return { label: mesLabel(p), ventas, compras, saldo: ventas - compras }
  }).filter(d => d.ventas > 0 || d.compras > 0)

  // ── Totales ────────────────────────────────────────────────────────────────
  const totalVentas = chartData.reduce((s, d) => s + d.ventas, 0)
  const totalCompras = chartData.reduce((s, d) => s + d.compras, 0)
  const saldoTotal = totalVentas - totalCompras

  // ── Tabla por cliente (para modo total / contador) ─────────────────────────
  const tablaClientes = clientesSeleccionados
    .map(c => {
      const ventas = Object.values(c.por_periodo).reduce((s, v) => s + v.iva_ventas, 0)
      const compras = Object.values(c.por_periodo).reduce((s, v) => s + v.iva_compras, 0)
      const saldo = ventas - compras
      return { ...c, ventas, compras, saldo }
    })
    .filter(c => c.ventas > 0 || c.compras > 0)
    .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo))

  return (
    <div className="space-y-6">

      {/* Header + filtros */}
      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Evolución mensual de IVA — {periodos.length} período{periodos.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Modo */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {[
              { v: 'total' as const, l: 'Total' },
              { v: 'contador' as const, l: 'Por contador' },
              { v: 'cliente' as const, l: 'Por cliente' },
            ].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => { setModo(v); setFiltroCliente(''); setFiltroContador(''); setFiltroRepresentado('') }}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  modo === v
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >{l}</button>
            ))}
          </div>

          {/* Dropdown según modo */}
          {modo === 'cliente' && (
            <select
              className="input py-1.5 text-sm min-w-[200px]"
              value={filtroCliente}
              onChange={e => { setFiltroCliente(e.target.value); setFiltroRepresentado('') }}
            >
              <option value="">Seleccioná un cliente</option>
              {clientes.filter(c => Object.keys(c.por_periodo).length > 0).map(c => (
                <option key={c.cliente_id} value={String(c.cliente_id)}>{c.cliente_nombre}</option>
              ))}
            </select>
          )}

          {modo === 'contador' && contadoresUnicos.length > 0 && (
            <select
              className="input py-1.5 text-sm min-w-[200px]"
              value={filtroContador}
              onChange={e => setFiltroContador(e.target.value)}
            >
              <option value="">Todos los contadores</option>
              {contadoresUnicos.map(u => (
                <option key={u.id} value={String(u.id)}>{u.nombre}</option>
              ))}
            </select>
          )}

          {/* Filtro por representado — input con autocompletado */}
          {representadosUnicos.length > 1 && (
            <div className="relative">
              <input
                type="text"
                className="input py-1.5 text-sm min-w-[240px]"
                placeholder="Buscar representado..."
                value={filtroRepresentado}
                onChange={e => setFiltroRepresentado(e.target.value)}
                list="representados-list"
              />
              <datalist id="representados-list">
                {representadosUnicos.map(r => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              {filtroRepresentado && (
                <button
                  onClick={() => setFiltroRepresentado('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >✕</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Tarjeta label="Total IVA Ventas" valor={totalVentas} color="border-blue-500"
          sub={`${chartData.length} período${chartData.length !== 1 ? 's' : ''}`} />
        <Tarjeta label="Total IVA Compras" valor={totalCompras} color="border-emerald-500"
          sub={`${clientesSeleccionados.length} cliente${clientesSeleccionados.length !== 1 ? 's' : ''}`} />
        <div className={`card border-l-4 ${saldoTotal > 0 ? 'border-red-500 bg-red-50' : saldoTotal < 0 ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300'}`}>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Saldo Total Acumulado</p>
          <p className={`text-2xl font-bold mt-1 ${saldoTotal > 0 ? 'text-red-700' : saldoTotal < 0 ? 'text-emerald-700' : 'text-gray-700'}`}>
            {$arFull(Math.abs(saldoTotal))}
          </p>
          <p className={`text-xs font-medium mt-0.5 ${saldoTotal > 0 ? 'text-red-500' : saldoTotal < 0 ? 'text-emerald-500' : 'text-gray-400'}`}>
            {saldoTotal > 0 ? '▲ A pagar a AFIP' : saldoTotal < 0 ? '▼ Saldo a favor' : 'Sin movimientos'}
          </p>
        </div>
      </div>

      {/* Gráfico */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
          Evolución mensual
          {modo === 'cliente' && filtroCliente && ` — ${clientes.find(c => String(c.cliente_id) === filtroCliente)?.cliente_nombre}`}
          {modo === 'contador' && filtroContador && ` — ${contadoresUnicos.find(u => String(u.id) === filtroContador)?.nombre}`}
        </h2>
        <BarChart data={chartData} />
      </div>

      {/* Tabla por cliente */}
      {tablaClientes.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Detalle por cliente
            </h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">IVA Ventas</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">IVA Compras</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Saldo</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Períodos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tablaClientes.map(c => (
                <tr key={c.cliente_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 text-sm">{c.cliente_nombre}</p>
                    {c.cliente_representado && c.cliente_representado !== c.cliente_nombre && (
                      <p className="text-xs text-gray-500">Rep.: {c.cliente_representado}</p>
                    )}
                    <p className="text-xs text-gray-400 font-mono">{c.cliente_cuit}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-blue-700">{$arFull(c.ventas)}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-700">{$arFull(c.compras)}</td>
                  <td className={`px-4 py-3 text-right text-sm font-bold ${c.saldo > 0 ? 'text-red-600' : c.saldo < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {c.saldo > 0 ? '+' : ''}{$arFull(c.saldo)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                      c.saldo > 0 ? 'bg-red-100 text-red-700' :
                      c.saldo < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {c.saldo > 0 ? 'A pagar' : c.saldo < 0 ? 'A favor' : 'Neutro'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-400">
                    {Object.keys(c.por_periodo).sort().map(mesLabel).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {chartData.length === 0 && (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-lg">Sin datos disponibles</p>
          <p className="text-sm mt-1">Descargá comprobantes desde Descarga Masiva o desde cada cliente</p>
        </div>
      )}
    </div>
  )
}
