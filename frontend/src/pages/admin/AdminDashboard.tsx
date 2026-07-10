import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function AdminDashboard() {
  const { user } = useAuth()

  const cards = [
    {
      title: 'Contadores',
      desc: 'Administrar usuarios contadores del estudio',
      to: '/admin/contadores',
      icon: '👤',
      color: 'bg-blue-50 border-blue-200',
      btnColor: 'bg-blue-600 hover:bg-blue-700',
    },
    {
      title: 'Clientes',
      desc: 'Administrar clientes y sus credenciales AFIP',
      to: '/admin/clientes',
      icon: '🏢',
      color: 'bg-green-50 border-green-200',
      btnColor: 'bg-green-600 hover:bg-green-700',
    },
    {
      title: 'Portal Contador',
      desc: 'Ver la plataforma como contador',
      to: '/contador',
      icon: '📊',
      color: 'bg-purple-50 border-purple-200',
      btnColor: 'bg-purple-600 hover:bg-purple-700',
    },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
        <p className="text-gray-500 mt-1">Bienvenido, {user?.nombre}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className={`card border-2 ${card.color} hover:shadow-md transition-shadow group`}
          >
            <div className="text-4xl mb-3">{card.icon}</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{card.title}</h2>
            <p className="text-sm text-gray-600">{card.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
