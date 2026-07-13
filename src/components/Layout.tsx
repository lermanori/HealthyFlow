import { ReactNode, useEffect, useState, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Home,
  Calendar,
  Settings,
  LogOut,
  Brain,
  Sparkles,
  Menu,
  X,
  Coins,
  MessageCircle,
  Utensils,
  Microscope,
  Award,
  Dumbbell
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import PWAInstallPrompt from './PWAInstallPrompt'
import MayaDemoGuide from './MayaDemoGuide'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettings } from '../hooks/useSettings'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    ;(window as any).__healthyFlowDemo = {
      ...((window as any).__healthyFlowDemo ?? {}),
      openAccountMenu: () => setIsMobileMenuOpen(true),
      closeAccountMenu: () => setIsMobileMenuOpen(false),
    }

    return () => {
      if (!(window as any).__healthyFlowDemo) return
      delete (window as any).__healthyFlowDemo.openAccountMenu
      delete (window as any).__healthyFlowDemo.closeAccountMenu
    }
  }, [])

  const { settings } = useSettings()
  const isTalkPage = location.pathname === '/talk'
  const searchParams = new URLSearchParams(location.search)
  const isMayaDemo = location.pathname === '/demo' || searchParams.get('demo') === 'maya' || localStorage.getItem('demoPersona') === 'maya'

  const navigation = [
    { name: 'Today', href: '/', icon: Home },
    { name: 'Talk', href: '/talk', icon: MessageCircle },
    { name: 'Week View', href: '/week', icon: Calendar },
    ...(settings?.calorieIntake ? [{ name: 'Calories', href: '/calories', icon: Utensils }] : []),
    ...(settings?.achievementTracker ? [{ name: 'Achievements', href: '/achievements', icon: Award }] : []),
    ...(settings?.workoutTracker ?? true ? [{ name: 'Workouts', href: '/workouts', icon: Dumbbell }] : []),
    { name: 'Settings', href: '/settings', icon: Settings },
    ...(user?.role === 'admin' ? [{ name: 'OCR Lab', href: '/meal-ocr-lab', icon: Microscope }] : []),
    ...(user?.role === 'admin' ? [{ name: 'Token Manager', href: '/token-manager', icon: Coins }] : []),
  ]

  const primaryMobileNavigation = navigation.filter((item) => (
    item.href === '/' || item.href === '/talk'
  ))

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
            className="fixed top-0 left-0 h-full w-80 max-w-[85vw] bg-page/95 backdrop-blur-xl border-r border-line/50 z-50 lg:hidden"
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-line/50">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl animate-float">
                      <Brain className="w-6 h-6 text-white" />
                    </div>
                    <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-cyan-400 animate-neon-flicker" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-ink neon-text">HealthyFlow</h1>
                    <p className="text-xs text-cyan-400">AI-Powered Planner</p>
                  </div>
                </div>
                
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 rounded-lg hover:bg-card/50 transition-colors text-ink-muted hover:text-ink-soft"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Navigation */}
              <nav className="flex-1 overflow-y-auto p-6">
                <ul className="space-y-2">
                  {navigation.map((item) => {
                    const isActive = location.pathname === item.href
                    return (
                      <li key={item.name}>
                        <Link
                          to={item.href}
                          data-demo={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                          data-demo-id={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                          className={`flex items-center space-x-3 px-4 py-4 rounded-xl transition-all duration-300 group ${
                            isActive
                              ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/20'
                              : 'text-ink-muted hover:bg-card/50 hover:text-ink-soft hover:border-line-strong/50 border border-transparent'
                          }`}
                        >
                          <item.icon className={`w-6 h-6 transition-all duration-300 ${
                            isActive ? 'text-cyan-400' : 'group-hover:text-ink-soft'
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
                    <span className="text-sm font-medium text-purple-400">Talk</span>
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  </div>
                  <p className="text-xs text-ink-muted">
                    Ready to analyze your tasks and provide intelligent suggestions
                  </p>
                </div>
              </nav>

              {/* User Info & Logout */}
              <div className="shrink-0 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] border-t border-line/50">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">
                      {user?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-soft">{user?.name}</p>
                    <p className="text-xs text-ink-muted">{user?.email}</p>
                  </div>
                </div>
                
                <button
                  onClick={logout}
                  data-demo-id="logout-button"
                  className="flex items-center space-x-2 w-full text-ink-muted hover:text-ink-soft transition-colors p-3 rounded-lg hover:bg-card/50"
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
    <div className="min-h-screen bg-page">
      {/* PWA Install Prompt */}
      <PWAInstallPrompt suppressed={isMayaDemo} />
      
      {/* Futuristic background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Mobile Header */}
      {isMobile && (
        <header className="pwa-mobile-header fixed left-0 right-0 top-0 z-30 border-b border-line/50 lg:hidden">
          <div className="flex h-[calc(4.8125rem+env(safe-area-inset-top))] items-end justify-between p-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              data-demo-id="account-menu"
              className="p-2 rounded-lg hover:bg-card/50 transition-colors text-ink-muted hover:text-ink-soft"
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
              <h1 className="text-lg font-bold text-ink neon-text">HealthyFlow</h1>
            </div>
            
            {/* Mobile User Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              data-demo-id="account-menu"
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
        <header className="relative z-10 glass-effect border-b border-line/50">
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
                  <h1 className="text-xl font-bold text-ink neon-text">HealthyFlow</h1>
                  <p className="text-xs text-cyan-400">AI-Powered Future Planner</p>
                </div>
              </div>
              
              <div data-demo-id="account-menu" className="flex items-center space-x-4">
                <div className="text-right">
                  <span className="text-sm text-ink-soft">Welcome back,</span>
                  <p className="text-sm font-medium text-cyan-400">{user?.name}</p>
                </div>
                <button
                  onClick={logout}
                  data-demo-id="logout-button"
                  className="flex items-center space-x-2 text-ink-muted hover:text-ink-soft transition-colors p-2 rounded-lg hover:bg-card/50"
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
          <nav className="w-64 glass-effect min-h-screen border-r border-line/50">
            <div className="p-4">
              <ul className="space-y-2">
                {navigation.map((item) => {
                  const isActive = location.pathname === item.href
                  return (
                    <li key={item.name}>
                        <Link
                        to={item.href}
                        data-demo={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                        data-demo-id={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                        className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
                          isActive
                            ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/20'
                            : 'text-ink-muted hover:bg-card/50 hover:text-ink-soft hover:border-line-strong/50 border border-transparent'
                        }`}
                      >
                        <item.icon className={`w-5 h-5 transition-all duration-300 ${
                          isActive ? 'text-cyan-400' : 'group-hover:text-ink-soft'
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
                  <span className="text-sm font-medium text-purple-400">Talk</span>
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                </div>
                <p className="text-xs text-ink-muted">
                  Ready to analyze your tasks and provide intelligent suggestions
                </p>
              </div>
            </div>
          </nav>
        )}

        {/* Mobile Navigation */}
        <MobileNavigation />

        {/* Main Content */}
        <main
          data-demo="main-content"
          data-demo-id="main-content"
          className={`min-w-0 flex-1 overflow-x-hidden ${
            isMobile
              ? isTalkPage ? 'mt-[calc(4.8125rem+env(safe-area-inset-top))] h-[calc(100dvh-4.8125rem-env(safe-area-inset-top))] p-0' : 'mt-[calc(4.8125rem+env(safe-area-inset-top))] p-4 pb-32'
              : 'p-6'
          }`}
          ref={contentRef}
        >
          <div className={`min-w-0 ${isMobile ? `max-w-full ${isTalkPage ? 'h-full' : ''}` : 'max-w-6xl'} mx-auto`}>
            {children}
            {!(isMobile && isTalkPage) && (
              <footer className="mt-10 flex flex-wrap justify-center gap-4 text-xs text-gray-500">
                <Link to="/privacy" className="transition-colors hover:text-cyan-400">
                  Privacy Policy
                </Link>
                <Link to="/terms" className="transition-colors hover:text-cyan-400">
                  Terms of Service
                </Link>
              </footer>
            )}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation — hidden while the drawer is open so it doesn't cover the drawer's Logout button */}
      {isMobile && !isMobileMenuOpen && (
        <div className="mobile-bottom-dock fixed bottom-0 left-0 right-0 z-30 border-t border-line/50 bg-page/95 backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-2 p-2">
            {primaryMobileNavigation.map((item) => {
              const isActive = location.pathname === item.href
              const isPrimary = item.href === '/talk'
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  aria-label={item.name}
                  data-demo-id={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                  className={`mobile-dock-link flex min-w-0 flex-col items-center space-y-1 rounded-xl p-2 transition-all duration-300 xs:p-3 ${
                    isPrimary
                      ? `bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30 ${isActive ? 'ring-2 ring-cyan-300/60' : ''}`
                      : isActive
                        ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-400'
                        : 'text-ink-muted hover:text-ink-soft hover:bg-card/50'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive && !isPrimary ? 'text-cyan-400' : ''}`} />
                  <span className="mobile-nav-label max-w-full truncate text-[10px] font-medium leading-tight xs:text-xs">
                    {item.name}
                  </span>
                  {isActive && !isPrimary && (
                    <div className="w-1 h-1 bg-cyan-400 rounded-full"></div>
                  )}
                </Link>
              )
            })}
          </div>
          
        </div>
      )}
      <MayaDemoGuide />
    </div>
  )
}
