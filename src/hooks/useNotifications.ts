import { useState, useEffect } from 'react'

interface NotificationPermission {
  granted: boolean
  denied: boolean
  default: boolean
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>({
    granted: false,
    denied: false,
    default: true
  })

  useEffect(() => {
    if ('Notification' in window) {
      const currentPermission = Notification.permission
      setPermission({
        granted: currentPermission === 'granted',
        denied: currentPermission === 'denied',
        default: currentPermission === 'default'
      })
    }
  }, [])

  const requestPermission = async () => {
    if ('Notification' in window && permission.default) {
      const result = await Notification.requestPermission()
      setPermission({
        granted: result === 'granted',
        denied: result === 'denied',
        default: result === 'default'
      })
      return result === 'granted'
    }
    return false
  }

  const showNotification = (title: string, options?: NotificationOptions) => {
    if (permission.granted && 'Notification' in window) {
      new Notification(title, {
        icon: '/vite.svg',
        badge: '/vite.svg',
        ...options
      })
    }
  }

  const scheduleReminder = (title: string, message: string, delay: number) => {
    setTimeout(() => {
      showNotification(title, {
        body: message,
        tag: 'task-reminder'
      })
    }, delay)
  }

  return {
    permission,
    requestPermission,
    showNotification,
    scheduleReminder
  }
}