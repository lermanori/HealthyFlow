import { compactTalkCalendarEvidence, contextPlannerPrompt, traceTalkCalendar, validateTalkContextPlan } from '../../src/talk-context'

describe('Talk read planning', () => {
  it('provides the actual Israeli week boundaries for Hebrew next-week requests', () => {
    const prompt = contextPlannerPrompt('Asia/Jerusalem', new Date('2026-10-19T08:00:00.000Z'))
    expect(prompt).toContain('Current local date: 2026-10-19')
    expect(prompt).toContain('Current Israeli week: 2026-10-18 through 2026-10-24')
    expect(prompt).toContain('Next Israeli week: 2026-10-25 through 2026-10-31')
    expect(prompt).toContain('2026-10-26 Monday')
  })

  it('requires exact dates and a Calendar source for Calendar questions', () => {
    expect(validateTalkContextPlan({
      kind: 'ready', intent: 'calendar_events', dates: ['2026-10-26'],
      sources: [], clarification: null, continuesPreviousTopic: false,
    })).toMatchObject({ dates: ['2026-10-26'], sources: ['calendar'] })
    expect(() => validateTalkContextPlan({
      kind: 'ready', intent: 'calendar_events', dates: [],
      sources: [], clarification: null, continuesPreviousTopic: false,
    })).toThrow('date-specific source')
  })

  it('requires a clarification instead of silently dropping an ambiguous or long range', () => {
    expect(validateTalkContextPlan({
      kind: 'clarify', intent: 'calendar_events', dates: [], sources: [],
      clarification: 'Which dates should I check?', continuesPreviousTopic: false,
    }).kind).toBe('clarify')
    expect(() => validateTalkContextPlan({
      kind: 'clarify', intent: 'calendar_events', dates: ['2026-10-26'],
      sources: ['calendar'], clarification: 'Which dates?', continuesPreviousTopic: false,
    })).toThrow('no reads')
  })

  it('keeps the verified Calendar scope for an elliptical follow-up', () => {
    const previous = {
      kind: 'ready' as const, intent: 'calendar_events' as const,
      dates: ['2026-10-26'], sources: ['calendar' as const],
      clarification: null, continuesPreviousTopic: false,
    }
    const followUp = {
      kind: 'ready', intent: 'conversation', dates: [], sources: [],
      clarification: null, continuesPreviousTopic: true,
    }
    expect(validateTalkContextPlan(followUp, previous)).toMatchObject({
      intent: 'calendar_events', dates: ['2026-10-26'], sources: ['calendar'],
    })
    expect(() => validateTalkContextPlan(followUp)).toThrow('previous ready read plan')
  })

  it('lets an explicit new date replace the previous Calendar date', () => {
    const previous = {
      kind: 'ready' as const, intent: 'calendar_events' as const,
      dates: ['2026-10-26'], sources: ['calendar' as const],
      clarification: null, continuesPreviousTopic: false,
    }
    expect(validateTalkContextPlan({
      kind: 'ready', intent: 'calendar_events', dates: ['2026-10-27'],
      sources: ['calendar'], clarification: null, continuesPreviousTopic: true,
    }, previous).dates).toEqual(['2026-10-27'])
  })

  it('traces only the selected account within a one-hour expiry window', () => {
    const priorUser = process.env.TALK_CALENDAR_TRACE_USER_ID
    const priorUntil = process.env.TALK_CALENDAR_TRACE_UNTIL
    const log = jest.spyOn(console, 'info').mockImplementation(() => undefined)
    const now = new Date('2026-10-19T12:00:00.000Z')
    try {
      process.env.TALK_CALENDAR_TRACE_USER_ID = 'selected-user'
      process.env.TALK_CALENDAR_TRACE_UNTIL = '2026-10-19T12:30:00.000Z'
      expect(traceTalkCalendar('other-user', 'plan', 'מה קורה שבוע הבא?', {}, now)).toBe(false)
      expect(traceTalkCalendar('selected-user', 'plan', 'מה קורה שבוע הבא?', {
        plan: { dates: ['2026-10-25'] },
      }, now)).toBe(true)
      expect(log).toHaveBeenCalledTimes(1)
      const line = String(log.mock.calls[0][0])
      expect(line).toContain('[DEBUG-talk-calendar-v1] ')
      expect(line).toContain('2026-10-25')
      expect(line).not.toContain('selected-user')
      expect(traceTalkCalendar('selected-user', 'plan', 'מה קורה שבוע הבא?', {},
        new Date('2026-10-19T12:30:00.000Z'))).toBe(false)
      process.env.TALK_CALENDAR_TRACE_UNTIL = '2026-10-20T12:00:00.000Z'
      expect(traceTalkCalendar('selected-user', 'plan', 'מה קורה שבוע הבא?', {}, now)).toBe(false)
      expect(log).toHaveBeenCalledTimes(1)
    } finally {
      if (priorUser === undefined) delete process.env.TALK_CALENDAR_TRACE_USER_ID
      else process.env.TALK_CALENDAR_TRACE_USER_ID = priorUser
      if (priorUntil === undefined) delete process.env.TALK_CALENDAR_TRACE_UNTIL
      else process.env.TALK_CALENDAR_TRACE_UNTIL = priorUntil
      log.mockRestore()
    }
  })

  it('keeps every selected local date and timed appointment without exposing an all-day UTC clock', () => {
    const reserve = {
      title: 'מילואים', description: null, location: null,
      startAt: '2026-10-21T21:00:00.000Z', endAt: '2026-11-01T21:59:59.000Z',
      localStartTime: null, localEndTime: null, allDay: true, status: 'confirmed',
    }
    const dentist = {
      title: 'ד"ר פרנקנטל שי', description: null, location: 'Kaplan Dental',
      startAt: '2026-10-26T07:00:00.000Z', endAt: '2026-10-26T09:30:00.000Z',
      localStartTime: '09:00', localEndTime: '11:30', allDay: false, status: 'confirmed',
    }
    const dates = Array.from({ length: 7 }, (_, index) => `2026-10-${25 + index}`)
    const index = compactTalkCalendarEvidence({
      days: dates.map((date) => ({
        date, status: 'connected', reasonCode: null, truncated: false,
        events: date === '2026-10-26' ? [reserve, dentist] : [reserve],
      })),
    })
    expect(index.days.map((day) => day.date)).toEqual(dates)
    expect(index.events).toEqual([
      expect.objectContaining({
        title: 'מילואים', allDay: true, onDates: dates,
        localStartTime: null, localEndTime: null,
      }),
      expect.objectContaining({
        title: 'ד"ר פרנקנטל שי', onDates: ['2026-10-26'],
        localStartTime: '09:00', localEndTime: '11:30',
      }),
    ])
    expect(JSON.stringify(index)).not.toContain('2026-10-21T21:00:00.000Z')
  })
})
