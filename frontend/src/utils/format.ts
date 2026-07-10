export const $ar = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })

export const $arFull = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function mesLabel(periodo: string): string {
  const [y, m] = periodo.split('-')
  const fecha = new Date(Number(y), Number(m) - 1, 1)
  return fecha.toLocaleString('es-AR', { month: 'long', year: 'numeric' })
}

export function mesActual(): string {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`
}

export function mesAnterior(): string {
  const h = new Date()
  h.setMonth(h.getMonth() - 1)
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`
}
