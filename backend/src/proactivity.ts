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
