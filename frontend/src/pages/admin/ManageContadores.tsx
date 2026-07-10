import { useState, useEffect } from 'react'
import { adminApi, User } from '../../api/client'
import toast from 'react-hot-toast'

interface FormData {
  nombre: string
  email: string
  password: string
}

const EMPTY_FORM: FormData = { nombre: '', email: '', password: '' }

export default function ManageContadores() {
  const [contadores, setContadores] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<User | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const cargar = async () => {
    setLoading(true)
    try {
      const res = await adminApi.getUsuarios()
      setContadores(res.data.filter((u) => u.rol === 'contador'))
    } catch {
      toast.error('Error al cargar contadores')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const abrirNuevo = () => {
    setEditando(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const abrirEditar = (c: User) => {
    setEditando(c)
    setForm({ nombre: c.nombre, email: c.email, password: '' })
    setShowModal(true)
  }

  const guardar = async () => {
    if (!form.nombre || !form.email) return toast.error('Completá nombre y email')
    if (!editando && !form.password) return toast.error('Ingresá una contraseña')
    setSaving(true)
    try {
      if (editando) {
        const payload: any = { nombre: form.nombre, email: form.email }
        if (form.password) payload.password = form.password
        await adminApi.actualizarUsuario(editando.id, payload)
        toast.success('Contador actualizado')
      } else {
        await adminApi.crearUsuario({ ...form, rol: 'contador' })
        toast.success('Contador creado')
      }
      setShowModal(false)
      cargar()
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const desactivar = async (id: number) => {
    if (!confirm('¿Desactivar este contador?')) return
    try {
      await adminApi.eliminarUsuario(id)
      toast.success('Contador desactivado')
      cargar()
    } catch {
      toast.error('Error al desactivar')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contadores</h1>
          <p className="text-gray-500 text-sm mt-1">{contadores.length} contadores registrados</p>
        </div>
        <div className="flex items-center gap-3 flex-1 max-w-sm">
          <input
            className="input py-1.5 text-sm w-full"
            placeholder="Buscar por nombre o email..."
            value={busqueda}
            list="lista-contadores"
            autoComplete="off"
            onChange={e => setBusqueda(e.target.value)}
          />
          <datalist id="lista-contadores">
            {contadores.map(c => <option key={c.id} value={c.nombre} />)}
          </datalist>
          {busqueda && (
            <button className="text-xs text-gray-400 hover:text-gray-600 underline shrink-0" onClick={() => setBusqueda('')}>
              Limpiar
            </button>
          )}
        </div>
        <button onClick={abrirNuevo} className="btn-primary shrink-0">+ Nuevo contador</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : contadores.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-lg mb-2">No hay contadores cargados</p>
          <button onClick={abrirNuevo} className="btn-primary mt-2">Crear el primero</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contadores.filter(c => {
                if (!busqueda) return true
                const b = busqueda.toLowerCase()
                return c.nombre.toLowerCase().includes(b) || c.email.toLowerCase().includes(b)
              }).map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{c.nombre}</td>
                  <td className="px-6 py-4 text-gray-600">{c.email}</td>
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">
              {editando ? 'Editar contador' : 'Nuevo contador'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Juan Pérez" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="juan@estudio.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña {editando && <span className="text-gray-400 font-normal">(dejar vacío para no cambiar)</span>}
                </label>
                <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={guardar} disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
