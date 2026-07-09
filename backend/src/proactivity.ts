import { z } from 'zod'
import webpush from 'web-push'
import cron from 'node-cron'
import { db } from './supabase-client'
import { buildDailyContext } from './daily-context'

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

export interface PushPayload {
  title: string
  body: string
  url: string
}

let vapidConfigured = false
// Lazily configure VAPID from env so tests (which mock web-push) don't require keys.
export function configureVapid(): boolean {
  if (vapidConfigured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@healthyflow.app'
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const subscriptions = await db.listPushSubscriptions(userId)
  const body = JSON.stringify(payload)

  await Promise.all(subscriptions.map(async (sub) => {
    const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }
    try {
      await webpush.sendNotification(subscription, body)
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        // Subscription is dead (iOS silently expires them). Prune it.
        await db.deletePushSubscriptionByEndpoint(sub.endpoint)
      } else {
        // No silent fallback: log and move on (no retry queue in v1).
        console.error(`[proactivity] push send failed for ${sub.endpoint}:`, err)
      }
    }
  }))
}

// Static, deterministic payloads. No AI at send time (spec).
const TOUCHPOINT_PAYLOADS: Record<TouchpointType, PushPayload> = {
  morning: { title: 'Good morning ☀️', body: 'Ready to plan your day?', url: '/assistant?kickoff=morning' },
  midday: { title: 'Mid-day check-in', body: 'How is today going? Want to adjust?', url: '/assistant?kickoff=midday' },
  weekly: { title: 'Weekly planning', body: "Let's shape the week ahead.", url: '/assistant?kickoff=weekly' },
}

// Exported object indirection so tests can spy on sendPushToUser.
export const proactivityInternals = { sendPushToUser }

export async function runProactivityTick(now: Date = new Date(), windowMinutes = 5): Promise<void> {
  const rows = await db.listAllRhythms()
  const records: RhythmRecord[] = rows.map((row) => ({
    userId: row.user_id,
    rhythm: RhythmSchema.parse(row.rhythm ?? {}),
  }))

  const due = findDueTouchpoints(records, now, windowMinutes)

  for (const item of due) {
    // Idempotency: stamp lastSent BEFORE sending so a crash skips, never doubles.
    // Deep-merge the touchpoint so we don't clobber enabled/time/days (upsertUserRhythm
    // only shallow-merges top-level keys).
    const current = records.find((r) => r.userId === item.userId)!.rhythm
    const currentTp = current[item.type] as Record<string, unknown>
    await db.upsertUserRhythm(item.userId, { [item.type]: { ...currentTp, lastSent: item.localDate } })
    await proactivityInternals.sendPushToUser(item.userId, TOUCHPOINT_PAYLOADS[item.type])
  }
}

let schedulerStarted = false
export function startProactivityScheduler(): void {
  if (schedulerStarted) return
  if (!configureVapid()) {
    console.warn('[proactivity] VAPID keys missing — scheduler not started')
    return
  }
  schedulerStarted = true
  // Every 5 minutes.
  cron.schedule('*/5 * * * *', () => {
    runProactivityTick(new Date(), 5).catch((err) => console.error('[proactivity] tick failed:', err))
  })
  console.log('[proactivity] scheduler started (*/5 * * * *)')
}

const KICKOFF_INTROS: Record<TouchpointType, string> = {
  morning: 'Good morning! Help me plan today. Here is my current day context:',
  midday: 'Mid-day check-in. Help me adjust the rest of today. Current context:',
  weekly: 'Weekly planning. Help me place work across the coming days. Current context:',
}

// Server-built seed message the assistant responds to. No AI here — the assistant
// chat endpoint runs the model when the client sends this as the first user turn.
export async function buildKickoffMessage(userId: string, type: TouchpointType): Promise<string> {
  const context = await buildDailyContext(userId)
  const tasks = context.day.tasks
    .filter((t) => !t.completed)
    .map((t) => `- ${t.title}${t.startTime ? ` at ${t.startTime}` : ''}`)
    .join('\n')
  const summary = tasks || '- (nothing scheduled yet)'
  return `${KICKOFF_INTROS[type]}\n\nDate: ${context.date}\nOpen items today:\n${summary}`
}
