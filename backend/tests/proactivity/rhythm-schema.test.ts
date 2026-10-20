import {
  NativePushRegistrationSchema,
  RhythmSchema,
  PushSubscriptionSchema,
  TOUCHPOINT_TYPES,
  buildReviewContextPrompt,
} from '../../src/proactivity'
import { TalkReviewContextSchema } from '../../src/settings-schema'

describe('RhythmSchema', () => {
  it('fills full defaults from an empty object', () => {
    const r = RhythmSchema.parse({})
    expect(r.timezone).toBe('UTC')
    expect(r.daily).toEqual({ enabled: false, time: '20:30', lastSent: null })
    expect(r.weeklyReview).toEqual({ enabled: false, time: '19:00', day: 0, lastSent: null })
  })

  it('keeps provided values and still defaults missing ones', () => {
    const r = RhythmSchema.parse({ timezone: 'America/New_York', daily: { time: '21:00' } })
    expect(r.timezone).toBe('America/New_York')
    expect(r.daily.time).toBe('21:00')
    expect(r.daily.enabled).toBe(false)
  })

  it('does not turn an old planning preference into review approval', () => {
    const r = RhythmSchema.parse({
      morning: { enabled: true },
      midday: { enabled: true },
      weekly: { enabled: true },
    })
    expect(r.daily.enabled).toBe(false)
    expect(r.weeklyReview.enabled).toBe(false)
  })

  it('rejects a bad time format', () => {
    expect(() => RhythmSchema.parse({ daily: { time: '7pm' } })).toThrow()
  })

  it('exposes the closed touchpoint set', () => {
    expect(TOUCHPOINT_TYPES).toEqual(['daily', 'weekly'])
  })
})

describe('Talk review evidence', () => {
  const readyDay = (date: string, addressedItemCount: number) => ({
    date,
    status: 'ready' as const,
    addressedItems: [],
    addressedItemCount,
    habitsWithProgress: 0,
    openItems: [],
    calorieEntryCount: 0,
    workoutSessionCount: 0,
    weightRecorded: false,
    progressEntryCount: 0,
    unavailable: [],
  })

  it('permits a weekly pattern only with two days of confirmed outcomes', () => {
    const one = TalkReviewContextSchema.parse({
      kind: 'weekly',
      days: [readyDay('2026-10-17', 1), readyDay('2026-10-18', 0)],
    })
    expect(buildReviewContextPrompt(one)).toMatch(/Do not claim a weekly pattern/)
    const two = TalkReviewContextSchema.parse({
      kind: 'weekly',
      days: [readyDay('2026-10-17', 1), readyDay('2026-10-18', 1)],
    })
    expect(buildReviewContextPrompt(two)).toMatch(/at most one concrete pattern/)
  })

  it('keeps a failed day read distinct from an empty day', () => {
    const review = TalkReviewContextSchema.parse({
      kind: 'weekly',
      days: [readyDay('2026-10-17', 0), { date: '2026-10-18', status: 'unavailable', reasonCode: 'day_read_failed' }],
    })
    expect(buildReviewContextPrompt(review)).toMatch(/A failed read is unavailable, not an empty day/)
    expect(buildReviewContextPrompt(review)).toMatch(/1 failed day reads/)
  })
})

describe('PushSubscriptionSchema', () => {
  it('parses a browser PushSubscription JSON shape', () => {
    const parsed = PushSubscriptionSchema.parse({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'KEY', auth: 'AUTH' },
    })
    expect(parsed.endpoint).toBe('https://push.example/abc')
    expect(parsed.keys.p256dh).toBe('KEY')
  })
})

describe('NativePushRegistrationSchema', () => {
  it('accepts only the HealthyFlow iOS app and a hexadecimal APNs token', () => {
    const registration = NativePushRegistrationSchema.parse({
      platform: 'ios',
      deviceToken: 'A'.repeat(64),
      appId: 'app.healthyflow.mobile',
    })
    expect(registration.deviceToken).toHaveLength(64)
    expect(() => NativePushRegistrationSchema.parse({
      platform: 'android',
      deviceToken: 'A'.repeat(64),
      appId: 'app.healthyflow.mobile',
    })).toThrow()
    expect(() => NativePushRegistrationSchema.parse({
      platform: 'ios',
      deviceToken: 'A'.repeat(64),
      appId: 'com.attacker.app',
    })).toThrow()
  })
})
