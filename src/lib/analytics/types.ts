// Product telemetry contracts. This is the single place event names and their
// property shapes are defined — see docs/analytics/STRATEGY.md for why each
// event exists and docs/analytics/README.md for how to add one.
//
// Not to be confused with `analyticsService` in src/services/api.ts, which is
// the user-facing productivity-charts feature.

export type ItemType = 'task' | 'habit' | 'grocery' | 'meal' | 'workout'
export type ItemSource = 'manual' | 'ai_parse'

/** Event name → property payload. `void` means the event carries no properties. */
export type AnalyticsEvents = {
  // Lifecycle & identity
  signed_up: { method: 'password' }
  logged_in: { is_demo: boolean }
  demo_started: { persona: 'maya' | 'noam' | 'lina' | 'amir' }
  onboarding_completed: void
  onboarding_skipped: void

  // Core loop (captured at the taskService layer, covering all UI paths)
  item_created: {
    item_type: ItemType
    category: string
    source: ItemSource
    has_start_time: boolean
    repeat: 'none' | 'daily' | 'weekly'
  }
  item_completed: { item_type: ItemType; category: string }

  // AI value moment
  ai_parse_requested: {
    surface: 'tasks' | 'meals'
    input: 'text' | 'photo' | 'text+photo'
    succeeded: boolean
    item_count: number | null
  }
  ai_question_asked: void

  // Modules
  calorie_entry_logged: { source: ItemSource }
  weight_logged: void
  workout_logged: void
  achievement_recorded: void
  google_calendar_connected: void
  pwa_installed: void

  // Monetization
  credits_exhausted: void
  upgrade_cta_clicked: { kind: 'subscribe' | 'topup' }
  upgrade_request_sent: { kind: 'subscribe' | 'topup' }
}

export type AnalyticsEventName = keyof AnalyticsEvents

/** Person properties. `setOnce` variants never overwrite an existing value. */
export type UserProperties = {
  email?: string
  name?: string
  role?: 'admin' | 'user'
  is_demo?: boolean
  onboarding_status?: 'active' | 'completed' | 'skipped'
  subscription_active?: boolean
  credit_balance_bucket?: 'none' | 'low' | 'ok'
}

export type UserPropertiesOnce = {
  signed_up_at?: string
}

/**
 * What a concrete analytics backend must implement. Implementations must never
 * throw out of these methods — the app treats analytics as fire-and-forget.
 */
export interface AnalyticsProvider {
  init(): void
  identify(userId: string, props?: Record<string, unknown>): void
  setUserProperties(props: Record<string, unknown>, setOnce?: Record<string, unknown>): void
  capture(event: string, props?: Record<string, unknown>): void
  page(path: string): void
  reset(): void
  isFeatureEnabled(flag: string): boolean
  /** Subscribe to flag availability; returns an unsubscribe function. */
  onFlagsLoaded(callback: () => void): () => void
}
