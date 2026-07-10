import { useAuth } from '../../contexts/AuthContext'

export default function ClienteDashboard() {
  const { user } = useAuth()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mi Portal</h1>
        <p className="text-gray-500 mt-1">Bienvenido, {user?.nombre}</p>
      </div>

      <div className="card border-2 border-dashed border-gray-200 text-center py-16">
        <div className="text-5xl mb-4">🏗️</div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Portal del cliente en construcción</h2>
        <p className="text-gray-500 max-w-md mx-auto">
          Pronto podrás acceder a tus comprobantes, estados de cuenta y otra información impositiva desde acá.
        </p>
      </div>
    </div>
  )
}
