import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WeekSummary } from '../../backend/src/day-summary-schema'
import { selectWeekAgenda } from './weekSummary'

const summary = {
  days: [
    {
      date: '2026-07-27',
      items: [
        { id: 'rollover', title: 'Carry me', type: 'task', startTime: null, completed: false },
        {
          id: 'habit-2026-07-27',
          title: 'Walk',
          type: 'habit',
          startTime: null,
          completed: false,
          originalHabitId: 'habit',
          habitInfo: { outcome: 'failed' },
        },
      ],
      calendar: { events: [] },
    },
    {
      date: '2026-07-28',
      items: [
        { id: 'rollover', title: 'Carry me', type: 'task', startTime: null, completed: false },
        { id: 'timed', title: 'Review', type: 'task', startTime: '09:00', completed: true },
      ],
      calendar: {
        events: [{
          id: 'event',
          title: 'Offsite',
          localStartTime: null,
          allDay: true,
          completed: false,
        }],
      },
    },
    ...Array.from({ length: 5 }, (_, index) => ({
      date: `2026-0${index + 8}-01`,
      items: [],
      calendar: { events: [] },
    })),
  ],
} as unknown as WeekSummary

describe('Week agenda selection', () => {
  it('deduplicates rollover Items and aggregates Habits only in All Week', () => {
    const agenda = selectWeekAgenda(summary, { kind: 'all' }, {
      showCompleted: true,
      domain: 'all',
    })

    assert.deepEqual(
      agenda.days.flatMap((day) => day.entries.map((entry) => entry.title)),
      ['Carry me', 'Review', 'Offsite']
    )
    assert.equal(agenda.totalCount, 3)
    assert.equal(agenda.days[0].entries[0].date, '2026-07-27')
  })

  it('keeps the selected day plan, including its Habit instance', () => {
    const agenda = selectWeekAgenda(summary, { kind: 'day', date: '2026-07-27' }, {
      showCompleted: true,
      domain: 'all',
    })

    assert.deepEqual(
      agenda.days[0].entries.map((entry) => entry.title),
      ['Carry me', 'Walk']
    )
    assert.equal(agenda.days[0].entries[1].addressed, true)
  })

  it('reduces Today to unresolved non-Habit Items and Calendar obligations', () => {
    const todaySummary = structuredClone(summary)
    todaySummary.days[0].items.push({
      ...todaySummary.days[0].items[0],
      id: 'completed',
      title: 'Already handled',
      completed: true,
    })
    todaySummary.days[0].calendar.events.push(
      {
        ...todaySummary.days[1].calendar.events[0],
        id: 'standup',
        title: 'Standup',
        localStartTime: '09:00',
        allDay: false,
        completed: false,
      },
      {
        ...todaySummary.days[1].calendar.events[0],
        id: 'completed-event',
        title: 'Finished meeting',
        completed: true,
      }
    )

    const agenda = selectWeekAgenda(todaySummary, { kind: 'day', date: '2026-07-27' }, {
      showCompleted: true,
      domain: 'all',
      mode: 'today_planning',
    })

    assert.deepEqual(
      agenda.days[0].entries.map((entry) => entry.title),
      ['Standup', 'Carry me']
    )
  })
})
