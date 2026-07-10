import { useState, useEffect } from 'react'
import { adminApi, Cliente, User } from '../../api/client'
import toast from 'react-hot-toast'

// ── helpers ───────────────────────────────────────────────────────────────────
function formatCuit(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`
}
function cuitDigits(cuit: string) { return cuit.replace(/\D/g, '') }

// ── Sección Contadores ────────────────────────────────────────────────────────
interface ContForm { nombre: string; email: string; password: string }
const EMPTY_CONT: ContForm = { nombre: '', email: '', password: '' }

function SeccionContadores() {
  const [lista, setLista] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<User | null>(null)
  const [form, setForm] = useState<ContForm>(EMPTY_CONT)
  const [saving, setSaving] = useState(false)

  const cargar = async () => {
    setLoading(true)
    try {
      const res = await adminApi.getUsuarios()
      setLista(res.data.filter(u => u.rol === 'contador'))
    } catch { toast.error('Error al cargar contadores') }
    finally { setLoading(false) }
  }

  useEffect(() => { cargar() }, [])

  const abrirNuevo = () => { setEditando(null); setForm(EMPTY_CONT); setModal(true) }
  const abrirEditar = (u: User) => { setEditando(u); setForm({ nombre: u.nombre, email: u.email, password: '' }); setModal(true) }

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
      setModal(false); cargar()
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Error al guardar') }
    finally { setSaving(false) }
  }

  const desactivar = async (id: number) => {
    if (!confirm('¿Desactivar este contador?')) return
    try { await adminApi.eliminarUsuario(id); toast.success('Desactivado'); cargar() }
    catch { toast.error('Error al desactivar') }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{lista.length} contadores registrados</p>
        <button onClick={abrirNuevo} className="btn-primary text-sm">+ Nuevo contador</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" /></div>
      ) : lista.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <p className="mb-3">No hay contadores cargados</p>
          <button onClick={abrirNuevo} className="btn-primary">Crear el primero</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Nombre</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lista.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{c.nombre}</td>
                  <td className="px-5 py-3 text-gray-600">{c.email}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${c.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right space-x-2">
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

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">{editando ? 'Editar contador' : 'Nuevo contador'}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                <input className="input" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Juan Pérez" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="juan@estudio.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña {editando && <span className="text-gray-400 font-normal">(dejar vacío para no cambiar)</span>}
                </label>
                <input className="input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={guardar} disabled={saving} className="btn-primary">{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sección Clientes ──────────────────────────────────────────────────────────
interface CliForm {
  nombre: string; cuit: string; email: string
  afip_password: string; representado: string; contador_ids: number[]
}
const EMPTY_CLI: CliForm = { nombre: '', cuit: '', email: '', afip_password: '', representado: '', contador_ids: [] }

function SeccionClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [contadores, setContadores] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [form, setForm] = useState<CliForm>(EMPTY_CLI)
  const [saving, setSaving] = useState(false)
  const [showPass, setShowPass] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroRep, setFiltroRep] = useState('')

  const cargar = async () => {
    setLoading(true)
    try {
      const [cr, cr2] = await Promise.all([adminApi.getClientes(), adminApi.getContadores()])
      setClientes(cr.data); setContadores(cr2.data)
    } catch { toast.error('Error al cargar datos') }
    finally { setLoading(false) }
  }

  useEffect(() => { cargar() }, [])

  const abrirNuevo = () => { setEditando(null); setForm(EMPTY_CLI); setShowPass(true); setModal(true) }
  const abrirEditar = (c: Cliente) => {
    setEditando(c)
    setForm({ nombre: c.nombre, cuit: c.cuit, email: c.email || '', afip_password: '', representado: (c as any).representado || '', contador_ids: c.contadores?.map(u => u.id) || [] })
    setShowPass(true); setModal(true)
  }

  const toggleCont = (id: number) =>
    setForm(prev => ({ ...prev, contador_ids: prev.contador_ids.includes(id) ? prev.contador_ids.filter(x => x !== id) : [...prev.contador_ids, id] }))

  const guardar = async () => {
    if (!form.nombre.trim()) return toast.error('Ingresá el nombre o razón social')
    if (cuitDigits(form.cuit).length !== 11) return toast.error('El CUIT debe tener 11 dígitos')
    if (!editando && !form.afip_password) return toast.error('Ingresá la clave fiscal de AFIP')
    setSaving(true)
    try {
      const rep = form.representado.trim() || form.nombre.trim()
      if (editando) {
        const payload: any = { nombre: form.nombre, email: form.email || null, afip_cuit: form.cuit, representado: rep, contador_ids: form.contador_ids }
        if (form.afip_password) payload.afip_password = form.afip_password
        await adminApi.actualizarCliente(editando.id, payload)
        toast.success('Cliente actualizado')
      } else {
        await adminApi.crearCliente({ nombre: form.nombre, cuit: form.cuit, email: form.email || null, afip_cuit: form.cuit, afip_password: form.afip_password, representado: rep, contador_ids: form.contador_ids })
        toast.success('Cliente creado')
      }
      setModal(false); cargar()
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Error al guardar') }
    finally { setSaving(false) }
  }

  const desactivar = async (id: number) => {
    if (!confirm('¿Desactivar este cliente?')) return
    try { await adminApi.eliminarCliente(id); toast.success('Desactivado'); cargar() }
    catch { toast.error('Error al desactivar') }
  }

  const clientesUnicos = Array.from(new Set(clientes.map(c => c.nombre))).sort()
  const representadosUnicos = Array.from(
    new Set(clientes.map(c => (c as any).representado || c.nombre).filter(Boolean))
  ).sort()

  const filtrados = clientes.filter(c => {
    if (busqueda) {
      const b = busqueda.toLowerCase()
      const cuitN = c.cuit.replace(/\D/g, '')
      const bN = b.replace(/\D/g, '')
      const matchNombre = c.nombre.toLowerCase().includes(b) || (bN ? cuitN.includes(bN) : c.cuit.includes(b))
      if (!matchNombre) return false
    }
    if (filtroRep) {
      const rep = ((c as any).representado || c.nombre).toLowerCase()
      if (!rep.includes(filtroRep.toLowerCase())) return false
    }
    return true
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3 flex-1">
          <p className="text-sm text-gray-500 shrink-0">{clientes.length} clientes</p>
          <input
            className="input py-1.5 text-sm flex-1 max-w-xs"
            placeholder="Buscar cliente..."
            value={busqueda}
            list="lista-clientes"
            autoComplete="off"
            onChange={e => setBusqueda(e.target.value)}
          />
          <datalist id="lista-clientes">
            {clientesUnicos.map(n => <option key={n} value={n} />)}
          </datalist>

          <input
            className="input py-1.5 text-sm flex-1 max-w-xs"
            placeholder="Buscar representado..."
            value={filtroRep}
            list="lista-representados"
            autoComplete="off"
            onChange={e => setFiltroRep(e.target.value)}
          />
          <datalist id="lista-representados">
            {representadosUnicos.map(r => <option key={r} value={r} />)}
          </datalist>

          {(busqueda || filtroRep) && (
            <>
              <span className="text-xs text-gray-400">{filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}</span>
              <button className="text-xs text-gray-400 hover:text-gray-600 underline" onClick={() => { setBusqueda(''); setFiltroRep('') }}>Limpiar</button>
            </>
          )}
        </div>
        <button onClick={abrirNuevo} className="btn-primary text-sm shrink-0">+ Nuevo cliente</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" /></div>
      ) : filtrados.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          {clientes.length === 0 ? (
            <><p className="mb-3">No hay clientes cargados</p><button onClick={abrirNuevo} className="btn-primary">Crear el primero</button></>
          ) : 'Sin resultados para la búsqueda'}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">CUIT</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Representado AFIP</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Contadores</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="font-medium text-gray-900">{c.nombre}</div>
                    {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                  </td>
                  <td className="px-5 py-3 text-gray-600 font-mono text-sm">{c.cuit}</td>
                  <td className="px-5 py-3 text-gray-600 text-sm">{(c as any).representado || c.nombre}</td>
                  <td className="px-5 py-3">
                    {c.contadores && c.contadores.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.contadores.map(u => <span key={u.id} className="badge bg-blue-100 text-blue-700">{u.nombre}</span>)}
                      </div>
                    ) : <span className="text-gray-400 text-sm">Sin asignar</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`badge ${c.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right space-x-2">
                    <button onClick={() => abrirEditar(c)} className="btn-secondary text-sm py-1">Editar</button>
                    {c.activo && <button onClick={() => desactivar(c.id)} className="btn-danger text-sm py-1">Desactivar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-1">{editando ? 'Editar cliente' : 'Nuevo cliente'}</h2>
            <p className="text-xs text-gray-400 mb-5">Los campos con * son obligatorios</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre / Razón Social *</label>
                <input className="input" autoComplete="off" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Empresa S.A. o Juan Pérez" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CUIT * <span className="text-gray-400 font-normal">(se formatea automáticamente)</span>
                </label>
                <input
                  className="input font-mono" autoComplete="off" maxLength={13}
                  value={form.cuit}
                  onChange={e => setForm({ ...form, cuit: formatCuit(e.target.value) })}
                  placeholder="20-33831072-3"
                />
                {form.cuit && cuitDigits(form.cuit).length !== 11 && (
                  <p className="text-xs text-amber-600 mt-1">Faltan {11 - cuitDigits(form.cuit).length} dígito(s)</p>
                )}
                {form.cuit && cuitDigits(form.cuit).length === 11 && (
                  <p className="text-xs text-green-600 mt-1">✓ CUIT completo</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-gray-400 font-normal">(opcional)</span></label>
                <input className="input" type="email" autoComplete="new-password" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="cliente@empresa.com" />
              </div>
              <div className="border border-blue-100 bg-blue-50 rounded-lg p-4 space-y-3">
                <p className="text-sm font-semibold text-blue-800">Credenciales AFIP</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Clave Fiscal AFIP {editando ? <span className="text-gray-400 font-normal">(vacío = no cambiar)</span> : <span className="text-red-500">*</span>}
                  </label>
                  <p className="text-xs text-gray-500 mb-2">CUIT AFIP: {form.cuit || '—'}</p>
                  <div className="relative">
                    <input
                      className="input pr-16 font-mono" autoComplete="new-password"
                      type={showPass ? 'text' : 'password'}
                      value={form.afip_password}
                      onChange={e => setForm({ ...form, afip_password: e.target.value })}
                      placeholder="Clave fiscal de AFIP"
                    />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded" onClick={() => setShowPass(!showPass)}>
                      {showPass ? 'Ocultar' : 'Ver'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Representado en AFIP <span className="text-gray-400 font-normal">(si difiere del nombre)</span>
                  </label>
                  <input className="input" autoComplete="off" value={form.representado} onChange={e => setForm({ ...form, representado: e.target.value })} placeholder={form.nombre || 'Por defecto usa el nombre del cliente'} />
                  {!form.representado && form.nombre && (
                    <p className="text-xs text-gray-400 mt-1">Se usará: <span className="font-medium">{form.nombre}</span></p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Contadores asignados <span className="text-gray-400 font-normal">(opcional)</span></label>
                {contadores.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No hay contadores cargados aún.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {contadores.map(cnt => (
                      <label key={cnt.id} className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors ${form.contador_ids.includes(cnt.id) ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={form.contador_ids.includes(cnt.id)} onChange={() => toggleCont(cnt.id)} className="rounded text-primary-600" />
                        <span className="text-sm">{cnt.nombre}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end border-t pt-4">
              <button onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={guardar} disabled={saving} className="btn-primary">{saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear cliente'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function AdminBase() {
  const [tab, setTab] = useState<'clientes' | 'contadores'>('clientes')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Administración</h1>
        <p className="text-gray-500 text-sm mt-1">Gestión de clientes y contadores del estudio</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {([
          { v: 'clientes' as const, l: 'Clientes' },
          { v: 'contadores' as const, l: 'Contadores' },
        ]).map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === v
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >{l}</button>
        ))}
      </div>

      {tab === 'clientes' ? <SeccionClientes /> : <SeccionContadores />}
    </div>
  )
}
