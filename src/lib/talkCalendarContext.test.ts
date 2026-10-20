import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CalendarSource, DaySummary } from '../../backend/src/day-summary-schema'
import type { TalkContextPlan } from '../../backend/src/settings-schema'
import { buildPlannedTalkEvidence, buildTalkCalendarContext } from './talkCalendarContext'

const connectedDay = (title: string, date = '2026-10-19'): CalendarSource => ({
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
    startAt: `${date}T07:00:00.000Z`,
    endAt: `${date}T08:00:00.000Z`,
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
  it('reads only the planned date, even beyond the old seven-day window', async () => {
    const dates: string[] = []
    const plan: TalkContextPlan = {
      kind: 'ready', intent: 'calendar_events', dates: ['2026-10-26'],
      sources: ['calendar'], clarification: null,
    }
    const evidence = await buildPlannedTalkEvidence(plan, async (date) => {
      dates.push(date)
      return connectedDay('Dentist appointment', date)
    }, async () => { throw new Error('Day should not be read') })

    assert.deepEqual(dates, ['2026-10-26'])
    assert.equal(evidence.calendar?.days[0].events[0].title, 'Dentist appointment')
    assert.equal(evidence.day, undefined)
  })

  it('keeps a failed day separate from a successful Calendar read', async () => {
    const plan: TalkContextPlan = {
      kind: 'ready', intent: 'schedule_conflicts', dates: ['2026-10-26'],
      sources: ['calendar', 'day'], clarification: null,
    }
    const evidence = await buildPlannedTalkEvidence(
      plan,
      async (date) => connectedDay('Dentist appointment', date),
      async (): Promise<DaySummary> => { throw new Error('Local day unavailable') },
    )

    assert.equal(evidence.day?.days[0].status, 'unavailable')
    assert.equal(evidence.calendar?.days[0].status, 'connected')
  })

  it('reads an explicitly asked Hebrew date outside the default seven days', async () => {
    const dates: string[] = []
    const context = await buildTalkCalendarContext(async (date) => {
      dates.push(date)
      return connectedDay(date === '2026-10-26' ? 'Dentist on October 26' : `Event ${date}`, date)
    }, new Date('2026-10-19T12:00:00'), 'ב26 באוקטובר אין לי כלום?')

    assert.equal(dates.length, 7)
    assert.ok(dates.includes('2026-10-26'))
    assert.equal(context.days.find((day) => day.date === '2026-10-26')?.events[0]?.title, 'Dentist on October 26')
  })

  it('reads the named date in English and ISO prompts', async () => {
    for (const prompt of ['October 26', '26 Oct', '2026-10-26']) {
      const context = await buildTalkCalendarContext(
        async (date) => connectedDay(`Event ${date}`, date),
        new Date('2026-10-19T12:00:00'),
        prompt,
      )
      assert.ok(context.days.some((day) => day.date === '2026-10-26'), prompt)
    }
  })

  it('keeps the previously named date available for a follow-up question', async () => {
    const context = await buildTalkCalendarContext(
      async (date) => connectedDay(`Event ${date}`, date),
      new Date('2026-10-19T12:00:00'),
      'And is that morning free?',
      ['ב26 באוקטובר אין לי כלום?'],
    )

    assert.ok(context.days.some((day) => day.date === '2026-10-26'))
  })

  it('reads unambiguous numeric and alternate Hebrew date phrasing', async () => {
    for (const prompt of ['26/10', '26.10', '10/26', 'ב-26 לאוקטובר', 'באוקטובר 26']) {
      const context = await buildTalkCalendarContext(
        async (date) => connectedDay(`Event ${date}`, date),
        new Date('2026-10-19T12:00:00'),
        prompt,
      )
      assert.ok(context.days.some((day) => day.date === '2026-10-26'), prompt)
    }
  })

  it('keeps a bare day-of-month reference available for a holiday follow-up', async () => {
    const read = async (date: string) => connectedDay(`Event ${date}`, date)
    const now = new Date('2026-10-19T12:00:00')
    const first = await buildTalkCalendarContext(read, now, 'מה יש ב26?')
    const followUp = await buildTalkCalendarContext(read, now, 'איזה חג ציבורי?', ['מה יש ב26?'])

    assert.ok(first.days.some((day) => day.date === '2026-10-26'))
    assert.ok(followUp.days.some((day) => day.date === '2026-10-26'))
  })

  it('reads a Hebrew conjunctive day and retains it through a short follow-up', async () => {
    const read = async (date: string) => connectedDay(`Event ${date}`, date)
    const now = new Date('2026-10-19T12:00:00')
    const direct = await buildTalkCalendarContext(read, now, 'וב26?', ['האם יש לי התנגשויות שבוע הבא?'])
    const followUp = await buildTalkCalendarContext(read, now, 'תבדוק', ['וב26?', 'האם יש לי התנגשויות שבוע הבא?'])

    assert.ok(direct.days.some((day) => day.date === '2026-10-26'))
    assert.ok(followUp.days.some((day) => day.date === '2026-10-26'))
  })

  it('reads next week when the Hebrew phrase omits a leading preposition', async () => {
    const context = await buildTalkCalendarContext(
      async (date) => connectedDay(`Event ${date}`, date),
      new Date('2026-10-19T12:00:00'),
      'האם יש לי התנגשויות שבוע הבא?',
    )

    assert.deepEqual(context.days.map((day) => day.date), [
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29',
      '2026-10-30', '2026-10-31', '2026-11-01',
    ])
  })

  it('reads next week when that week is outside the default window', async () => {
    const context = await buildTalkCalendarContext(
      async (date) => connectedDay(`Event ${date}`, date),
      new Date('2026-10-19T12:00:00'),
      'מה יש לי בשבוע הבא?',
    )

    assert.deepEqual(context.days.map((day) => day.date), [
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29',
      '2026-10-30', '2026-10-31', '2026-11-01',
    ])
  })

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
