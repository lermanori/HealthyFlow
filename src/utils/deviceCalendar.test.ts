import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import DaySummaryContracts from '../../backend/src/day-summary-schema'
import {
  createCalendarEventReader,
  createDeviceCalendarService,
  createWebGoogleCalendarMutation,
  deviceCalendarReadToDaySource,
} from '../lib/deviceCalendar'

const { DaySummaryCalendarEventSchema } = DaySummaryContracts

describe('Device Calendar day contract', () => {
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
    assert.match(project, /DeviceCalendarPlugin\.swift in Sources/)
  })

  it('uses Device Calendar settings on iOS without starting backend Google OAuth', () => {
    const settings = readFileSync('src/pages/SettingsPage.tsx', 'utf8')
    const week = readFileSync('src/pages/WeekViewPage.tsx', 'utf8')
    const timeline = readFileSync('src/components/DayTimeline.tsx', 'utf8')

    assert.match(settings, /isNativeIOS[\s\S]+deviceCalendarService\.authorization\(\)/)
    assert.match(settings, /Device Calendar/)
    assert.match(settings, /Nothing is sent to HealthyFlow/)
    assert.match(settings, /isNativeIOS\s*\?[\s\S]+Connect Calendar/)
    assert.match(week, /queryFn:\s*\(\)\s*=>\s*calendarService\.getEvents\(dateKey\)/)
    assert.match(timeline, /event\.provider\s*===\s*'device'/)
    assert.doesNotMatch(week, /queryFn:[^\n]+getGoogleEvents/)
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
