import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CalendarSource } from '../../backend/src/day-summary-schema'
import { buildTalkCalendarContext } from './talkCalendarContext'

const connectedDay = (title: string): CalendarSource => ({
  status: 'connected',
  reasonCode: null,
  events: [{
    id: 'device:event-1',
    provider: 'device',
    calendarId: 'calendar-1',
    externalEventId: 'event-1',
    title,
    description: 'Bring the referral',
    location: 'Clinic',
    startAt: '2026-10-19T07:00:00.000Z',
    endAt: '2026-10-19T08:00:00.000Z',
    localStartTime: '10:00',
    localEndTime: '11:00',
    allDay: false,
    status: 'confirmed',
    htmlLink: null,
    completed: false,
    completedAt: null,
  }],
})

describe('Talk calendar context', () => {
  it('carries a bounded seven-day device snapshot including tomorrow', async () => {
    const dates: string[] = []
    const context = await buildTalkCalendarContext(async (date) => {
      dates.push(date)
      return connectedDay(date === '2026-10-19' ? 'Dentist tomorrow' : `Event ${date}`)
    }, new Date('2026-10-18T12:00:00'))

    assert.deepEqual(dates, [
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ])
    assert.equal(context.days[1].events[0].title, 'Dentist tomorrow')
    assert.equal('externalEventId' in context.days[1].events[0], false)
  })

  it('marks one failed calendar day unavailable without erasing the other days', async () => {
    const context = await buildTalkCalendarContext(async (date) => {
      if (date === '2026-10-19') throw new Error('EventKit read failed')
      return connectedDay(`Event ${date}`)
    }, new Date('2026-10-18T12:00:00'))

    assert.deepEqual(context.days[1], {
      date: '2026-10-19',
      status: 'unavailable',
      reasonCode: 'status_unavailable',
      events: [],
      truncated: false,
    })
    assert.equal(context.days[0].status, 'connected')
  })
})
