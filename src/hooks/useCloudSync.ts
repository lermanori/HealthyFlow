import { useCallback, useEffect, useRef, useState } from 'react'
import { Network } from '@capacitor/network'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { creditsService, syncService, DAY_SUMMARY_QUERY_KEY } from '../services/api'
import { runSync } from '../lib/local/sync'
import { localDayUser } from '../lib/local/services'
import { LOCAL_DAY_CHANGED_EVENT } from '../lib/local/store'

const AFTER_A_CHANGE_MS = 3_000
const CLOUD_STATUS_CHANGED_EVENT = 'healthyflow:cloud-status-changed'

export interface CloudStatusNotification {
  state: 'paused' | 'unavailable'
  message: string
}

interface CloudStatusChangedDetail {
  notification: CloudStatusNotification | null
}

interface CloudStatusState {
  notification: CloudStatusNotification
  dismissed: boolean
}

function publishCloudStatus(notification: CloudStatusNotification | null) {
  window.dispatchEvent(new CustomEvent<CloudStatusChangedDetail>(CLOUD_STATUS_CHANGED_EVENT, {
    detail: { notification },
  }))
}

function showCloudStatusUnavailable() {
  publishCloudStatus({
    state: 'unavailable',
    message: 'Cloud status unavailable. Changes are safe on this device.',
  })
}

export function reportCloudSyncFailure(error: unknown) {
  console.error('[sync] exchange failed:', error)
  publishCloudStatus({
    state: 'paused',
    message: 'Cloud sync paused. Changes are safe on this device.',
  })
}

export function reportCloudStatusFailure(error: unknown) {
  console.error('[sync] subscription check failed:', error)
  showCloudStatusUnavailable()
}

export function clearCloudSyncFailure() {
  publishCloudStatus(null)
}

/**
 * Keep a Cloud subscriber's day and the server in step.
 *
 * Runs on open, on regaining a connection, and a few seconds after a change.
 * There is no queue: offline simply means the watermark does not advance, and the
 * next run carries whatever accumulated.
 *
 * A Guest has a local day and no account, so nothing here applies to them — the
 * `user` gate and the subscription check together mean sync belongs to registered
 * subscribers only, which is what Cloud sells (TARGET.md, ADR-0012).
 */
export function useCloudSync() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const running = useRef(false)
  const [cloudStatus, setCloudStatus] = useState<CloudStatusState | null>(null)

  useEffect(() => {
    const onCloudStatusChanged = (event: Event) => {
      const { notification } = (event as CustomEvent<CloudStatusChangedDetail>).detail
      setCloudStatus((current) => {
        if (!notification) return null
        // An unresolved failure stays noticeable until it is dismissed. Repeating
        // that same failure must not interrupt someone who already dismissed it;
        // a successful check clears this state so a later failure can surface.
        if (current?.notification.state === notification.state) {
          return { ...current, notification }
        }
        return { notification, dismissed: false }
      })
    }

    window.addEventListener(CLOUD_STATUS_CHANGED_EVENT, onCloudStatusChanged)
    return () => window.removeEventListener(CLOUD_STATUS_CHANGED_EVENT, onCloudStatusChanged)
  }, [])

  useEffect(() => {
    const userId = localDayUser()
    // No local day means there is nothing on this device to send. A Guest has no
    // subscription; every account-entry path opens a Local day before it opens
    // the session, so registered Cloud subscribers reach this branch.
    if (!user || !userId) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const sync = async () => {
      if (running.current || cancelled) return
      running.current = true
      try {
        let connected: boolean
        try {
          connected = (await Network.getStatus()).connected
        } catch (error) {
          if (!cancelled) reportCloudStatusFailure(error)
          return
        }
        // Capacitor knows the native connection state even when WKWebView has
        // not yet rejected an HTTP promise or updated navigator.onLine.
        if (!connected) {
          if (!cancelled) showCloudStatusUnavailable()
          return
        }

        let summary: Awaited<ReturnType<typeof creditsService.getSummary>>
        try {
          summary = await creditsService.getSummary()
        } catch (error) {
          // This account may not subscribe, so a failed status read cannot
          // honestly be called a failed sync. It still surfaces: unavailable is
          // not the same thing as inactive.
          if (!cancelled) reportCloudStatusFailure(error)
          return
        }
        if (!summary.subscription.active) {
          clearCloudSyncFailure()
          return
        }
        try {
          await runSync(userId, syncService.exchange)
        } catch (error) {
          // A failed exchange changes nothing: the watermark did not move, so
          // the next one carries the same delta plus whatever happened since.
          if (!cancelled) reportCloudSyncFailure(error)
          return
        }
        clearCloudSyncFailure()
        if (!cancelled) queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY })
      } finally {
        running.current = false
      }
    }

    void sync()
    const onOnline = () => { void sync() }
    const onOffline = () => {
      if (timer) clearTimeout(timer)
      timer = undefined
      showCloudStatusUnavailable()
    }
    const onChange = () => {
      // ponytail: a sync writes its watermark through the same store funnel;
      // ignore that write instead of adding a second event or store API.
      if (running.current) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void sync() }, AFTER_A_CHANGE_MS)
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener(LOCAL_DAY_CHANGED_EVENT, onChange)
    return () => {
      cancelled = true
      clearCloudSyncFailure()
      if (timer) clearTimeout(timer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener(LOCAL_DAY_CHANGED_EVENT, onChange)
    }
  }, [user, queryClient])

  const dismissCloudStatus = useCallback(() => {
    setCloudStatus((current) => current ? { ...current, dismissed: true } : null)
  }, [])

  return {
    notification: cloudStatus?.dismissed ? null : cloudStatus?.notification ?? null,
    dismiss: dismissCloudStatus,
  }
}
