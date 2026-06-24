import crypto from 'crypto'
import { z } from 'zod'
import { supabase } from './supabase-client'

const GoogleTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
})

const GoogleUserInfoSchema = z.object({
  email: z.string().email().optional(),
})

const GoogleEventDateSchema = z.object({
  date: z.string().optional(),
  dateTime: z.string().optional(),
  timeZone: z.string().optional(),
})

const GoogleCalendarEventSchema = z.object({
  id: z.string(),
  etag: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: GoogleEventDateSchema.optional(),
  end: GoogleEventDateSchema.optional(),
  status: z.string().optional(),
  htmlLink: z.string().optional(),
  extendedProperties: z.object({
    private: z.record(z.string(), z.string()).optional(),
  }).optional(),
})

const GoogleEventMutationResponseSchema = z.object({
  id: z.string(),
  etag: z.string().optional(),
  htmlLink: z.string().optional(),
})

const GoogleEventsListSchema = z.object({
  items: z.array(GoogleCalendarEventSchema).default([]),
})

const CalendarProviderSchema = z.literal('google')

export type CalendarProvider = z.infer<typeof CalendarProviderSchema>

export type CalendarConnectionStatus = {
  provider: CalendarProvider
  connected: boolean
  accountEmail: string | null
  connectedAt: string | null
  scopes: string[]
}

export type ExternalCalendarEvent = {
  id: string
  provider: CalendarProvider
  calendarId: string
  externalEventId: string
  title: string
  description: string | null
  location: string | null
  startAt: string | null
  endAt: string | null
  localStartTime: string | null
  localEndTime: string | null
  allDay: boolean
  status: string | null
  htmlLink: string | null
  completed: boolean
  completedAt: string | null
}

type GoogleSyncedTask = {
  id: string
  user_id: string
  title: string
  type: string
  start_time: string | null
  duration: number | null
  scheduled_date: string | null
  google_event_id?: string | null
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
]

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required for Google Calendar integration`)
  }
  return value
}

function getFrontendUrl(): string {
  return process.env.FRONTEND_URL || 'http://localhost:5173'
}

function getBackendUrl(): string {
  return process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`
}

function getRedirectUri(): string {
  return `${getBackendUrl()}/api/calendar/google/callback`
}

function getEncryptionKey(): Buffer {
  const secret = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET
  if (!secret) {
    throw new Error('CALENDAR_TOKEN_ENCRYPTION_KEY or JWT_SECRET is required for calendar token encryption')
  }
  return crypto.createHash('sha256').update(secret).digest()
}

function encryptToken(token: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.')
}

function decryptToken(value: string): string {
  const [ivText, tagText, encryptedText] = value.split('.')
  if (!ivText || !tagText || !encryptedText) {
    throw new Error('Invalid encrypted token')
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivText, 'base64url')
  )
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

function createState(userId: string): string {
  const payload = {
    userId,
    nonce: crypto.randomUUID(),
    createdAt: Date.now(),
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', getRequiredEnv('JWT_SECRET'))
    .update(encodedPayload)
    .digest('base64url')
  return `${encodedPayload}.${signature}`
}

function parseState(state: string): { userId: string } {
  const [encodedPayload, signature] = state.split('.')
  if (!encodedPayload || !signature) {
    throw new Error('Invalid OAuth state')
  }

  const expectedSignature = crypto
    .createHmac('sha256', getRequiredEnv('JWT_SECRET'))
    .update(encodedPayload)
    .digest('base64url')

  const signatureBuffer = Buffer.from(signature)
  const expectedSignatureBuffer = Buffer.from(expectedSignature)
  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    throw new Error('Invalid OAuth state signature')
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
    userId?: string
    createdAt?: number
  }

  if (!payload.userId || !payload.createdAt) {
    throw new Error('Invalid OAuth state payload')
  }

  if (Date.now() - payload.createdAt > 10 * 60 * 1000) {
    throw new Error('OAuth state expired')
  }

  return { userId: payload.userId }
}

export function getGoogleCalendarConnectUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: getRequiredEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: createState(userId),
  })

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export async function completeGoogleCalendarOAuth(code: string, state: string): Promise<void> {
  const { userId } = parseState(state)
  const body = new URLSearchParams({
    code,
    client_id: getRequiredEnv('GOOGLE_CLIENT_ID'),
    client_secret: getRequiredEnv('GOOGLE_CLIENT_SECRET'),
    redirect_uri: getRedirectUri(),
    grant_type: 'authorization_code',
  })

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    throw new Error(`Google token exchange failed: ${errorText}`)
  }

  const tokens = GoogleTokenResponseSchema.parse(await tokenResponse.json())
  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh token; reconnect with consent is required')
  }

  const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (!userInfoResponse.ok) {
    const errorText = await userInfoResponse.text()
    throw new Error(`Google account lookup failed: ${errorText}`)
  }

  const userInfo = GoogleUserInfoSchema.parse(await userInfoResponse.json())
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  const { error } = await supabase
    .from('calendar_connections')
    .upsert({
      user_id: userId,
      provider: 'google',
      provider_account_email: userInfo.email ?? null,
      access_token_encrypted: encryptToken(tokens.access_token),
      refresh_token_encrypted: encryptToken(tokens.refresh_token),
      token_expiry: expiresAt,
      scopes: tokens.scope?.split(' ') ?? GOOGLE_SCOPES,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      disconnected_at: null,
    }, { onConflict: 'user_id,provider' })

  if (error) throw error
}

export async function getGoogleCalendarStatus(userId: string): Promise<CalendarConnectionStatus> {
  const { data, error } = await supabase
    .from('calendar_connections')
    .select('provider_account_email, connected_at, scopes, disconnected_at')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle()

  if (error) throw error

  return {
    provider: 'google',
    connected: Boolean(data && !data.disconnected_at),
    accountEmail: data?.provider_account_email ?? null,
    connectedAt: data?.connected_at ?? null,
    scopes: data?.scopes ?? [],
  }
}

async function getGoogleAccessToken(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('calendar_connections')
    .select('access_token_encrypted, refresh_token_encrypted, token_expiry, disconnected_at')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle()

  if (error) throw error
  if (!data || data.disconnected_at) {
    throw new Error('Google Calendar is not connected')
  }

  const expiresAt = data.token_expiry ? new Date(data.token_expiry).getTime() : 0
  if (data.access_token_encrypted && expiresAt > Date.now() + 60_000) {
    return decryptToken(data.access_token_encrypted)
  }

  const refreshToken = decryptToken(data.refresh_token_encrypted)
  const body = new URLSearchParams({
    client_id: getRequiredEnv('GOOGLE_CLIENT_ID'),
    client_secret: getRequiredEnv('GOOGLE_CLIENT_SECRET'),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    throw new Error(`Google token refresh failed: ${errorText}`)
  }

  const tokens = GoogleTokenResponseSchema.parse(await tokenResponse.json())
  const expiresAtIso = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  const { error: updateError } = await supabase
    .from('calendar_connections')
    .update({
      access_token_encrypted: encryptToken(tokens.access_token),
      token_expiry: expiresAtIso,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', 'google')

  if (updateError) throw updateError
  return tokens.access_token
}

function dateBounds(date: string): { timeMin: string; timeMax: string } {
  const start = new Date(`${date}T00:00:00.000Z`)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  return { timeMin: start.toISOString(), timeMax: end.toISOString() }
}

function getCalendarTimeZone(timeZone?: string): string {
  return timeZone || process.env.GOOGLE_CALENDAR_TIME_ZONE || 'UTC'
}

function isTimedTask(row: GoogleSyncedTask): boolean {
  return row.type === 'task' && Boolean(row.scheduled_date && row.start_time)
}

function taskEventTimes(row: GoogleSyncedTask): { start: string; end: string } {
  if (!row.scheduled_date || !row.start_time) {
    throw new Error('Task is missing schedule fields')
  }

  const [hours, minutes] = row.start_time.split(':').map(Number)
  const durationMinutes = row.duration || 30
  const startMinutes = (hours || 0) * 60 + (minutes || 0)
  const endMinutes = startMinutes + durationMinutes
  const endDate = new Date(`${row.scheduled_date}T00:00:00.000Z`)
  endDate.setUTCDate(endDate.getUTCDate() + Math.floor(endMinutes / (24 * 60)))

  const localDateTime = (date: string, totalMinutes: number) => {
    const minutesInDay = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60)
    return `${date}T${String(Math.floor(minutesInDay / 60)).padStart(2, '0')}:${String(minutesInDay % 60).padStart(2, '0')}:00`
  }

  return {
    start: localDateTime(row.scheduled_date, startMinutes),
    end: localDateTime(endDate.toISOString().slice(0, 10), endMinutes),
  }
}

export function taskToGoogleEvent(row: GoogleSyncedTask, timeZone?: string) {
  const { start, end } = taskEventTimes(row)
  const calendarTimeZone = getCalendarTimeZone(timeZone)

  return {
    summary: row.title,
    start: {
      dateTime: start,
      timeZone: calendarTimeZone,
    },
    end: {
      dateTime: end,
      timeZone: calendarTimeZone,
    },
    extendedProperties: {
      private: {
        healthyflowTaskId: row.id,
        healthyflowUserId: row.user_id,
      },
    },
  }
}

export async function syncTaskToGoogleCalendar(row: GoogleSyncedTask, timeZone?: string): Promise<{
  googleEventId: string | null
  synced: boolean
  status: 'synced' | 'skipped' | 'failed'
}> {
  if (!isTimedTask(row)) {
    if (row.google_event_id) {
      await deleteGoogleCalendarEvent(row.user_id, row.google_event_id)
    }
    return {
      googleEventId: null,
      synced: false,
      status: 'skipped',
    }
  }

  const accessToken = await getGoogleAccessToken(row.user_id)
  const eventBody = taskToGoogleEvent(row, timeZone)
  const existingEventId = row.google_event_id
  const url = existingEventId
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(existingEventId)}`
    : 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

  const response = await fetch(url, {
    method: existingEventId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventBody),
  })

  if (!response.ok) {
    if (existingEventId && response.status === 404) {
      return syncTaskToGoogleCalendar({ ...row, google_event_id: null }, timeZone)
    }
    const errorText = await response.text()
    throw new Error(`Google Calendar task sync failed: ${errorText}`)
  }

  const event = GoogleEventMutationResponseSchema.parse(await response.json())
  return {
    googleEventId: event.id,
    synced: true,
    status: 'synced',
  }
}

export async function syncTimedTasksForDate(userId: string, date: string, timeZone?: string): Promise<{ synced: number }> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'task')
    .eq('scheduled_date', date)
    .is('deleted_at', null)
    .not('start_time', 'is', null)

  if (error) throw error

  let synced = 0
  for (const task of data ?? []) {
    try {
      const result = await syncTaskToGoogleCalendar(task, timeZone)
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          google_event_id: result.googleEventId,
          synced_to_google: result.synced,
          google_sync_status: result.status,
        })
        .eq('id', task.id)

      if (updateError) throw updateError
      if (result.synced) synced += 1
    } catch (error) {
      if (error instanceof Error && error.message === 'Google Calendar is not connected') {
        return { synced }
      }

      await supabase
        .from('tasks')
        .update({
          synced_to_google: false,
          google_sync_status: 'failed',
        })
        .eq('id', task.id)
      throw error
    }
  }

  return { synced }
}

export async function deleteGoogleCalendarEvent(userId: string, googleEventId: string): Promise<void> {
  const accessToken = await getGoogleAccessToken(userId)
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const errorText = await response.text()
    throw new Error(`Google Calendar event delete failed: ${errorText}`)
  }
}

function formatExternalEvent(row: any): ExternalCalendarEvent {
  const rawStart = row.raw?.start?.dateTime ?? row.raw?.start?.date ?? null
  const rawEnd = row.raw?.end?.dateTime ?? row.raw?.end?.date ?? null

  return {
    id: row.id,
    provider: row.provider,
    calendarId: row.provider_calendar_id,
    externalEventId: row.provider_event_id,
    title: row.title,
    description: row.description ?? null,
    location: row.location ?? null,
    startAt: row.start_at ?? null,
    endAt: row.end_at ?? null,
    localStartTime: typeof rawStart === 'string' && rawStart.includes('T') ? rawStart.slice(11, 16) : null,
    localEndTime: typeof rawEnd === 'string' && rawEnd.includes('T') ? rawEnd.slice(11, 16) : null,
    allDay: Boolean(row.all_day),
    status: row.status ?? null,
    htmlLink: row.html_link ?? null,
    completed: Boolean(row.completed),
    completedAt: row.completed_at ?? null,
  }
}

export async function updateExternalCalendarEventCompletion(
  userId: string,
  eventId: string,
  completed: boolean
): Promise<ExternalCalendarEvent> {
  const { data, error } = await supabase
    .from('external_calendar_events')
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', eventId)
    .is('deleted_at', null)
    .select('*')
    .single()

  if (error) throw error
  return formatExternalEvent(data)
}

export async function syncGoogleCalendarEventsForDate(
  userId: string,
  date: string
): Promise<ExternalCalendarEvent[]> {
  const accessToken = await getGoogleAccessToken(userId)
  const { timeMin, timeMax } = dateBounds(date)
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    showDeleted: 'false',
    maxResults: '100',
  })

  const eventsResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!eventsResponse.ok) {
    const errorText = await eventsResponse.text()
    throw new Error(`Google Calendar events fetch failed: ${errorText}`)
  }

  const googleEvents = GoogleEventsListSchema.parse(await eventsResponse.json()).items
  const healthyFlowEventIds = googleEvents
    .filter((event) => event.extendedProperties?.private?.healthyflowTaskId)
    .map((event) => event.id)

  if (healthyFlowEventIds.length > 0) {
    const { error } = await supabase
      .from('external_calendar_events')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'google')
      .eq('provider_calendar_id', 'primary')
      .in('provider_event_id', healthyFlowEventIds)

    if (error) throw error
  }

  const rows = googleEvents
    .filter((event) => event.status !== 'cancelled')
    .filter((event) => !event.extendedProperties?.private?.healthyflowTaskId)
    .map((event) => {
      const start = event.start?.dateTime ?? event.start?.date ?? null
      const end = event.end?.dateTime ?? event.end?.date ?? null
      return {
        user_id: userId,
        provider: 'google',
        provider_calendar_id: 'primary',
        provider_event_id: event.id,
        etag: event.etag ?? null,
        title: event.summary || '(No title)',
        description: event.description ?? null,
        location: event.location ?? null,
        start_at: start ? new Date(start).toISOString() : null,
        end_at: end ? new Date(end).toISOString() : null,
        all_day: Boolean(event.start?.date),
        status: event.status ?? null,
        html_link: event.htmlLink ?? null,
        raw: event,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      }
    })

  if (rows.length > 0) {
    const { error } = await supabase
      .from('external_calendar_events')
      .upsert(rows, { onConflict: 'user_id,provider,provider_calendar_id,provider_event_id' })

    if (error) throw error
  }

  const { data, error } = await supabase
    .from('external_calendar_events')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .eq('provider_calendar_id', 'primary')
    .is('deleted_at', null)
    .gte('end_at', timeMin)
    .lt('start_at', timeMax)
    .order('start_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map(formatExternalEvent)
}

export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  const { error } = await supabase
    .from('calendar_connections')
    .update({
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', 'google')

  if (error) throw error
}

export function getCalendarOAuthReturnUrl(status: 'connected' | 'error', message?: string): string {
  const params = new URLSearchParams({ calendar: status })
  if (message) params.set('message', message)
  return `${getFrontendUrl()}/settings?${params.toString()}`
}
