import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  addLocalHabitProgress,
  buildLocalDaySummary,
  completeLocalTask,
  createLocalTask,
  deleteLocalTask,
  localDaySummaryDependencies,
  localItemsForDay,
  readLocalSettings,
  reorderLocalTasks,
  setLocalHabitOutcome,
  updateLocalSettings,
  updateLocalTask,
} from './day'
import {
  clearLocalDay,
  emptyLocalDatabase,
  LocalStoreError,
  loadLocalDatabase,
  localDayExists,
  memoryDriver,
  setLocalStoreDriver,
} from './store'

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

describe('a day held on the device', () => {
  it('starts empty on a first open rather than treating a missing document as a failure', async () => {
    const day = await summary()

    assert.deepEqual(day.items, [])
    assert.equal(day.calendar.status, 'not_connected')
    assert.equal(driver.contents, null, 'reading a day must not write one')
  })

  // The sentence the whole launch rests on. A Guest has connected no Calendar,
  // which is outside the system's world rather than a failed read, so Capacity
  // stays exact instead of hedging to an upper bound.
  it('reports an exact Capacity offline, with no Calendar to hedge about', async () => {
    await createLocalTask(USER, {
      title: 'Write the listing copy',
      type: 'task',
      category: 'work',
      startTime: '09:00',
      duration: 60,
      scheduledDate: TODAY,
    })

    const day = await summary()

    assert.equal(day.capacity.status, 'complete')
    assert.deepEqual(day.capacity.reasonCodes, [])
    assert.equal(day.items.length, 1)
  })

  it('refuses to invent the modules it does not store', async () => {
    const day = await summary()

    assert.equal(day.modules.nutrition, 'disabled')
    assert.equal(day.modules.workouts, 'disabled')
    assert.equal(day.supporting.nutrition.status, 'disabled')

    const dependencies = localDaySummaryDependencies()
    await assert.rejects(() => dependencies.getCalorieEntries(USER, TODAY), LocalStoreError)
    await assert.rejects(() => dependencies.getWorkoutSessions(USER, TODAY), LocalStoreError)
    await assert.rejects(() => dependencies.getCalendarEvents(USER, TODAY), LocalStoreError)
  })
})

describe('Items on the device', () => {
  it('gives a start time a day, and leaves an undated Task in the Someday backlog', async () => {
    const timed = await createLocalTask(USER, {
      title: 'Standup', type: 'task', category: 'work', startTime: '09:30',
    })
    const someday = await createLocalTask(USER, {
      title: 'Read the ADRs', type: 'task', category: 'personal',
    })

    assert.equal(timed.scheduled_date, new Date().toISOString().slice(0, 10))
    assert.equal(someday.scheduled_date, null)
    assert.equal(someday.position, null)
  })

  it('carries an undated Task forward until it is completed, then keeps it on the day it was', async () => {
    const task = await createLocalTask(USER, {
      title: 'Renew the certificate', type: 'task', category: 'work', scheduledDate: YESTERDAY,
    })

    const before = await localItemsForDay(USER, TODAY)
    assert.deepEqual(before.map((item) => item.id), [task.id])

    await completeLocalTask(USER, task.id)
    const after = await localItemsForDay(USER, TODAY)
    assert.equal(after.length, 1)
    assert.equal(after[0].completed, true)

    // Completed yesterday-and-earlier is not today's business.
    const tomorrow = await localItemsForDay(USER, '2026-08-22')
    assert.deepEqual(tomorrow, [])
  })

  it('orders the Anytime backlog by the order it was given', async () => {
    const a = await createLocalTask(USER, { title: 'A', type: 'task', category: 'personal', scheduledDate: TODAY })
    const b = await createLocalTask(USER, { title: 'B', type: 'task', category: 'personal', scheduledDate: TODAY })

    await reorderLocalTasks(USER, [b.id, a.id])
    const items = await localItemsForDay(USER, TODAY)

    assert.deepEqual(items.map((item) => item.title), ['B', 'A'])
  })

  it('soft-deletes so the row survives for a later Claim', async () => {
    const task = await createLocalTask(USER, { title: 'Gone', type: 'task', category: 'personal', scheduledDate: TODAY })
    await deleteLocalTask(USER, task.id)

    assert.deepEqual(await localItemsForDay(USER, TODAY), [])
    const database = await loadLocalDatabase(USER)
    assert.equal(database.tasks.length, 1)
    assert.ok(database.tasks[0].deleted_at)
  })

  it('refuses an id it does not hold instead of pretending the write landed', async () => {
    await assert.rejects(() => updateLocalTask(USER, 'not-a-row', { title: 'x' }), LocalStoreError)
    await assert.rejects(() => deleteLocalTask(USER, 'not-a-row'), LocalStoreError)
  })
})

describe('Habits on the device', () => {
  const dailyHabit = () => createLocalTask(USER, {
    title: 'Twenty minutes of Hebrew',
    type: 'habit',
    category: 'personal',
    repeat: 'daily',
    habitTarget: { value: 20, unit: 'minutes' },
  })

  it('synthesises an instance per day without writing one', async () => {
    const habit = await dailyHabit()

    const today = await localItemsForDay(USER, TODAY)
    const yesterday = await localItemsForDay(USER, YESTERDAY)

    assert.deepEqual(today.map((item) => item.id), [`${habit.id}-${TODAY}`])
    assert.deepEqual(yesterday.map((item) => item.id), [`${habit.id}-${YESTERDAY}`])
    assert.equal(today[0].isHabitInstance, true)

    const database = await loadLocalDatabase(USER)
    assert.equal(database.tasks.length, 1, 'a plain read must not materialize anything')
  })

  it('materializes exactly one row when the day is measured, and keeps measuring it', async () => {
    const habit = await dailyHabit()
    const virtualId = `${habit.id}-${TODAY}`

    await addLocalHabitProgress(USER, virtualId, { amount: 8 })
    await addLocalHabitProgress(USER, virtualId, { amount: 7 })

    const database = await loadLocalDatabase(USER)
    const instances = database.tasks.filter((row) => row.original_habit_id === habit.id)
    assert.equal(instances.length, 1)

    const items = await localItemsForDay(USER, TODAY)
    assert.equal(items[0].habitInfo?.progressTotal, 15)
    assert.equal(items[0].habitInfo?.outcome, 'partial')
  })

  it('does not carry a missed Habit day forward — it re-synthesises fresh', async () => {
    const habit = await dailyHabit()
    await addLocalHabitProgress(USER, `${habit.id}-${YESTERDAY}`, { amount: 5 })

    const today = await localItemsForDay(USER, TODAY)

    assert.equal(today.length, 1)
    assert.equal(today[0].id, `${habit.id}-${TODAY}`)
    assert.equal(today[0].habitInfo?.progressTotal, 0)
  })

  it('records a failed Habit day as addressed without counting it complete', async () => {
    const habit = await dailyHabit()
    await setLocalHabitOutcome(USER, `${habit.id}-${TODAY}`, 'failed')

    const day = await summary()

    assert.equal(day.completion.addressed, 1)
    assert.equal(day.completion.completed, 0)
  })

  it('tops the record up rather than overriding the number when a short day is marked done', async () => {
    const habit = await dailyHabit()
    const virtualId = `${habit.id}-${TODAY}`
    await addLocalHabitProgress(USER, virtualId, { amount: 12 })

    const settled = await setLocalHabitOutcome(USER, virtualId, 'completed')

    assert.equal(settled.outcome, 'completed')
    assert.equal(settled.total, 20, 'the total must match the target it now claims')
    assert.equal(settled.entries.length, 2)
    assert.equal(settled.entries[1].amount, 8)
  })

  it('refuses Not done while recorded progress says otherwise', async () => {
    const habit = await dailyHabit()
    const virtualId = `${habit.id}-${TODAY}`
    await addLocalHabitProgress(USER, virtualId, { amount: 20 })

    await assert.rejects(() => setLocalHabitOutcome(USER, virtualId, 'failed'), LocalStoreError)
  })

  it('does not accept progress against a Habit with nothing to measure', async () => {
    const binary = await createLocalTask(USER, {
      title: 'Take the vitamins', type: 'habit', category: 'health', repeat: 'daily',
    })

    await assert.rejects(
      () => addLocalHabitProgress(USER, `${binary.id}-${TODAY}`, { amount: 1 }),
      LocalStoreError,
    )
  })

  it('treats a drag as a per-day override and never touches the template', async () => {
    const habit = await dailyHabit()

    const placed = await updateLocalTask(USER, `${habit.id}-${TODAY}`, { startTime: '07:15' })

    assert.equal(placed.original_habit_id, habit.id)
    assert.equal(placed.start_time, '07:15')

    const database = await loadLocalDatabase(USER)
    const template = database.tasks.find((row) => row.id === habit.id)
    assert.equal(template?.start_time, null, 'the template keeps its own default')

    const tomorrow = await localItemsForDay(USER, '2026-08-22')
    assert.equal(tomorrow[0].startTime, null, 'a drag applies to one day only')
  })

  it('changes the whole Habit when the edit says so, leaving other days as they were', async () => {
    const habit = await dailyHabit()
    await updateLocalTask(USER, `${habit.id}-${YESTERDAY}`, { title: 'Yesterday only' })

    await updateLocalTask(USER, `${habit.id}-${TODAY}`, { title: 'Thirty minutes of Hebrew' }, 'habit')

    const today = await localItemsForDay(USER, TODAY)
    const tomorrow = await localItemsForDay(USER, '2026-08-22')
    const yesterday = await localItemsForDay(USER, YESTERDAY)

    assert.equal(today[0].title, 'Thirty minutes of Hebrew')
    assert.equal(tomorrow[0].title, 'Thirty minutes of Hebrew', 'future days follow the template')
    assert.equal(yesterday[0].title, 'Yesterday only', 'an edited day is a historical snapshot')
  })

  it('keeps a single-day edit on that day', async () => {
    const habit = await dailyHabit()

    await updateLocalTask(USER, `${habit.id}-${TODAY}`, { title: 'Just today' })

    assert.equal((await localItemsForDay(USER, TODAY))[0].title, 'Just today')
    assert.equal((await localItemsForDay(USER, '2026-08-22'))[0].title, 'Twenty minutes of Hebrew')
  })

  it('deletes the template and every instance when the Habit itself goes', async () => {
    const habit = await dailyHabit()
    await addLocalHabitProgress(USER, `${habit.id}-${TODAY}`, { amount: 3 })

    await deleteLocalTask(USER, habit.id, 'habit')

    assert.deepEqual(await localItemsForDay(USER, TODAY), [])
    assert.deepEqual(await localItemsForDay(USER, YESTERDAY), [])
  })
})

describe('settings on the device', () => {
  it('starts from the local baseline and keeps what the user changed', async () => {
    const initial = await readLocalSettings(USER)
    assert.equal(initial.calorieIntake, false)
    assert.equal(initial.planningWindow?.startTime, '08:00')

    const updated = await updateLocalSettings(USER, {
      planningWindow: { startTime: '07:00', endTime: '19:00', transitionBufferMinutes: 10 },
    })
    assert.equal(updated.planningWindow?.startTime, '07:00')

    const day = await summary()
    assert.equal(day.settings.planningWindow?.startTime, '07:00')
  })

  it('renders Capacity against the window it computed with, with no window set anywhere else', async () => {
    await updateLocalSettings(USER, { planningWindow: null })

    const day = await summary()

    assert.equal(day.capacity.status, 'unavailable')
    assert.ok(day.capacity.reasonCodes.includes('planning_window_missing'))
  })
})

describe('the stored document', () => {
  it('survives a round trip through the driver', async () => {
    await createLocalTask(USER, { title: 'Persisted', type: 'task', category: 'work', scheduledDate: TODAY })

    // A fresh process, same file.
    setLocalStoreDriver(memoryDriver(driver.contents))
    const items = await localItemsForDay(USER, TODAY)

    assert.deepEqual(items.map((item) => item.title), ['Persisted'])
  })

  it('surfaces an unreadable document instead of starting the Guest on a blank day', async () => {
    setLocalStoreDriver(memoryDriver('{"version":1,"userId":'))
    await assert.rejects(() => localItemsForDay(USER, TODAY), LocalStoreError)

    setLocalStoreDriver(memoryDriver(JSON.stringify({ version: 99, userId: USER, tasks: [] })))
    await assert.rejects(() => localItemsForDay(USER, TODAY), LocalStoreError)
  })

  it('erases the day only when the deletion was asked for by name', async () => {
    await createLocalTask(USER, { title: 'Gone for good', type: 'task', category: 'personal', scheduledDate: TODAY })
    assert.equal(await localDayExists(), true)

    await clearLocalDay()

    assert.equal(await localDayExists(), false)
    assert.deepEqual(await localItemsForDay(USER, TODAY), [])
  })

  it('refuses a document belonging to a different session', async () => {
    setLocalStoreDriver(memoryDriver(JSON.stringify(emptyLocalDatabase('someone-else'))))
    await assert.rejects(() => localItemsForDay(USER, TODAY), LocalStoreError)
  })
})
