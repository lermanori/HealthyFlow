import { findDueTouchpoints, RhythmSchema, type DueTouchpoint } from '../../src/proactivity'

function rec(userId: string, overrides: Record<string, unknown>) {
  return { userId, rhythm: RhythmSchema.parse(overrides) }
}

describe('findDueTouchpoints', () => {
  const now = new Date('2026-07-09T00:32:00Z') // 20:32 EDT on July 8

  it('does not send anything without an explicit opt-in', () => {
    expect(findDueTouchpoints([rec('u1', { timezone: 'America/New_York' })], now)).toEqual([])
    expect(findDueTouchpoints([rec('u1', { timezone: 'America/New_York', morning: { enabled: true }, weekly: { enabled: true } })], now)).toEqual([])
  })

  it('sends one daily review in the user timezone', () => {
    expect(findDueTouchpoints([
      rec('u1', { timezone: 'America/New_York', daily: { enabled: true } }),
    ], now)).toEqual<DueTouchpoint[]>([
      { userId: 'u1', type: 'daily', localDate: '2026-07-08' },
    ])
  })

  it('does not repeat a review or send after the five minute window', () => {
    expect(findDueTouchpoints([
      rec('u1', { timezone: 'America/New_York', daily: { enabled: true, lastSent: '2026-07-08' } }),
    ], now)).toEqual([])
    expect(findDueTouchpoints([
      rec('u1', { timezone: 'America/New_York', daily: { enabled: true } }),
    ], new Date('2026-07-09T00:37:00Z'))).toEqual([])
  })

  it('sends weekly review only on the selected local day', () => {
    const thursday = new Date('2026-07-09T23:02:00Z') // 19:02 EDT
    expect(findDueTouchpoints([
      rec('u1', { timezone: 'America/New_York', weeklyReview: { enabled: true, day: 4 } }),
    ], thursday)).toEqual([{ userId: 'u1', type: 'weekly', localDate: '2026-07-09' }])
    expect(findDueTouchpoints([
      rec('u1', { timezone: 'America/New_York', weeklyReview: { enabled: true, day: 0 } }),
    ], thursday)).toEqual([])
  })

  it('replaces the daily closeout on the weekly review day', () => {
    const sunday = new Date('2026-07-12T00:32:00Z') // Saturday 20:32 EDT
    expect(findDueTouchpoints([
      rec('u1', { timezone: 'America/New_York', daily: { enabled: true }, weeklyReview: { enabled: true, day: 6 } }),
    ], sunday)).toEqual([])
  })
})
