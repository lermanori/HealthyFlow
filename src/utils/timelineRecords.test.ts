import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  buildTimelineRecords,
  groupRecordsByHour,
  habitProgressRecords,
  isSettled,
  isStamped,
  slotKey,
  timelineClock,
  timelineHour,
} from '../timelineRecords'
import type { Task } from '../services/api'

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Book dentist appointment',
  type: 'task',
  category: 'personal',
  completed: false,
  scheduledDate: '2026-07-28',
  createdAt: '2026-07-28T06:00:00.000Z',
  ...overrides,
} as Task)

const habit = (overrides: Record<string, unknown> = {}): Task => task({
  id: 'habit-1',
  title: 'לקחת 3 כדורים',
  type: 'habit',
  repeat: 'daily',
  ...overrides,
} as Partial<Task>)

// --- the placement rule ----------------------------------------------------

test('a scheduled item sits at its planned hour', () => {
  assert.equal(timelineHour(task({ startTime: '09:30' })), '09:00')
})

test('a scheduled item stays at its planned hour even once completed', () => {
  // Its position is a fact about the plan; finishing it should not move it.
  const done = task({ startTime: '09:30', completed: true, resolvedTime: '17:02' })
  assert.equal(timelineHour(done), '09:00')
  assert.equal(isStamped(done), false)
})

test('an untimed item earns an hour by being settled', () => {
  const done = task({ completed: true, resolvedTime: '09:48' })
  assert.equal(timelineHour(done), '09:00')
  assert.equal(isStamped(done), true)
})

test('an untimed open item has no hour and stays in the backlog', () => {
  assert.equal(timelineHour(task()), null)
})

test('a settled item with no resolvedTime is not invented onto the clock', () => {
  assert.equal(timelineHour(task({ completed: true, resolvedTime: null })), null)
})

test('hours outside the visible window clamp to the nearest edge', () => {
  assert.equal(slotKey('02:15'), '06:00')
  assert.equal(slotKey('23:59'), '23:00')
  assert.equal(timelineHour(task({ completed: true, resolvedTime: '02:10' })), '06:00')
})

// --- settled vs open -------------------------------------------------------

test('a Habit marked Not done is settled', () => {
  assert.equal(isSettled(habit({ habitInfo: { target: null, outcome: 'failed', progressTotal: 0 } })), true)
})

test('a partial Habit is NOT settled — it is still owed', () => {
  const partial = habit({
    habitInfo: { target: { value: 3, unit: 'count' }, outcome: 'partial', progressTotal: 1 },
  })
  assert.equal(isSettled(partial), false)
  assert.equal(timelineHour(partial), null, 'a partial Habit stays in the Anytime backlog')
})

// --- within-hour ordering --------------------------------------------------

test('rows inside an hour sort by minute, not by kind', () => {
  const rows = [
    { clock: timelineClock(task({ startTime: '07:45' })) },
    { clock: '07:05' },
  ].sort((a, b) => a.clock.localeCompare(b.clock))
  assert.deepEqual(rows.map((row) => row.clock), ['07:05', '07:45'])
})

test('a stamped item sorts by when it was resolved', () => {
  assert.equal(timelineClock(task({ completed: true, resolvedTime: '09:48' })), '09:48')
})

// --- habit progress chunks -------------------------------------------------

test('each progress chunk becomes its own row with a running total', () => {
  const records = habitProgressRecords([
    habit({
      habitInfo: {
        target: { value: 3, unit: 'count' },
        outcome: 'partial',
        progressTotal: 2,
        chunks: [
          { id: 'c1', amount: 1, note: null, loggedTime: '09:59' },
          { id: 'c2', amount: 1, note: 'after lunch', loggedTime: '13:10' },
        ],
      },
    }),
  ])

  assert.equal(records.length, 2)
  assert.equal(records[0].time, '09:59')
  assert.equal(records[0].detail, '+1 count → 1 / 3 count')
  assert.equal(records[1].detail, '+1 count → 2 / 3 count · after lunch')
  assert.equal(records[0].habitId, 'habit-1', 'a chunk reopens its Habit rather than navigating')
  assert.equal(records[0].href, undefined)
})

test('a Habit with no recorded progress contributes no rows', () => {
  assert.deepEqual(habitProgressRecords([habit()]), [])
})

test('a chunk with no logged time is skipped rather than guessed', () => {
  const records = habitProgressRecords([
    habit({
      habitInfo: {
        target: null, outcome: 'partial', progressTotal: 1,
        chunks: [{ id: 'c1', amount: 1, note: null, loggedTime: null }],
      },
    }),
  ])
  assert.deepEqual(records, [])
})

// --- records from the day summary ------------------------------------------

const summary = (overrides: Record<string, any> = {}): any => ({
  date: '2026-07-28',
  modules: { habits: 'enabled', nutrition: 'enabled', workouts: 'enabled', achievements: 'enabled' },
  dailyPlan: { references: [] },
  calendar: { events: [] },
  calorieEntries: [],
  supporting: {
    nutrition: { weight: { status: 'not_recorded', entry: null } },
    workouts: { sessions: [] },
    progress: { status: 'not_recorded', entries: [] },
  },
  ...overrides,
})

test('a protected Calendar transition becomes a non-mutating boundary row', () => {
  const records = buildTimelineRecords(summary({
    calendar: {
      events: [{ id: 'event-1', title: 'Client call', htmlLink: 'https://calendar.google.com/event/1' }],
    },
    dailyPlan: {
      references: [{
        id: 'calendar-transition:event-1', sourceId: 'event-1', kind: 'calendar_transition',
        module: 'calendar', state: 'protected', semantics: 'boundary', time: '09:45', slot: '09:00',
        endTime: '10:00', durationMinutes: 15,
      }],
    },
  }))

  assert.deepEqual(records[0], {
    id: 'calendar-transition:event-1',
    kind: 'calendar-transition',
    hour: '09:00',
    time: '09:45',
    stamped: false,
    title: 'Transition after Client call',
    detail: '15 min protected · until 10:00',
    externalHref: 'https://calendar.google.com/event/1',
  })
})

test('an untimed Calorie entry is placed by when it was logged, not dropped', () => {
  const records = buildTimelineRecords(summary({
    calorieEntries: [
      { id: 'c1', name: 'Snack', calories: 120, protein: null, carbs: null, fat: null, quantity: null, time: null, loggedTime: '10:04' },
    ],
  }))
  assert.equal(records.length, 1)
  assert.equal(records[0].hour, '10:00')
  assert.equal(records[0].stamped, true, 'an inferred hour is marked as such')
})

test('a Calorie entry with an explicit time is not marked as stamped', () => {
  const records = buildTimelineRecords(summary({
    calorieEntries: [
      { id: 'c1', name: 'Oats', calories: 410, protein: 12, carbs: 61, fat: 9, quantity: '1 bowl', time: '08:15', loggedTime: '08:15' },
    ],
  }))
  assert.equal(records[0].stamped, false)
  assert.equal(records[0].detail, '1 bowl · 410 cal · 12p 61c 9f')
})

test('weight, workouts and progress each become a linked row', () => {
  const records = buildTimelineRecords(summary({
    supporting: {
      nutrition: { weight: { status: 'recorded', entry: { id: 'w1', weightKg: 78.4, loggedTime: '07:05' } } },
      workouts: { sessions: [{ id: 's1', title: 'Push day', exercises: [{ name: 'Bench press' }], loggedTime: '17:45' }] },
      progress: { status: 'recorded', entries: [{ id: 'a1', name: 'Bench press 1RM', unit: 'kg', value: 92.5, loggedTime: '18:30' }] },
    },
  }))

  assert.deepEqual(records.map((record) => record.kind), ['weight', 'workout', 'progress'])
  assert.ok(records.every((record) => record.href), 'every module record links somewhere')
  assert.equal(records[1].detail, '1 exercise · Bench press')
})

test('a disabled module contributes nothing', () => {
  const records = buildTimelineRecords(summary({
    modules: { habits: 'enabled', nutrition: 'disabled', workouts: 'disabled', achievements: 'disabled' },
    calorieEntries: [{ id: 'c1', name: 'Snack', calories: 120, protein: null, carbs: null, fat: null, quantity: null, time: null, loggedTime: '10:04' }],
    supporting: {
      nutrition: { weight: { status: 'recorded', entry: { id: 'w1', weightKg: 78.4, loggedTime: '07:05' } } },
      workouts: { sessions: [{ id: 's1', title: 'Push day', exercises: [], loggedTime: '17:45' }] },
      progress: { status: 'recorded', entries: [{ id: 'a1', name: 'PB', unit: 'kg', value: 92.5, loggedTime: '18:30' }] },
    },
  }))
  assert.deepEqual(records, [])
})

test('records come back ordered by time and bucket by hour', () => {
  const records = buildTimelineRecords(
    summary({
      calorieEntries: [
        { id: 'c2', name: 'Dinner', calories: 640, protein: null, carbs: null, fat: null, quantity: null, time: '20:10', loggedTime: '20:10' },
        { id: 'c1', name: 'Breakfast', calories: 410, protein: null, carbs: null, fat: null, quantity: null, time: '08:15', loggedTime: '08:15' },
      ],
    }),
    [habit({
      habitInfo: {
        target: { value: 2, unit: 'count' }, outcome: 'partial', progressTotal: 1,
        chunks: [{ id: 'k1', amount: 1, note: null, loggedTime: '09:56' }],
      },
    })]
  )

  assert.deepEqual(records.map((record) => record.time), ['08:15', '09:56', '20:10'])
  assert.deepEqual(Object.keys(groupRecordsByHour(records)).sort(), ['08:00', '09:00', '20:00'])
})
