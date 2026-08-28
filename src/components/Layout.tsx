import { ReactNode, useEffect, useState, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home,
  Calendar,
  Settings,
  LogOut,
  Menu,
  X,
  Coins,
  MessageCircle,
  Microscope,
  HeartPulse,
  Briefcase,
  UserPlus,
  LogIn,
  Target,
  CloudOff,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import PWAInstallPrompt from './PWAInstallPrompt'
import AppMark from './AppMark'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettings } from '../hooks/useSettings'
import type { ModuleNoticeState } from '../App'
import { useModalFocus } from '../hooks/useModalFocus'
import { WEEK_VIEW_ENABLED, WORK_ENABLED } from '../featureFlags'
import { MODULE_PRESENTATIONS } from '../modulePresentation'
import { parseDemoPersonaId } from '../demoPersonas'
import { analytics } from '../lib/analytics'
import { isNativeApp, isNativeIOS } from '../lib/native'
import type { CloudStatusNotification } from '../hooks/useCloudSync'
import { useOfflineStatus } from '../hooks/useOfflineStatus'

interface LayoutProps {
  children: ReactNode
  cloudStatus: CloudStatusNotification | null
  onDismissCloudStatus: () => void
}

interface NavigationItem {
  name: string
  href: string
  icon: LucideIcon
  activePaths?: string[]
}

interface NavigationGroup {
  id: 'today' | 'plan' | 'health' | 'utility'
  label: string
  items: NavigationItem[]
}

type TalkViewport = {
  bottom: number
  keyboardOpen: boolean
}

function currentViewportBottom() {
  const visualViewport = window.visualViewport
  return Math.min(
    window.innerHeight,
    visualViewport ? visualViewport.offsetTop + visualViewport.height : window.innerHeight,
  )
}

export default function Layout({ children, cloudStatus, onDismissCloudStatus }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, isGuest } = useAuth()
  const { isOffline, reconnected } = useOfflineStatus()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [talkViewport, setTalkViewport] = useState<TalkViewport>(() => ({
    bottom: currentViewportBottom(),
    keyboardOpen: false,
  }))
  const contentRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const mobileMenuCloseRef = useRef<HTMLButtonElement>(null)

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

  useModalFocus({
    open: isMobileMenuOpen,
    onClose: () => setIsMobileMenuOpen(false),
    containerRef: mobileMenuRef,
    initialFocusRef: mobileMenuCloseRef,
  })

  const { modules, resolution, retry } = useSettings()
  const isTalkPage = location.pathname === '/talk'

  useEffect(() => {
    if (!isMobile || !isTalkPage) return

    let disposed = false
    let nativeKeyboardHeight = 0
    let closedViewportBottom = Math.max(window.innerHeight, currentViewportBottom())
    const nativeListenerHandles: Array<{ remove: () => Promise<void> }> = []

    const measure = () => {
      const visibleBottom = currentViewportBottom()
      const composerFocused = document.activeElement?.matches('[data-demo-id="talk-input"]') ?? false
      const visuallyShrunk = composerFocused && visibleBottom < closedViewportBottom - 80

      if (nativeKeyboardHeight === 0 && !visuallyShrunk) {
        closedViewportBottom = Math.max(window.innerHeight, visibleBottom)
      }

      const nativeKeyboardTop = nativeKeyboardHeight > 0
        ? Math.max(0, closedViewportBottom - nativeKeyboardHeight)
        : visibleBottom
      const nextViewport = {
        bottom: Math.min(visibleBottom, nativeKeyboardTop),
        keyboardOpen: nativeKeyboardHeight > 0 || visuallyShrunk,
      }
      setTalkViewport((current) => (
        current.bottom === nextViewport.bottom && current.keyboardOpen === nextViewport.keyboardOpen
          ? current
          : nextViewport
      ))
    }

    const visualViewport = window.visualViewport
    window.addEventListener('resize', measure)
    window.addEventListener('focusin', measure)
    window.addEventListener('focusout', measure)
    visualViewport?.addEventListener('resize', measure)
    visualViewport?.addEventListener('scroll', measure)
    measure()

    if (isNativeIOS && Capacitor.isPluginAvailable('Keyboard')) {
      void Promise.all([
        Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => {
          nativeKeyboardHeight = keyboardHeight
          measure()
        }),
        Keyboard.addListener('keyboardDidShow', ({ keyboardHeight }) => {
          nativeKeyboardHeight = keyboardHeight
          measure()
        }),
        Keyboard.addListener('keyboardWillHide', () => {
          nativeKeyboardHeight = 0
          measure()
        }),
        Keyboard.addListener('keyboardDidHide', () => {
          nativeKeyboardHeight = 0
          measure()
        }),
      ]).then((handles) => {
        if (disposed) {
          void Promise.all(handles.map((handle) => handle.remove())).catch((error) => {
            console.error('[talk-viewport] Could not remove late Keyboard listeners.', error)
          })
          return
        }
        nativeListenerHandles.push(...handles)
      }).catch((error) => {
        console.error('[talk-viewport] Could not register Keyboard listeners.', error)
      })
    }

    return () => {
      disposed = true
      window.removeEventListener('resize', measure)
      window.removeEventListener('focusin', measure)
      window.removeEventListener('focusout', measure)
      visualViewport?.removeEventListener('resize', measure)
      visualViewport?.removeEventListener('scroll', measure)
      void Promise.all(nativeListenerHandles.map((handle) => handle.remove())).catch((error) => {
        console.error('[talk-viewport] Could not remove Keyboard listeners.', error)
      })
      setTalkViewport({ bottom: currentViewportBottom(), keyboardOpen: false })
    }
  }, [isMobile, isTalkPage])

  const talkMainStyle = isMobile && isTalkPage
    ? {
        '--talk-viewport-bottom': `${talkViewport.bottom}px`,
        '--talk-dock-reserve': talkViewport.keyboardOpen ? '0px' : 'var(--mobile-dock-height)',
      } as CSSProperties
    : undefined
  const searchParams = new URLSearchParams(location.search)
  const isDemo = location.pathname === '/demo' || Boolean(searchParams.get('demo')) || Boolean(localStorage.getItem('demoPersona'))
  const handleSessionExit = () => {
    if (isDemo) {
      const persona = parseDemoPersonaId(localStorage.getItem('demoPersona'))
      analytics.capture('demo_ended', { persona, reason: 'closed' })
      navigate(`/demo?persona=${persona}&stage=finish&reason=closed`)
      return
    }
    logout()
  }

  /**
   * A Guest cannot log out.
   *
   * There is nothing to sign back in with — no email, no password — and their day
   * is on this device, so logging out would strand it behind a session that can
   * never be re-issued (ADR-0010). Deleting the account is still available in
   * Settings, and that at least says what it does.
   */
  const canExitSession = !isGuest

  const healthEnabled = Object.values(modules).includes('enabled')
  const navigationGroups = ([
    {
      id: 'today',
      label: 'Today',
      items: [
        { name: 'Today', href: '/', icon: Home },
        { name: 'Talk', href: '/talk', icon: MessageCircle },
      ],
    },
    {
      id: 'plan',
      label: 'Plan',
      items: [
        { name: 'Goals', href: '/goals', icon: Target },
        ...(WORK_ENABLED ? [{ name: 'Work', href: '/work', icon: Briefcase }] : []),
        ...(WEEK_VIEW_ENABLED ? [{ name: 'Week', href: '/week', icon: Calendar }] : []),
      ],
    },
    {
      id: 'health',
      label: 'Health tools',
      items: healthEnabled
        ? [{
            name: 'Health',
            href: '/health',
            icon: HeartPulse,
            activePaths: ['/health', ...MODULE_PRESENTATIONS.flatMap((presentation) => presentation.route.activePaths)],
          }]
        : [],
    },
    {
      id: 'utility',
      label: 'Utility',
      items: [
        { name: 'Settings', href: '/settings', icon: Settings },
        ...(user?.role === 'admin' ? [{ name: 'OCR Lab', href: '/meal-ocr-lab', icon: Microscope }] : []),
        ...(user?.role === 'admin' ? [{ name: 'Token Manager', href: '/token-manager', icon: Coins }] : []),
      ],
    },
  ] satisfies NavigationGroup[]).filter((group) => group.items.length > 0)
  const navigation = navigationGroups.flatMap((group) => group.items)
  const isNavigationActive = (item: NavigationItem) => (
    item.activePaths?.includes(location.pathname)
      ?? (location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(`${item.href}/`)))
  )
  const moduleNotice = (location.state as ModuleNoticeState | null)?.moduleNotice

  const dismissModuleNotice = () => {
    const state = location.state && typeof location.state === 'object'
      ? { ...(location.state as Record<string, unknown>) }
      : {}
    delete state.moduleNotice
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state })
  }

  const primaryMobileNavigation = navigation.filter((item) => (
    item.href === '/' || item.href === '/goals' || item.href === '/talk'
  ))
  const networkStatus = isOffline
    ? { state: 'offline' as const, message: "You're offline. Some features may be limited." }
    : reconnected
      ? { state: 'reconnected' as const, message: "You're back online! Syncing data..." }
      : null

  const MobileNavigation = () => createPortal((
    <AnimatePresence>
      {isMobileMenuOpen && (
        <>
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Close navigation drawer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Mobile Menu */}
          <motion.div
            ref={mobileMenuRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-navigation-title"
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
                  <AppMark size={40} />
                  <div>
                    <h1 id="mobile-navigation-title" className="text-xl font-bold text-ink">HealthyFlow navigation</h1>
                    <p className="text-xs text-ink-muted">Plan your day. Track what matters.</p>
                  </div>
                </div>
                
                <button
                  ref={mobileMenuCloseRef}
                  type="button"
                  aria-label="Close navigation drawer"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 rounded-lg hover:bg-card/50 transition-colors text-ink-muted hover:text-ink-soft"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Navigation */}
              <nav aria-label="Application" className="flex-1 overflow-y-auto p-6">
                <div className="space-y-6">
                  {navigationGroups.map((group) => {
                    const groupActive = group.items.some(isNavigationActive)
                    return (
                      <section key={group.id} aria-labelledby={`mobile-nav-group-${group.id}`}>
                        <div
                          id={`mobile-nav-group-${group.id}`}
                          className={`mb-2 px-4 text-[11px] font-bold uppercase tracking-[0.18em] ${
                            groupActive ? 'text-accent' : 'text-ink-muted'
                          }`}
                        >
                          {group.label}
                        </div>
                        <ul className="space-y-1.5">
                          {group.items.map((item) => {
                            const isActive = isNavigationActive(item)
                            return (
                              <li key={item.name}>
                                <Link
                                  to={item.href}
                                  aria-current={isActive ? 'page' : undefined}
                                  data-demo={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                                  data-demo-id={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                                  className={`group flex items-center space-x-3 rounded-control border px-4 py-3 transition-colors ${
                                    isActive
                                      ? 'border-accent/40 bg-accent/10 text-accent'
                                      : 'border-transparent text-ink-muted hover:border-line hover:bg-raised hover:text-ink'
                                  }`}
                                >
                                  <item.icon className={`h-5 w-5 transition-colors ${
                                    isActive ? 'text-accent' : 'group-hover:text-ink'
                                  }`} />
                                  <span className="font-medium">{item.name}</span>
                                </Link>
                              </li>
                            )
                          })}
                        </ul>
                      </section>
                    )
                  })}
                </div>

                {isNativeApp && (
                  <div className="mt-8 flex gap-5 border-t border-line/50 px-4 pt-5 text-sm text-ink-muted">
                    <Link to="/support" className="transition-colors hover:text-accent">Support</Link>
                    <Link to="/privacy" className="transition-colors hover:text-accent">Privacy</Link>
                    <Link to="/terms" className="transition-colors hover:text-accent">Terms</Link>
                  </div>
                )}
              </nav>

              {/* User Info & Logout */}
              <div className="shrink-0 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] border-t border-line/50">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-action">
                    <span className="text-white font-semibold text-sm">
                      {user?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-soft">{user?.name}</p>
                    <p className="text-xs text-ink-muted">{user?.email ?? 'On this iPhone only'}</p>
                  </div>
                </div>
                
                {isGuest && (
                  <Link
                    to="/claim"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center space-x-2 w-full text-ink-muted hover:text-ink-soft transition-colors p-3 rounded-lg hover:bg-card/50"
                  >
                    <UserPlus className="w-5 h-5" />
                    <span className="font-medium">Create an account</span>
                  </Link>
                )}

                {isGuest && (
                  <Link
                    to="/sign-in"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center space-x-2 w-full text-ink-muted hover:text-ink-soft transition-colors p-3 rounded-lg hover:bg-card/50"
                  >
                    <LogIn className="w-5 h-5" />
                    <span className="font-medium">Sign in</span>
                  </Link>
                )}

                {canExitSession && (
                  <button
                    onClick={handleSessionExit}
                    data-demo-id="logout-button"
                    className="flex items-center space-x-2 w-full text-ink-muted hover:text-ink-soft transition-colors p-3 rounded-lg hover:bg-card/50"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">{isDemo ? 'Exit demo' : 'Logout'}</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  ), document.body)

  return (
    <div className={`min-h-screen bg-page ${isNativeApp ? 'native-app-shell' : ''}`}>
      {/* PWA Install Prompt */}
      <PWAInstallPrompt suppressed={isDemo} />
      
      {/* Mobile Header */}
      {isMobile && (
        <header className="pwa-mobile-header fixed left-0 right-0 top-0 z-30 border-b border-line/50 lg:hidden">
          <div className="mobile-header-inner grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2 px-4">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setIsMobileMenuOpen(true)}
              data-demo-id="account-menu"
              className="flex h-11 w-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-card/50 hover:text-ink-soft"
            >
              <Menu className="w-6 h-6" />
            </button>
            
            <div className="flex min-w-0 items-center justify-center space-x-2">
              <AppMark size={30} />
              <h1 className="truncate text-[1.05rem] font-bold text-ink">HealthyFlow</h1>
            </div>
            
            {/* Mobile User Menu Button */}
            <button
              type="button"
              aria-label="Open account navigation"
              onClick={() => setIsMobileMenuOpen(true)}
              data-demo-id="account-menu"
              className="flex h-10 w-10 justify-self-end items-center justify-center rounded-full bg-action"
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
                <AppMark size={40} />
                <div>
                  <h1 className="text-xl font-bold text-ink">HealthyFlow</h1>
                  <p className="text-xs text-ink-muted">Plan your day. Track what matters.</p>
                </div>
              </div>
              
              <div data-demo-id="account-menu" className="flex items-center space-x-4">
                <div className="text-right">
                  <span className="text-sm text-ink-soft">Welcome back,</span>
                  <p className="text-sm font-medium text-ink">{user?.name}</p>
                </div>
                {isGuest && (
                  <Link
                    to="/claim"
                    className="flex items-center space-x-2 text-ink-muted hover:text-ink-soft transition-colors p-2 rounded-lg hover:bg-card/50"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span className="text-sm">Create an account</span>
                  </Link>
                )}

                {isGuest && (
                  <Link
                    to="/sign-in"
                    className="flex items-center space-x-2 text-ink-muted hover:text-ink-soft transition-colors p-2 rounded-lg hover:bg-card/50"
                  >
                    <LogIn className="w-4 h-4" />
                    <span className="text-sm">Sign in</span>
                  </Link>
                )}

                {canExitSession && (
                  <button
                    onClick={handleSessionExit}
                    data-demo-id="logout-button"
                    className="flex items-center space-x-2 text-ink-muted hover:text-ink-soft transition-colors p-2 rounded-lg hover:bg-card/50"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm">{isDemo ? 'Exit demo' : 'Logout'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>
      )}

      <div className="flex relative z-10">
        {/* Desktop Sidebar */}
        {!isMobile && (
          <nav aria-label="Application" className="w-64 glass-effect min-h-screen border-r border-line/50">
            <div className="p-4">
              <div className="space-y-6">
                {navigationGroups.map((group) => {
                  const groupActive = group.items.some(isNavigationActive)
                  return (
                    <section key={group.id} aria-labelledby={`desktop-nav-group-${group.id}`}>
                      <div
                        id={`desktop-nav-group-${group.id}`}
                        className={`mb-2 px-4 text-[10px] font-bold uppercase tracking-[0.18em] ${
                          groupActive ? 'text-accent' : 'text-ink-muted'
                        }`}
                      >
                        {group.label}
                      </div>
                      <ul className="space-y-1">
                        {group.items.map((item) => {
                          const isActive = isNavigationActive(item)
                          return (
                            <li key={item.name}>
                              <Link
                                to={item.href}
                                aria-current={isActive ? 'page' : undefined}
                                data-demo={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                                data-demo-id={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                                className={`group flex items-center space-x-3 rounded-control border px-4 py-3 transition-colors ${
                                  isActive
                                    ? 'border-accent/40 bg-accent/10 text-accent'
                                    : 'border-transparent text-ink-muted hover:border-line hover:bg-raised hover:text-ink'
                                }`}
                              >
                                <item.icon className={`h-5 w-5 transition-colors ${
                                  isActive ? 'text-accent' : 'group-hover:text-ink'
                                }`} />
                                <span className="font-medium">{item.name}</span>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )
                })}
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
          className={`flex min-w-0 flex-1 flex-col overflow-x-hidden ${
            isMobile
              ? isTalkPage
                ? 'talk-main-content mt-[var(--mobile-header-height)] p-0'
                : 'mobile-main-content mt-[var(--mobile-header-height)] p-4'
              : 'p-6'
          }`}
          style={talkMainStyle}
          ref={contentRef}
        >
          {(networkStatus || cloudStatus) && (
            <div className={`mx-auto mb-4 w-full max-w-6xl shrink-0 space-y-3 ${isMobile && isTalkPage ? 'px-4 pt-3' : ''}`}>
              {networkStatus && (
                <div
                  data-demo-id="network-status-notification"
                  className={`flex w-full items-start justify-center gap-2 rounded-control px-3 py-2.5 text-sm font-medium text-on-action shadow-section ${
                    networkStatus.state === 'offline' ? 'bg-state-danger' : 'bg-state-success'
                  }`}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {networkStatus.state === 'offline'
                    ? <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    : <Wifi className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                  <p className="min-w-0 leading-5">{networkStatus.message}</p>
                </div>
              )}
              {cloudStatus && (
                <div
                  data-demo-id="cloud-status-notification"
                  className="flex w-full items-start gap-3 rounded-control border border-state-warning/40 bg-state-warning/10 px-3 py-2.5 text-sm text-ink shadow-section"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-state-warning" aria-hidden="true" />
                  <p className="min-w-0 flex-1 leading-5">{cloudStatus.message}</p>
                  <button
                    type="button"
                    aria-label="Dismiss Cloud status"
                    className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    onClick={onDismissCloudStatus}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          )}
          <div className={`min-h-0 min-w-0 flex-1 ${isMobile ? 'max-w-full' : 'max-w-6xl'} mx-auto w-full`}>
            {moduleNotice && (
              <div className="mb-4 flex items-start justify-between gap-4 rounded-section border border-state-warning/40 bg-state-warning/10 p-4 text-sm" role="status">
                <div>
                  <p className="font-medium text-ink">{moduleNotice.message}</p>
                  <Link className="mt-1 inline-block font-medium text-accent underline underline-offset-2" to="/settings/health-tools">
                    Enable in Settings
                  </Link>
                </div>
                <button type="button" aria-label="Dismiss module notice" className="rounded-control p-2 text-ink-muted hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" onClick={dismissModuleNotice}>
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
            {resolution === 'error' && !moduleNotice && (
              <div className="mb-4 flex items-center justify-between gap-4 rounded-section border border-state-warning/40 bg-state-warning/10 p-4 text-sm" role="status">
                <p className="text-ink">Optional modules could not be checked.</p>
                <button type="button" className="font-medium text-accent underline underline-offset-2" onClick={() => void retry()}>Retry</button>
              </div>
            )}
            {children}
            {!(isMobile && isTalkPage) && !(isMobile && isNativeApp) && (
              <footer className="mt-10 flex flex-wrap justify-center gap-4 text-xs text-ink-muted">
                <Link to="/support" className="transition-colors hover:text-accent">
                  Support
                </Link>
                <Link to="/privacy" className="transition-colors hover:text-accent">
                  Privacy Policy
                </Link>
                <Link to="/terms" className="transition-colors hover:text-accent">
                  Terms of Service
                </Link>
              </footer>
            )}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation — hidden while the drawer is open so it doesn't cover the drawer's Logout button */}
      {isMobile && !isMobileMenuOpen && !(isTalkPage && talkViewport.keyboardOpen) && (
        <div className="mobile-bottom-dock fixed bottom-0 left-0 right-0 z-30 border-t border-line/50 bg-page/95 backdrop-blur-xl">
          <nav aria-label="Primary" className="mx-auto grid h-[var(--mobile-dock-content-height)] max-w-sm grid-cols-3 px-4 py-1">
            {primaryMobileNavigation.map((item) => {
              const isActive = isNavigationActive(item)
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  aria-label={item.name}
                  data-demo-id={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                  className={`mobile-dock-link flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-control transition-colors ${
                    isActive
                      ? 'text-accent'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                    isActive ? 'bg-accent/15' : ''
                  }`}>
                    <item.icon className="h-5 w-5" />
                  </span>
                  <span className="mobile-nav-label max-w-full truncate text-[10px] font-medium leading-tight xs:text-xs">
                    {item.name}
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>
      )}
    </div>
  )
}
