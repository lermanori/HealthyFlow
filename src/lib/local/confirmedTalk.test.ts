import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  applyConfirmedTalkActionToLocalDay,
  localServices,
  setLocalDayUser,
} from './services'
import { createLocalTask, localItemsForDay } from './day'
import {
  LocalStoreError,
  loadLocalDatabase,
  memoryDriver,
  setLocalStoreDriver,
} from './store'

const USER = 'local-talk-user'
const TODAY = '2026-08-27'
const NOW = '2026-08-27T12:00:00.000Z'

const taskResult = (overrides: Record<string, unknown> = {}) => ({
  item: {
    id: 'talk-task-1',
    title: 'Visible immediately',
    type: 'task',
    category: 'personal',
    completed: false,
    scheduledDate: TODAY,
    startTime: null,
    location: null,
    duration: 30,
    repeat: 'none',
    position: 0,
    isHabitInstance: false,
    originalHabitId: null,
    rolledOverFromTaskId: null,
    originalCreatedAt: null,
    googleEventId: null,
    syncedToGoogle: false,
    createdAt: NOW,
    ...overrides,
  },
})

beforeEach(() => {
  setLocalStoreDriver(memoryDriver(null))
  setLocalDayUser(USER, 'owner@example.com')
})

describe('a confirmed Talk change and a Local day', () => {
  it('stores the exact confirmed Task id and stays idempotent on a repeated result', async () => {
    const action = {
      capability: 'add_task',
      args: { title: 'Visible immediately', category: 'personal', scheduledDate: TODAY },
    }

    assert.equal(await applyConfirmedTalkActionToLocalDay(action, taskResult()), true)
    assert.equal(await applyConfirmedTalkActionToLocalDay(action, taskResult()), true)

    const database = await loadLocalDatabase(USER)
    assert.equal(database.tasks.length, 1)
    assert.equal(database.tasks[0]?.id, 'talk-task-1')
    assert.deepEqual((await localItemsForDay(USER, TODAY)).map((item) => item.title), ['Visible immediately'])
  })

  it('mirrors edits and deletions into the Item collection Talk just changed', async () => {
    const original = await createLocalTask(USER, {
      title: 'Before Talk',
      type: 'task',
      category: 'personal',
      scheduledDate: TODAY,
    })

    await applyConfirmedTalkActionToLocalDay(
      { capability: 'update_item', args: { itemId: original.id, title: 'After Talk' } },
      taskResult({ id: original.id, title: 'After Talk' }),
    )
    assert.equal((await localItemsForDay(USER, TODAY))[0]?.title, 'After Talk')

    await applyConfirmedTalkActionToLocalDay(
      { capability: 'delete_item', args: { itemId: original.id, deleteScope: 'instance' } },
      { deleted: true, itemId: original.id },
    )
    assert.deepEqual(await localItemsForDay(USER, TODAY), [])
  })

  it('merges confirmed Habit progress without discarding progress already on the device', async () => {
    await createLocalTask(USER, {
      title: 'Walk',
      type: 'habit',
      category: 'health',
      repeat: 'daily',
      habitTarget: { value: 30, unit: 'minutes' },
    })
    const habit = (await localItemsForDay(USER, TODAY))[0]!
    await localServices.addHabitProgress(USER, habit.id, { amount: 5, note: 'Already here' })

    await applyConfirmedTalkActionToLocalDay(
      { capability: 'record_habit_progress', args: { itemId: habit.id, amount: 10, date: TODAY } },
      {
        detail: {
          habit: {
            id: 'server-habit-instance',
            title: habit.title,
            type: 'habit',
            category: habit.category,
            startTime: habit.startTime,
            duration: habit.duration ?? null,
            repeat: habit.repeat,
            completed: false,
            scheduledDate: TODAY,
            createdAt: NOW,
            originalHabitId: habit.originalHabitId,
            isHabitInstance: true,
            position: habit.position ?? null,
            habitInfo: {
              target: { value: 30, unit: 'minutes' },
              outcome: 'partial',
              progressTotal: 10,
            },
          },
          entries: [{
            id: 'server-progress-entry',
            amount: 10,
            note: null,
            createdAt: NOW,
            updatedAt: NOW,
          }],
        },
      },
    )

    const detail = await localServices.getHabitProgress(USER, 'server-habit-instance', TODAY)
    assert.equal(detail.habit.habitInfo?.progressTotal, 15)
    assert.deepEqual(detail.entries.map((entry) => entry.amount).sort((a, b) => a - b), [5, 10])
  })

  it('mirrors Nutrition, Weight, Workout and Achievement results into their owning collections', async () => {
    await applyConfirmedTalkActionToLocalDay(
      { capability: 'add_calorie_entry', args: {} },
      { entry: { id: 'calorie-1', date: TODAY, time: '12:00', name: 'Lunch', calories: 500, protein: 30, carbs: 50, fat: 15, quantity: null, createdAt: NOW, updatedAt: NOW } },
    )
    await applyConfirmedTalkActionToLocalDay(
      { capability: 'add_weight_entry', args: {} },
      { entry: { id: 'weight-1', date: TODAY, weightKg: 80, createdAt: NOW, updatedAt: NOW } },
    )
    await applyConfirmedTalkActionToLocalDay(
      { capability: 'add_workout_session', args: {} },
      { session: { id: 'session-1', userId: USER, date: TODAY, title: 'Strength', notes: null, exercises: [{ id: 'exercise-1', sessionId: 'session-1', name: 'Squat', sets: 3, reps: 5, weightKg: 80, durationMinutes: null, distanceKm: null, notes: null, position: 0 }], createdAt: NOW, updatedAt: NOW } },
    )
    await applyConfirmedTalkActionToLocalDay(
      { capability: 'add_achievement_entry', args: {} },
      { entry: { id: 'achievement-entry-1', achievementId: 'achievement-1', userId: USER, date: TODAY, value: 100, supportingValue: null, supportingUnit: null, notes: null, createdAt: NOW, updatedAt: NOW } },
    )

    const database = await loadLocalDatabase(USER)
    assert.equal(database.calorieEntries[0]?.id, 'calorie-1')
    assert.equal(database.weightEntries[0]?.id, 'weight-1')
    assert.equal(database.workoutSessions[0]?.id, 'session-1')
    assert.equal(database.achievementEntries[0]?.id, 'achievement-entry-1')
  })

  it('can compose Today after mirroring a confirmed Workout session', async () => {
    await applyConfirmedTalkActionToLocalDay(
      { capability: 'add_workout_session', args: {} },
      {
        session: {
          id: 'session-today-1',
          userId: USER,
          date: TODAY,
          title: 'Minimal strength building Workout',
          notes: 'A confirmed Talk session.',
          exercises: [{
            id: 'exercise-today-1',
            sessionId: 'session-today-1',
            name: 'Squat',
            sets: 3,
            reps: 8,
            weightKg: null,
            durationMinutes: null,
            distanceKm: null,
            notes: null,
            position: 0,
          }],
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
    )

    const summary = await localServices.daySummary(USER, TODAY)
    assert.equal(summary.supporting.workouts.status, 'logged')
    assert.equal(summary.supporting.workouts.sessions[0]?.id, 'session-today-1')
  })

  it('stores the exact confirmed reusable Workout plan once in the Local day', async () => {
    const action = {
      capability: 'add_workout_plan',
      args: { requestId: 'plan-request-1' },
    }
    const result = {
      plan: {
        id: 'plan-1',
        userId: USER,
        name: 'Full body strength',
        color: '#22d3ee',
        note: 'Three balanced sessions each week.',
        position: 0,
        exercises: [{
          id: 'plan-exercise-1',
          planId: 'plan-1',
          name: 'Goblet squat',
          sets: 3,
          reps: 8,
          weightKg: 20,
          durationMinutes: null,
          distanceKm: null,
          notes: 'Controlled tempo',
          position: 0,
        }],
        createdAt: NOW,
        updatedAt: NOW,
      },
    }

    assert.equal(await applyConfirmedTalkActionToLocalDay(action, result), true)
    assert.equal(await applyConfirmedTalkActionToLocalDay(action, result), true)

    const database = await loadLocalDatabase(USER)
    assert.equal(database.workoutPlans.length, 1)
    assert.equal(database.workoutPlans[0]?.id, result.plan.id)
    assert.equal(database.workoutPlans[0]?.name, result.plan.name)
    assert.deepEqual(database.workoutPlans[0]?.exercises, result.plan.exercises)
  })

  it('surfaces a future Local-day mutation that has no device implementation', async () => {
    await assert.rejects(
      () => applyConfirmedTalkActionToLocalDay({ capability: 'future_write', args: {} }, {}),
      LocalStoreError,
    )
  })
})
