import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { adoptAccountDay, countLocalDay, localDayFromExport } from './adopt'
import { emptyLocalDatabase, LocalDatabaseSchema, LocalStoreError, loadLocalDatabase, opensWithoutSession, readLocalDayIdentity, replaceLocalDay, memoryDriver, setLocalStoreDriver, type LocalDatabase } from './store'
import { buildLocalDaySummary } from './day'
import { collectDelta, runSync } from './sync'

const ACCOUNT = 'account-1'
const GUEST = 'guest-1'

const exportPayload = {
  version: 1,
  goals: [
    { id: '11111111-1111-4111-8111-111111111111', user_id: ACCOUNT, module: 'whole_day', statement: 'Launch HealthyFlow.', created_at: '2026-08-26T08:00:00.000Z', updated_at: '2026-08-26T08:00:00.000Z', deleted_at: null },
  ],
  items: [
    { id: 'server-task', user_id: ACCOUNT, title: 'Server task', type: 'task', category: 'work', scheduled_date: '2026-08-21', created_at: '2026-08-20T09:00:00.000Z', updated_at: '2026-08-20T09:00:00.000Z' },
  ],
  habitProgress: [],
  settings: [
    { id: 'settings-1', user_id: ACCOUNT, created_at: 'x', updated_at: 'y', weekStartsOn: 0, theme: 'white' },
  ],
  health: {
    calorieEntries: [
      { id: 'meal-1', user_id: ACCOUNT, date: '2026-08-21', time: '12:30', name: 'Server lunch', calories: 500, protein: 30, carbs: 40, fat: 12, quantity: null, created_at: 'a', updated_at: 'b' },
    ],
    calorieHistory: [],
    weightEntries: [
      { id: 'weight-1', user_id: ACCOUNT, date: '2026-08-21', weight_kg: 81.2, created_at: 'a', updated_at: 'b' },
    ],
    achievementDefinitions: [
      { id: 'def-1', user_id: ACCOUNT, name: 'Bench', metric_type: 'weight', unit: 'kg', better_direction: 'higher', target_value: 100, created_at: 'a', updated_at: 'b' },
    ],
    achievementEntries: [
      { id: 'entry-1', achievement_id: 'def-1', user_id: ACCOUNT, date: '2026-08-21', value: 92, created_at: 'a', updated_at: 'b' },
    ],
    workoutPlans: [{ id: 'plan-1', user_id: ACCOUNT, name: 'Push', position: 0, created_at: 'a', updated_at: 'b' }],
    workoutPlanItems: [{ id: 'plan-ex-1', plan_id: 'plan-1', name: 'Bench', sets: 5, reps: 5, weight_kg: 80, position: 0 }],
    workoutSessions: [{ id: 'session-1', user_id: ACCOUNT, date: '2026-08-21', title: 'Push', notes: null, created_at: 'a', updated_at: 'b' }],
    workoutSessionExercises: [{ id: 'ex-1', session_id: 'session-1', name: 'Bench', sets: 5, reps: 5, weight_kg: 80, position: 0 }],
    workoutExerciseHistory: [],
  },
  calendar: { connections: [], events: [] },
  assistant: { conversations: [], messages: [], recommendations: [], proposals: [], auditMetadata: [] },
  billing: { credits: [{ id: 'c1' }], subscriptions: [], usage: [] },
  contactMessages: [],
  apiTokens: [{ id: 'token-1' }],
  mcpOAuthGrants: [],
}

function deviceDay(): LocalDatabase {
  return {
    ...emptyLocalDatabase(GUEST),
    tasks: [
      { id: 'device-task', user_id: GUEST, title: 'Device task', type: 'task', category: 'personal', start_time: null, location: null, duration: null, repeat_type: 'none', completed: false, completed_at: null, scheduled_date: '2026-08-21', position: null, original_habit_id: null, habit_target_value: null, habit_target_unit: null, habit_outcome: null, overdue_notified: false, rolled_over_from_task_id: null, original_created_at: null, deleted_at: null, created_at: 'a', updated_at: 'b' },
    ],
    calorieEntries: [
      { id: 'device-meal', userId: GUEST, date: '2026-08-21', name: 'Device lunch', calories: 400 },
    ] as LocalDatabase['calorieEntries'],
  }
}

describe('reading an account export onto the device', () => {
  it('maps every health shape the server stores into the shape the device does', () => {
    const day = localDayFromExport(ACCOUNT, exportPayload)

    assert.equal(day.userId, ACCOUNT)
    assert.equal(day.goals[0].statement, 'Launch HealthyFlow.')
    assert.equal(day.tasks.length, 1)
    assert.deepEqual(day.calorieEntries[0], {
      id: 'meal-1', userId: ACCOUNT, date: '2026-08-21', time: '12:30', name: 'Server lunch',
      calories: 500, protein: 30, carbs: 40, fat: 12, quantity: null, createdAt: 'a', updatedAt: 'b',
    })
    assert.equal((day.weightEntries[0] as unknown as { weightKg: number }).weightKg, 81.2)
    assert.equal((day.achievementDefinitions[0] as unknown as { betterDirection: string }).betterDirection, 'higher')
    assert.equal((day.achievementEntries[0] as unknown as { achievementId: string }).achievementId, 'def-1')
  })

  it('nests exercises inside the session and plan they belong to', () => {
    const day = localDayFromExport(ACCOUNT, exportPayload)

    const session = day.workoutSessions[0] as unknown as { exercises: { sessionId: string; weightKg: number }[] }
    assert.equal(session.exercises.length, 1)
    assert.equal(session.exercises[0].sessionId, 'session-1')
    assert.equal(session.exercises[0].weightKg, 80)

    const plan = day.workoutPlans[0] as unknown as { exercises: { planId: string }[] }
    assert.equal(plan.exercises[0].planId, 'plan-1')
  })

  it('leaves behind everything that belongs to the account rather than the day', () => {
    const day = localDayFromExport(ACCOUNT, exportPayload) as unknown as Record<string, unknown>

    // Calendar connections, assistant history, billing, tokens and OAuth grants
    // are the account's, not the day's, and must not land on a device.
    for (const key of ['calendar', 'assistant', 'billing', 'apiTokens', 'mcpOAuthGrants']) {
      assert.equal(day[key], undefined, `${key} must not reach the device`)
    }
  })

  it('keeps the settings the app can read and drops the row bookkeeping', () => {
    const day = localDayFromExport(ACCOUNT, exportPayload)

    assert.deepEqual(day.settings, { weekStartsOn: 0, theme: 'white' })
  })

  it('unwraps hosted JSON settings and preserves old assistant direction as Goals', () => {
    const day = localDayFromExport(ACCOUNT, {
      items: [],
      habitProgress: [],
      goals: [],
      settings: [{
        user_id: ACCOUNT,
        settings: {
          theme: 'white',
          assistantProfile: {
            preferredName: 'Ori',
            responseStyle: 'concise',
            planningStyle: 'one_step_at_a_time',
            followUpMode: 'ask_about_outcomes',
            priorities: ['Launch HealthyFlow'],
            constraints: ['Protect training consistency'],
          },
        },
      }],
    })

    assert.equal(day.settings.theme, 'white')
    assert.deepEqual(day.goals.map(goal => goal.statement), [
      'Launch HealthyFlow',
      'Protect training consistency',
    ])
    assert.deepEqual(day.settings.assistantProfile, {
      preferredName: 'Ori',
      responseStyle: 'concise',
      planningStyle: 'one_step_at_a_time',
      followUpMode: 'ask_about_outcomes',
    })
  })

  it('reads an export with no health at all', () => {
    const day = localDayFromExport(ACCOUNT, { items: [], habitProgress: [], settings: [] })

    assert.deepEqual(day.calorieEntries, [])
    assert.deepEqual(day.workoutSessions, [])
  })
})

describe('choosing what happens to the day already here', () => {
  it('keeps both, re-keyed to the account so the document has one owner', () => {
    const merged = adoptAccountDay(deviceDay(), localDayFromExport(ACCOUNT, exportPayload), 'keep_both')

    assert.equal(merged.userId, ACCOUNT)
    assert.equal(merged.tasks.length, 2)
    assert.equal(merged.calorieEntries.length, 2)
    // Every record now belongs to the account, or loadLocalDatabase would refuse
    // the document as someone else's.
    assert.ok(merged.tasks.every((task) => task.user_id === ACCOUNT))
    assert.ok(merged.calorieEntries.every((entry) => (entry as unknown as { userId: string }).userId === ACCOUNT))
  })

  it('discards the device day when that is what was chosen', () => {
    const merged = adoptAccountDay(deviceDay(), localDayFromExport(ACCOUNT, exportPayload), 'discard_device')

    assert.equal(merged.tasks.length, 1)
    assert.equal(merged.tasks[0].id, 'server-task')
    assert.equal(merged.calorieEntries.length, 1)
  })

  it('prefers the account settings, which are the ones they have been living with', () => {
    const device = { ...deviceDay(), settings: { theme: 'midnight' } }
    const merged = adoptAccountDay(device, localDayFromExport(ACCOUNT, exportPayload), 'keep_both')

    assert.equal(merged.settings.theme, 'white')
  })

  it('falls back to the device settings when the account has none', () => {
    const device = { ...deviceDay(), settings: { theme: 'midnight' } }
    const account = { ...localDayFromExport(ACCOUNT, exportPayload), settings: {} }
    const merged = adoptAccountDay(device, account, 'keep_both')

    assert.equal(merged.settings.theme, 'midnight')
  })
})

describe('what the person is asked to weigh', () => {
  it('counts the day in the terms they would recognise', () => {
    const counts = countLocalDay(deviceDay())

    assert.deepEqual(counts, { goals: 0, items: 1, habits: 0, meals: 1, workouts: 0 })
  })

  it('does not count a deleted Item or a Habit instance as separate things', () => {
    const device = deviceDay()
    device.tasks.push(
      { ...device.tasks[0], id: 'gone', deleted_at: 'now' },
      { ...device.tasks[0], id: 'habit-template', type: 'habit', repeat_type: 'daily' },
      { ...device.tasks[0], id: 'habit-instance', type: 'habit', original_habit_id: 'habit-template' },
    )

    assert.deepEqual(countLocalDay(device), { goals: 0, items: 1, habits: 1, meals: 1, workouts: 0 })
  })
})

describe('a day downloaded from a real account', () => {
  // Taken from an actual phone. Signing in pulled 110 real task rows down, wrote
  // them, and made the document unreadable — because `updated_at` was required
  // and the server's `tasks` table has no such column. The write reported
  // success and destroyed access to the day.
  const serverTaskRow = {
    id: 'server-1',
    user_id: 'account-1',
    title: 'A row as the server actually stores it',
    type: 'task',
    category: 'work',
    start_time: null,
    duration: null,
    repeat_type: 'none',
    completed: false,
    completed_at: null,
    created_at: '2026-08-20T09:00:00.000Z',
    scheduled_date: '2026-08-23',
    overdue_notified: false,
    original_habit_id: null,
    rolled_over_from_task_id: null,
    original_created_at: null,
    google_event_id: null,
    synced_to_google: false,
    google_sync_status: 'pending',
    position: null,
    deleted_at: null,
    location: null,
    habit_target_value: null,
    habit_target_unit: null,
    habit_outcome: null,
    project_id: null,
    target_relation: null,
    deferred_at: null,
    workout_plan_id: null,
    // and deliberately no updated_at
  }

  it('reads a server row that has no updated_at', () => {
    const day = localDayFromExport('account-1', {
      items: [serverTaskRow], habitProgress: [], settings: [],
    })

    assert.equal(day.tasks.length, 1)
    // Filled from when the row is last known to have changed, not invented.
    assert.equal(day.tasks[0].updated_at, '2026-08-20T09:00:00.000Z')
    assert.equal(LocalDatabaseSchema.safeParse(day).success, true)
  })

  it('refuses to save a day it could not read back', async () => {
    setLocalStoreDriver(memoryDriver(null))
    const broken = {
      ...emptyLocalDatabase('account-1'),
      tasks: [{ id: 'x' }],
    } as unknown as LocalDatabase

    // The failure that must never be silent: writing succeeds, reading never
    // will, and the day is gone while the app says it saved.
    await assert.rejects(() => replaceLocalDay(broken), LocalStoreError)
  })

  it('saves a day it can read back', async () => {
    const driver = memoryDriver(null)
    setLocalStoreDriver(driver)
    const day = localDayFromExport('account-1', {
      items: [serverTaskRow], habitProgress: [], settings: [],
    })

    await replaceLocalDay(day)

    assert.ok(driver.contents)
    assert.equal(LocalDatabaseSchema.safeParse(JSON.parse(driver.contents!)).success, true)
  })
})

describe('signing in again, when the device already holds this account\'s day', () => {
  // The case the first design missed. "Ids come from two generators and cannot
  // collide" is true the first time someone signs in and false every time after,
  // because by then the device is holding the account's own rows. Concatenating
  // would have duplicated an entire account — 109 rows, in the report that found
  // this — and reverted everything done on the device since.
  const serverRow = {
    id: 'task-1', user_id: 'account-1', title: 'Gmail integration task', type: 'task',
    category: 'work', completed: false, deleted_at: null,
    created_at: '2025-09-02T15:48:26.000Z', updated_at: '2025-09-02T15:48:26.000Z',
  }
  const account = () => ({
    ...emptyLocalDatabase('account-1'),
    tasks: [serverRow],
  } as unknown as LocalDatabase)

  it('does not duplicate a row the device already has', () => {
    const device = {
      ...emptyLocalDatabase('account-1'),
      tasks: [serverRow],
    } as unknown as LocalDatabase

    const merged = adoptAccountDay(device, account(), 'keep_both')

    assert.equal(merged.tasks.length, 1)
  })

  it('keeps what was done on the device over a server copy that has not moved', () => {
    // Marked done on the phone. The server still says open, and re-downloading
    // must not undo it.
    const device = {
      ...emptyLocalDatabase('account-1'),
      tasks: [{
        ...serverRow,
        completed: true,
        completed_at: '2026-08-23T10:00:00.000Z',
        updated_at: '2026-08-23T10:00:00.000Z',
      }],
    } as unknown as LocalDatabase

    const merged = adoptAccountDay(device, account(), 'keep_both')

    assert.equal(merged.tasks.length, 1)
    assert.equal(merged.tasks[0].completed, true)
  })

  it('keeps a deletion made on the device', () => {
    const device = {
      ...emptyLocalDatabase('account-1'),
      tasks: [{ ...serverRow, deleted_at: '2026-08-23T10:00:00.000Z', updated_at: '2026-08-23T10:00:00.000Z' }],
    } as unknown as LocalDatabase

    const merged = adoptAccountDay(device, account(), 'keep_both')

    assert.equal(merged.tasks.length, 1)
    assert.ok(merged.tasks[0].deleted_at)
  })

  it('takes the server row when it is the newer of the two', () => {
    const device = {
      ...emptyLocalDatabase('account-1'),
      tasks: [{ ...serverRow, title: 'Stale device copy', updated_at: '2025-01-01T00:00:00.000Z' }],
    } as unknown as LocalDatabase

    const merged = adoptAccountDay(device, account(), 'keep_both')

    assert.equal(merged.tasks[0].title, 'Gmail integration task')
  })

  it('still keeps a genuinely separate day from a guest session', () => {
    const guestDay = {
      ...emptyLocalDatabase('guest-1'),
      tasks: [{ ...serverRow, id: 'guest-task', user_id: 'guest-1', title: 'Written as a Guest' }],
    } as unknown as LocalDatabase

    const merged = adoptAccountDay(guestDay, account(), 'keep_both')

    assert.equal(merged.tasks.length, 2)
    assert.ok(merged.tasks.every((task) => task.user_id === 'account-1'))
  })
})

describe('a complete server export, through the whole path', () => {
  // Server rows for every collection, in the shapes the tables actually have —
  // snake_case, no updated_at on tasks, health carrying its own timestamps.
  // Every device bug this week came from data the *server* creates, while every
  // test used data the *device* creates. This is that gap.
  const exported = {
    items: [{
      id: 'srv-task', user_id: ACCOUNT, title: 'From the server', type: 'task',
      category: 'work', completed: false, deleted_at: null, scheduled_date: '2026-08-23',
      created_at: '2026-08-20T09:00:00.000Z',
    }],
    habitProgress: [{
      id: 'srv-progress', habit_instance_id: 'srv-habit', user_id: ACCOUNT,
      amount: 10, note: null, created_at: '2026-08-20T09:00:00.000Z',
    }],
    settings: [{ user_id: ACCOUNT, weekStartsOn: 1 }],
    health: {
      calorieEntries: [{
        id: 'srv-meal', user_id: ACCOUNT, date: '2026-08-23', name: 'Porridge',
        calories: 300, created_at: '2026-08-23T08:00:00.000Z',
        updated_at: '2026-08-23T08:00:00.000Z',
      }],
      weightEntries: [{
        id: 'srv-weight', user_id: ACCOUNT, date: '2026-08-23', weight_kg: 80,
        created_at: '2026-08-23T07:00:00.000Z', updated_at: '2026-08-23T07:00:00.000Z',
      }],
      workoutSessions: [{
        id: 'srv-session', user_id: ACCOUNT, date: '2026-08-23', title: 'Legs', notes: null,
        created_at: '2026-08-23T18:00:00.000Z', updated_at: '2026-08-23T18:00:00.000Z',
      }],
      workoutSessionExercises: [{
        id: 'srv-ex', session_id: 'srv-session', name: 'Squat', sets: 5, reps: 5,
        weight_kg: 100, duration_minutes: null, distance_km: null, notes: null, position: 0,
      }],
    },
  }

  it('imports, saves, reads back, and builds a day', async () => {
    setLocalStoreDriver(memoryDriver(null))

    const day = localDayFromExport(ACCOUNT, exported as never)
    await replaceLocalDay(day)

    const reloaded = await loadLocalDatabase(ACCOUNT)
    assert.equal(reloaded.tasks.length, 1)
    // The write that succeeded and could never be read back is the failure this
    // guards: every row has to survive the round trip, not just parse going in.
    assert.equal(LocalDatabaseSchema.safeParse(reloaded).success, true)

    const summary = await buildLocalDaySummary(ACCOUNT, '2026-08-23', 'UTC')
    assert.equal(summary.items.length, 1)
    assert.equal(summary.capacity.status, 'complete')
  })

  it('pushes that whole day up on the first exchange, then nothing on the second', async () => {
    setLocalStoreDriver(memoryDriver(null))
    await replaceLocalDay(localDayFromExport(ACCOUNT, exported as never))

    const sent: { since: string | null; changed: Record<string, any> }[] = []
    const exchange = async (body: any) => {
      sent.push(body)
      return { syncedAt: '2026-08-24T00:00:00.000Z', changed: {} }
    }

    await runSync(ACCOUNT, exchange as never)
    await runSync(ACCOUNT, exchange as never)

    assert.equal(sent[0].since, null)
    assert.equal(sent[0].changed.tasks.length, 1)
    assert.equal(sent[0].changed.workoutSessions.length, 1)
    assert.deepEqual(sent[0].changed.settings, { weekStartsOn: 1, updated_at: null })

    // The watermark advanced, and nothing moved in between.
    assert.equal(sent[1].since, '2026-08-24T00:00:00.000Z')
    assert.equal(sent[1].changed.tasks.length, 0)
    assert.equal(sent[1].changed.workoutSessions.length, 0)
    assert.equal(sent[1].changed.settings, null)
  })

  it('keeps the id the server gave a row, so a push is not a second copy', async () => {
    setLocalStoreDriver(memoryDriver(null))
    await replaceLocalDay(localDayFromExport(ACCOUNT, exported as never))

    const delta = collectDelta(await loadLocalDatabase(ACCOUNT))

    assert.deepEqual(delta.tasks.map((row) => row.id), ['srv-task'])
    assert.deepEqual(delta.weightEntries.map((row) => row.id), ['srv-weight'])
  })

  it('does not bring a deleted server record back to life', async () => {
    setLocalStoreDriver(memoryDriver(null))
    const withDeleted = {
      ...exported,
      health: {
        ...exported.health,
        calorieEntries: [{ ...exported.health.calorieEntries[0], deleted_at: '2026-08-23T09:00:00.000Z' }],
      },
    }

    await replaceLocalDay(localDayFromExport(ACCOUNT, withDeleted as never))
    const summary = await buildLocalDaySummary(ACCOUNT, '2026-08-23', 'UTC')

    assert.equal(summary.supporting.nutrition.status, 'not_logged')
  })
})

describe('recording who an adopted day belongs to', () => {
  // Signing in writes an account's day onto a device. If that document does not
  // say the owner has an email, logging out later leaves it looking exactly like
  // a Guest's, and the next launch reopens it with no session at all.
  it('records the account\u2019s email from the export', () => {
    const day = localDayFromExport(ACCOUNT, {
      ...exportPayload,
      account: { id: ACCOUNT, email: 'someone@example.com' },
    } as never)

    assert.equal(day.ownerEmail, 'someone@example.com')
  })

  it('records no email for a Guest, who has none', () => {
    const day = localDayFromExport(GUEST, {
      ...exportPayload,
      account: { id: GUEST, email: null },
    } as never)

    assert.equal(day.ownerEmail, null)
  })

  it('keeps it through a keep-both merge with the device\u2019s day', () => {
    const account = localDayFromExport(ACCOUNT, {
      ...exportPayload,
      account: { id: ACCOUNT, email: 'someone@example.com' },
    } as never)

    const merged = adoptAccountDay(emptyLocalDatabase(GUEST), account, 'keep_both')

    assert.equal(merged.ownerEmail, 'someone@example.com')
  })
})

describe('handing this device from a Guest to the account they signed in to', () => {
  // Signing in abandons the guest identity (CONTEXT.md). With a document per
  // person the guest's day is no longer overwritten by the account's — it sits
  // there — and it is the one a no-token launch would prefer, because a Guest's
  // day is the only kind that opens without a session. The device would come
  // back as the guest they just left.
  const accountDay = () => ({ ...emptyLocalDatabase(ACCOUNT), ownerEmail: 'someone@example.com' })

  it('retires the guest\u2019s day rather than leaving it to be reopened', async () => {
    setLocalStoreDriver(memoryDriver(null))
    await replaceLocalDay(emptyLocalDatabase(GUEST))

    await replaceLocalDay(accountDay(), GUEST)

    const identity = await readLocalDayIdentity()
    assert.equal(identity?.id, ACCOUNT)
    assert.equal(opensWithoutSession(identity), false)
  })

  it('leaves every other day on the device alone', async () => {
    setLocalStoreDriver(memoryDriver(null))
    await replaceLocalDay(emptyLocalDatabase('someone-elses-guest'))

    await replaceLocalDay(accountDay(), GUEST)

    assert.equal((await loadLocalDatabase('someone-elses-guest')).userId, 'someone-elses-guest')
  })
})
