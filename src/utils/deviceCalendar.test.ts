import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import DaySummaryContracts from '../../backend/src/day-summary-schema'
import { createLocalTask } from '../lib/local/day'
import { loadLocalDatabase, memoryDriver, setLocalStoreDriver } from '../lib/local/store'
import {
  createCalendarEventReader,
  createDeviceCalendarItemSync,
  createDeviceCalendarService,
  createWebGoogleCalendarMutation,
  deviceCalendarReadToDaySource,
  reconcileDeviceCalendarItems,
  syncLocalDayWithDeviceCalendar,
} from '../lib/deviceCalendar'

const { DaySummaryCalendarEventSchema } = DaySummaryContracts

describe('Device Calendar day contract', () => {
  it('syncs a timed Item to one validated EventKit event', async () => {
    const writes: unknown[] = []
    const sync = createDeviceCalendarItemSync({
      getAuthorizationStatus: async () => ({ status: 'full_access' }),
      upsertItemEvent: async (input) => {
        writes.push(input)
        return { eventIdentifier: 'event-1' }
      },
      deleteItemEvent: async () => ({ deleted: true }),
    })

    const result = await sync.upsert({
      itemId: 'item-1',
      eventIdentifier: null,
      title: 'Strength training',
      scheduledDate: '2026-09-09',
      startTime: '18:00',
      durationMinutes: 60,
      location: 'Gym',
    })

    assert.deepEqual(result, { state: 'synced', eventIdentifier: 'event-1' })
    assert.deepEqual(writes, [{
      itemId: 'item-1',
      eventIdentifier: null,
      title: 'Strength training',
      scheduledDate: '2026-09-09',
      startTime: '18:00',
      durationMinutes: 60,
      location: 'Gym',
    }])
  })

  it('removes a linked Item event through a validated EventKit result', async () => {
    const removed: string[] = []
    const sync = createDeviceCalendarItemSync({
      getAuthorizationStatus: async () => ({ status: 'full_access' }),
      upsertItemEvent: async () => ({ eventIdentifier: 'unused' }),
      deleteItemEvent: async ({ eventIdentifier }) => {
        removed.push(eventIdentifier)
        return { deleted: true }
      },
    })

    assert.deepEqual(await sync.remove('event-1'), { state: 'removed' })
    assert.deepEqual(removed, ['event-1'])
  })

  it('reconciles a newly timed Item into a device-local EventKit link', async () => {
    const result = await reconcileDeviceCalendarItems({
      items: [{
        id: 'item-1',
        title: 'Strength training',
        scheduledDate: '2026-09-09',
        startTime: '18:00',
        durationMinutes: 60,
        location: 'Gym',
        updatedAt: '2026-09-09T10:00:00.000Z',
        deleted: false,
      }],
      links: [],
      sync: {
        upsert: async () => ({ state: 'synced', eventIdentifier: 'event-1' }),
        remove: async () => ({ state: 'removed' }),
      },
      now: '2026-09-09T10:01:00.000Z',
    })

    assert.deepEqual(result, {
      state: 'connected',
      failures: [],
      links: [{
        itemId: 'item-1',
        eventIdentifier: 'event-1',
        status: 'synced',
        error: null,
        itemUpdatedAt: '2026-09-09T10:00:00.000Z',
        updatedAt: '2026-09-09T10:01:00.000Z',
      }],
    })
  })

  it('updates the same linked EventKit event after a timed Item changes', async () => {
    const identifiers: Array<string | null> = []
    const result = await reconcileDeviceCalendarItems({
      items: [{
        id: 'item-1',
        title: 'Updated title',
        scheduledDate: '2026-09-10',
        startTime: '19:00',
        durationMinutes: 45,
        location: null,
        updatedAt: '2026-09-09T11:00:00.000Z',
        deleted: false,
      }],
      links: [{
        itemId: 'item-1',
        eventIdentifier: 'event-1',
        status: 'synced',
        error: null,
        itemUpdatedAt: '2026-09-09T10:00:00.000Z',
        updatedAt: '2026-09-09T10:01:00.000Z',
      }],
      sync: {
        upsert: async (item) => {
          identifiers.push(item.eventIdentifier)
          return { state: 'synced', eventIdentifier: 'event-1' }
        },
        remove: async () => ({ state: 'removed' }),
      },
      now: '2026-09-09T11:01:00.000Z',
    })

    assert.deepEqual(identifiers, ['event-1'])
    assert.equal(result.links[0]?.eventIdentifier, 'event-1')
    assert.equal(result.links[0]?.itemUpdatedAt, '2026-09-09T11:00:00.000Z')
  })

  it('recreates an unchanged Item event that was removed in Apple Calendar', async () => {
    const result = await reconcileDeviceCalendarItems({
      items: [{
        id: 'item-1',
        title: 'Strength training',
        scheduledDate: '2026-09-09',
        startTime: '18:00',
        durationMinutes: 60,
        location: null,
        updatedAt: '2026-09-09T10:00:00.000Z',
        deleted: false,
      }],
      links: [{
        itemId: 'item-1',
        eventIdentifier: 'event-removed-outside-healthyflow',
        status: 'synced',
        error: null,
        itemUpdatedAt: '2026-09-09T10:00:00.000Z',
        updatedAt: '2026-09-09T10:01:00.000Z',
      }],
      sync: {
        upsert: async () => ({ state: 'synced', eventIdentifier: 'event-recreated' }),
        remove: async () => ({ state: 'removed' }),
      },
      now: '2026-09-09T11:00:00.000Z',
    })

    assert.equal(result.links[0]?.eventIdentifier, 'event-recreated')
  })

  it('removes the linked EventKit event after its Item is deleted', async () => {
    const removed: string[] = []
    const result = await reconcileDeviceCalendarItems({
      items: [{
        id: 'item-1',
        title: 'Deleted Item',
        scheduledDate: '2026-09-09',
        startTime: '18:00',
        durationMinutes: 30,
        location: null,
        updatedAt: '2026-09-09T12:00:00.000Z',
        deleted: true,
      }],
      links: [{
        itemId: 'item-1',
        eventIdentifier: 'event-1',
        status: 'synced',
        error: null,
        itemUpdatedAt: '2026-09-09T10:00:00.000Z',
        updatedAt: '2026-09-09T10:01:00.000Z',
      }],
      sync: {
        upsert: async () => ({ state: 'synced', eventIdentifier: 'unused' }),
        remove: async (identifier) => {
          removed.push(identifier)
          return { state: 'removed' }
        },
      },
    })

    assert.deepEqual(removed, ['event-1'])
    assert.deepEqual(result.links, [])
  })

  it('records a failed write so automatic sync can retry it explicitly', async () => {
    const item = {
      id: 'item-1',
      title: 'Strength training',
      scheduledDate: '2026-09-09',
      startTime: '18:00',
      durationMinutes: 60,
      location: null,
      updatedAt: '2026-09-09T10:00:00.000Z',
      deleted: false,
    }
    const failed = await reconcileDeviceCalendarItems({
      items: [item],
      links: [],
      sync: {
        upsert: async () => ({ state: 'failed', reason: 'Calendar is unavailable' }),
        remove: async () => ({ state: 'removed' }),
      },
      now: '2026-09-09T10:01:00.000Z',
    })

    assert.equal(failed.state, 'connected')
    if (failed.state !== 'connected') assert.fail('expected connected Calendar')
    assert.deepEqual(failed.failures, ['item-1'])
    assert.equal(failed.links[0]?.status, 'failed')
    assert.equal(failed.links[0]?.error, 'Calendar is unavailable')

    const retried = await reconcileDeviceCalendarItems({
      items: [item],
      links: failed.links,
      sync: {
        upsert: async () => ({ state: 'synced', eventIdentifier: 'event-1' }),
        remove: async () => ({ state: 'removed' }),
      },
      now: '2026-09-09T10:02:00.000Z',
    })

    assert.equal(retried.state, 'connected')
    if (retried.state !== 'connected') assert.fail('expected connected Calendar')
    assert.deepEqual(retried.failures, [])
    assert.equal(retried.links[0]?.status, 'synced')
    assert.equal(retried.links[0]?.eventIdentifier, 'event-1')
    assert.equal(retried.links[0]?.error, null)
  })

  it('persists a Guest timed Item link entirely inside the Local day', async () => {
    setLocalStoreDriver(memoryDriver(null))
    const item = await createLocalTask('guest-1', {
      title: 'Strength training',
      type: 'task',
      category: 'fitness',
      scheduledDate: '2026-09-09',
      startTime: '18:00',
      duration: 60,
    })

    const result = await syncLocalDayWithDeviceCalendar('guest-1', {
      upsert: async () => ({ state: 'synced', eventIdentifier: 'event-1' }),
      remove: async () => ({ state: 'removed' }),
    }, '2026-09-09T18:01:00.000Z')
    const database = await loadLocalDatabase('guest-1')

    assert.deepEqual(result, { state: 'connected', failures: [] })
    assert.equal(database.deviceCalendarLinks[0]?.itemId, item.id)
    assert.equal(database.deviceCalendarLinks[0]?.eventIdentifier, 'event-1')
  })

  it('accepts a device Calendar obligation as a canonical day event', () => {
    const event = DaySummaryCalendarEventSchema.parse({
      id: 'device:event-1',
      provider: 'device',
      calendarId: 'calendar-1',
      externalEventId: 'event-1',
      title: 'Dentist',
      description: null,
      location: 'Clinic',
      startAt: '2026-09-08T09:00:00.000+02:00',
      endAt: '2026-09-08T10:00:00.000+02:00',
      localStartTime: '09:00',
      localEndTime: '10:00',
      allDay: false,
      status: 'confirmed',
      htmlLink: null,
      completed: false,
      completedAt: null,
    })

    assert.equal(event.provider, 'device')
  })

  it('returns validated events when the device grants full Calendar access', async () => {
    const service = createDeviceCalendarService({
      getAuthorizationStatus: async () => ({ status: 'full_access' }),
      requestFullAccess: async () => ({ status: 'full_access' }),
      getEvents: async () => ({
        events: [{
          id: 'device:event-1',
          provider: 'device',
          calendarId: 'calendar-1',
          externalEventId: 'event-1',
          title: 'Dentist',
          description: null,
          location: 'Clinic',
          startAt: '2026-09-08T09:00:00.000+02:00',
          endAt: '2026-09-08T10:00:00.000+02:00',
          localStartTime: '09:00',
          localEndTime: '10:00',
          allDay: false,
          status: 'confirmed',
          htmlLink: null,
          completed: false,
          completedAt: null,
        }],
      }),
      openSettings: async () => undefined,
    })

    const result = await service.read('2026-09-08')

    assert.equal(result.state, 'connected')
    if (result.state !== 'connected') assert.fail('expected connected Calendar')
    assert.equal(result.events[0]?.provider, 'device')
    assert.equal(result.events[0]?.title, 'Dentist')
  })

  it('reports the current authorization state without requesting permission', async () => {
    const service = createDeviceCalendarService({
      getAuthorizationStatus: async () => ({ status: 'not_determined' }),
      requestFullAccess: async () => ({ status: 'full_access' }),
      getEvents: async () => ({ events: [] }),
      openSettings: async () => undefined,
    })

    assert.deepEqual(await service.authorization(), { status: 'not_determined' })
  })

  it('returns the validated authorization state after requesting full access', async () => {
    const service = createDeviceCalendarService({
      getAuthorizationStatus: async () => ({ status: 'not_determined' }),
      requestFullAccess: async () => ({ status: 'full_access' }),
      getEvents: async () => ({ events: [] }),
      openSettings: async () => undefined,
    })

    assert.deepEqual(await service.requestFullAccess(), { status: 'full_access' })
  })

  it('opens the app-specific iOS Settings page when permission must be managed', async () => {
    let opened = false
    const service = createDeviceCalendarService({
      getAuthorizationStatus: async () => ({ status: 'denied' }),
      requestFullAccess: async () => ({ status: 'denied' }),
      getEvents: async () => ({ events: [] }),
      openSettings: async () => { opened = true },
    })

    await service.openSettings()

    assert.equal(opened, true)
  })

  it('keeps an authorized empty Device Calendar distinct from not connected', () => {
    assert.deepEqual(deviceCalendarReadToDaySource({
      state: 'connected',
      events: [],
    }), {
      status: 'connected_empty',
      reasonCode: null,
      events: [],
    })
  })

  it('ships an iOS 17 full-access EventKit bridge with the required permission copy', () => {
    const pluginPath = 'ios/App/App/DeviceCalendarPlugin.swift'
    assert.equal(existsSync(pluginPath), true, 'DeviceCalendarPlugin.swift must exist')

    const plugin = readFileSync(pluginPath, 'utf8')
    const viewController = readFileSync('ios/App/App/HealthyFlowViewController.swift', 'utf8')
    const infoPlist = readFileSync('ios/App/App/Info.plist', 'utf8')
    const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8')

    assert.match(plugin, /import EventKit/)
    assert.match(plugin, /requestFullAccessToEvents/)
    assert.match(viewController, /registerPluginInstance\(DeviceCalendarPlugin\(\)\)/)
    assert.match(infoPlist, /NSCalendarsFullAccessUsageDescription/)
    assert.match(infoPlist, /add timed Items/i)
    assert.match(project, /DeviceCalendarPlugin\.swift in Sources/)
  })

  it('upserts and deletes HealthyFlow-owned EventKit events without re-importing them', () => {
    const plugin = readFileSync('ios/App/App/DeviceCalendarPlugin.swift', 'utf8')

    assert.match(plugin, /CAPPluginMethod\(name: "upsertItemEvent"/)
    assert.match(plugin, /CAPPluginMethod\(name: "deleteItemEvent"/)
    assert.match(plugin, /eventStore\.defaultCalendarForNewEvents/)
    assert.match(plugin, /healthyflow:\/\/item\//)
    assert.match(plugin, /eventStore\.event\(withIdentifier:/)
    assert.match(plugin, /findHealthyFlowItemEvent/)
    assert.match(plugin, /existing\.url == itemURL\(itemId\)/)
    assert.match(plugin, /guard isHealthyFlowItemEvent\(event\) else/)
    assert.match(plugin, /eventStore\.save\(/)
    assert.match(plugin, /eventStore\.remove\(/)
    assert.match(plugin, /filter \{ !isHealthyFlowItemEvent\(\$0\) \}/)
  })

  it('uses Device Calendar settings on iOS without starting backend Google OAuth', () => {
    const settings = readFileSync('src/pages/SettingsPage.tsx', 'utf8')
    const week = readFileSync('src/pages/WeekViewPage.tsx', 'utf8')
    const timeline = readFileSync('src/components/DayTimeline.tsx', 'utf8')

    assert.match(settings, /isNativeIOS[\s\S]+deviceCalendarService\.authorization\(\)/)
    assert.match(settings, /Device Calendar/)
    assert.match(settings, /automatically sync timed Items/i)
    assert.match(settings, /Calendar data stays on this iPhone/)
    assert.match(settings, /isNativeIOS\s*\?[\s\S]+Connect Calendar/)
    assert.match(week, /queryFn:\s*\(\)\s*=>\s*calendarService\.getEvents\(dateKey\)/)
    assert.match(timeline, /event\.provider\s*===\s*'device'/)
    assert.doesNotMatch(week, /queryFn:[^\n]+getGoogleEvents/)
  })

  it('runs automatic Device Calendar reconciliation app-wide and exposes retryable failure', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    const hook = readFileSync('src/hooks/useDeviceCalendarSync.ts', 'utf8')
    const layout = readFileSync('src/components/Layout.tsx', 'utf8')

    assert.match(app, /useDeviceCalendarSync\(\)/)
    assert.match(hook, /LOCAL_DAY_CHANGED_EVENT/)
    assert.match(hook, /DEVICE_CALENDAR_CONNECTION_CHANGED_EVENT/)
    assert.match(hook, /healthyflow:app-state/)
    assert.match(hook, /addEventsChangedListener/)
    assert.match(hook, /refreshCalendarQueries/)
    assert.match(hook, /queryKey: \['calendar-events'\]/)
    assert.match(hook, /queryKey: DAY_SUMMARY_QUERY_KEY/)
    assert.match(hook, /queryKey: DAILY_SIGNALS_QUERY_KEY/)
    assert.match(hook, /syncLocalDayWithDeviceCalendar/)
    assert.match(layout, /device-calendar-sync-notification/)
    assert.match(layout, /onRetryDeviceCalendarSync/)
    assert.match(layout, /Retry/)
  })

  it('forwards EventKit store changes to the React bridge', () => {
    const plugin = readFileSync('ios/App/App/DeviceCalendarPlugin.swift', 'utf8')

    assert.match(plugin, /Notification\.Name\.EKEventStoreChanged/)
    assert.match(plugin, /notifyListeners\("eventsChanged"/)
    assert.match(plugin, /NotificationCenter\.default\.removeObserver\(self\)/)
  })

  it('rechecks the visible permission state after returning from iOS Settings', () => {
    const settings = readFileSync('src/pages/SettingsPage.tsx', 'utf8')

    assert.match(settings, /healthyflow:app-state[\s\S]+loadCalendarStatus\(\)/)
  })

  it('reads native Calendar events without invoking the backend Google reader', async () => {
    let googleRead = false
    const readEvents = createCalendarEventReader({
      isNativeIOS: true,
      readDevice: async () => ({ state: 'connected', events: [] }),
      readGoogle: async () => {
        googleRead = true
        return []
      },
    })

    assert.deepEqual(await readEvents('2026-09-08'), [])
    assert.equal(googleRead, false)
  })

  it('surfaces a failed native Calendar read instead of returning an empty day', async () => {
    const readEvents = createCalendarEventReader({
      isNativeIOS: true,
      readDevice: async () => ({ state: 'unavailable', reason: 'EventKit failed' }),
      readGoogle: async () => [],
    })

    await assert.rejects(() => readEvents('2026-09-08'), /EventKit failed/)
  })

  it('blocks Google Calendar mutations on native before they reach the backend', async () => {
    let backendWrites = 0
    const update = createWebGoogleCalendarMutation({
      isNativeIOS: true,
      mutate: async (_id: string) => {
        backendWrites += 1
        return { updated: true }
      },
    })

    await assert.rejects(() => update('event-1'), /read-only/)
    assert.equal(backendWrites, 0)
  })
})
