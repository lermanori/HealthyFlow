import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildTodayWidgetSummary } from '../lib/widget'
import type { DaySummary } from '../../backend/src/day-summary-schema'

function summary(overrides: Partial<DaySummary> = {}): DaySummary {
  return {
    version: 1,
    date: '2026-07-30',
    generatedAt: '2026-07-30T08:00:00.000Z',
    timeZone: 'Asia/Jerusalem',
    dateMode: 'today',
    settings: { sourceStatus: 'available', planningWindow: null },
    modules: {
      habits: 'enabled',
      nutrition: 'enabled',
      workouts: 'enabled',
      achievements: 'enabled',
    },
    items: [],
    calendar: { status: 'connected_empty', reasonCode: null, events: [] },
    calorieEntries: [],
    completion: {
      state: 'in_progress',
      total: 5,
      completed: 2,
      addressed: 3,
      remaining: 2,
      percent: 60,
    },
    week: {
      weekStartsOn: 1,
      startDate: '2026-07-27',
      endDate: '2026-08-02',
      days: [
        { date: '2026-07-27', total: 0, completed: 0 },
        { date: '2026-07-28', total: 0, completed: 0 },
        { date: '2026-07-29', total: 0, completed: 0 },
        { date: '2026-07-30', total: 5, completed: 2, addressed: 3 },
        { date: '2026-07-31', total: 0, completed: 0 },
        { date: '2026-08-01', total: 0, completed: 0 },
        { date: '2026-08-02', total: 0, completed: 0 },
      ],
    },
    attention: {
      focus: {
        state: 'selected',
        itemId: 'task-1',
        reasonCode: 'active_timed_item',
      },
      nextPlannedItem: { id: 'task-1', title: 'Gym', startTime: '18:00' },
      nextCalendarObligation: null,
      nextObligation: {
        source: 'item',
        id: 'task-1',
        title: 'Gym',
        startTime: '18:00',
        reasonCode: 'only_planned_item',
        conflictIds: [],
      },
    },
    capacity: {
      status: 'unavailable',
      window: null,
      basis: null,
      reasonCodes: ['planning_window_missing'],
    },
    supporting: {
      habits: {
        status: 'available',
        total: 0,
        pending: 0,
        partial: 0,
        completed: 0,
        failed: 0,
        targeted: 0,
      },
      nutrition: {
        status: 'not_logged',
        entries: [],
        calories: { status: 'complete', value: 0 },
        protein: { status: 'complete', value: 0 },
        carbs: { status: 'complete', value: 0 },
        fat: { status: 'complete', value: 0 },
        weight: { status: 'not_recorded', entry: null },
      },
      workouts: { status: 'not_logged', sessions: [] },
      progress: { status: 'not_recorded', entries: [] },
    },
    ...overrides,
  }
}

describe('Today widget summary', () => {
  it('uses addressed progress and the canonical next obligation', () => {
    assert.deepEqual(buildTodayWidgetSummary(summary()), {
      date: '2026-07-30',
      addressed: 3,
      total: 5,
      remaining: 2,
      percent: 60,
      nextTitle: 'Gym',
      nextTime: '18:00',
      deepLink: 'healthyflow://app?date=2026-07-30',
    })
  })

  it('does not invent next-item details for an empty day', () => {
    const built = buildTodayWidgetSummary(summary({
      completion: {
        state: 'empty',
        total: 0,
        completed: 0,
        addressed: 0,
        remaining: 0,
        percent: null,
      },
      attention: {
        focus: { state: 'empty_day', itemId: null, reasonCode: null },
        nextPlannedItem: null,
        nextCalendarObligation: null,
        nextObligation: null,
      },
    }))
    assert.equal(built.nextTitle, undefined)
    assert.equal(built.nextTime, undefined)
    assert.equal(built.percent, null)
  })
})
