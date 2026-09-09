import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import {
  DEVICE_CALENDAR_CONNECTION_CHANGED_EVENT,
  deviceCalendarItemSync,
  deviceCalendarService,
  syncLocalDayWithDeviceCalendar,
} from '../lib/deviceCalendar'
import { isNativeIOS } from '../lib/native'
import { localDayUser } from '../lib/local/services'
import { LOCAL_DAY_CHANGED_EVENT } from '../lib/local/store'
import { DAILY_SIGNALS_QUERY_KEY, DAY_SUMMARY_QUERY_KEY } from '../services/api'

const AFTER_A_CHANGE_MS = 250

export interface DeviceCalendarSyncNotification {
  message: string
}

type DeviceCalendarRefreshNotification = DeviceCalendarSyncNotification & {
  source: 'listener' | 'query'
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
  const queryClient = useQueryClient()
  const [syncNotification, setSyncNotification] = useState<DeviceCalendarSyncNotification | null>(null)
  const [refreshNotification, setRefreshNotification] = useState<DeviceCalendarRefreshNotification | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!isNativeIOS) return
    const userId = localDayUser()
    if (!user || !userId) return

    let cancelled = false
    let running = false
    let dirty = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let nativeListener: Awaited<ReturnType<typeof deviceCalendarService.addEventsChangedListener>> | null = null

    const refreshCalendarQueries = () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['calendar-events'] }),
        queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: DAILY_SIGNALS_QUERY_KEY }),
      ]).then(() => {
        if (!cancelled) {
          setRefreshNotification((current) => current?.source === 'query' ? null : current)
        }
      }).catch((error) => {
        console.error('[device-calendar-sync] query refresh failed:', error)
        if (!cancelled) {
          setRefreshNotification((current) => current?.source === 'listener' ? current : {
            source: 'query',
            message: 'Device Calendar changed, but HealthyFlow could not refresh it.',
          })
        }
      })
    }

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
              setSyncNotification(null)
            } else if (result.failures.length > 0) {
              setSyncNotification({
                message: `${result.failures.length} Item${result.failures.length === 1 ? '' : 's'} could not sync with Device Calendar.`,
              })
            } else {
              setSyncNotification(null)
            }
          } catch (error) {
            console.error('[device-calendar-sync] reconciliation failed:', error)
            if (!cancelled) {
              setSyncNotification({ message: 'Device Calendar sync is unavailable. Your Items are safe in HealthyFlow.' })
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
      if (detail?.isActive) {
        schedule()
        refreshCalendarQueries()
      }
    }
    const handleConnectionChange = () => {
      schedule()
      refreshCalendarQueries()
    }

    void reconcile()
    window.addEventListener(LOCAL_DAY_CHANGED_EVENT, schedule)
    window.addEventListener(DEVICE_CALENDAR_CONNECTION_CHANGED_EVENT, handleConnectionChange)
    // Permission may be granted in iOS Settings while the app is inactive.
    window.addEventListener('healthyflow:app-state', scheduleWhenActive)
    void deviceCalendarService.addEventsChangedListener(refreshCalendarQueries)
      .then((listener) => {
        if (cancelled) void listener.remove()
        else {
          nativeListener = listener
          setRefreshNotification(null)
        }
      })
      .catch((error) => {
        console.error('[device-calendar-sync] change listener failed:', error)
        if (!cancelled) {
          setRefreshNotification({
            source: 'listener',
            message: 'Automatic Device Calendar refresh is unavailable.',
          })
        }
      })
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (nativeListener) void nativeListener.remove()
      window.removeEventListener(LOCAL_DAY_CHANGED_EVENT, schedule)
      window.removeEventListener(DEVICE_CALENDAR_CONNECTION_CHANGED_EVENT, handleConnectionChange)
      window.removeEventListener('healthyflow:app-state', scheduleWhenActive)
    }
  }, [queryClient, user, retry])

  return {
    notification: syncNotification ?? refreshNotification,
    dismiss: useCallback(() => {
      setSyncNotification(null)
      setRefreshNotification(null)
    }, []),
    retry: useCallback(() => setRetry((value) => value + 1), []),
  }
}
