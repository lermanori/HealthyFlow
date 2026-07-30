import { useState, useEffect } from 'react'
import {
  checkPushPermission,
  requestPushPermission,
  type PushPermissionState,
} from '../lib/push'

interface NotificationPermission {
  granted: boolean
  denied: boolean
  default: boolean
}

function permissionFlags(permission: PushPermissionState): NotificationPermission {
  return {
    granted: permission === 'granted',
    denied: permission === 'denied',
    default: permission === 'prompt',
  }
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>({
    granted: false,
    denied: false,
    default: true
  })

  useEffect(() => {
    let active = true
    void checkPushPermission().then((current) => {
      if (active) setPermission(permissionFlags(current))
    })
    return () => {
      active = false
    }
  }, [])

  const requestPermission = async () => {
    const result = await requestPushPermission()
    setPermission(permissionFlags(result))
    return result === 'granted'
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
