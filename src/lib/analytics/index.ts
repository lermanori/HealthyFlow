// Provider-agnostic product telemetry. Call sites use `analytics.*` and never
// import a vendor SDK — swapping PostHog out means replacing posthogProvider.ts
// and nothing else. Every method is a guarded no-op when analytics is disabled
// (no key configured, or running under test automation) and swallows provider
// errors: telemetry must never break the app.
import type {
  AnalyticsEventName,
  AnalyticsEvents,
  AnalyticsProvider,
  UserProperties,
  UserPropertiesOnce,
} from './types'
import { PostHogProvider, posthogConfigured } from './posthogProvider'

export type { AnalyticsEvents, AnalyticsEventName } from './types'

type CaptureArgs<E extends AnalyticsEventName> = AnalyticsEvents[E] extends void
  ? []
  : [properties: AnalyticsEvents[E]]

class AnalyticsService {
  private provider: AnalyticsProvider | null = null
  // Person properties already sent this session; setUserProperties only sends
  // changed keys so frequent callers (e.g. credit-summary fetches) don't burn
  // event volume on identical $set payloads.
  private sentProps: Record<string, unknown> = {}

  /** Idempotent; safe to call before render. Disabled under Playwright/webdriver. */
  init(): void {
    if (this.provider) return
    if (!posthogConfigured() || navigator.webdriver) return
    try {
      const provider = new PostHogProvider()
      provider.init()
      this.provider = provider
    } catch (error) {
      console.error('Analytics init failed (continuing without telemetry):', error)
      this.provider = null
    }
  }

  get enabled(): boolean {
    return this.provider !== null
  }

  identify(userId: string, props?: UserProperties, setOnce?: UserPropertiesOnce): void {
    this.sentProps = { ...props }
    this.safely(p => p.identify(userId, { ...props, ...(setOnce ? { $set_once: setOnce } : {}) }))
  }

  setUserProperties(props: UserProperties, setOnce?: UserPropertiesOnce): void {
    const changed: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(props)) {
      if (this.sentProps[key] !== value) {
        changed[key] = value
        this.sentProps[key] = value
      }
    }
    if (Object.keys(changed).length === 0 && !setOnce) return
    this.safely(p => p.setUserProperties(changed, setOnce as Record<string, unknown> | undefined))
  }

  capture<E extends AnalyticsEventName>(event: E, ...args: CaptureArgs<E>): void {
    this.safely(p => p.capture(event, args[0] as Record<string, unknown> | undefined))
  }

  page(path: string): void {
    this.safely(p => p.page(path))
  }

  /** Clear identity on logout so the next session starts anonymous. */
  reset(): void {
    this.sentProps = {}
    this.safely(p => p.reset())
  }

  /** False when the flag is off, unknown, or analytics is unavailable. */
  isFeatureEnabled(flag: string): boolean {
    let enabled = false
    this.safely(p => {
      enabled = p.isFeatureEnabled(flag)
    })
    return enabled
  }

  /** Re-evaluate flags once loaded; returns an unsubscribe function. */
  onFlagsLoaded(callback: () => void): () => void {
    let unsubscribe: () => void = () => {}
    this.safely(p => {
      unsubscribe = p.onFlagsLoaded(callback)
    })
    return unsubscribe
  }

  private safely(fn: (provider: AnalyticsProvider) => void): void {
    if (!this.provider) return
    try {
      fn(this.provider)
    } catch (error) {
      console.error('Analytics call failed (ignored):', error)
    }
  }
}

export const analytics = new AnalyticsService()
