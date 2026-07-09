import { RhythmSchema, PushSubscriptionSchema, TOUCHPOINT_TYPES } from '../../src/proactivity'

describe('RhythmSchema', () => {
  it('fills full defaults from an empty object', () => {
    const r = RhythmSchema.parse({})
    expect(r.timezone).toBe('UTC')
    expect(r.morning).toEqual({ enabled: true, time: '07:00', days: [0, 1, 2, 3, 4, 5, 6], lastSent: null })
    expect(r.midday).toEqual({ enabled: false, time: '13:00', days: [1, 2, 3, 4, 5], lastSent: null })
    expect(r.weekly).toEqual({ enabled: false, time: '18:00', day: 0, lastSent: null })
  })

  it('keeps provided values and still defaults missing ones', () => {
    const r = RhythmSchema.parse({ timezone: 'America/New_York', morning: { time: '06:30' } })
    expect(r.timezone).toBe('America/New_York')
    expect(r.morning.time).toBe('06:30')
    expect(r.morning.enabled).toBe(true)
    expect(r.morning.days).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('rejects a bad time format', () => {
    expect(() => RhythmSchema.parse({ morning: { time: '7am' } })).toThrow()
  })

  it('exposes the closed touchpoint set', () => {
    expect(TOUCHPOINT_TYPES).toEqual(['morning', 'midday', 'weekly'])
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
