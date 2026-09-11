/**
 * Does a deletion made on the device actually reach the database?
 *
 * `endpoint.test.ts` mocks `Sync.exchange` wholesale, so the real accept path has
 * never been exercised — which is why a tombstone could stop landing without a
 * test noticing. This drives the real `exchange` against an in-memory table.
 */
import { supabase } from '../../src/supabase-client'

jest.mock('../../src/supabase-client', () => ({
  supabase: { from: jest.fn() },
  db: {},
}))

const USER = 'user-1'

/** Rows as Postgres would hold them, keyed by table. */
let tables: Record<string, Record<string, any>[]>

function query(table: string) {
  let rows = () => tables[table] ?? []
  const builder: any = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      const previous = rows
      rows = () => previous().filter((row) => row[column] === value)
      return builder
    },
    gt: (column: string, value: unknown) => {
      const previous = rows
      rows = () => previous().filter((row) => String(row[column]) > String(value))
      return builder
    },
    in: (column: string, values: unknown[]) => {
      const previous = rows
      rows = () => previous().filter((row) => values.includes(row[column]))
      return Promise.resolve({ data: previous().filter((r) => values.includes(r[column])), error: null })
    },
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    upsert: (incoming: Record<string, any>[]) => {
      tables[table] = tables[table] ?? []
      for (const row of incoming) {
        const at = tables[table].findIndex((existing) => existing.id === row.id)
        if (at >= 0) tables[table][at] = { ...tables[table][at], ...row }
        else tables[table].push({ ...row })
      }
      return Promise.resolve({ error: null })
    },
    delete: () => builder,
    then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
      resolve({ data: rows(), error: null }),
  }
  return builder
}

beforeEach(() => {
  tables = {}
  ;(supabase.from as jest.Mock).mockImplementation((table: string) => query(table))
})

describe('a deletion made on the device', () => {
  it('reaches the database as a tombstone', async () => {
    const { Sync } = await import('../../src/sync')
    const empty = {
      tasks: [], habitProgress: [], goals: [], calorieEntries: [], calorieItems: [],
      weightEntries: [], workoutSessions: [], workoutPlans: [],
      workoutExerciseItems: [], achievementDefinitions: [], achievementEntries: [],
      settings: null,
    }

    const created = {
      id: 'task-1',
      title: 'test event',
      scheduled_date: '2026-09-11',
      start_time: '16:20',
      deleted_at: null,
      created_at: '2026-09-11T09:00:00.000Z',
      updated_at: '2026-09-11T09:00:00.000Z',
    }

    // 1. The device pushes the create.
    const first = await Sync.exchange(USER, { since: null, changed: { ...empty, tasks: [created] } } as never)
    expect(tables.tasks?.[0]?.deleted_at ?? null).toBeNull()

    // 2. The device deletes it and pushes again, with the watermark it was given.
    const deleted = {
      ...created,
      deleted_at: '2026-09-11T09:05:00.000Z',
      updated_at: '2026-09-11T09:05:00.000Z',
    }
    await Sync.exchange(USER, { since: first.syncedAt, changed: { ...empty, tasks: [deleted] } } as never)

    // eslint-disable-next-line no-console
    console.log('stored row after delete:', JSON.stringify(tables.tasks?.[0]))
    expect(tables.tasks?.[0]?.deleted_at).toBe('2026-09-11T09:05:00.000Z')
  })

  // Was `it.failing` while the pull filtered on the device-authored `updated_at`
  // against a server-clock watermark. Now that the server stamps and filters on
  // its own `synced_at`, a row written by one device is always visible to the
  // other regardless of whose clock was where.
  it('hands the tombstone to a second device that pulls afterwards', async () => {
    const { Sync } = await import('../../src/sync')
    const empty = {
      tasks: [], habitProgress: [], goals: [], calorieEntries: [], calorieItems: [],
      weightEntries: [], workoutSessions: [], workoutPlans: [],
      workoutExerciseItems: [], achievementDefinitions: [], achievementEntries: [],
      settings: null,
    }

    // Device A authored the row on ITS clock, well behind the server — but the
    // server stamped `synced_at` when it accepted it.
    tables.tasks = [{
      id: 'task-1', user_id: USER, title: 'test event',
      deleted_at: '2026-09-11T09:05:00.000Z',
      created_at: '2026-09-11T09:00:00.000Z',
      updated_at: '2026-09-11T09:05:00.000Z',
      synced_at: '2026-09-11T09:07:00.000Z',
    }]

    // Device B's watermark is a SERVER-clock reading from its last exchange,
    // taken after device A's write but stamped on a clock running ahead.
    const deviceBWatermark = '2026-09-11T09:06:00.000Z'
    const pulled = await Sync.exchange(USER, { since: deviceBWatermark, changed: empty } as never)

    // eslint-disable-next-line no-console
    console.log('device B pulled tasks:', (pulled.changed.tasks as unknown[]).length)
    expect(pulled.changed.tasks).toHaveLength(1)
  })
})
