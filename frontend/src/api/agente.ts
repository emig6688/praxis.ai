import api from './client'

export interface AgenteConfig {
  activo: boolean
  hora: string
  mail_dias: number[]
  proximo_job?: string | null
}

export interface AgenteLogDetalle {
  cliente: string
  descarga: boolean
  saldo?: number
  envio: boolean
  error?: string | null
}

export interface AgenteLog {
  id: number
  ejecutado_en: string
  periodo: string
  clientes_procesados: number
  reportes_enviados: number
  errores: number
  detalle?: AgenteLogDetalle[] | null
}

export interface BackupMeta {
  fecha: string
  fecha_display: string
  enviado_a: string
  tamano_bytes: number
}

export interface BackupInfo {
  ultimo: BackupMeta | null
  proximo: string | null
}

export const agenteApi = {
  getConfig:         ()                                                    => api.get<AgenteConfig>('/agente/config'),
  setConfig:         (data: { activo: boolean; hora: string; mail_dias: number[] }) => api.put<AgenteConfig>('/agente/config', data),
  getHistorial:      ()                                                    => api.get<AgenteLog[]>('/agente/historial'),
  ejecutarAhora:     ()                                                    => api.post('/agente/ejecutar-ahora'),
  getBackup:         ()                                                    => api.get<BackupInfo>('/agente/backup'),
  ejecutarBackup:    ()                                                    => api.post('/agente/backup/ejecutar'),
}
