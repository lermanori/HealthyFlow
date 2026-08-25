import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { creditsService, syncService, DAY_SUMMARY_QUERY_KEY } from '../services/api'
import { runSync } from '../lib/local/sync'
import { localDayUser } from '../lib/local/services'
import { LOCAL_DAY_CHANGED_EVENT } from '../lib/local/store'

const AFTER_A_CHANGE_MS = 3_000

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

  useEffect(() => {
    const userId = localDayUser()
    // No local day means there is nothing on this device to send. The web has no
    // local day at all, and someone signing in at the login screen still reads a
    // hosted day; neither is in scope here.
    if (!user || !userId) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const sync = async () => {
      if (running.current || cancelled) return
      running.current = true
      try {
        const summary = await creditsService.getSummary()
        if (!summary.subscription.active) return
        await runSync(userId, syncService.exchange)
        if (!cancelled) queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY })
      } catch (error) {
        // A failed exchange changes nothing: the watermark did not move, so the
        // next one carries the same delta plus whatever has happened since. The
        // error is reported as itself rather than as a connection problem — what
        // a subscriber should *see* while sync is failing is still undesigned,
        // and guessing at it here would put a wrong message in front of them.
        console.error('[sync] exchange failed:', error)
      } finally {
        running.current = false
      }
    }

    void sync()
    const onOnline = () => { void sync() }
    const onChange = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void sync() }, AFTER_A_CHANGE_MS)
    }

    window.addEventListener('online', onOnline)
    window.addEventListener(LOCAL_DAY_CHANGED_EVENT, onChange)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener(LOCAL_DAY_CHANGED_EVENT, onChange)
    }
  }, [user, queryClient])
}
