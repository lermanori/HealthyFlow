import posthog from 'posthog-js'
import type { AnalyticsProvider } from './types'

// PostHog project keys are public by design (they only allow ingestion), so
// exposing VITE_POSTHOG_KEY in the bundle is fine.
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com'

export function posthogConfigured(): boolean {
  return Boolean(KEY)
}

export class PostHogProvider implements AnalyticsProvider {
  private initialized = false

  init(): void {
    if (this.initialized || !KEY) return
    posthog.init(KEY, {
      api_host: HOST,
      // Pageviews are sent manually from PageViewTracker (SPA routing).
      capture_pageview: false,
      capture_pageleave: true,
      // Typed catalog only — see docs/analytics/STRATEGY.md "not tracked".
      autocapture: false,
      session_recording: {
        maskAllInputs: true,
      },
      persistence: 'localStorage+cookie',
    })
    this.initialized = true
  }

  identify(userId: string, props?: Record<string, unknown>): void {
    posthog.identify(userId, props)
  }

  setUserProperties(props: Record<string, unknown>, setOnce?: Record<string, unknown>): void {
    posthog.setPersonProperties(props, setOnce)
  }

  capture(event: string, props?: Record<string, unknown>): void {
    posthog.capture(event, props)
  }

  page(path: string): void {
    posthog.capture('$pageview', { $current_url: window.location.origin + path })
  }

  reset(): void {
    posthog.reset()
  }

  isFeatureEnabled(flag: string): boolean {
    return posthog.isFeatureEnabled(flag) === true
  }

  onFlagsLoaded(callback: () => void): () => void {
    return posthog.onFeatureFlags(callback)
  }
}
