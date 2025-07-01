import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X, Smartphone, Apple } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(iOS)

    // Check if app is already installed
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    const iosStandalone = (window.navigator as any).standalone === true
    const isInStandaloneMode = standalone || iosStandalone
    
    setIsStandalone(isInStandaloneMode)
    setIsInstalled(isInStandaloneMode)

    if (isInStandaloneMode) return

    // Listen for install prompt (Android/Desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      
      // Show prompt after a delay, but only if not dismissed recently
      const lastDismissed = localStorage.getItem('pwa-prompt-dismissed')
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000)
      
      if (!lastDismissed || parseInt(lastDismissed) < oneDayAgo) {
        setTimeout(() => {
          setShowPrompt(true)
        }, 3000)
      }
    }

    // Handle app installation
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setShowPrompt(false)
      setDeferredPrompt(null)
      localStorage.removeItem('pwa-prompt-dismissed')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    // Show iOS install prompt if on iOS and not installed
    if (iOS && !isInStandaloneMode) {
      const iosPromptDismissed = localStorage.getItem('ios-install-dismissed')
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000)
      
      if (!iosPromptDismissed || parseInt(iosPromptDismissed) < oneDayAgo) {
        setTimeout(() => {
          setShowPrompt(true)
        }, 5000)
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    try {
      await deferredPrompt.prompt()
      const choiceResult = await deferredPrompt.userChoice
      
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt')
      }
      
      setDeferredPrompt(null)
      setShowPrompt(false)
    } catch (error) {
      console.error('Install prompt failed:', error)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    const dismissTime = Date.now().toString()
    
    if (isIOS) {
      localStorage.setItem('ios-install-dismissed', dismissTime)
    } else {
      localStorage.setItem('pwa-prompt-dismissed', dismissTime)
    }
  }

  // Don't show if already installed
  if (isInstalled || isStandalone) {
    return null
  }

  const IOSInstallInstructions = () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <Apple className="w-6 h-6 text-gray-300" />
        <h3 className="font-semibold text-gray-100">Install HealthyFlow on iOS</h3>
      </div>
      
      <div className="space-y-3 text-sm text-gray-300">
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
            1
          </div>
          <p>Tap the <strong>Share</strong> button in Safari (bottom of screen)</p>
        </div>
        
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
            2
          </div>
          <p>Scroll down and tap <strong>"Add to Home Screen"</strong></p>
        </div>
        
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
            3
          </div>
          <p>Tap <strong>"Add"</strong> to install HealthyFlow</p>
        </div>
      </div>
      
      <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3">
        <p className="text-xs text-cyan-300">
          💡 Once installed, HealthyFlow will work offline and feel like a native app!
        </p>
      </div>
    </div>
  )

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: -100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -100 }}
          className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg"
        >
          <div className="max-w-md mx-auto p-4">
            {isIOS ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Apple className="w-5 h-5" />
                    <span className="font-medium text-sm">Install on iOS</span>
                  </div>
                  <button
                    onClick={handleDismiss}
                    className="p-1 hover:bg-white/20 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="text-xs opacity-90">
                  Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> for the best experience
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">Install HealthyFlow</p>
                    <p className="text-xs opacity-90">Works offline • Push notifications</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleInstall}
                    className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>Install</span>
                  </button>
                  
                  <button
                    onClick={handleDismiss}
                    className="p-1 hover:bg-white/20 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
      
      {/* iOS Install Instructions Modal */}
      {isIOS && showPrompt && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4"
          onClick={handleDismiss}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <IOSInstallInstructions />
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={handleDismiss}
                className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
              >
                Maybe Later
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
              >
                Got It
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}