// Every Guest install creates a users row, so Admin's reads must stay complete
// past the API's row limit and must never put every user id into one URL (#303).
// The fake below behaves like PostgREST: no response carries more than 1,000
// rows, and an `in` filter longer than 100 ids is treated as an overlong URL.

process.env.ADMIN_PAGE_SIZE = '100'

const MAX_ROWS = 1000
const tables: Record<string, Array<Record<string, unknown>>> = {}
const inFilterSizes: number[] = []

function builder(table: string) {
  let rows = [...(tables[table] ?? [])]
  let range: [number, number] | null = null
  let single = false
  const api: any = {
    select: () => api,
    order: (column: string, options?: { ascending?: boolean }) => {
      const dir = options?.ascending === false ? -1 : 1
      rows.sort((a, b) => (String(a[column]) < String(b[column]) ? -dir : String(a[column]) > String(b[column]) ? dir : 0))
      return api
    },
    in: (column: string, values: string[]) => {
      inFilterSizes.push(values.length)
      if (values.length > 100) throw new Error('414 URI Too Long')
      rows = rows.filter(row => values.includes(String(row[column])))
      return api
    },
    eq: (column: string, value: unknown) => {
      rows = rows.filter(row => row[column] === value)
      return api
    },
    limit: (n: number) => { rows = rows.slice(0, n); return api },
    range: (from: number, to: number) => { range = [from, to]; return api },
    single: () => { single = true; return api },
    then: (resolve: (value: unknown) => void) => {
      if (single) return resolve({ data: rows[0] ?? null, error: rows[0] ? null : { code: 'PGRST116' } })
      const [from, to] = range ?? [0, rows.length - 1]
      resolve({ data: rows.slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null })
    },
  }
  return api
}

jest.mock('../../src/supabase-client', () => {
  const actual = jest.requireActual('../../src/supabase-client')
  return {
    ...actual,
    supabase: { from: (table: string) => builder(table) },
    db: {
      ...actual.db,
      // Chunked inside the real function; see free-grants-chunking.test.ts.
      adminFreeCreditGrants: jest.fn(async (ids: string[]) =>
        new Map(ids.map(id => [id, { state: 'available', credits: 15, kind: 'monthly' }]))),
    },
  }
})

import { listManagedUsers } from '../../src/account-data'
import { db } from '../../src/supabase-client'

const USERS = 2500
beforeAll(() => {
  const pad = (n: number) => String(n).padStart(12, '0')
  tables.users = [
    { id: `00000000-0000-0000-0000-${pad(0)}`, email: 'admin@example.com', name: 'Admin', role: 'admin', signup_method: 'password', created_at: '2026-01-01T00:00:00.000Z', last_login_at: null, disabled_at: null, is_test: false, email_verified_at: '2026-01-01T00:00:00.000Z' },
    ...Array.from({ length: USERS - 1 }, (_, i) => ({
      id: `00000000-0000-0000-0000-${pad(i + 1)}`, email: null, name: 'Guest', role: 'user', signup_method: 'guest',
      created_at: new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString(),
      last_login_at: null, disabled_at: null, is_test: false, email_verified_at: null,
    })),
  ]
  tables.user_credits = tables.users.map((user, i) => ({ user_id: user.id, balance: i % 7 }))
  tables.user_credit_subscriptions = [{ user_id: tables.users[USERS - 1].id, active: true }]
})

describe('People past the row limit', () => {
  it('lists every account with its own balance and Cloud state', async () => {
    const people = await listManagedUsers(String(tables.users[0].id))

    expect(people).toHaveLength(USERS)
    const last = tables.users[USERS - 1]
    const listedLast = people.find(person => person.id === last.id)!
    expect(listedLast.balance).toBe((USERS - 1) % 7)
    expect(listedLast.subscriptionActive).toBe(true)
  })

  it('never sends a long id list in a URL, and asks for every account’s allowance', async () => {
    await listManagedUsers(String(tables.users[0].id))

    expect(Math.max(0, ...inFilterSizes)).toBeLessThanOrEqual(100)
    const asked = (db.adminFreeCreditGrants as jest.Mock).mock.calls.at(-1)![0] as string[]
    expect(asked).toHaveLength(USERS)
  })
})
