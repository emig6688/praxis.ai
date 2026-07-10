import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

// ── Types ──────────────────────────────────────────────────────────────────

export interface User {
  id: number
  nombre: string
  email: string
  rol: 'superadmin' | 'admin' | 'contador' | 'cliente'
  activo: boolean
  creado_en: string
  estudio_id?: number | null
  estudio_nombre?: string | null
}

export interface Estudio {
  id: number
  nombre: string
  email_institucional?: string | null
  activo: boolean
  creado_en: string
  total_usuarios?: number
  total_clientes?: number
  admin_nombre?: string
  admin_email?: string
  admin_id?: number
  admin_password_visible?: string
}

export interface ResultadoEnvioReporte {
  cliente_id: number
  cliente_nombre: string
  enviado: boolean
  error?: string | null
}

export interface Cliente {
  id: number
  nombre: string
  cuit: string
  email?: string
  afip_cuit: string
  representado?: string
  activo: boolean
  creado_en: string
  contadores?: User[]
}

export interface ArchivoAfip {
  id: number
  tipo: 'emitidos' | 'recibidos'
  periodo: string
  nombre_archivo: string
  tamanio_bytes?: number
  descargado_en: string
  descargado_por_usuario: User
}

export interface ArchivoAfipConCliente extends ArchivoAfip {
  cliente_id: number
  cliente_nombre: string
  cliente_cuit: string
}

export interface ResultadoMasivo {
  cliente_id: number
  cliente_nombre: string
  exitoso: boolean
  archivos: ArchivoAfip[]
  errores: string[]
}

export interface IVADetalleAlicuotas {
  iva_21: number
  iva_105: number
  iva_27: number
  iva_5: number
  iva_25: number
}

export interface IVAClienteData {
  cliente_id: number
  cliente_nombre: string
  cliente_cuit: string
  cliente_representado?: string | null
  iva_ventas: number
  iva_compras: number
  imp_total_ventas: number
  imp_total_compras: number
  saldo: number
  detalle_ventas: IVADetalleAlicuotas
  detalle_compras: IVADetalleAlicuotas
  tiene_emitidos: boolean
  tiene_recibidos: boolean
  periodos_usados: string[]
  alerta: 'pagar' | 'favor' | 'neutro'
}

export interface DescargaResponse {
  exitoso: boolean
  archivos: ArchivoAfip[]
  errores: string[]
}

export interface EvolucionPeriodoData {
  iva_ventas: number
  iva_compras: number
  saldo: number
}

export interface EvolucionClienteData {
  cliente_id: number
  cliente_nombre: string
  cliente_cuit: string
  cliente_representado: string
  contadores: User[]
  por_periodo: Record<string, EvolucionPeriodoData>
}

export interface DashboardEvolucionData {
  periodos: string[]
  clientes: EvolucionClienteData[]
}

// ── Auth ───────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  me: () => api.get<User>('/auth/me'),
}

// ── Superadmin ─────────────────────────────────────────────────────────────

export const superadminApi = {
  getEstudios: () => api.get<Estudio[]>('/superadmin/estudios'),
  crearEstudio: (data: object) => api.post<Estudio>('/superadmin/estudios', data),
  actualizarEstudio: (id: number, data: object) => api.put<Estudio>(`/superadmin/estudios/${id}`, data),
  actualizarAdmin: (id: number, data: object) => api.put(`/superadmin/estudios/${id}/admin`, data),
  getUsuariosEstudio: (id: number) => api.get<User[]>(`/superadmin/estudios/${id}/usuarios`),
}

// ── Admin ──────────────────────────────────────────────────────────────────

export const adminApi = {
  getUsuarios: () => api.get<User[]>('/admin/usuarios'),
  crearUsuario: (data: object) => api.post<User>('/admin/usuarios', data),
  actualizarUsuario: (id: number, data: object) => api.put<User>(`/admin/usuarios/${id}`, data),
  eliminarUsuario: (id: number) => api.delete(`/admin/usuarios/${id}`),
  getContadores: () => api.get<User[]>('/admin/contadores'),
  getClientes: () => api.get<Cliente[]>('/admin/clientes'),
  crearCliente: (data: object) => api.post<Cliente>('/admin/clientes', data),
  actualizarCliente: (id: number, data: object) => api.put<Cliente>(`/admin/clientes/${id}`, data),
  eliminarCliente: (id: number) => api.delete(`/admin/clientes/${id}`),
}

// ── Contador ───────────────────────────────────────────────────────────────

export const contadorApi = {
  getMisClientes: () => api.get<Cliente[]>('/contador/clientes'),
  getArchivosCliente: (clienteId: number) =>
    api.get<ArchivoAfip[]>(`/contador/clientes/${clienteId}/archivos`),
  descargarAfip: (data: { cliente_id: number; periodo_desde: string; periodo_hasta: string; tipos: string[] }) =>
    api.post<DescargaResponse>('/contador/descargar-afip', data),
  getUrlDescarga: (archivoId: number) => `/api/contador/archivos/${archivoId}/descargar`,
  eliminarArchivo: (archivoId: number) => api.delete(`/contador/archivos/${archivoId}`),
  getDashboardIVA: (periodo?: string) =>
    api.get<IVAClienteData[]>('/contador/dashboard/iva', { params: periodo ? { periodo } : {} }),
  descargarAfipMasivo: (data: { periodo_desde: string; periodo_hasta: string; tipos: string[]; cliente_ids?: number[] }) =>
    api.post<ResultadoMasivo[]>('/contador/descargar-afip-masivo', data, { timeout: 600000 }),
  getTodosArchivos: () => api.get<ArchivoAfipConCliente[]>('/contador/archivos'),
  getDashboardEvolucion: () => api.get<DashboardEvolucionData>('/contador/dashboard/evolucion'),
  enviarReportesIva: (data: { periodo?: string; cliente_ids: number[] }) =>
    api.post<ResultadoEnvioReporte[]>('/contador/reportes/enviar', data),
}
