import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  DEVICE_CALENDAR_CONNECTION_CHANGED_EVENT,
  deviceCalendarItemSync,
  syncLocalDayWithDeviceCalendar,
} from '../lib/deviceCalendar'
import { isNativeIOS } from '../lib/native'
import { localDayUser } from '../lib/local/services'
import { LOCAL_DAY_CHANGED_EVENT } from '../lib/local/store'

const AFTER_A_CHANGE_MS = 250

export interface DeviceCalendarSyncNotification {
  message: string
}

/**
 * Keep the Local day and EventKit aligned whenever Device Calendar is connected.
 *
 * Identity does not participate in the decision: Guest, claimed-free, and Cloud
 * accounts all hold a Local day on iPhone. The current Local-day owner is the
 * only key needed, and no HTTP service is called from this hook.
 */
export function useDeviceCalendarSync() {
  const { user } = useAuth()
  const [notification, setNotification] = useState<DeviceCalendarSyncNotification | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!isNativeIOS) return
    const userId = localDayUser()
    if (!user || !userId) return

    let cancelled = false
    let running = false
    let dirty = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const reconcile = async () => {
      if (running) {
        dirty = true
        return
      }
      running = true
      try {
        do {
          dirty = false
          try {
            const result = await syncLocalDayWithDeviceCalendar(userId, deviceCalendarItemSync)
            if (cancelled) return
            if (result.state === 'not_connected') {
              setNotification(null)
            } else if (result.failures.length > 0) {
              setNotification({
                message: `${result.failures.length} Item${result.failures.length === 1 ? '' : 's'} could not sync with Device Calendar.`,
              })
            } else {
              setNotification(null)
            }
          } catch (error) {
            console.error('[device-calendar-sync] reconciliation failed:', error)
            if (!cancelled) {
              setNotification({ message: 'Device Calendar sync is unavailable. Your Items are safe in HealthyFlow.' })
            }
          }
        } while (dirty && !cancelled)
      } finally {
        running = false
      }
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void reconcile() }, AFTER_A_CHANGE_MS)
    }
    const scheduleWhenActive = (event: Event) => {
      const detail = (event as CustomEvent<{ isActive?: boolean }>).detail
      if (detail?.isActive) schedule()
    }

    void reconcile()
    window.addEventListener(LOCAL_DAY_CHANGED_EVENT, schedule)
    window.addEventListener(DEVICE_CALENDAR_CONNECTION_CHANGED_EVENT, schedule)
    // Permission may be granted in iOS Settings while the app is inactive.
    window.addEventListener('healthyflow:app-state', scheduleWhenActive)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      window.removeEventListener(LOCAL_DAY_CHANGED_EVENT, schedule)
      window.removeEventListener(DEVICE_CALENDAR_CONNECTION_CHANGED_EVENT, schedule)
      window.removeEventListener('healthyflow:app-state', scheduleWhenActive)
    }
  }, [user, retry])

  return {
    notification,
    dismiss: useCallback(() => setNotification(null), []),
    retry: useCallback(() => setRetry((value) => value + 1), []),
  }
}
