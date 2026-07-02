import { useEffect, useState } from 'react'
import { analytics } from './index'

/**
 * Reactive feature-flag check. Returns `defaultValue` until flags load, and
 * permanently when analytics is disabled — flag-gated UI must have a sane
 * default path.
 */
export function useFeatureFlag(flag: string, defaultValue = false): boolean {
  const [enabled, setEnabled] = useState(() =>
    analytics.enabled ? analytics.isFeatureEnabled(flag) : defaultValue
  )

  useEffect(() => {
    if (!analytics.enabled) return
    const unsubscribe = analytics.onFlagsLoaded(() => {
      setEnabled(analytics.isFeatureEnabled(flag))
    })
    return unsubscribe
  }, [flag])

  return analytics.enabled ? enabled : defaultValue
}
