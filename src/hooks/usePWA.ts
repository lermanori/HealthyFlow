import { useState, useEffect } from 'react'
import { analytics } from '../lib/analytics'

interface PWAState {
  isInstallable: boolean
  isInstalled: boolean
  isStandalone: boolean
  canInstall: boolean
  isIOS: boolean
  deferredPrompt: any
}

export function usePWA() {
  const [state, setState] = useState<PWAState>({
    isInstallable: false,
    isInstalled: false,
    isStandalone: false,
    canInstall: false,
    isIOS: false,
    deferredPrompt: null
  })

  useEffect(() => {
    // Check if running in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const isIOSStandalone = window.navigator.standalone === true
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    
    setState(prev => ({
      ...prev,
      isStandalone: isStandalone || isIOSStandalone,
      isInstalled: isStandalone || isIOSStandalone,
      isIOS
    }))

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setState(prev => ({
        ...prev,
        isInstallable: true,
        canInstall: true,
        deferredPrompt: e
      }))
    }

    // Handle app installation
    const handleAppInstalled = () => {
      setState(prev => ({
        ...prev,
        isInstalled: true,
        isInstallable: false,
        canInstall: false,
        deferredPrompt: null
      }))

      analytics.capture('pwa_installed')
    }

    // Check for display mode changes
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setState(prev => ({
        ...prev,
        isStandalone: e.matches,
        isInstalled: e.matches
      }))
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    
    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    mediaQuery.addEventListener('change', handleDisplayModeChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      mediaQuery.removeEventListener('change', handleDisplayModeChange)
    }
  }, [])

  const promptInstall = async () => {
    if (!state.deferredPrompt) return false
    
    try {
      state.deferredPrompt.prompt()
      const choiceResult = await state.deferredPrompt.userChoice
      
      if (choiceResult.outcome === 'accepted') {
        setState(prev => ({
          ...prev,
          isInstallable: false,
          canInstall: false,
          deferredPrompt: null
        }))
        return true
      } else {
        return false
      }
    } catch (error) {
      console.error('Error prompting install:', error)
      return false
    }
  }

  return {
    ...state,
    promptInstall
  }
}