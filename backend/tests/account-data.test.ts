const taskRows = Array.from({ length: 501 }, (_, index) => ({ id: `task-${index}`, user_id: 'user-1', title: `Task ${index}`, deleted_at: index === 0 ? '2026-01-01T00:00:00Z' : null }))
const tables: Record<string, Array<Record<string, unknown>>> = {
  users: [{ id: 'user-1', email: 'user@example.com', name: 'User', role: 'user', created_at: '2026-01-01T00:00:00Z', password_hash: 'secret' }],
  tasks: taskRows,
  workout_plans: [{ id: 'plan-1', user_id: 'user-1', name: 'Plan' }],
  workout_plan_items: [{ id: 'plan-item-1', plan_id: 'plan-1', name: 'Squat' }],
  workout_sessions: [{ id: 'session-1', user_id: 'user-1', date: '2026-01-02' }],
  workout_session_exercises: [{ id: 'session-item-1', session_id: 'session-1', name: 'Run' }],
  calendar_connections: [{ id: 'connection-1', user_id: 'user-1', provider: 'google', provider_account_email: 'user@gmail.com', refresh_token_encrypted: 'secret' }],
  external_calendar_events: [{ id: 'event-1', user_id: 'user-1', title: 'Event', raw: { secret: true } }],
  api_tokens: [{ id: 'token-1', user_id: 'user-1', name: 'MCP', scopes: ['hf:read'], token_hash: 'secret' }],
}

const selectCalls: Array<{ table: string; columns: string }> = []

function makeBuilder(table: string) {
  let columns = '*'
  let from = 0
  let to = Number.MAX_SAFE_INTEGER
  let parentFilter: { column: string; ids: string[] } | null = null
  const builder: any = {
    select(nextColumns: string) { columns = nextColumns; selectCalls.push({ table, columns }); return builder },
    eq() { return builder },
    in(column: string, ids: string[]) { parentFilter = { column, ids }; return builder },
    range(nextFrom: number, nextTo: number) { from = nextFrom; to = nextTo; return builder },
    single() { return Promise.resolve(result(true)) },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(result(false)).then(resolve) },
  }
  const result = (single: boolean) => {
    let rows = [...(tables[table] ?? [])]
    if (parentFilter) rows = rows.filter((row) => parentFilter!.ids.includes(String(row[parentFilter!.column])))
    rows = rows.slice(from, to + 1)
    const selected = rows.map((row) => {
      if (columns === '*') return row
      const names = columns.split(',').map((name) => name.trim())
      return Object.fromEntries(names.filter((name) => name in row).map((name) => [name, row[name]]))
    })
    return { data: single ? selected[0] : selected, error: null }
  }
  return builder
}

jest.mock('../src/supabase-client', () => ({
  supabase: { from: (table: string) => makeBuilder(table) },
}))

import { AccountExportV1Schema, buildAccountExport } from '../src/account-data'

beforeEach(() => selectCalls.splice(0))

test('builds a schema-valid, paginated archive with soft-deleted Items and batched children', async () => {
  const archive = await buildAccountExport('user-1')
  expect(AccountExportV1Schema.safeParse(archive).success).toBe(true)
  expect(archive.items).toHaveLength(501)
  expect(archive.items[0].deleted_at).toBeTruthy()
  expect(archive.health.workoutPlanItems).toEqual([{ id: 'plan-item-1', plan_id: 'plan-1', name: 'Squat' }])
  expect(archive.health.workoutSessionExercises).toEqual([{ id: 'session-item-1', session_id: 'session-1', name: 'Run' }])
})

test('redacts credentials, token hashes, and opaque calendar raw data through explicit projections', async () => {
  const archive = await buildAccountExport('user-1')
  const json = JSON.stringify(archive)
  expect(json).not.toContain('password_hash')
  expect(json).not.toContain('refresh_token_encrypted')
  expect(json).not.toContain('token_hash')
  expect(json).not.toContain('"raw"')
  expect(selectCalls.find((call) => call.table === 'calendar_connections')?.columns).not.toContain('token_encrypted')
  expect(selectCalls.find((call) => call.table === 'api_tokens')?.columns).not.toContain('token_hash')
})
