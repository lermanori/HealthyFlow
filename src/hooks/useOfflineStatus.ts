import { useState, useEffect } from 'react'

export function useOfflineStatus() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [wasOffline, setWasOffline] = useState(false)
  const [reconnected, setReconnected] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false)
      if (wasOffline) {
        setReconnected(true)
        setTimeout(() => setReconnected(false), 5000)
      }
      setWasOffline(false)
    }

    const handleOffline = () => {
      setIsOffline(true)
      setWasOffline(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [wasOffline])

  return { isOffline, reconnected }
}