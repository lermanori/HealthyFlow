import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import DaySummaryContracts from '../../backend/src/day-summary-schema'
import { createLocalTask } from '../lib/local/day'
import { emptyLocalDatabase, loadLocalDatabase, memoryDriver, setLocalStoreDriver } from '../lib/local/store'
import {
  createCalendarEventReader,
  canUseHostedGoogleCalendar,
  combinedCalendarReadToDaySource,
  createDeviceCalendarItemSync,
  createDeviceCalendarService,
  createWebGoogleCalendarMutation,
  deviceCalendarReadToDaySource,
  reconcileDeviceCalendarItems,
  resolveHostedGoogleCalendarAccess,
  syncLocalDayWithDeviceCalendar,
} from '../lib/deviceCalendar'

const { DaySummaryCalendarEventSchema } = DaySummaryContracts

function calendarEvent(provider: 'device' | 'google', id: string) {
  return DaySummaryCalendarEventSchema.parse({
    id: `${provider}:${id}`,
    provider,
    calendarId: `${provider}-calendar`,
    externalEventId: id,
    title: `${provider} event`,
    description: null,
    location: null,
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
}

describe('Device Calendar day contract', () => {
  it('shows hosted Google only to a claimed active Cloud identity on an enabled surface', () => {
    assert.equal(canUseHostedGoogleCalendar({
      claimed: true,
      cloudActive: true,
      surfaceEnabled: true,
    }), true)
    for (const input of [
      { claimed: false, cloudActive: true, surfaceEnabled: true },
      { claimed: true, cloudActive: false, surfaceEnabled: true },
      { claimed: true, cloudActive: true, surfaceEnabled: false },
    ]) {
      assert.equal(canUseHostedGoogleCalendar(input), false)
    }
  })

  it('does not reach Google before claimed active Cloud is proven', async () => {
    let entitlementReads = 0
    let googleReads = 0
    const readCloudActive = async () => {
      entitlementReads += 1
      return false
    }
    const readConnected = async () => {
      googleReads += 1
      return true
    }

    assert.deepEqual(await resolveHostedGoogleCalendarAccess({
      claimed: false,
      surfaceEnabled: true,
      readCloudActive,
      readConnected,
    }), { state: 'not_entitled', reason: 'cloud_not_active' })
    assert.equal(entitlementReads, 0)
    assert.equal(googleReads, 0)

    assert.deepEqual(await resolveHostedGoogleCalendarAccess({
      claimed: true,
      surfaceEnabled: true,
      readCloudActive,
      readConnected,
    }), { state: 'not_entitled', reason: 'cloud_not_active' })
    assert.equal(entitlementReads, 1)
    assert.equal(googleReads, 0)
  })

  it('keeps an unavailable entitlement read typed and never probes Google', async () => {
    let googleReads = 0
    const result = await resolveHostedGoogleCalendarAccess({
      claimed: true,
      surfaceEnabled: true,
      readCloudActive: async () => { throw new Error('credits unavailable') },
      readConnected: async () => {
        googleReads += 1
        return true
      },
    })

    assert.deepEqual(result, { state: 'unavailable', reason: 'credits unavailable' })
    assert.equal(googleReads, 0)
  })

  it('syncs a timed Item to one validated EventKit event', async () => {
    const writes: unknown[] = []
    const sync = createDeviceCalendarItemSync({
      getAuthorizationStatus: async () => ({ status: 'full_access' }),
      upsertItemEvent: async (input) => {
        writes.push(input)
        return { eventIdentifier: 'event-1' }
      },
      readItemEvents: async () => ({ events: [] }),
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
      readItemEvents: async () => ({ events: [] }),
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
        readLinked: async () => ({ state: 'read' as const, events: [] }),
        remove: async () => ({ state: 'removed' }),
      },
      now: '2026-09-09T10:01:00.000Z',
    })

    assert.deepEqual(result, {
      state: 'connected',
      failures: [],
      // Nothing changed on the device side of this pass.
      deviceChanges: [],
      conflicts: [],
      links: [{
        itemId: 'item-1',
        eventIdentifier: 'event-1',
        status: 'synced',
        error: null,
        itemUpdatedAt: '2026-09-09T10:00:00.000Z',
        eventModifiedAt: null,
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
        eventModifiedAt: null,
        updatedAt: '2026-09-09T10:01:00.000Z',
      }],
      sync: {
        upsert: async (item) => {
          identifiers.push(item.eventIdentifier)
          return { state: 'synced', eventIdentifier: 'event-1' }
        },
        readLinked: async () => ({ state: 'read' as const, events: [] }),
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
        eventModifiedAt: null,
        updatedAt: '2026-09-09T10:01:00.000Z',
      }],
      sync: {
        upsert: async () => ({ state: 'synced', eventIdentifier: 'event-recreated' }),
        readLinked: async () => ({ state: 'read' as const, events: [] }),
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
        eventModifiedAt: null,
        updatedAt: '2026-09-09T10:01:00.000Z',
      }],
      sync: {
        upsert: async () => ({ state: 'synced', eventIdentifier: 'unused' }),
        readLinked: async () => ({ state: 'read' as const, events: [] }),
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
        readLinked: async () => ({ state: 'read' as const, events: [] }),
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
        readLinked: async () => ({ state: 'read' as const, events: [] }),
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
      readLinked: async () => ({ state: 'read' as const, events: [] }),
      remove: async () => ({ state: 'removed' }),
    }, '2026-09-09T18:01:00.000Z')
    const database = await loadLocalDatabase('guest-1')

    assert.deepEqual(result, { state: 'connected', failures: [] })
    assert.equal(database.deviceCalendarLinks[0]?.itemId, item.id)
    assert.equal(database.deviceCalendarLinks[0]?.eventIdentifier, 'event-1')
  })

  it('treats a legacy blank account clock as untimed without blocking timed Items', async () => {
    setLocalStoreDriver(memoryDriver(JSON.stringify({
      ...emptyLocalDatabase('account-1'),
      ownerEmail: 'founder@example.com',
      tasks: [{
        id: 'legacy-untimed-item',
        user_id: 'account-1',
        title: 'Legacy untimed account Item',
        type: 'task',
        category: 'personal',
        start_time: '',
        scheduled_date: '2026-09-10',
        created_at: '2026-09-10T08:00:00.000Z',
      }, {
        id: 'timed-item',
        user_id: 'account-1',
        title: 'Timed account Item',
        type: 'task',
        category: 'personal',
        start_time: '18:00',
        duration: 30,
        scheduled_date: '2026-09-10',
        created_at: '2026-09-10T08:00:00.000Z',
      }],
    })))
    const syncedTimes: string[] = []

    const result = await syncLocalDayWithDeviceCalendar('account-1', {
      upsert: async (item) => {
        syncedTimes.push(item.startTime)
        return { state: 'synced', eventIdentifier: 'event-legacy' }
      },
      readLinked: async () => ({ state: 'read' as const, events: [] }),
      remove: async () => ({ state: 'removed' }),
    }, '2026-09-10T18:01:00.000Z')

    assert.deepEqual(result, { state: 'connected', failures: [] })
    assert.deepEqual(syncedTimes, ['18:00'])
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

  it('keeps Device Calendar available on iOS independently of hosted Google', () => {
    const settings = readFileSync('src/pages/SettingsPage.tsx', 'utf8')
    const week = readFileSync('src/pages/WeekViewPage.tsx', 'utf8')
    const timeline = readFileSync('src/components/DayTimeline.tsx', 'utf8')

    assert.match(settings, /isNativeIOS[\s\S]+deviceCalendarService\.authorization\(\)/)
    assert.match(settings, /Device Calendar/)
    assert.match(settings, /automatically sync timed Items/i)
    assert.match(settings, /Calendar data stays on this iPhone/)
    assert.match(settings, /isNativeIOS && \(/)
    assert.match(settings, /Connect Calendar/)
    assert.match(week, /queryFn:\s*\(\)\s*=>\s*calendarService\.getDay\(dateKey\)/)
    assert.match(timeline, /event\.provider\s*===\s*'device'/)
    assert.doesNotMatch(week, /queryFn:[^\n]+getGoogleEvents/)
  })

  it('keeps direct Google off the iPhone entirely, not merely behind a flag', () => {
    const settings = readFileSync('src/pages/SettingsPage.tsx', 'utf8')
    const api = readFileSync('src/services/api.ts', 'utf8')
    const flags = readFileSync('src/featureFlags.ts', 'utf8')

    // A Google account added to iOS Calendar is already exposed through
    // EventKit, so reaching Google again through the backend would show one
    // meeting twice and write one Item as two events (ADR-0020 §4).
    //
    // This used to be a release flag, which meant the guarantee held only while
    // nobody set it. It is now structural: there is no value of any variable
    // that reaches direct Google from the iPhone.
    assert.match(settings, /surfaceEnabled: !isNativeIOS,/)
    assert.match(api, /surfaceEnabled: false,/)
    assert.match(api, /includeGoogle: !isNativeIOS,/)
    assert.doesNotMatch(flags, /NATIVE_GOOGLE_CALENDAR_ENABLED/)

    // The web path is untouched — this is a deferral to the web surface, not a
    // deletion of the integration.
    assert.match(settings, /canUseHostedGoogleCalendar/)
    assert.match(settings, /Google Calendar · Cloud/)
  })

  it('feeds the composed Calendar day into Today, Week, Capacity, and Daily Signals', () => {
    const api = readFileSync('src/services/api.ts', 'utf8')
    const week = readFileSync('src/pages/WeekViewPage.tsx', 'utf8')
    const core = readFileSync('backend/src/day-summary-core.ts', 'utf8')

    assert.match(api, /combinedCalendarReadToDaySource\(await readCalendarDay\(date\)\)/)
    assert.match(api, /calendarEvents: calendar\.events/)
    assert.match(week, /calendarService\.getDay\(dateKey\)/)
    assert.match(core, /dependencies\.getCalendarSource/)
    assert.match(core, /deriveCapacity\([\s\S]+calendar,/)
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

    assert.match(settings, /healthyflow:app-state[\s\S]+loadDeviceCalendarStatus\(\)/)
  })

  it('keeps Guest and claimed-free native reads off the backend Google path', async () => {
    let googleRead = false
    const readCalendar = createCalendarEventReader({
      isNativeIOS: true,
      readDevice: async () => ({ state: 'connected', events: [] }),
      readGoogle: async () => {
        googleRead = true
        return { provider: 'google', state: 'connected', events: [] }
      },
      includeGoogle: false,
    })

    const result = await readCalendar('2026-09-08')
    assert.deepEqual(result.events, [])
    assert.deepEqual(result.sources.map((source) => source.provider), ['device'])
    assert.equal(googleRead, false)
  })

  it('combines Device and Google without guessing duplicate events away', async () => {
    const sameLookingDeviceEvent = calendarEvent('device', 'same-time')
    const sameLookingGoogleEvent = {
      ...calendarEvent('google', 'same-time'),
      title: sameLookingDeviceEvent.title,
    }
    const readCalendar = createCalendarEventReader({
      isNativeIOS: true,
      readDevice: async () => ({ state: 'connected', events: [sameLookingDeviceEvent] }),
      readGoogle: async () => ({ provider: 'google', state: 'connected', events: [sameLookingGoogleEvent] }),
      includeGoogle: true,
    })

    const result = await readCalendar('2026-09-08')
    assert.deepEqual(result.events.map((event) => event.provider), ['device', 'google'])
    assert.equal(result.events.length, 2)
  })

  it('returns Google-only obligations when Device Calendar is not connected', async () => {
    const googleEvent = calendarEvent('google', 'standup')
    const result = await createCalendarEventReader({
      isNativeIOS: true,
      readDevice: async () => ({ state: 'not_connected', reason: 'denied' }),
      readGoogle: async () => ({ provider: 'google', state: 'connected', events: [googleEvent] }),
      includeGoogle: true,
    })('2026-09-08')

    assert.deepEqual(result.events, [googleEvent])
    assert.equal(combinedCalendarReadToDaySource(result).status, 'connected')
  })

  it('keeps Google events and typed source state when Device Calendar fails', async () => {
    const readCalendar = createCalendarEventReader({
      isNativeIOS: true,
      readDevice: async () => ({ state: 'unavailable', reason: 'EventKit failed' }),
      readGoogle: async () => ({ provider: 'google', state: 'connected', events: [calendarEvent('google', 'work')] }),
      includeGoogle: true,
    })

    const result = await readCalendar('2026-09-08')
    assert.equal(result.events.length, 1)
    assert.deepEqual(result.sources[0], { provider: 'device', state: 'unavailable', reason: 'EventKit failed' })
    assert.deepEqual(combinedCalendarReadToDaySource(result), {
      status: 'unavailable',
      reasonCode: 'status_unavailable',
      events: result.events,
      providerStates: [
        { provider: 'device', status: 'unavailable', reasonCode: 'status_unavailable' },
        { provider: 'google', status: 'connected', reasonCode: null },
      ],
    })
  })

  it('preserves Device events when Google is unavailable and distinguishes neither connected', async () => {
    const deviceEvent = calendarEvent('device', 'dentist')
    const partial = await createCalendarEventReader({
      isNativeIOS: true,
      readDevice: async () => ({ state: 'connected', events: [deviceEvent] }),
      readGoogle: async () => ({ provider: 'google', state: 'unavailable', reason: 'Google failed' }),
      includeGoogle: true,
    })('2026-09-08')
    assert.deepEqual(partial.events, [deviceEvent])

    const neither = await createCalendarEventReader({
      isNativeIOS: true,
      readDevice: async () => ({ state: 'not_connected', reason: 'denied' }),
      readGoogle: async () => ({ provider: 'google', state: 'not_connected', reason: 'not_connected' }),
      includeGoogle: true,
    })('2026-09-08')
    assert.equal(combinedCalendarReadToDaySource(neither).status, 'not_connected')
    assert.deepEqual(neither.events, [])
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
