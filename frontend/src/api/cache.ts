import type { DashboardEvolucionData, IVAClienteData } from './client'

const TTL = 5 * 60 * 1000  // 5 minutos

// ── Dashboard evolución ───────────────────────────────────────────────────────
let _evolucion: DashboardEvolucionData | null = null
let _evolucionTs = 0

export function getCachedEvolucion() { return _evolucion }
export function setCachedEvolucion(data: DashboardEvolucionData) {
  _evolucion = data
  _evolucionTs = Date.now()
}
export function evolucionStale() { return !_evolucion || Date.now() - _evolucionTs > TTL }
export function invalidarCacheDashboard() { _evolucion = null; _evolucionTs = 0 }

// ── Estimado IVA (por período) ────────────────────────────────────────────────
const _ivaMap = new Map<string, { data: IVAClienteData[]; ts: number }>()

export function getCachedIVA(periodo: string) { return _ivaMap.get(periodo) ?? null }
export function setCachedIVA(periodo: string, data: IVAClienteData[]) {
  _ivaMap.set(periodo, { data, ts: Date.now() })
}
export function ivaStale(periodo: string) {
  const entry = _ivaMap.get(periodo)
  return !entry || Date.now() - entry.ts > TTL
}
export function invalidarCacheIVA() { _ivaMap.clear() }
