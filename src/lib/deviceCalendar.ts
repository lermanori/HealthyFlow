import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { z } from 'zod'
import { reconcileLinkedRecord } from './deviceCalendarReconcile'
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

/**
 * One linked event as EventKit currently holds it (#267).
 *
 * `missing` covers both "deleted in iOS Calendar" and "no longer carries the
 * HealthyFlow ownership marker": either way it is not a linked record any more.
 * `lastModifiedAt` is nullable because EventKit does not guarantee one, and the
 * decision layer must be told that rather than handed a substitute that would
 * silently win a concurrent edit.
 */
export const DeviceCalendarLinkedEventSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('missing'),
    eventIdentifier: z.string().min(1),
  }).strict(),
  z.object({
    state: z.literal('present'),
    eventIdentifier: z.string().min(1),
    title: z.string().min(1),
    scheduledDate: z.string().date(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    durationMinutes: z.number().int().positive(),
    location: z.string().nullable(),
    lastModifiedAt: z.string().min(1).nullable(),
  }).strict(),
])
export type DeviceCalendarLinkedEvent = z.infer<typeof DeviceCalendarLinkedEventSchema>

const DeviceCalendarLinkedEventsResponseSchema = z.object({
  events: z.array(DeviceCalendarLinkedEventSchema),
}).strict()

export const DeviceCalendarLinkedEventReadSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('read'), events: z.array(DeviceCalendarLinkedEventSchema) }).strict(),
  z.object({
    state: z.literal('not_connected'),
    reason: z.enum(['not_determined', 'restricted', 'denied']),
  }).strict(),
  z.object({ state: z.literal('failed'), reason: z.string().min(1) }).strict(),
])
export type DeviceCalendarLinkedEventRead = z.infer<typeof DeviceCalendarLinkedEventReadSchema>

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
  readLinked(eventIdentifiers: string[]): Promise<DeviceCalendarLinkedEventRead>
  remove(eventIdentifier: string): Promise<DeviceCalendarItemRemovalResult>
}

/** A change EventKit made that the Local day still has to absorb. */
export type DeviceCalendarItemChange =
  | {
      kind: 'update'
      itemId: string
      title: string
      scheduledDate: string
      startTime: string
      durationMinutes: number
      location: string | null
    }
  | { kind: 'delete'; itemId: string }

export type DeviceCalendarReconcileResult =
  | {
      state: 'connected'
      links: DeviceCalendarLink[]
      failures: string[]
      /** Applied by the caller, which owns the Local day. */
      deviceChanges: DeviceCalendarItemChange[]
      conflicts: string[]
    }
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
  const byId = new Map(items.map((item) => [item.id, item]))
  const failures: string[] = []
  const conflicts: string[] = []
  const deviceChanges: DeviceCalendarItemChange[] = []
  const changedAt = input.now ?? new Date().toISOString()
  const scheduledItemIds = new Set(
    items
      .filter((item) => !item.deleted && item.scheduledDate && item.startTime)
      .map((item) => item.id),
  )

  // ── Device side first ─────────────────────────────────────────────────────
  //
  // Read what EventKit currently holds before writing anything, so an edit made
  // in iOS Calendar is seen rather than overwritten. Items the device side
  // settles are excluded from the write pass below.
  const linkedIdentifiers = [...byItem.values()]
    .map((link) => link.eventIdentifier)
    .filter((identifier): identifier is string => identifier !== null)

  const read = await input.sync.readLinked(linkedIdentifiers)
  if (read.state === 'not_connected') {
    return { state: 'not_connected', links, reason: read.reason }
  }

  // A failed read is not an empty Calendar. Every linked event would look
  // deleted, and writing now could clobber a device edit we could not see, so
  // nothing is written this pass.
  if (read.state === 'failed') {
    return {
      state: 'connected',
      links: [...byItem.values()].map((link) => ({
        ...link,
        status: 'failed' as const,
        error: read.reason,
        updatedAt: changedAt,
      })),
      failures: [...byItem.keys()],
      deviceChanges: [],
      conflicts: [],
    }
  }

  const settledByDevice = new Set<string>()
  const eventById = new Map(read.events.map((event) => [event.eventIdentifier, event]))

  for (const link of [...byItem.values()]) {
    if (link.eventIdentifier === null) continue
    const item = byId.get(link.itemId)
    if (!item) continue
    // An identifier the read did not answer for is unknown, not deleted. The
    // native bridge answers for every identifier it is given, so this only
    // happens when something went wrong — and deleting the person's Item on
    // that basis would be a failed read masquerading as an instruction.
    const event = eventById.get(link.eventIdentifier)
    if (!event) continue

    const decision = reconcileLinkedRecord({
      item: {
        id: item.id,
        title: item.title,
        scheduledDate: item.scheduledDate,
        startTime: item.startTime,
        durationMinutes: item.durationMinutes,
        location: item.location,
        updatedAt: item.updatedAt,
        deleted: item.deleted,
      },
      event: event.state === 'present'
        ? {
            state: 'present',
            eventIdentifier: event.eventIdentifier,
            title: event.title,
            scheduledDate: event.scheduledDate,
            startTime: event.startTime,
            durationMinutes: event.durationMinutes,
            location: event.location,
            // A null modification time cannot order anything; the decision layer
            // turns that into a conflict rather than a silent win.
            lastModifiedAt: event.lastModifiedAt ?? 'unknown',
          }
        : { state: 'missing' },
      link: {
        itemId: link.itemId,
        eventIdentifier: link.eventIdentifier,
        itemUpdatedAt: link.itemUpdatedAt,
        eventModifiedAt: link.eventModifiedAt,
        updatedAt: link.updatedAt,
      },
    })

    if (decision.action === 'apply_to_item') {
      deviceChanges.push({
        kind: 'update',
        itemId: link.itemId,
        title: decision.event.title,
        scheduledDate: decision.event.scheduledDate,
        startTime: decision.event.startTime,
        durationMinutes: decision.event.durationMinutes,
        location: decision.event.location,
      })
      // The caller stamps the row with `changedAt` when it applies this, so the
      // watermark has to be that same value — otherwise the next pass reads the
      // applied change as a fresh Item-side edit and writes it straight back.
      byItem.set(link.itemId, {
        ...link,
        status: 'synced',
        error: null,
        itemUpdatedAt: changedAt,
        eventModifiedAt: decision.event.lastModifiedAt,
        updatedAt: changedAt,
      })
      settledByDevice.add(link.itemId)
      continue
    }

    if (decision.action === 'delete_item') {
      deviceChanges.push({ kind: 'delete', itemId: link.itemId })
      byItem.delete(link.itemId)
      settledByDevice.add(link.itemId)
      continue
    }

    if (decision.action === 'conflict') {
      byItem.set(link.itemId, {
        ...link,
        status: 'conflict',
        error: decision.reason === 'indeterminate_order'
          ? 'This Item and its Calendar event were both changed, and neither is clearly newer.'
          : 'This Item and its Calendar event were both changed, and the Calendar did not report when.',
        updatedAt: changedAt,
      })
      conflicts.push(link.itemId)
      settledByDevice.add(link.itemId)
      continue
    }

    // Record the baseline the first time an event is seen, so a link written
    // before this field existed settles after one pass instead of being treated
    // as changed forever.
    if (event.state === 'present' && link.eventModifiedAt === null) {
      byItem.set(link.itemId, { ...link, eventModifiedAt: event.lastModifiedAt })
    }

    if (decision.action === 'none') {
      // Nothing moved on either side, so there is nothing to write. Writing
      // anyway would touch the event and bump its modification time, which the
      // next read sees as a device-side edit — the loop this whole pass exists
      // to settle.
      settledByDevice.add(link.itemId)
      continue
    }

    // `write_to_calendar` and `delete_event` fall through to the passes below,
    // which already own those directions.
  }

  for (const item of items) {
    if (item.deleted || !item.scheduledDate || !item.startTime) continue
    if (settledByDevice.has(item.id)) continue
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
          // Writing the event changes its modification time, so any baseline we
          // held is stale. Null means "record it next pass" — which settles in
          // one more reconcile without claiming the device changed.
          eventModifiedAt: null,
          updatedAt: changedAt,
          }
      : {
          itemId: item.id,
          eventIdentifier: existing?.eventIdentifier ?? null,
          status: 'failed',
          error: result.reason,
          itemUpdatedAt: item.updatedAt,
          eventModifiedAt: existing?.eventModifiedAt ?? null,
          updatedAt: changedAt,
        }
    byItem.set(item.id, link)
    if (link.status === 'failed') failures.push(item.id)
  }

  for (const link of [...byItem.values()]) {
    if (scheduledItemIds.has(link.itemId)) continue
    if (settledByDevice.has(link.itemId)) continue
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

  return { state: 'connected', links: [...byItem.values()], failures, deviceChanges, conflicts }
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
  // One instant for this pass. The reconciler stamps links with it and the rows
  // it causes to change carry the same value, so the next pass cannot read a
  // change HealthyFlow just applied as a fresh Item-side edit.
  const stampedAt = now ?? new Date().toISOString()
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
    now: stampedAt,
  })

  if (result.state === 'not_connected') {
    return { state: 'not_connected', reason: result.reason }
  }

  const changed = new Map(result.deviceChanges.map((change) => [change.itemId, change]))

  if (
    changed.size > 0
    || JSON.stringify(result.links) !== JSON.stringify(database.deviceCalendarLinks)
  ) {
    await mutateLocalDatabase(userId, (current) => ({
      next: {
        ...current,
        deviceCalendarLinks: result.links,
        // Apply what the person changed in iOS Calendar. This is the direction
        // that did not exist: an edit made there used to be overwritten with
        // HealthyFlow's older value, and a deletion there left an Item pointing
        // at an event that was gone.
        tasks: current.tasks.map((row) => {
          const change = changed.get(row.id)
          if (!change) return row
          if (change.kind === 'delete') {
            return { ...row, deleted_at: row.deleted_at ?? stampedAt }
          }
          return {
            ...row,
            title: change.title,
            scheduled_date: change.scheduledDate,
            start_time: change.startTime,
            duration: change.durationMinutes,
            location: change.location,
            updated_at: stampedAt,
          }
        }),
      },
      result: undefined,
    }))
  }
  return { state: 'connected', failures: result.failures }
}


interface DeviceCalendarItemPlugin {
  getAuthorizationStatus(): Promise<unknown>
  upsertItemEvent(options: DeviceCalendarItemInput): Promise<unknown>
  readItemEvents(options: { eventIdentifiers: string[] }): Promise<unknown>
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

    async readLinked(eventIdentifiers: string[]): Promise<DeviceCalendarLinkedEventRead> {
      if (eventIdentifiers.length === 0) return { state: 'read', events: [] }
      try {
        const authorization = DeviceCalendarAuthorizationSchema.parse(
          await plugin.getAuthorizationStatus(),
        )
        if (authorization.status !== 'full_access') {
          return { state: 'not_connected', reason: authorization.status }
        }
        const response = DeviceCalendarLinkedEventsResponseSchema.parse(
          await plugin.readItemEvents({
            eventIdentifiers: z.array(z.string().min(1)).parse(eventIdentifiers),
          }),
        )
        return { state: 'read', events: response.events }
      } catch (error) {
        // A broken read is never an empty Calendar: reporting no events would
        // make every linked Item look deleted.
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
  readItemEvents(options: { eventIdentifiers: string[] }): Promise<unknown>
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
