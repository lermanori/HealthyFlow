import { registerPlugin } from '@capacitor/core'
import { z } from 'zod'
import DaySummaryContracts from '../../backend/src/day-summary-schema'
import type { CalendarSource } from '../../backend/src/day-summary-schema'

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

export function createCalendarEventReader(options: {
  isNativeIOS: boolean
  readDevice: (date: string) => Promise<DeviceCalendarReadResult>
  readGoogle: (date: string) => Promise<z.infer<typeof DaySummaryCalendarEventSchema>[]>
}) {
  return async (date: string) => {
    if (!options.isNativeIOS) return options.readGoogle(date)

    const result = await options.readDevice(date)
    if (result.state === 'unavailable') {
      throw new Error(result.reason)
    }
    return result.state === 'connected' ? result.events : []
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

interface DeviceCalendarPlugin {
  getAuthorizationStatus(): Promise<unknown>
  requestFullAccess(): Promise<unknown>
  getEvents(options: { date: string }): Promise<unknown>
  openSettings(): Promise<void>
}

const DeviceCalendar = registerPlugin<DeviceCalendarPlugin>('DeviceCalendar')

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Device Calendar could not be read.'
}

export function createDeviceCalendarService(plugin: DeviceCalendarPlugin) {
  return {
    async authorization(): Promise<DeviceCalendarAuthorization> {
      return DeviceCalendarAuthorizationSchema.parse(
        await plugin.getAuthorizationStatus(),
      )
    },

    async requestFullAccess(): Promise<DeviceCalendarAuthorization> {
      return DeviceCalendarAuthorizationSchema.parse(
        await plugin.requestFullAccess(),
      )
    },

    openSettings(): Promise<void> {
      return plugin.openSettings()
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
