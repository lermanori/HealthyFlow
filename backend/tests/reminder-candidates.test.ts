/**
 * The reminder query has to stay bounded without narrowing what can fire.
 *
 * SmartReminders polls once a minute per open tab and used to pull every Item
 * an account had ever created. It cannot simply be scoped to today: the overdue
 * branch deliberately matches earlier days (issue #20), so an item left behind
 * on a previous day must still come back until it has actually been notified.
 *
 * Driven against the REAL db.getReminderCandidates through an in-memory fake of
 * the supabase query builder, so the filter terms themselves are under test —
 * including SQL NULL semantics for the legacy rows that predate the columns.
 */

let mockRows: any[] = []
let lastSelect = ''

jest.mock('@supabase/supabase-js', () => {
  // Evaluate one PostgREST filter term, e.g. "overdue_notified.is.null".
  function matchesTerm(row: any, term: string): boolean {
    const [col, op, ...rest] = term.split('.')
    const raw = rest.join('.')
    const value = row[col] ?? null
    if (op === 'is') return raw === 'null' ? value === null : value === (raw === 'true')
    if (op === 'eq') return value !== null && String(value) === raw
    throw new Error(`fake builder does not implement or-term operator: ${op}`)
  }

  function makeBuilder() {
    let rows = [...mockRows]
    const builder: any = {
      select: (cols: string) => { lastSelect = cols; return builder },
      eq: (col: string, val: any) => { rows = rows.filter(r => r[col] === val); return builder },
      is: (col: string, val: any) => { rows = rows.filter(r => (r[col] ?? null) === val); return builder },
      // `.not(col, 'is', x)` negates an IS test, so NULL survives `not.is.true`.
      not: (col: string, op: string, val: any) => {
        if (op !== 'is') throw new Error(`fake builder does not implement not.${op}`)
        rows = rows.filter(r => (r[col] ?? null) !== val)
        return builder
      },
      // SQL: NULL <= 'value' is NULL, so undated rows drop out.
      lte: (col: string, val: any) => {
        rows = rows.filter(r => (r[col] ?? null) !== null && r[col] <= val)
        return builder
      },
      or: (terms: string) => {
        const parts = terms.split(',')
        rows = rows.filter(r => parts.some(term => matchesTerm(r, term)))
        return builder
      },
      order: (col: string, opts: { ascending?: boolean } = {}) => {
        const asc = opts.ascending !== false
        rows = [...rows].sort((a, b) => {
          const av = a[col] ?? '', bv = b[col] ?? ''
          if (av < bv) return asc ? -1 : 1
          if (av > bv) return asc ? 1 : -1
          return 0
        })
        return builder
      },
      then: (resolve: any) => resolve({ data: rows, error: null }),
    }
    return builder
  }
  return { createClient: () => ({ from: () => makeBuilder() }) }
})

import { db } from '../src/supabase-client'

const USER = 'user-1'
const TODAY = '2026-08-17'
const YESTERDAY = '2026-08-16'
const LAST_YEAR = '2025-08-17'
const TOMORROW = '2026-08-18'

function row(over: any = {}) {
  return {
    id: 'task-1',
    user_id: USER,
    title: 'Standup',
    start_time: '09:00',
    completed: false,
    scheduled_date: TODAY,
    overdue_notified: false,
    deleted_at: null,
    ...over,
  }
}

beforeEach(() => {
  mockRows = []
  lastSelect = ''
})

describe('db.getReminderCandidates', () => {
  it('returns the never-notified overdue item from a previous day', async () => {
    mockRows = [row({ id: 'yesterday', scheduled_date: YESTERDAY })]

    const items = await db.getReminderCandidates(USER, TODAY)

    expect(items.map((i: any) => i.id)).toEqual(['yesterday'])
  })

  it('keeps a never-notified overdue item however old it is', async () => {
    mockRows = [row({ id: 'ancient', scheduled_date: LAST_YEAR })]

    const items = await db.getReminderCandidates(USER, TODAY)

    expect(items.map((i: any) => i.id)).toEqual(['ancient'])
  })

  it("keeps today's items even after they have been notified, for the upcoming branch", async () => {
    mockRows = [row({ id: 'today', scheduled_date: TODAY, overdue_notified: true })]

    const items = await db.getReminderCandidates(USER, TODAY)

    expect(items.map((i: any) => i.id)).toEqual(['today'])
  })

  it('drops the accumulated history of already-notified past items', async () => {
    mockRows = [
      row({ id: 'notified-old', scheduled_date: YESTERDAY, overdue_notified: true }),
      row({ id: 'notified-ancient', scheduled_date: LAST_YEAR, overdue_notified: true }),
      row({ id: 'live', scheduled_date: YESTERDAY, overdue_notified: false }),
    ]

    const items = await db.getReminderCandidates(USER, TODAY)

    expect(items.map((i: any) => i.id)).toEqual(['live'])
  })

  it('drops completed, untimed, undated and future items', async () => {
    mockRows = [
      row({ id: 'done', completed: true }),
      row({ id: 'untimed', start_time: null }),
      row({ id: 'backlog', scheduled_date: null }),
      row({ id: 'future', scheduled_date: TOMORROW }),
      row({ id: 'keep' }),
    ]

    const items = await db.getReminderCandidates(USER, TODAY)

    expect(items.map((i: any) => i.id)).toEqual(['keep'])
  })

  // Both columns were added by migration, so older rows can hold NULL. The
  // client reads them through Boolean(), i.e. NULL means "not done" and "not
  // yet notified" — the filter has to agree or those reminders vanish.
  it('treats NULL completed and NULL overdue_notified as not-done and not-notified', async () => {
    mockRows = [
      row({ id: 'legacy', scheduled_date: YESTERDAY, completed: null, overdue_notified: null }),
    ]

    const items = await db.getReminderCandidates(USER, TODAY)

    expect(items.map((i: any) => i.id)).toEqual(['legacy'])
  })

  it('never crosses the owner or soft-delete boundary', async () => {
    mockRows = [
      row({ id: 'other-user', user_id: 'user-2' }),
      row({ id: 'deleted', deleted_at: '2026-08-01T00:00:00Z' }),
      row({ id: 'mine' }),
    ]

    const items = await db.getReminderCandidates(USER, TODAY)

    expect(items.map((i: any) => i.id)).toEqual(['mine'])
  })

  it('selects only the columns a reminder is decided from', async () => {
    mockRows = [row()]

    await db.getReminderCandidates(USER, TODAY)

    expect(lastSelect.split(',').map(c => c.trim()).sort()).toEqual([
      'completed',
      'id',
      'overdue_notified',
      'scheduled_date',
      'start_time',
      'title',
    ])
  })
})
