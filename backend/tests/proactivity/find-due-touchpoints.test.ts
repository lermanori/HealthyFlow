import { findDueTouchpoints, RhythmSchema, type DueTouchpoint } from '../../src/proactivity'

// Helper: build a rhythm record (userId + parsed rhythm) with overrides.
function rec(userId: string, overrides: Record<string, unknown>) {
  return { userId, rhythm: RhythmSchema.parse(overrides) }
}

const WINDOW = 5

describe('findDueTouchpoints', () => {
  it('fires morning when local time just reached the scheduled minute', () => {
    // America/New_York is UTC-4 on 2026-07-09 (EDT). 07:02 EDT = 11:02 UTC.
    const now = new Date('2026-07-09T11:02:00Z')
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00' } })],
      now,
      WINDOW,
    )
    expect(due).toEqual<DueTouchpoint[]>([{ userId: 'u1', type: 'morning', localDate: '2026-07-09' }])
  })

  it('does NOT fire when the tick is past the window (missed tick is skipped, not caught up)', () => {
    // 07:07 EDT = 11:07 UTC, window is 5 min → 7 min past 07:00 is outside [0,5).
    const now = new Date('2026-07-09T11:07:00Z')
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00' } })],
      now,
      WINDOW,
    )
    expect(due).toEqual([])
  })

  it('does NOT fire before the scheduled time', () => {
    const now = new Date('2026-07-09T10:58:00Z') // 06:58 EDT
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00' } })],
      now,
      WINDOW,
    )
    expect(due).toEqual([])
  })

  it('is idempotent: skips when lastSent equals today local date', () => {
    const now = new Date('2026-07-09T11:02:00Z')
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00', lastSent: '2026-07-09' } })],
      now,
      WINDOW,
    )
    expect(due).toEqual([])
  })

  it('fires again the next day even though lastSent was yesterday', () => {
    const now = new Date('2026-07-10T11:02:00Z')
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00', lastSent: '2026-07-09' } })],
      now,
      WINDOW,
    )
    expect(due).toEqual([{ userId: 'u1', type: 'morning', localDate: '2026-07-10' }])
  })

  it('skips disabled touchpoints', () => {
    const now = new Date('2026-07-09T11:02:00Z')
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00', enabled: false } })],
      now,
      WINDOW,
    )
    expect(due).toEqual([])
  })

  it('respects daily day-of-week matching (0=Sunday)', () => {
    // 2026-07-09 is a Thursday (weekday 4). Only fire if 4 is in days.
    const now = new Date('2026-07-09T11:02:00Z')
    const notToday = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00', days: [0, 6] } })],
      now,
      WINDOW,
    )
    expect(notToday).toEqual([])
    const today = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00', days: [4] } })],
      now,
      WINDOW,
    )
    expect(today).toHaveLength(1)
  })

  it('fires weekly only on its configured day', () => {
    // 2026-07-09 Thursday(4), 18:00 EDT = 22:00 UTC.
    const now = new Date('2026-07-09T22:02:00Z')
    const wrongDay = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', weekly: { enabled: true, time: '18:00', day: 0 } })],
      now,
      WINDOW,
    )
    expect(wrongDay).toEqual([])
    const rightDay = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', weekly: { enabled: true, time: '18:00', day: 4 } })],
      now,
      WINDOW,
    )
    expect(rightDay).toEqual([{ userId: 'u1', type: 'weekly', localDate: '2026-07-09' }])
  })

  it('handles a non-UTC timezone that crosses the date line vs UTC', () => {
    // Asia/Tokyo (UTC+9). 07:02 JST on 2026-07-09 = 22:02 UTC on 2026-07-08.
    const now = new Date('2026-07-08T22:02:00Z')
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'Asia/Tokyo', morning: { time: '07:00' } })],
      now,
      WINDOW,
    )
    expect(due).toEqual([{ userId: 'u1', type: 'morning', localDate: '2026-07-09' }])
  })

  it('uses wall-clock time across a DST spring-forward (America/New_York)', () => {
    // 2026-03-08 US DST begins; clocks jump 02:00→03:00 EST→EDT.
    // Morning at 07:00 local that day = 11:00 UTC (EDT, UTC-4).
    const now = new Date('2026-03-08T11:02:00Z')
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00', days: [0] } })], // 2026-03-08 is Sunday(0)
      now,
      WINDOW,
    )
    expect(due).toEqual([{ userId: 'u1', type: 'morning', localDate: '2026-03-08' }])
  })
})
