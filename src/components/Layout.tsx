import { ReactNode, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  Home, 
  Plus, 
  Calendar, 
  Settings, 
  LogOut,
  Brain,
  Sparkles,
  Menu,
  X,
  User
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import PWAInstallPrompt from './PWAInstallPrompt'
import { motion, AnimatePresence } from 'framer-motion'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isMobileMenuOpen])

  const navigation = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Add Item', href: '/add', icon: Plus },
    { name: 'Week View', href: '/week', icon: Calendar },
    { name: 'Settings', href: '/settings', icon: Settings },
  ]

  const MobileNavigation = () => (
    <AnimatePresence>
      {isMobileMenuOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Mobile Menu */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 h-full w-80 max-w-[85vw] bg-gray-900/95 backdrop-blur-xl border-r border-gray-700/50 z-50 lg:hidden"
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-700/50">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl animate-float">
                      <Brain className="w-6 h-6 text-white" />
                    </div>
                    <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-cyan-400 animate-neon-flicker" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-100 neon-text">HealthyFlow</h1>
                    <p className="text-xs text-cyan-400">AI-Powered Planner</p>
                  </div>
                </div>
                
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-800/50 transition-colors text-gray-400 hover:text-gray-200"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Navigation */}
              <nav className="flex-1 p-6">
                <ul className="space-y-2">
                  {navigation.map((item) => {
                    const isActive = location.pathname === item.href
                    return (
                      <li key={item.name}>
                        <Link
                          to={item.href}
                          className={`flex items-center space-x-3 px-4 py-4 rounded-xl transition-all duration-300 group ${
                            isActive
                              ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/20'
                              : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 hover:border-gray-600/50 border border-transparent'
                          }`}
                        >
                          <item.icon className={`w-6 h-6 transition-all duration-300 ${
                            isActive ? 'text-cyan-400' : 'group-hover:text-gray-200'
                          }`} />
                          <span className="font-medium text-lg">{item.name}</span>
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
              </nav>

              {/* User Info & Logout */}
              <div className="p-6 border-t border-gray-700/50">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">
                      {user?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-200">{user?.name}</p>
                    <p className="text-xs text-gray-400">{user?.email}</p>
                  </div>
                </div>
                
                <button
                  onClick={logout}
                  className="flex items-center space-x-2 w-full text-gray-400 hover:text-gray-200 transition-colors p-3 rounded-lg hover:bg-gray-800/50"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return (
    <div className="min-h-screen bg-gray-900">
      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
      
      {/* Futuristic background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Mobile Header */}
      {isMobile && (
        <header className="relative z-10 glass-effect border-b border-gray-700/50 lg:hidden">
          <div className="flex items-center justify-between p-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-800/50 transition-colors text-gray-400 hover:text-gray-200"
            >
              <Menu className="w-6 h-6" />
            </button>
            
            <div className="flex items-center space-x-2">
              <div className="relative">
                <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg animate-float">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-cyan-400 animate-neon-flicker" />
              </div>
              <h1 className="text-lg font-bold text-gray-100 neon-text">HealthyFlow</h1>
            </div>
            
            {/* Mobile User Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center"
            >
              <span className="text-white font-semibold text-sm">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </button>
          </div>
        </header>
      )}

      {/* Desktop Header */}
      {!isMobile && (
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
      )}

      <div className="flex relative z-10">
        {/* Desktop Sidebar */}
        {!isMobile && (
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
        )}

        {/* Mobile Navigation */}
        <MobileNavigation />

        {/* Main Content */}
        <main className={`flex-1 ${isMobile ? 'p-4' : 'p-6'}`}>
          <div className={`${isMobile ? 'max-w-full' : 'max-w-6xl'} mx-auto`}>
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-xl border-t border-gray-700/50 z-30">
          <div className="grid grid-cols-5 gap-1 p-2">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex flex-col items-center space-y-1 p-3 rounded-xl transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-cyan-400' : ''}`} />
                  <span className="text-xs font-medium">{item.name}</span>
                  {isActive && (
                    <div className="w-1 h-1 bg-cyan-400 rounded-full"></div>
                  )}
                </Link>
              )
            })}
            
            {/* User Profile/Logout Button in Bottom Nav */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex flex-col items-center space-y-1 p-3 rounded-xl transition-all duration-300 text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
            >
              <User className="w-5 h-5" />
              <span className="text-xs font-medium">Profile</span>
            </button>
          </div>
          
          {/* Safe area padding for devices with home indicator */}
          <div className="h-safe-area-inset-bottom"></div>
        </div>
      )}
    </div>
  )
}