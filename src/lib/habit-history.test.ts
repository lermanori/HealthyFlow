import assert from 'node:assert/strict'
import test from 'node:test'
import HabitContracts from '../../backend/src/habit-contracts'

const { composeHabitHistory } = HabitContracts

test('Habit history keeps untouched days as not recorded instead of inventing an outcome', () => {
  const history = composeHabitHistory({
    to: '2026-08-26',
    days: 3,
    habits: [{
      id: 'habit-1',
      title: 'Do not smoke before 11:00',
      category: 'health',
      createdDate: '2026-08-24',
      target: null,
    }],
    instances: [{
      habitId: 'habit-1',
      date: '2026-08-25',
      outcome: 'completed',
      progressTotal: 0,
      target: null,
    }],
  })

  assert.deepEqual(history.habits[0].days, [
    {
      date: '2026-08-24',
      recordState: 'not_recorded',
      outcome: null,
      progressTotal: 0,
      target: null,
    },
    {
      date: '2026-08-25',
      recordState: 'recorded',
      outcome: 'completed',
      progressTotal: 0,
      target: null,
    },
    {
      date: '2026-08-26',
      recordState: 'not_recorded',
      outcome: null,
      progressTotal: 0,
      target: null,
    },
  ])
  assert.equal(history.habits[0].summary.completedDays, 1)
  assert.equal(history.habits[0].summary.notRecordedDays, 2)
})

test('Habit history reports progress and streaks without treating the unfinished current day as a miss', () => {
  const history = composeHabitHistory({
    to: '2026-08-26',
    days: 5,
    habits: [{
      id: 'habit-1',
      title: 'Daily workout',
      category: 'fitness',
      createdDate: '2026-08-22',
      target: { value: 30, unit: 'minutes' },
    }],
    instances: [
      { habitId: 'habit-1', date: '2026-08-22', outcome: 'completed', progressTotal: 20, target: { value: 20, unit: 'minutes' } },
      { habitId: 'habit-1', date: '2026-08-23', outcome: 'completed', progressTotal: 30, target: { value: 30, unit: 'minutes' } },
      { habitId: 'habit-1', date: '2026-08-24', outcome: 'failed', progressTotal: 10, target: { value: 30, unit: 'minutes' } },
      { habitId: 'habit-1', date: '2026-08-25', outcome: 'completed', progressTotal: 30, target: { value: 30, unit: 'minutes' } },
    ],
  })

  assert.deepEqual(history.habits[0].summary, {
    completedDays: 3,
    partialDays: 0,
    failedDays: 1,
    pendingDays: 0,
    recordedDays: 4,
    notRecordedDays: 1,
    currentStreak: 1,
    bestStreak: 2,
    completionRate: 0.75,
  })
  assert.deepEqual(history.habits[0].days[0].target, { value: 20, unit: 'minutes' })
  assert.equal(history.habits[0].days[0].progressTotal, 20)
  assert.deepEqual(history.habits[0].days[4].target, { value: 30, unit: 'minutes' })
})
