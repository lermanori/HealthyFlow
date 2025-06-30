import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  Home, 
  Plus, 
  Calendar, 
  Settings, 
  LogOut,
  Brain,
  Sparkles
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { user, logout } = useAuth()

  const navigation = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Add Item', href: '/add', icon: Plus },
    { name: 'Week View', href: '/week', icon: Calendar },
    { name: 'Settings', href: '/settings', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Futuristic background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 glass-effect border-b border-gray-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl animate-float">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-cyan-400 animate-neon-flicker" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-100 neon-text">HealthyFlow</h1>
                <p className="text-xs text-cyan-400">AI-Powered Future Planner</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <span className="text-sm text-gray-300">Welcome back,</span>
                <p className="text-sm font-medium text-cyan-400">{user?.name}</p>
              </div>
              <button
                onClick={logout}
                className="flex items-center space-x-2 text-gray-400 hover:text-gray-200 transition-colors p-2 rounded-lg hover:bg-gray-800/50"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex relative z-10">
        {/* Futuristic Sidebar */}
        <nav className="w-64 glass-effect min-h-screen border-r border-gray-700/50">
          <div className="p-4">
            <ul className="space-y-2">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
                        isActive
                          ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/20'
                          : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 hover:border-gray-600/50 border border-transparent'
                      }`}
                    >
                      <item.icon className={`w-5 h-5 transition-all duration-300 ${
                        isActive ? 'text-cyan-400' : 'group-hover:text-gray-200'
                      }`} />
                      <span className="font-medium">{item.name}</span>
                      {isActive && (
                        <div className="ml-auto w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>

            {/* AI Status Indicator */}
            <div className="mt-8 p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
              <div className="flex items-center space-x-2 mb-2">
                <Brain className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-purple-400">AI Assistant</span>
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              </div>
              <p className="text-xs text-gray-400">
                Ready to analyze your tasks and provide intelligent suggestions
              </p>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 p-6">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}