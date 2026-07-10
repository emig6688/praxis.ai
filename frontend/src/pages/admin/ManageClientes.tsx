import { useState, useEffect } from 'react'
import { adminApi, Cliente, User } from '../../api/client'
import toast from 'react-hot-toast'

interface FormData {
  nombre: string
  cuit: string
  email: string
  afip_password: string
  representado: string
  contador_ids: number[]
}

const EMPTY_FORM: FormData = {
  nombre: '', cuit: '', email: '', afip_password: '', representado: '', contador_ids: [],
}

function formatCuit(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`
}

function cuitSinGuiones(cuit: string): string {
  return cuit.replace(/\D/g, '')
}

export default function ManageClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [contadores, setContadores] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(true)

  const cargar = async () => {
    setLoading(true)
    try {
      const [clientesRes, contadoresRes] = await Promise.all([
        adminApi.getClientes(),
        adminApi.getContadores(),
      ])
      setClientes(clientesRes.data)
      setContadores(contadoresRes.data)
    } catch {
      toast.error('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const abrirNuevo = () => {
    setEditando(null)
    setForm(EMPTY_FORM)
    setShowPassword(true)
    setShowModal(true)
  }

  const abrirEditar = (c: Cliente) => {
    setEditando(c)
    setForm({
      nombre: c.nombre,
      cuit: c.cuit,
      email: c.email || '',
      afip_password: '',
      representado: (c as any).representado || '',
      contador_ids: c.contadores?.map((cnt) => cnt.id) || [],
    })
    setShowPassword(true)
    setShowModal(true)
  }

  const toggleContador = (id: number) => {
    setForm((prev) => ({
      ...prev,
      contador_ids: prev.contador_ids.includes(id)
        ? prev.contador_ids.filter((x) => x !== id)
        : [...prev.contador_ids, id],
    }))
  }

  const handleCuitChange = (val: string) => {
    const formatted = formatCuit(val)
    setForm((prev) => ({
      ...prev,
      cuit: formatted,
      // Si representado está vacío o era igual al nombre anterior, no tocar
    }))
  }

  const guardar = async () => {
    if (!form.nombre.trim()) return toast.error('Ingresá el nombre o razón social')
    if (cuitSinGuiones(form.cuit).length !== 11) return toast.error('El CUIT debe tener 11 dígitos (ej: 20-33831072-3)')
    if (!editando && !form.afip_password) return toast.error('Ingresá la clave fiscal de AFIP')

    setSaving(true)
    try {
      const cuitLimpio = form.cuit
      const representadoFinal = form.representado.trim() || form.nombre.trim()

      if (editando) {
        const payload: any = {
          nombre: form.nombre,
          email: form.email || null,
          afip_cuit: cuitLimpio,
          representado: representadoFinal,
          contador_ids: form.contador_ids,
        }
        if (form.afip_password) payload.afip_password = form.afip_password
        await adminApi.actualizarCliente(editando.id, payload)
        toast.success('Cliente actualizado')
      } else {
        await adminApi.crearCliente({
          nombre: form.nombre,
          cuit: cuitLimpio,
          email: form.email || null,
          afip_cuit: cuitLimpio,
          afip_password: form.afip_password,
          representado: representadoFinal,
          contador_ids: form.contador_ids,
        })
        toast.success('Cliente creado exitosamente')
      }
      setShowModal(false)
      cargar()
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Error al guardar el cliente')
    } finally {
      setSaving(false)
    }
  }

  const desactivar = async (id: number) => {
    if (!confirm('¿Desactivar este cliente?')) return
    try {
      await adminApi.eliminarCliente(id)
      toast.success('Cliente desactivado')
      cargar()
    } catch {
      toast.error('Error al desactivar')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">{clientes.length} clientes registrados</p>
        </div>
        <button onClick={abrirNuevo} className="btn-primary">+ Nuevo cliente</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : clientes.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-lg mb-2">No hay clientes cargados</p>
          <button onClick={abrirNuevo} className="btn-primary mt-2">Crear el primero</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">CUIT</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Representado AFIP</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Contadores</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clientes.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{c.nombre}</div>
                    {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                  </td>
                  <td className="px-6 py-4 text-gray-600 font-mono text-sm">{c.cuit}</td>
                  <td className="px-6 py-4 text-gray-600 text-sm">{(c as any).representado || c.nombre}</td>
                  <td className="px-6 py-4">
                    {c.contadores && c.contadores.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.contadores.map((cnt) => (
                          <span key={cnt.id} className="badge bg-blue-100 text-blue-700">{cnt.nombre}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`badge ${c.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => abrirEditar(c)} className="btn-secondary text-sm py-1">Editar</button>
                    {c.activo && (
                      <button onClick={() => desactivar(c.id)} className="btn-danger text-sm py-1">Desactivar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-1">
              {editando ? 'Editar cliente' : 'Nuevo cliente'}
            </h2>
            <p className="text-xs text-gray-400 mb-5">Los campos con * son obligatorios</p>

            <div className="space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre / Razón Social *
                </label>
                <input
                  className="input"
                  autoComplete="off"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Empresa S.A. o Juan Pérez"
                />
              </div>

              {/* CUIT */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CUIT *
                  <span className="text-gray-400 font-normal ml-1">(se formatea automáticamente)</span>
                </label>
                <input
                  className="input font-mono"
                  autoComplete="off"
                  value={form.cuit}
                  onChange={(e) => handleCuitChange(e.target.value)}
                  placeholder="20-33831072-3"
                  maxLength={13}
                />
                {form.cuit && cuitSinGuiones(form.cuit).length !== 11 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Faltan {11 - cuitSinGuiones(form.cuit).length} dígito(s)
                  </p>
                )}
                {form.cuit && cuitSinGuiones(form.cuit).length === 11 && (
                  <p className="text-xs text-green-600 mt-1">✓ CUIT completo</p>
                )}
              </div>

              {/* Email opcional */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email del cliente
                  <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                </label>
                <input
                  className="input"
                  type="email"
                  autoComplete="new-password"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="cliente@empresa.com"
                />
              </div>

              {/* Credenciales AFIP */}
              <div className="border border-blue-100 bg-blue-50 rounded-lg p-4 space-y-3">
                <p className="text-sm font-semibold text-blue-800 flex items-center gap-1">
                  Credenciales AFIP
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Clave Fiscal AFIP
                    {editando
                      ? <span className="text-gray-400 font-normal ml-1">(dejar vacío para no cambiar)</span>
                      : <span className="text-red-500 ml-1">*</span>
                    }
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    CUIT AFIP: {form.cuit || '—'} (igual al CUIT del cliente)
                  </p>
                  <div className="relative">
                    <input
                      className="input pr-16 font-mono"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={form.afip_password}
                      onChange={(e) => setForm({ ...form, afip_password: e.target.value })}
                      placeholder="Clave fiscal de AFIP"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? 'Ocultar' : 'Ver'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Representado en AFIP
                    <span className="text-gray-400 font-normal ml-1">(si es distinto al nombre del cliente)</span>
                  </label>
                  <input
                    className="input"
                    autoComplete="off"
                    value={form.representado}
                    onChange={(e) => setForm({ ...form, representado: e.target.value })}
                    placeholder={form.nombre || 'Por defecto usa el nombre del cliente'}
                  />
                  {!form.representado && form.nombre && (
                    <p className="text-xs text-gray-400 mt-1">
                      Se usará: <span className="font-medium">{form.nombre}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Contadores asignados */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contadores asignados
                  <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                </label>
                {contadores.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No hay contadores cargados aún.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {contadores.map((cnt) => (
                      <label
                        key={cnt.id}
                        className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors ${
                          form.contador_ids.includes(cnt.id)
                            ? 'border-primary-400 bg-primary-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={form.contador_ids.includes(cnt.id)}
                          onChange={() => toggleContador(cnt.id)}
                          className="rounded text-primary-600"
                        />
                        <span className="text-sm">{cnt.nombre}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end border-t pt-4">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={guardar} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
