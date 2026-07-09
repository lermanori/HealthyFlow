import { z } from 'zod'

// Closed set of touchpoint types (see spec). Order matters for iteration.
export const TOUCHPOINT_TYPES = ['morning', 'midday', 'weekly'] as const
export type TouchpointType = (typeof TOUCHPOINT_TYPES)[number]

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const timeField = z.string().regex(TIME_RE)
const dayField = z.number().int().min(0).max(6)
// A YYYY-MM-DD local-date string (or null before first send).
const lastSentField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null)

const DailyTouchpointSchema = z.object({
  enabled: z.boolean().default(true),
  time: timeField.default('07:00'),
  days: z.array(dayField).default([0, 1, 2, 3, 4, 5, 6]),
  lastSent: lastSentField,
})

const MiddayTouchpointSchema = z.object({
  enabled: z.boolean().default(false),
  time: timeField.default('13:00'),
  days: z.array(dayField).default([1, 2, 3, 4, 5]),
  lastSent: lastSentField,
})

const WeeklyTouchpointSchema = z.object({
  enabled: z.boolean().default(false),
  time: timeField.default('18:00'),
  day: dayField.default(0),
  lastSent: lastSentField,
})

// Defaults let the feature work before onboarding writes a row.
// zod v4: `.prefault({})` runs partial/empty input through the schema so nested
// field-level defaults get filled (plain `.default` would require the full object).
export const RhythmSchema = z.object({
  timezone: z.string().default('UTC'),
  morning: DailyTouchpointSchema.prefault({}),
  midday: MiddayTouchpointSchema.prefault({}),
  weekly: WeeklyTouchpointSchema.prefault({}),
}).prefault({})

export type Rhythm = z.infer<typeof RhythmSchema>

// Browser PushSubscription.toJSON() shape.
export const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionSchema>

export interface RhythmRecord {
  userId: string
  rhythm: Rhythm
}

export interface DueTouchpoint {
  userId: string
  type: TouchpointType
  localDate: string // YYYY-MM-DD in the user's timezone, used to stamp lastSent
}

// Resolve a UTC instant into a user-local {date, weekday, minuteOfDay} using Intl.
// Intl handles DST automatically (wall-clock is what we compare against).
function localParts(now: Date, timeZone: string): { date: string; weekday: number; minuteOfDay: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  })
  const parts = fmt.formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const year = get('year')
  const month = get('month')
  const day = get('day')
  // Intl can yield '24' for hour '00' at midnight under hour12:false; normalize.
  const hour = get('hour') === '24' ? '00' : get('hour')
  const minute = get('minute')
  const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    date: `${year}-${month}-${day}`,
    weekday: WEEKDAYS[get('weekday')],
    minuteOfDay: Number(hour) * 60 + Number(minute),
  }
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * Selects the touchpoints whose user-local scheduled time falls inside this tick's
 * window and that have not already been sent today. Pure; caller writes lastSent + sends.
 */
export function findDueTouchpoints(records: RhythmRecord[], now: Date, windowMinutes = 5): DueTouchpoint[] {
  const due: DueTouchpoint[] = []

  for (const { userId, rhythm } of records) {
    const local = localParts(now, rhythm.timezone)

    const inWindow = (time: string) => {
      const diff = local.minuteOfDay - timeToMinutes(time)
      return diff >= 0 && diff < windowMinutes
    }

    // Daily touchpoints: morning, midday
    for (const type of ['morning', 'midday'] as const) {
      const tp = rhythm[type]
      if (!tp.enabled) continue
      if (!tp.days.includes(local.weekday)) continue
      if (!inWindow(tp.time)) continue
      if (tp.lastSent === local.date) continue
      due.push({ userId, type, localDate: local.date })
    }

    // Weekly touchpoint
    const w = rhythm.weekly
    if (w.enabled && w.day === local.weekday && inWindow(w.time) && w.lastSent !== local.date) {
      due.push({ userId, type: 'weekly', localDate: local.date })
    }
  }

  return due
}
