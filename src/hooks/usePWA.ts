import { useState, useEffect } from 'react'

interface PWAState {
  isInstallable: boolean
  isInstalled: boolean
  isStandalone: boolean
  canInstall: boolean
}

export function usePWA() {
  const [state, setState] = useState<PWAState>({
    isInstallable: false,
    isInstalled: false,
    isStandalone: false,
    canInstall: false
  })

  useEffect(() => {
    // Check if running in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const isIOSStandalone = (window.navigator as any).standalone === true
    
    setState(prev => ({
      ...prev,
      isStandalone: isStandalone || isIOSStandalone,
      isInstalled: isStandalone || isIOSStandalone
    }))

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setState(prev => ({
        ...prev,
        isInstallable: true,
        canInstall: true
      }))
    }

    // Handle app installation
    const handleAppInstalled = () => {
      setState(prev => ({
        ...prev,
        isInstalled: true,
        isInstallable: false,
        canInstall: false
      }))
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  return state
}