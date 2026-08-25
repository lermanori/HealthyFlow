import { Sync, SyncClockError, SyncOwnershipError } from '../../src/sync'
import { supabase } from '../../src/supabase-client'

jest.mock('../../src/supabase-client', () => ({
  supabase: { from: jest.fn() },
}))

/**
 * A Supabase stand-in that records what was asked of it.
 *
 * `stored` is what the server holds, keyed by table, so the pull half can be
 * exercised with rows in the shape the tables actually have — which is where
 * every device bug this week came from.
 */
const stored: Record<string, any[]> = {}
let calls: { table: string; op: string; args: any[] }[] = []

const upsertsTo = (table: string) => calls.filter((call) => call.table === table && call.op === 'upsert')

beforeEach(() => {
  jest.clearAllMocks()
  calls = []
  for (const key of Object.keys(stored)) delete stored[key]
  ;(supabase.from as jest.Mock).mockImplementation((table: string) => {
    const builder: any = {}
    for (const op of ['select', 'eq', 'gt', 'in', 'not', 'upsert', 'delete']) {
      builder[op] = (...args: any[]) => { calls.push({ table, op, args }); return builder }
    }
    const rows = () => stored[table] ?? []
    builder.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
    builder.then = (resolve: any, reject: any) =>
      Promise.resolve({ data: rows(), error: null }).then(resolve, reject)
    return builder
  })
})

const emptyPayload = {
  tasks: [], habitProgress: [], calorieEntries: [], calorieItems: [],
  weightEntries: [], workoutSessions: [], workoutPlans: [],
  workoutExerciseItems: [], achievementDefinitions: [], achievementEntries: [],
  settings: null,
}

const push = (changed: Record<string, any>, since: string | null = null) =>
  Sync.exchange('user-1', { since, changed: { ...emptyPayload, ...changed } } as never)

const AT = '2026-08-23T10:00:00.000Z'

describe('accepting what a device sent', () => {
  it('upserts on the id the device chose, so a replay is not a second row', async () => {
    await push({ tasks: [{ id: 'chosen-by-the-device', title: 'A task', updated_at: AT }] })

    const [rows, options] = upsertsTo('tasks')[0].args
    expect(rows[0].id).toBe('chosen-by-the-device')
    expect(options).toEqual({ onConflict: 'id' })
  })

  it('stamps the caller as the owner, whatever the device claimed', async () => {
    await push({ tasks: [{ id: 'a', user_id: 'somebody-else', updated_at: AT }] })

    expect(upsertsTo('tasks')[0].args[0][0].user_id).toBe('user-1')
  })

  it('refuses a row from a clock that is far ahead, writing nothing', async () => {
    const ahead = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    await expect(push({ tasks: [{ id: 'a', updated_at: ahead }] })).rejects.toThrow(SyncClockError)

    expect(calls.filter((call) => call.op === 'upsert')).toHaveLength(0)
  })

  it('refuses settings from a clock that is far ahead too', async () => {
    const ahead = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    await expect(push({ settings: { weekStartsOn: 1, updated_at: ahead } }))
      .rejects.toThrow(SyncClockError)
  })

  it('answers with the server’s clock, never the device’s', async () => {
    // A device clock decides which of two edits was later. It must never decide
    // what has already been seen, or a skewed one misses rows forever.
    const before = Date.now()
    const response = await push({}, '2019-01-01T00:00:00.000Z')

    expect(Date.parse(response.syncedAt)).toBeGreaterThanOrEqual(before)
  })

  it('does not let an older device row overwrite a newer server row', async () => {
    stored.tasks = [{
      id: 'same-task', user_id: 'user-1', title: 'Newer server copy',
      updated_at: '2026-08-23T11:00:00.000Z',
    }]

    await push({ tasks: [{
      id: 'same-task', user_id: 'user-1', title: 'Older device copy',
      updated_at: '2026-08-23T10:00:00.000Z',
    }] }, '2026-08-23T09:00:00.000Z')

    expect(upsertsTo('tasks')).toHaveLength(0)
  })

  it('refuses an id already owned by another account', async () => {
    stored.tasks = [{
      id: 'somebody-elses-task', user_id: 'user-2', title: 'Private',
      updated_at: '2026-08-23T10:00:00.000Z',
    }]

    await expect(push({ tasks: [{
      id: 'somebody-elses-task', title: 'Taken over', updated_at: AT,
    }] })).rejects.toThrow(SyncOwnershipError)

    expect(upsertsTo('tasks')).toHaveLength(0)
  })
})

describe('a record whose natural key is the identity', () => {
  // Two devices that each log today's weight while apart produce two ids for one
  // row. Upserting those on the id violates UNIQUE (user_id, date) and fails the
  // whole exchange, so the conflict target is the key Postgres actually enforces.
  it('collapses a weight on the date, not the id', async () => {
    await push({ weightEntries: [{ id: 'device-id', date: '2026-08-23', weightKg: 80, updatedAt: AT }] })

    expect(upsertsTo('weight_entries')[0].args[1]).toEqual({ onConflict: 'user_id,date' })
  })

  it('collapses an Achievement entry on its Achievement and date', async () => {
    await push({ achievementEntries: [{ id: 'a', achievementId: 'ach-1', date: '2026-08-23', value: 5, updatedAt: AT }] })

    expect(upsertsTo('achievement_entries')[0].args[1])
      .toEqual({ onConflict: 'user_id,achievement_id,date' })
  })

  it('collapses food history on the name and quantity it is indexed by', async () => {
    await push({ calorieItems: [{ id: 'a', name: 'Eggs', normalizedName: 'eggs', normalizedQuantity: '2 eggs', calories: 140, updatedAt: AT }] })

    expect(upsertsTo('calorie_items')[0].args[1])
      .toEqual({ onConflict: 'user_id,normalized_name,normalized_quantity' })
  })

  it('collapses exercise history on the name it is indexed by', async () => {
    await push({ workoutExerciseItems: [{ id: 'a', name: 'Squat', normalizedName: 'squat', updatedAt: AT }] })

    expect(upsertsTo('workout_exercise_items')[0].args[1])
      .toEqual({ onConflict: 'user_id,normalized_name' })
  })
})

describe('health crossing into the relational schema', () => {
  it('writes the device’s client shape as columns the table has', async () => {
    await push({ weightEntries: [{ id: 'w', userId: 'user-1', date: '2026-08-23', weightKg: 80.5, createdAt: AT, updatedAt: AT }] })

    expect(upsertsTo('weight_entries')[0].args[0][0]).toEqual({
      id: 'w', user_id: 'user-1', date: '2026-08-23', weight_kg: 80.5,
      created_at: AT, updated_at: AT, deleted_at: null,
    })
  })

  it('carries a deletion, so it does not come back on the next pull', async () => {
    await push({ calorieEntries: [{ id: 'c', date: '2026-08-23', name: 'Porridge', calories: 300, updatedAt: AT, deletedAt: AT }] })

    expect(upsertsTo('calorie_entries')[0].args[0][0].deleted_at).toBe(AT)
  })

  it('splits a session into its row and the exercises the server keeps separately', async () => {
    await push({
      workoutSessions: [{
        id: 'session-1', userId: 'user-1', date: '2026-08-23', title: 'Legs', notes: null,
        exercises: [{ id: 'ex-1', sessionId: 'session-1', name: 'Squat', sets: 5, reps: 5, weightKg: 100, position: 0 }],
        createdAt: AT, updatedAt: AT,
      }],
    })

    expect(upsertsTo('workout_sessions')[0].args[0][0].title).toBe('Legs')
    const child = upsertsTo('workout_session_exercises')[0].args[0][0]
    expect(child).toMatchObject({ id: 'ex-1', session_id: 'session-1', name: 'Squat', weight_kg: 100 })
  })

  it('removes an exercise the session no longer carries', async () => {
    // Exercises have no identity of their own on the device — they live inside
    // the session — so the server's copy is replaced rather than merged.
    await push({
      workoutSessions: [{
        id: 'session-1', date: '2026-08-23', exercises: [{ id: 'kept', name: 'Squat', position: 0 }],
        updatedAt: AT,
      }],
    })

    const removal = calls.filter((call) => call.table === 'workout_session_exercises' && call.op === 'not')
    expect(removal[0].args).toEqual(['id', 'in', '(kept)'])
  })

  it('clears every exercise when the last one is removed', async () => {
    await push({ workoutSessions: [{ id: 'session-1', date: '2026-08-23', exercises: [], updatedAt: AT }] })

    expect(calls.some((call) => call.table === 'workout_session_exercises' && call.op === 'delete')).toBe(true)
    expect(calls.some((call) => call.table === 'workout_session_exercises' && call.op === 'not')).toBe(false)
  })
})

describe('settings, which are one record rather than rows', () => {
  it('writes the patch into the JSONB column instead of as columns', async () => {
    await push({ settings: { weekStartsOn: 1, showNutrition: true, updated_at: AT } })

    const [row, options] = upsertsTo('user_settings')[0].args
    expect(row.settings).toEqual({ weekStartsOn: 1, showNutrition: true })
    expect(row.user_id).toBe('user-1')
    expect(options).toEqual({ onConflict: 'user_id' })
  })

  it('sends the stored patch back down, not the row wrapping it', async () => {
    stored.user_settings = [{ user_id: 'user-1', settings: { weekStartsOn: 1 }, updated_at: AT }]

    const response = await push({})

    expect(response.changed.settings).toEqual({ weekStartsOn: 1, updated_at: AT })
  })

  it('sends nothing when settings have not moved', async () => {
    const response = await push({})

    expect(response.changed.settings).toBeNull()
  })

  it('does not let older device settings overwrite newer server settings', async () => {
    stored.user_settings = [{
      user_id: 'user-1', settings: { weekStartsOn: 1 },
      updated_at: '2026-08-23T11:00:00.000Z',
    }]

    await push({
      settings: { weekStartsOn: 0, updated_at: '2026-08-23T10:00:00.000Z' },
    }, '2026-08-23T09:00:00.000Z')

    expect(upsertsTo('user_settings')).toHaveLength(0)
  })
})

describe('what the server sends back', () => {
  it('gives health to the device in the shape the device stores', async () => {
    stored.weight_entries = [{
      id: 'srv-w', user_id: 'user-1', date: '2026-08-23', weight_kg: 79,
      created_at: AT, updated_at: AT, deleted_at: null,
    }]

    const response = await push({})

    expect(response.changed.weightEntries[0]).toEqual({
      id: 'srv-w', userId: 'user-1', date: '2026-08-23', weightKg: 79,
      createdAt: AT, updatedAt: AT,
    })
  })

  it('rebuilds a session with its exercises inside it', async () => {
    stored.workout_sessions = [{
      id: 'srv-s', user_id: 'user-1', date: '2026-08-23', title: 'Legs', notes: null,
      created_at: AT, updated_at: AT, deleted_at: null,
    }]
    stored.workout_session_exercises = [{
      id: 'srv-ex', session_id: 'srv-s', name: 'Squat', sets: 5, reps: 5,
      weight_kg: 100, duration_minutes: null, distance_km: null, notes: null, position: 0,
    }]

    const response = await push({})

    expect((response.changed.workoutSessions[0] as any).exercises[0].name).toBe('Squat')
  })

  it('sends a server-side deletion down as a marked record, not an absent one', async () => {
    stored.calorie_entries = [{
      id: 'srv-c', user_id: 'user-1', date: '2026-08-23', name: 'Porridge', calories: 300,
      created_at: AT, updated_at: AT, deleted_at: AT,
    }]

    const response = await push({})

    expect((response.changed.calorieEntries[0] as any).deletedAt).toBe(AT)
  })

  it('reads what the server held, before this device’s own rows land on it', async () => {
    stored.tasks = [{ id: 'srv-task', user_id: 'user-1', title: 'From the server', updated_at: AT }]

    const response = await push({ tasks: [{ id: 'device-task', title: 'From here', updated_at: AT }] })

    expect(response.changed.tasks.map((row: any) => row.id)).toEqual(['srv-task'])
  })
})
