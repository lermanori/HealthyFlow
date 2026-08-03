import { useEffect, useState } from 'react'

/**
 * Elapsed time for a Focus block.
 *
 * Always derived from the block's persisted `startedAt` rather than from a
 * counter this component owns — which is exactly why the timer is still correct
 * after a reload, a navigation, or a switch to another device.
 */

export function minutesBetween(start: string | null, end: string | null) {
  if (!start) return 0
  const elapsed = new Date(end ?? Date.now()).getTime() - new Date(start).getTime()
  return Math.max(0, Math.round(elapsed / 60_000))
}

/** Ticking `mm:ss` (or `h:mm:ss`) text, with no element of its own. */
export function useElapsedLabel(startedAt: string) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function Elapsed({ startedAt }: { startedAt: string }) {
  return <span aria-label="Elapsed time">{useElapsedLabel(startedAt)}</span>
}
