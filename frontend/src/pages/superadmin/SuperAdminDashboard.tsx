import { useState, useEffect } from 'react'
import { superadminApi, Estudio } from '../../api/client'
import toast from 'react-hot-toast'

interface FormData {
  nombre: string
  admin_nombre: string
  admin_email: string
  admin_password: string
}

const EMPTY_FORM: FormData = {
  nombre: '', admin_nombre: '', admin_email: '', admin_password: '',
}

export default function SuperAdminDashboard() {
  const [estudios, setEstudios] = useState<Estudio[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Estudio | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [detalleId, setDetalleId] = useState<number | null>(null)
  const [filtro, setFiltro] = useState('')

  const cargar = async () => {
    setLoading(true)
    try {
      const res = await superadminApi.getEstudios()
      setEstudios(res.data)
    } catch {
      toast.error('Error al cargar estudios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const abrirNuevo = () => {
    setEditando(null)
    setForm(EMPTY_FORM)
    setShowPass(false)
    setShowModal(true)
  }

  const abrirEditar = (e: Estudio) => {
    setEditando(e)
    setForm({
      nombre: e.nombre,
      admin_nombre: e.admin_nombre || '',
      admin_email: e.admin_email || '',
      admin_password: e.admin_password_visible || '',
    })
    setShowPass(false)
    setShowModal(true)
  }

  const guardar = async () => {
    if (!form.nombre.trim()) return toast.error('Ingresá el nombre del estudio')
    if (!editando) {
      if (!form.admin_nombre.trim()) return toast.error('Ingresá el nombre del administrador')
      if (!form.admin_email.trim()) return toast.error('Ingresá el email del administrador')
      if (!form.admin_password.trim()) return toast.error('Ingresá la contraseña del administrador')
    }
    setSaving(true)
    try {
      if (editando) {
        await superadminApi.actualizarEstudio(editando.id, {
          nombre: form.nombre,
        })
        // Actualizar admin si se completaron nombre y email
        if (form.admin_nombre.trim() && form.admin_email.trim()) {
          await superadminApi.actualizarAdmin(editando.id, {
            admin_nombre: form.admin_nombre,
            admin_email: form.admin_email,
            admin_password: form.admin_password || undefined,
          })
        }
        toast.success('Estudio actualizado')
      } else {
        await superadminApi.crearEstudio(form)
        toast.success('Estudio creado correctamente')
      }
      setShowModal(false)
      cargar()
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const toggleActivo = async (e: Estudio) => {
    const accion = e.activo ? 'desactivar' : 'activar'
    if (!confirm(`¿Querés ${accion} el estudio "${e.nombre}"?`)) return
    try {
      await superadminApi.actualizarEstudio(e.id, { activo: !e.activo })
      toast.success(`Estudio ${e.activo ? 'desactivado' : 'activado'}`)
      cargar()
    } catch {
      toast.error('Error al actualizar')
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estudios Contables</h1>
          <p className="text-gray-500 text-sm mt-1">
            {estudios.length} estudio{estudios.length !== 1 ? 's' : ''} registrado{estudios.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={abrirNuevo} className="btn-primary">
          + Nuevo estudio
        </button>
      </div>

      {/* Filtro */}
      <div className="mb-6">
        <input
          className="input max-w-xs"
          placeholder="Buscar estudio..."
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Estudios activos', value: estudios.filter(e => e.activo).length, color: 'text-green-600' },
          { label: 'Total usuarios', value: estudios.reduce((a, e) => a + (e.total_usuarios || 0), 0), color: 'text-blue-600' },
          { label: 'Total clientes', value: estudios.reduce((a, e) => a + (e.total_clientes || 0), 0), color: 'text-purple-600' },
        ].map((s) => (
          <div key={s.label} className="card text-center">
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : estudios.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <p className="text-5xl mb-4">🏢</p>
          <p className="text-lg mb-2">No hay estudios cargados</p>
          <p className="text-sm mb-4">Creá el primer estudio contable para empezar</p>
          <button onClick={abrirNuevo} className="btn-primary">Crear estudio</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {estudios.filter(e => e.nombre.toLowerCase().includes(filtro.toLowerCase())).map((e) => (
            <div
              key={e.id}
              className={`card border-2 transition-all ${e.activo ? 'border-transparent hover:border-primary-200' : 'border-red-100 bg-red-50/50 opacity-75'}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center text-primary-700 font-bold text-lg">
                  {e.nombre.charAt(0).toUpperCase()}
                </div>
                <span className={`badge ${e.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {e.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <h3 className="font-semibold text-gray-900 text-lg mb-1">{e.nombre}</h3>
              <p className="text-xs text-gray-400 mb-4">
                Creado: {new Date(e.creado_en).toLocaleDateString('es-AR')}
              </p>

              <div className="flex gap-4 text-sm text-gray-600 mb-4 border-t pt-3">
                <span className="flex items-center gap-1">
                  <span className="font-semibold text-blue-600">{e.total_usuarios}</span> usuario{e.total_usuarios !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1">
                  <span className="font-semibold text-purple-600">{e.total_clientes}</span> cliente{e.total_clientes !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => abrirEditar(e)}
                  className="btn-secondary text-sm py-1 flex-1"
                >
                  Editar
                </button>
                <button
                  onClick={() => toggleActivo(e)}
                  className={`text-sm py-1 px-3 rounded-lg font-medium transition-colors ${
                    e.activo
                      ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                      : 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200'
                  }`}
                >
                  {e.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-1">
              {editando ? 'Editar estudio' : 'Nuevo estudio contable'}
            </h2>
            <p className="text-xs text-gray-400 mb-5">
              {editando ? 'Modificá los datos del estudio' : 'Completá los datos del estudio y su administrador'}
            </p>

            <div className="space-y-4">
              {/* Nombre estudio */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del estudio *
                </label>
                <input
                  className="input"
                  autoComplete="off"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Estudio Contable García & Asociados"
                />
              </div>

              {/* Datos del admin */}
              <>
                <hr className="my-1" />
                <p className="text-sm font-semibold text-gray-700">Administrador del estudio</p>
                <p className="text-xs text-gray-400 -mt-2">
                  {editando
                    ? 'Modificá los datos del administrador. Dejá la contraseña en blanco para no cambiarla.'
                    : 'Con estas credenciales el estudio podrá ingresar a la plataforma'}
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre completo {!editando && '*'}
                  </label>
                  <input
                    className="input"
                    autoComplete="off"
                    value={form.admin_nombre}
                    onChange={(e) => setForm({ ...form, admin_nombre: e.target.value })}
                    placeholder="Ej: María García"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email {!editando && '*'}
                  </label>
                  <input
                    className="input"
                    type="email"
                    autoComplete="off"
                    value={form.admin_email}
                    onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
                    placeholder="admin@estudio.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña {editando ? '(dejar en blanco para no cambiar)' : '*'}
                  </label>
                  <div className="relative">
                    <input
                      className="input pr-16"
                      type={showPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={form.admin_password}
                      onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
                      placeholder={editando ? 'Nueva contraseña (opcional)' : 'Mínimo 6 caracteres'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded"
                    >
                      {showPass ? 'Ocultar' : 'Ver'}
                    </button>
                  </div>
                </div>
              </>
            </div>

            <div className="flex gap-3 mt-6 justify-end border-t pt-4">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={guardar} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear estudio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
