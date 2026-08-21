import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  addLocalAchievementEntry,
  addLocalWorkoutExercise,
  createLocalAchievement,
  createLocalCalorieEntry,
  createLocalWeightEntry,
  createLocalWorkoutSession,
  localAchievements,
  localCalorieEntries,
  localWeightEntry,
  localWorkoutSessions,
  removeLocalAchievement,
  removeLocalCalorieEntry,
  updateLocalAchievement,
} from './health'
import { buildLocalDaySummary } from './day'
import { LocalStoreError, emptyLocalDatabase, memoryDriver, setLocalStoreDriver } from './store'

const USER = 'guest-1'
const TODAY = '2026-08-21'
const YESTERDAY = '2026-08-20'
const NOW = new Date('2026-08-21T10:00:00.000Z')

let driver: ReturnType<typeof memoryDriver>

beforeEach(() => {
  driver = memoryDriver(null)
  setLocalStoreDriver(driver)
})

const summary = () => buildLocalDaySummary(USER, TODAY, 'UTC', NOW)

describe('food on the device', () => {
  it('puts a logged meal on the day it belongs to, and no other', async () => {
    await createLocalCalorieEntry(USER, {
      date: TODAY, time: '13:00', name: 'Chicken and rice', calories: 620, protein: 48, carbs: 60, fat: 14,
    })
    await createLocalCalorieEntry(USER, { date: YESTERDAY, time: '19:00', name: 'Soup', calories: 210 })

    const day = await summary()

    assert.equal(day.supporting.nutrition.status, 'available')
    assert.equal(day.supporting.nutrition.calories.value, 620)
    assert.equal(day.supporting.nutrition.protein.value, 48)
    assert.deepEqual((await localCalorieEntries(USER, TODAY)).map((entry) => entry.name), ['Chicken and rice'])
  })

  it('orders a day by clock time, with unclocked entries after', async () => {
    await createLocalCalorieEntry(USER, { date: TODAY, name: 'No time', calories: 100 })
    await createLocalCalorieEntry(USER, { date: TODAY, time: '08:00', name: 'Breakfast', calories: 300 })

    const entries = await localCalorieEntries(USER, TODAY)

    assert.deepEqual(entries.map((entry) => entry.name), ['Breakfast', 'No time'])
  })

  it('refuses to delete something it does not hold', async () => {
    await assert.rejects(() => removeLocalCalorieEntry(USER, 'not-an-entry'), LocalStoreError)
  })
})

describe('weight on the device', () => {
  it('keeps one weight per day, replacing rather than duplicating', async () => {
    await createLocalWeightEntry(USER, { date: TODAY, weightKg: 82.4 })
    await createLocalWeightEntry(USER, { date: TODAY, weightKg: 82.1 })

    const entry = await localWeightEntry(USER, TODAY)

    assert.equal(entry?.weightKg, 82.1)
    const day = await summary()
    assert.equal(day.supporting.nutrition.weight.status, 'recorded')
  })

  it('reports nothing recorded rather than a failed read', async () => {
    const day = await summary()

    assert.equal(day.supporting.nutrition.weight.status, 'not_recorded')
    assert.equal(day.supporting.nutrition.weight.entry, null)
  })
})

describe('training on the device', () => {
  it('logs a session with its exercises, on the right day', async () => {
    const session = await createLocalWorkoutSession(USER, {
      date: TODAY,
      title: 'Push',
      notes: null,
      exercises: [{ name: 'Bench press', sets: 5, reps: 5, weightKg: 80 }],
    })

    assert.equal((session.exercises as unknown[]).length, 1)

    const day = await summary()
    assert.equal(day.supporting.workouts.status, 'logged')
    assert.equal(day.supporting.workouts.sessions.length, 1)
    assert.deepEqual((await localWorkoutSessions(USER, YESTERDAY)), [])
  })

  it('adds an exercise to a session that already exists, and answers with it', async () => {
    const session = await createLocalWorkoutSession(USER, { date: TODAY, title: 'Pull', exercises: [] })

    const added = await addLocalWorkoutExercise(USER, session.id, { name: 'Deadlift', sets: 3, reps: 5 })

    assert.equal(added.name, 'Deadlift')
    assert.equal(added.sessionId, session.id)
    const [stored] = await localWorkoutSessions(USER, TODAY)
    assert.equal((stored.exercises as unknown[]).length, 1)
  })

  it('refuses an exercise for a session it does not hold', async () => {
    await assert.rejects(
      () => addLocalWorkoutExercise(USER, 'not-a-session', { name: 'Squat' }),
      LocalStoreError,
    )
  })
})

describe('progress on the device', () => {
  const benchPress = () => createLocalAchievement(USER, {
    name: 'Bench press 1RM', category: 'strength', metricType: 'weight', unit: 'kg',
    betterDirection: 'higher', targetValue: 100,
  })

  it('derives trend and target through the same rule the server uses', async () => {
    const definition = await benchPress()
    await addLocalAchievementEntry(USER, definition.id, { date: YESTERDAY, value: 90 })
    await addLocalAchievementEntry(USER, definition.id, { date: TODAY, value: 95 })

    const [progress] = await localAchievements(USER)

    assert.equal(progress.latest?.value, 95)
    assert.equal(progress.previous?.value, 90)
    assert.equal(progress.personalBest?.value, 95)
    assert.equal(progress.trend.delta, 5)
    assert.equal(progress.trend.direction, 'up')
    assert.equal(progress.trend.isImprovement, true)
    assert.equal(progress.targetProgress, 95)
  })

  it('shows only the entries recorded on this date', async () => {
    const definition = await benchPress()
    await addLocalAchievementEntry(USER, definition.id, { date: YESTERDAY, value: 90 })

    const yesterdayOnly = await summary()
    assert.equal(yesterdayOnly.supporting.progress.status, 'not_recorded')
    assert.equal(yesterdayOnly.supporting.progress.targets.length, 1)

    await addLocalAchievementEntry(USER, definition.id, { date: TODAY, value: 95 })
    const today = await summary()
    assert.equal(today.supporting.progress.status, 'recorded')
    assert.equal(today.supporting.progress.entries.length, 1)
  })

  it('refuses a second entry for a date rather than overwriting a measurement', async () => {
    const definition = await benchPress()
    await addLocalAchievementEntry(USER, definition.id, { date: TODAY, value: 95 })

    await assert.rejects(
      () => addLocalAchievementEntry(USER, definition.id, { date: TODAY, value: 97 }),
      LocalStoreError,
    )
  })

  it('hides an archived Achievement unless asked for it', async () => {
    const definition = await benchPress()
    await updateLocalAchievement(USER, definition.id, { archived: true })

    assert.deepEqual(await localAchievements(USER), [])
    assert.equal((await localAchievements(USER, { includeArchived: true })).length, 1)
  })

  it('takes its entries with it when deleted', async () => {
    const definition = await benchPress()
    await addLocalAchievementEntry(USER, definition.id, { date: TODAY, value: 95 })

    await removeLocalAchievement(USER, definition.id)

    const day = await summary()
    assert.deepEqual(await localAchievements(USER, { includeArchived: true }), [])
    assert.equal(day.supporting.progress.entries.length, 0)
  })
})

describe('a health read that fails', () => {
  it('surfaces rather than reporting nothing logged', async () => {
    setLocalStoreDriver(memoryDriver('{"version":2,"userId":'))
    await assert.rejects(() => localCalorieEntries(USER, TODAY), LocalStoreError)
  })

  it('reads a version-1 document as one with no health in it', async () => {
    // A version-1 document is a valid version-2 document that logged no food.
    const legacy = { ...emptyLocalDatabase(USER), version: 1 }
    setLocalStoreDriver(memoryDriver(JSON.stringify(legacy)))

    assert.deepEqual(await localCalorieEntries(USER, TODAY), [])
    assert.equal((await summary()).supporting.nutrition.status, 'not_logged')
  })
})
