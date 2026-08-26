import { logger } from './utils/logger'
import { z } from 'zod'
import webpush from 'web-push'
import cron from 'node-cron'
import { createHash, createSign } from 'node:crypto'
import * as http2 from 'node:http2'
import { db } from './supabase-client'
import { buildDailyContext } from './daily-context'
import {
  NativePushRegistrationSchema,
} from './push-contracts'

export {
  NativePushRegistrationSchema,
  type NativePushRegistration,
} from './push-contracts'

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

const ApnsConfigSchema = z.object({
  keyId: z.string().min(1),
  teamId: z.string().min(1),
  privateKey: z.string().includes('BEGIN PRIVATE KEY'),
  bundleId: z.string().min(1),
  environment: z.enum(['sandbox', 'production']),
})
type ApnsConfig = z.infer<typeof ApnsConfigSchema>

let cachedApnsAuth: { token: string; issuedAt: number; identity: string } | null = null

function readApnsConfig(): ApnsConfig | null {
  const parsed = ApnsConfigSchema.safeParse({
    keyId: process.env.APNS_KEY_ID,
    teamId: process.env.APNS_TEAM_ID,
    privateKey: process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    bundleId: process.env.APNS_BUNDLE_ID ?? 'app.healthyflow.mobile',
    environment: process.env.APNS_ENVIRONMENT ?? 'production',
  })
  return parsed.success ? parsed.data : null
}

export function configureApns(): boolean {
  return readApnsConfig() !== null
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

function apnsAuthorization(config: ApnsConfig) {
  const now = Math.floor(Date.now() / 1000)
  const privateKeyFingerprint = createHash('sha256')
    .update(config.privateKey)
    .digest('hex')
  const identity = `${config.teamId}:${config.keyId}:${privateKeyFingerprint}`
  if (
    cachedApnsAuth &&
    cachedApnsAuth.identity === identity &&
    now - cachedApnsAuth.issuedAt < 50 * 60
  ) {
    return cachedApnsAuth.token
  }

  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: config.keyId }))
  const claims = base64Url(JSON.stringify({ iss: config.teamId, iat: now }))
  const unsignedToken = `${header}.${claims}`
  const signer = createSign('SHA256')
  signer.update(unsignedToken)
  signer.end()
  const signature = signer.sign({
    key: config.privateKey,
    dsaEncoding: 'ieee-p1363',
  })
  const token = `${unsignedToken}.${base64Url(signature)}`
  cachedApnsAuth = { token, issuedAt: now, identity }
  return token
}

class ApnsDeliveryError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly reason: string,
  ) {
    super(`APNs delivery failed (${statusCode}): ${reason}`)
    this.name = 'ApnsDeliveryError'
  }
}

export async function sendApnsNotification(
  device: { device_token: string; app_id: string },
  payload: PushPayload,
): Promise<void> {
  const config = readApnsConfig()
  if (!config) throw new Error('APNs is not configured')
  if (device.app_id !== config.bundleId) {
    throw new Error(`APNs topic mismatch for ${device.app_id}`)
  }

  const origin = config.environment === 'sandbox'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com'
  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: 'default',
    },
    url: payload.url,
  })

  await new Promise<void>((resolve, reject) => {
    const client = http2.connect(origin)
    let statusCode = 0
    let responseBody = ''
    let settled = false

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      if (error) {
        client.destroy()
        reject(error)
        return
      }
      client.close()
      resolve()
    }

    client.once('error', finish)
    client.setTimeout(10_000, () => {
      finish(new Error('APNs request timed out'))
    })
    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${device.device_token}`,
      authorization: `bearer ${apnsAuthorization(config)}`,
      'apns-topic': config.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': '0',
      'content-type': 'application/json',
    })
    request.setEncoding('utf8')
    request.on('response', (headers) => {
      statusCode = Number(headers[':status'] ?? 0)
    })
    request.on('data', (chunk: string) => {
      responseBody += chunk
    })
    request.once('error', finish)
    request.on('end', () => {
      if (statusCode >= 200 && statusCode < 300) {
        finish()
        return
      }
      let reason = responseBody || 'unknown'
      try {
        const parsed = JSON.parse(responseBody) as { reason?: string }
        reason = parsed.reason ?? reason
      } catch {
        // APNs normally returns JSON; preserve the raw response if it does not.
      }
      finish(new ApnsDeliveryError(statusCode, reason))
    })
    request.end(body)
  })
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const [subscriptions, nativeDevices] = await Promise.all([
    db.listPushSubscriptions(userId),
    db.listNativePushDevices(userId),
  ])
  const body = JSON.stringify(payload)

  const webDeliveries = subscriptions.map(async (sub) => {
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
  })

  const nativeDeliveries = nativeDevices.map(async (device) => {
    try {
      await proactivityInternals.sendApnsNotification(device, payload)
    } catch (err) {
      if (err instanceof ApnsDeliveryError && err.statusCode === 410) {
        await db.deleteNativePushDevice(userId, device.device_token, device.app_id)
      } else {
        console.error(`[proactivity] APNs send failed for ${device.device_token.slice(0, 8)}…:`, err)
      }
    }
  })

  await Promise.all([...webDeliveries, ...nativeDeliveries])
}

// Static, deterministic payloads. No AI at send time (spec).
const TOUCHPOINT_PAYLOADS: Record<TouchpointType, PushPayload> = {
  morning: { title: 'Good morning ☀️', body: 'Ready to plan your day?', url: '/app/talk?kickoff=morning' },
  midday: { title: 'Mid-day check-in', body: 'How is today going? Want to adjust?', url: '/app/talk?kickoff=midday' },
  weekly: { title: 'Weekly planning', body: "Let's shape the week ahead.", url: '/app/talk?kickoff=weekly' },
}

// Exported object indirection so tests can spy on sendPushToUser.
export const proactivityInternals = { sendPushToUser, sendApnsNotification }

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
  const webPushReady = configureVapid()
  const nativePushReady = configureApns()
  if (!webPushReady && !nativePushReady) {
    console.warn('[proactivity] VAPID and APNs keys missing — scheduler not started')
    return
  }
  schedulerStarted = true
  // Every 5 minutes.
  cron.schedule('*/5 * * * *', () => {
    runProactivityTick(new Date(), 5).catch((err) => console.error('[proactivity] tick failed:', err))
  })
  logger.info('[proactivity] scheduler started (*/5 * * * *)')
}

const KICKOFF_INTROS: Record<TouchpointType, string> = {
  morning: 'Start a morning planning check-in.',
  midday: 'Start a mid-day check-in.',
  weekly: 'Start a weekly planning check-in.',
}

const KICKOFF_STYLE: Record<TouchpointType, string> = {
  morning: 'Help me choose a realistic shape for today before I get moving.',
  midday: 'Help me adjust the rest of today based on what is still open.',
  weekly: 'Help me zoom out and place work across the coming days.',
}

const KICKOFF_FIRST_TOPIC: Record<TouchpointType, string> = {
  morning: 'Start with the day shape: what needs a time, what can stay flexible, and what should be protected.',
  midday: 'Start with an actual-vs-planned check on the next block: ask what happened, what is open now, and what should move or be dropped.',
  weekly: 'Start with the week shape: the biggest commitments, pressure points, and what needs a home first.',
}

function validTimeZone(value?: string) {
  if (!value) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return value
  } catch {
    return 'UTC'
  }
}

function localDateAtOffset(now: Date, timeZone: string, dayOffset: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  return new Date(Date.UTC(year, month - 1, day + dayOffset)).toISOString().slice(0, 10)
}

function openItemsSummary(context: Awaited<ReturnType<typeof buildDailyContext>>) {
  const tasks = context.day.tasks.filter((task) => !task.completed)
  if (tasks.length === 0) return '- (nothing scheduled)'

  const visible = tasks.slice(0, 12)
    .map((task) => `- ${task.title}${task.startTime ? ` at ${task.startTime}` : ''}`)
  if (tasks.length > visible.length) visible.push(`- (+${tasks.length - visible.length} more open Items)`)
  return visible.join('\n')
}

// Server-built seed message the assistant responds to. No AI here — the assistant
// chat endpoint runs the model when the client sends this as the first user turn.
export async function buildKickoffMessage(
  userId: string,
  type: TouchpointType,
  timeZoneHeader?: string,
  now = new Date(),
): Promise<string> {
  const timeZone = validTimeZone(timeZoneHeader)
  const dates = type === 'weekly'
    ? Array.from({ length: 7 }, (_, offset) => localDateAtOffset(now, timeZone, offset))
    : [localDateAtOffset(now, timeZone, 0)]
  const contexts = await Promise.all(dates.map((date) => buildDailyContext(userId, date)))
  const contextBlock = type === 'weekly'
    ? contexts.map((context) => `${context.date}:\n${openItemsSummary(context)}`).join('\n\n')
    : `Date: ${contexts[0].date}\nOpen Items today:\n${openItemsSummary(contexts[0])}`

  return `${KICKOFF_INTROS[type]}

${KICKOFF_STYLE[type]}

Use this context, but do not echo it back as a raw dump.
Run this as a topic-by-topic check-in, not a full report.
For the first response:
- Cover only one topic: ${KICKOFF_FIRST_TOPIC[type]}
- Use a short, specific heading.
- Give at most 2 bullets, each with one concrete observation or proposed move.
- End with one direct question that lets me decide or adjust that topic.
- Mention other topics only as a tiny queue, e.g. "Next: food, workout, admin" if they are relevant.
- Do not move to the next topic until I answer.
- Preserve item titles exactly, including Hebrew or mixed-language text.
- Do not show JSON, tool traces, or generic assistant phrasing.

Context:
${type === 'weekly' ? 'Coming 7 days:' : ''}
${contextBlock}`
}
