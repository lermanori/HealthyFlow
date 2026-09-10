import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { z } from 'zod'
import DaySummaryContracts from '../../backend/src/day-summary-schema'
import type { CalendarSource } from '../../backend/src/day-summary-schema'
import {
  DeviceCalendarLinkSchema,
  loadLocalDatabase,
  mutateLocalDatabase,
  type DeviceCalendarLink,
} from './local/store'

const { DaySummaryCalendarEventSchema } = DaySummaryContracts

export const DeviceCalendarAuthorizationSchema = z.object({
  status: z.enum(['not_determined', 'restricted', 'denied', 'full_access']),
}).strict()

const DeviceCalendarEventsResponseSchema = z.object({
  events: z.array(DaySummaryCalendarEventSchema),
}).strict()

export const DeviceCalendarReadResultSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('connected'),
    events: z.array(DaySummaryCalendarEventSchema),
  }).strict(),
  z.object({
    state: z.literal('not_connected'),
    reason: z.enum(['not_determined', 'restricted', 'denied']),
  }).strict(),
  z.object({
    state: z.literal('unavailable'),
    reason: z.string().min(1),
  }).strict(),
])

export type DeviceCalendarAuthorization = z.infer<typeof DeviceCalendarAuthorizationSchema>
export type DeviceCalendarReadResult = z.infer<typeof DeviceCalendarReadResultSchema>
export const DEVICE_CALENDAR_CONNECTION_CHANGED_EVENT = 'healthyflow:device-calendar-connection-changed'

export const CalendarProviderReadResultSchema = z.discriminatedUnion('state', [
  z.object({
    provider: z.enum(['device', 'google']),
    state: z.literal('connected'),
    events: z.array(DaySummaryCalendarEventSchema),
  }).strict(),
  z.object({
    provider: z.enum(['device', 'google']),
    state: z.literal('not_connected'),
    reason: z.literal('not_connected'),
  }).strict(),
  z.object({
    provider: z.literal('google'),
    state: z.literal('not_entitled'),
    reason: z.literal('cloud_not_active'),
  }).strict(),
  z.object({
    provider: z.enum(['device', 'google']),
    state: z.literal('unavailable'),
    reason: z.string().min(1),
  }).strict(),
])

export const CombinedCalendarReadResultSchema = z.object({
  sources: z.array(CalendarProviderReadResultSchema),
  events: z.array(DaySummaryCalendarEventSchema),
}).strict()

export type CalendarProviderReadResult = z.infer<typeof CalendarProviderReadResultSchema>
export type CombinedCalendarReadResult = z.infer<typeof CombinedCalendarReadResultSchema>

export const HostedGoogleCalendarAccessResultSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('connected') }).strict(),
  z.object({ state: z.literal('not_connected'), reason: z.literal('not_connected') }).strict(),
  z.object({ state: z.literal('not_entitled'), reason: z.literal('cloud_not_active') }).strict(),
  z.object({ state: z.literal('unavailable'), reason: z.string().min(1) }).strict(),
])
export type HostedGoogleCalendarAccessResult = z.infer<typeof HostedGoogleCalendarAccessResultSchema>

export async function resolveHostedGoogleCalendarAccess(options: {
  claimed: boolean
  surfaceEnabled: boolean
  readCloudActive: () => Promise<boolean>
  readConnected: () => Promise<boolean>
}): Promise<HostedGoogleCalendarAccessResult> {
  if (!options.claimed || !options.surfaceEnabled) {
    return { state: 'not_entitled', reason: 'cloud_not_active' }
  }
  try {
    if (!await options.readCloudActive()) {
      return { state: 'not_entitled', reason: 'cloud_not_active' }
    }
  } catch (error) {
    return {
      state: 'unavailable',
      reason: errorMessage(error, 'Cloud access could not be checked.'),
    }
  }
  try {
    return await options.readConnected()
      ? { state: 'connected' }
      : { state: 'not_connected', reason: 'not_connected' }
  } catch (error) {
    return {
      state: 'unavailable',
      reason: errorMessage(error, 'Google Calendar access could not be checked.'),
    }
  }
}

const HostedGoogleCalendarAccessInputSchema = z.object({
  claimed: z.boolean(),
  cloudActive: z.boolean(),
  surfaceEnabled: z.boolean(),
}).strict()

export function canUseHostedGoogleCalendar(input: z.input<typeof HostedGoogleCalendarAccessInputSchema>) {
  const access = HostedGoogleCalendarAccessInputSchema.parse(input)
  return access.claimed && access.cloudActive && access.surfaceEnabled
}

export const DeviceCalendarItemInputSchema = z.object({
  itemId: z.string().min(1),
  eventIdentifier: z.string().min(1).nullable(),
  title: z.string().min(1),
  scheduledDate: z.string().date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().positive(),
  location: z.string().nullable(),
}).strict()

const DeviceCalendarEventMutationResponseSchema = z.object({
  eventIdentifier: z.string().min(1),
}).strict()

const DeviceCalendarEventDeletionResponseSchema = z.object({
  deleted: z.boolean(),
}).strict()

export const DeviceCalendarItemSyncResultSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('synced'),
    eventIdentifier: z.string().min(1),
  }).strict(),
  z.object({
    state: z.literal('not_connected'),
    reason: z.enum(['not_determined', 'restricted', 'denied']),
  }).strict(),
  z.object({
    state: z.literal('failed'),
    reason: z.string().min(1),
  }).strict(),
])

export type DeviceCalendarItemInput = z.infer<typeof DeviceCalendarItemInputSchema>
export type DeviceCalendarItemSyncResult = z.infer<typeof DeviceCalendarItemSyncResultSchema>

export const DeviceCalendarItemRemovalResultSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('removed') }).strict(),
  z.object({
    state: z.literal('not_connected'),
    reason: z.enum(['not_determined', 'restricted', 'denied']),
  }).strict(),
  z.object({
    state: z.literal('failed'),
    reason: z.string().min(1),
  }).strict(),
])
export type DeviceCalendarItemRemovalResult = z.infer<typeof DeviceCalendarItemRemovalResultSchema>

const DeviceCalendarReconcileItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  scheduledDate: z.string().date().nullable(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  durationMinutes: z.number().int().positive(),
  location: z.string().nullable(),
  updatedAt: z.string().min(1),
  deleted: z.boolean(),
}).strict()

type DeviceCalendarReconcileItem = z.infer<typeof DeviceCalendarReconcileItemSchema>
type DeviceCalendarItemSync = {
  upsert(input: DeviceCalendarItemInput): Promise<DeviceCalendarItemSyncResult>
  remove(eventIdentifier: string): Promise<DeviceCalendarItemRemovalResult>
}

export type DeviceCalendarReconcileResult =
  | { state: 'connected'; links: DeviceCalendarLink[]; failures: string[] }
  | {
      state: 'not_connected'
      links: DeviceCalendarLink[]
      reason: 'not_determined' | 'restricted' | 'denied'
    }

export async function reconcileDeviceCalendarItems(input: {
  items: DeviceCalendarReconcileItem[]
  links: DeviceCalendarLink[]
  sync: DeviceCalendarItemSync
  now?: string
}): Promise<DeviceCalendarReconcileResult> {
  const items = z.array(DeviceCalendarReconcileItemSchema).parse(input.items)
  const links = z.array(DeviceCalendarLinkSchema).parse(input.links)
  const byItem = new Map(links.map((link) => [link.itemId, link]))
  const failures: string[] = []
  const changedAt = input.now ?? new Date().toISOString()
  const scheduledItemIds = new Set(
    items
      .filter((item) => !item.deleted && item.scheduledDate && item.startTime)
      .map((item) => item.id),
  )

  for (const item of items) {
    if (item.deleted || !item.scheduledDate || !item.startTime) continue
    const existing = byItem.get(item.id)

    const result = await input.sync.upsert({
      itemId: item.id,
      eventIdentifier: existing?.eventIdentifier ?? null,
      title: item.title,
      scheduledDate: item.scheduledDate,
      startTime: item.startTime,
      durationMinutes: item.durationMinutes,
      location: item.location,
    })
    if (result.state === 'not_connected') {
      return { state: 'not_connected', links, reason: result.reason }
    }
    const link: DeviceCalendarLink = result.state === 'synced'
      ? existing?.status === 'synced'
        && existing.eventIdentifier === result.eventIdentifier
        && existing.itemUpdatedAt === item.updatedAt
        && existing.error === null
        ? existing
        : {
          itemId: item.id,
          eventIdentifier: result.eventIdentifier,
          status: 'synced',
          error: null,
          itemUpdatedAt: item.updatedAt,
          updatedAt: changedAt,
          }
      : {
          itemId: item.id,
          eventIdentifier: existing?.eventIdentifier ?? null,
          status: 'failed',
          error: result.reason,
          itemUpdatedAt: item.updatedAt,
          updatedAt: changedAt,
        }
    byItem.set(item.id, link)
    if (link.status === 'failed') failures.push(item.id)
  }

  for (const link of [...byItem.values()]) {
    if (scheduledItemIds.has(link.itemId)) continue
    if (link.eventIdentifier === null) {
      byItem.delete(link.itemId)
      continue
    }

    const result = await input.sync.remove(link.eventIdentifier)
    if (result.state === 'not_connected') {
      return { state: 'not_connected', links: [...byItem.values()], reason: result.reason }
    }
    if (result.state === 'removed') {
      byItem.delete(link.itemId)
      continue
    }
    byItem.set(link.itemId, {
      ...link,
      status: 'failed',
      error: result.reason,
      updatedAt: changedAt,
    })
    failures.push(link.itemId)
  }

  return { state: 'connected', links: [...byItem.values()], failures }
}

/**
 * Reconcile one person's Local day with EventKit on this iPhone.
 *
 * The link collection is device bookkeeping, not a synced day collection. A
 * 30-minute event duration is the same declared export default used by the
 * existing Google Calendar integration when an Item has no duration; it does
 * not feed Capacity, which continues to report the missing duration honestly.
 */
export async function syncLocalDayWithDeviceCalendar(
  userId: string,
  sync: DeviceCalendarItemSync,
  now?: string,
): Promise<
  | { state: 'connected'; failures: string[] }
  | { state: 'not_connected'; reason: 'not_determined' | 'restricted' | 'denied' }
> {
  const database = await loadLocalDatabase(userId)
  const result = await reconcileDeviceCalendarItems({
    items: database.tasks.map((row) => ({
      id: row.id,
      title: row.title,
      scheduledDate: row.scheduled_date,
      // Older hosted rows used an empty string to mean "untimed". It is the
      // same explicit absence as null, not a clock value. Every nonblank value
      // still passes through the strict HH:mm reconciliation schema below.
      startTime: row.start_time === '' ? null : row.start_time,
      durationMinutes: Math.max(1, Math.round(row.duration ?? 30)),
      location: row.location,
      updatedAt: row.updated_at ?? row.created_at,
      deleted: row.deleted_at !== null,
    })),
    links: database.deviceCalendarLinks,
    sync,
    now,
  })

  if (result.state === 'not_connected') {
    return { state: 'not_connected', reason: result.reason }
  }

  if (JSON.stringify(result.links) !== JSON.stringify(database.deviceCalendarLinks)) {
    await mutateLocalDatabase(userId, (current) => ({
      next: { ...current, deviceCalendarLinks: result.links },
      result: undefined,
    }))
  }
  return { state: 'connected', failures: result.failures }
}

interface DeviceCalendarItemPlugin {
  getAuthorizationStatus(): Promise<unknown>
  upsertItemEvent(options: DeviceCalendarItemInput): Promise<unknown>
  deleteItemEvent(options: { eventIdentifier: string }): Promise<unknown>
}

export function createDeviceCalendarItemSync(plugin: DeviceCalendarItemPlugin) {
  return {
    async upsert(input: DeviceCalendarItemInput): Promise<DeviceCalendarItemSyncResult> {
      try {
        const authorization = DeviceCalendarAuthorizationSchema.parse(
          await plugin.getAuthorizationStatus(),
        )
        if (authorization.status !== 'full_access') {
          return { state: 'not_connected', reason: authorization.status }
        }
        const checkedInput = DeviceCalendarItemInputSchema.parse(input)
        const response = DeviceCalendarEventMutationResponseSchema.parse(
          await plugin.upsertItemEvent(checkedInput),
        )
        return { state: 'synced', eventIdentifier: response.eventIdentifier }
      } catch (error) {
        return { state: 'failed', reason: errorMessage(error) }
      }
    },

    async remove(eventIdentifier: string): Promise<DeviceCalendarItemRemovalResult> {
      try {
        const authorization = DeviceCalendarAuthorizationSchema.parse(
          await plugin.getAuthorizationStatus(),
        )
        if (authorization.status !== 'full_access') {
          return { state: 'not_connected', reason: authorization.status }
        }
        DeviceCalendarEventDeletionResponseSchema.parse(
          await plugin.deleteItemEvent({ eventIdentifier: z.string().min(1).parse(eventIdentifier) }),
        )
        return { state: 'removed' }
      } catch (error) {
        return { state: 'failed', reason: errorMessage(error) }
      }
    },
  }
}

export function deviceCalendarReadToDaySource(
  result: DeviceCalendarReadResult,
): CalendarSource {
  if (result.state === 'connected') {
    return {
      status: result.events.length > 0 ? 'connected' : 'connected_empty',
      reasonCode: null,
      events: result.events,
    }
  }
  if (result.state === 'not_connected') {
    return { status: 'not_connected', reasonCode: 'not_connected', events: [] }
  }
  return { status: 'unavailable', reasonCode: 'status_unavailable', events: [] }
}

function deviceCalendarReadToProvider(result: DeviceCalendarReadResult): CalendarProviderReadResult {
  if (result.state === 'connected') {
    return { provider: 'device', state: 'connected', events: result.events }
  }
  if (result.state === 'not_connected') {
    return { provider: 'device', state: 'not_connected', reason: 'not_connected' }
  }
  return { provider: 'device', state: 'unavailable', reason: result.reason }
}

export function combinedCalendarReadToDaySource(result: CombinedCalendarReadResult): CalendarSource {
  const combined = CombinedCalendarReadResultSchema.parse(result)
  const providerStates = combined.sources.map((source) => {
    if (source.state === 'connected') {
      return {
        provider: source.provider,
        status: source.events.length > 0 ? 'connected' as const : 'connected_empty' as const,
        reasonCode: null,
      }
    }
    if (source.state === 'not_connected') {
      return { provider: source.provider, status: 'not_connected' as const, reasonCode: 'not_connected' as const }
    }
    if (source.state === 'not_entitled') {
      return { provider: source.provider, status: 'not_entitled' as const, reasonCode: 'cloud_not_active' as const }
    }
    return { provider: source.provider, status: 'unavailable' as const, reasonCode: 'status_unavailable' as const }
  })

  if (combined.sources.some((source) => source.state === 'unavailable')) {
    return {
      status: 'unavailable',
      reasonCode: 'status_unavailable',
      events: combined.events,
      providerStates,
    }
  }
  if (combined.sources.some((source) => source.state === 'connected')) {
    return {
      status: combined.events.length > 0 ? 'connected' : 'connected_empty',
      reasonCode: null,
      events: combined.events,
      providerStates,
    }
  }
  if (combined.sources.some((source) => source.state === 'not_connected')) {
    return { status: 'not_connected', reasonCode: 'not_connected', events: [], providerStates }
  }
  return { status: 'not_entitled', reasonCode: 'cloud_not_active', events: [], providerStates }
}

export function createCalendarEventReader(options: {
  isNativeIOS: boolean
  readDevice: (date: string) => Promise<DeviceCalendarReadResult>
  readGoogle: (date: string) => Promise<CalendarProviderReadResult>
  includeGoogle: boolean
}) {
  return async (date: string): Promise<CombinedCalendarReadResult> => {
    if (!options.isNativeIOS) {
      const google = CalendarProviderReadResultSchema.parse(await options.readGoogle(date))
      return CombinedCalendarReadResultSchema.parse({
        sources: [google],
        events: google.state === 'connected' ? google.events : [],
      })
    }

    const [device, google] = await Promise.all([
      options.readDevice(date).then(deviceCalendarReadToProvider),
      options.includeGoogle ? options.readGoogle(date) : Promise.resolve(null),
    ])
    const sources = [device, ...(google ? [CalendarProviderReadResultSchema.parse(google)] : [])]
    return CombinedCalendarReadResultSchema.parse({
      sources,
      events: sources.flatMap((source) => source.state === 'connected' ? source.events : []),
    })
  }
}

export function createWebGoogleCalendarMutation<Args extends unknown[], Result>(options: {
  isNativeIOS: boolean
  mutate: (...args: Args) => Promise<Result>
}) {
  return async (...args: Args): Promise<Result> => {
    if (options.isNativeIOS) {
      throw new Error('Device Calendar is read-only in this version.')
    }
    return options.mutate(...args)
  }
}

interface DeviceCalendarReadPlugin {
  getAuthorizationStatus(): Promise<unknown>
  requestFullAccess(): Promise<unknown>
  getEvents(options: { date: string }): Promise<unknown>
  openSettings(): Promise<void>
  addListener?(
    eventName: 'eventsChanged',
    listener: () => void,
  ): Promise<PluginListenerHandle>
}

interface DeviceCalendarPlugin extends DeviceCalendarReadPlugin {
  upsertItemEvent(options: DeviceCalendarItemInput): Promise<unknown>
  deleteItemEvent(options: { eventIdentifier: string }): Promise<unknown>
}

const DeviceCalendar = registerPlugin<DeviceCalendarPlugin>('DeviceCalendar')

function announceDeviceCalendarConnectionChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(DEVICE_CALENDAR_CONNECTION_CHANGED_EVENT))
}

function errorMessage(error: unknown, fallback = 'Device Calendar could not be read.'): string {
  return error instanceof Error && error.message
    ? error.message
    : fallback
}

export function createDeviceCalendarService(plugin: DeviceCalendarReadPlugin) {
  return {
    async authorization(): Promise<DeviceCalendarAuthorization> {
      return DeviceCalendarAuthorizationSchema.parse(
        await plugin.getAuthorizationStatus(),
      )
    },

    async requestFullAccess(): Promise<DeviceCalendarAuthorization> {
      const authorization = DeviceCalendarAuthorizationSchema.parse(
        await plugin.requestFullAccess(),
      )
      if (authorization.status === 'full_access') announceDeviceCalendarConnectionChange()
      return authorization
    },

    openSettings(): Promise<void> {
      return plugin.openSettings()
    },

    addEventsChangedListener(listener: () => void): Promise<PluginListenerHandle> {
      if (!plugin.addListener) {
        return Promise.reject(new Error('Device Calendar change notifications are unavailable.'))
      }
      return plugin.addListener('eventsChanged', listener)
    },

    async read(date: string): Promise<DeviceCalendarReadResult> {
      try {
        const authorization = DeviceCalendarAuthorizationSchema.parse(
          await plugin.getAuthorizationStatus(),
        )
        if (authorization.status !== 'full_access') {
          return {
            state: 'not_connected',
            reason: authorization.status,
          }
        }

        const response = DeviceCalendarEventsResponseSchema.parse(
          await plugin.getEvents({ date }),
        )
        return { state: 'connected', events: response.events }
      } catch (error) {
        return { state: 'unavailable', reason: errorMessage(error) }
      }
    },
  }
}

export const deviceCalendarService = createDeviceCalendarService(DeviceCalendar)
export const deviceCalendarItemSync = createDeviceCalendarItemSync(DeviceCalendar)
