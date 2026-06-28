/**
 * Critical test for ADR-0002 — the one rule for untimed tasks.
 *
 * (a) an incomplete untimed task dated YESTERDAY appears for today
 * (b) a FUTURE-dated untimed task does NOT appear today
 * (c) editing the title of a carried task does NOT change its scheduled_date
 *
 * (a)/(b) exercise Rollover.listForDay against an in-memory fake of the supabase
 * query builder (real rows, real ids — no synthetic `rollover-` id, no override).
 * (c) exercises PUT /tasks/:id with the db layer mocked.
 */

import request from 'supertest'
import jwt from 'jsonwebtoken'

// In-memory table the fake `supabase` reads. Prefixed `mock*` so jest's factory
// hoisting allows referencing it. Tests reassign it per case.
let mockRows: any[] = []

jest.mock('../src/supabase-client', () => {
  // Minimal chainable builder that actually applies the predicates listForDay uses,
  // so (a)/(b) are real behaviour assertions rather than call-shape checks.
  function makeBuilder() {
    let result = [...mockRows]
    const builder: any = {
      select: () => builder,
      eq: (col: string, val: any) => {
        result = result.filter(r => r[col] === val)
        return builder
      },
      is: (col: string, val: any) => {
        result = result.filter(r => (r[col] ?? null) === val)
        return builder
      },
      or: (expr: string) => {
        const clauses = expr.split(',')
        result = result.filter(r =>
          clauses.some(c => {
            const [col, op, val] = c.split('.')
            const cell = r[col] ?? null
            if (op === 'is' && val === 'null') return cell === null
            if (op === 'lt') return cell !== null && cell < val
            if (op === 'lte') return cell !== null && cell <= val
            return false
          })
        )
        return builder
      },
      filter: (col: string, op: string, val: string) => {
        result = result.filter(r => {
          const cell = r[col] ?? null
          if (cell === null) return false
          if (op === 'gte') return cell >= val
          if (op === 'lt') return cell < val
          return true
        })
        return builder
      },
      order: () => builder,
      then: (resolve: any) => resolve({ data: result, error: null }),
    }
    return builder
  }

  return {
    supabase: { from: () => makeBuilder() },
    db: {
      // methods PUT /tasks/:id touches
      getTaskById: jest.fn(),
      updateTask: jest.fn(),
      createHabitInstance: jest.fn(),
      getNextPosition: jest.fn(),
      createTask: jest.fn(),
      // present so other route imports don't explode
      getUserByEmail: jest.fn(),
      createUser: jest.fn(),
    },
  }
})

import { Rollover } from '../src/rollover'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

const mockDb = db as jest.Mocked<typeof db>

const USER = 'user-aaa'
const TODAY = '2026-06-22'
const YESTERDAY = '2026-06-21'
const TOMORROW = '2026-06-23'

const base = {
  user_id: USER,
  type: 'task',
  start_time: null,
  rolled_over_from_task_id: null,
  completed: false,
  completed_at: null,
  created_at: '2026-06-01T00:00:00.000Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRows = []
})

describe('Rollover.listForDay — the one rule (ADR-0002)', () => {
  it('(a) an incomplete untimed task dated yesterday appears for today', async () => {
    mockRows = [{ ...base, id: 'y', title: 'left from yesterday', scheduled_date: YESTERDAY }]

    const rows = await Rollover.listForDay(USER, TODAY)

    expect(rows.map(r => r.id)).toContain('y')
    // Real row, unchanged: real id (no `rollover-` prefix), true date preserved.
    const row = rows.find(r => r.id === 'y')
    expect(row.scheduled_date).toBe(YESTERDAY)
    expect(row.id).not.toMatch(/^rollover-/)
  })

  it('someday (no date) incomplete task appears for today', async () => {
    mockRows = [{ ...base, id: 's', title: 'someday', scheduled_date: null }]
    const rows = await Rollover.listForDay(USER, TODAY)
    expect(rows.map(r => r.id)).toEqual(['s'])
    expect(rows[0].scheduled_date).toBeNull()
  })

  it('(b) a future-dated untimed task does NOT appear today', async () => {
    mockRows = [{ ...base, id: 'f', title: 'future', scheduled_date: TOMORROW }]
    const rows = await Rollover.listForDay(USER, TODAY)
    expect(rows.map(r => r.id)).not.toContain('f')
  })

  it('a task dated exactly today is NOT returned (regularTasks owns =date — disjoint)', async () => {
    mockRows = [{ ...base, id: 't', title: 'today', scheduled_date: TODAY }]
    const rows = await Rollover.listForDay(USER, TODAY)
    expect(rows.map(r => r.id)).not.toContain('t')
  })

  it('a carried task completed today still shows (struck through) on the day completed', async () => {
    mockRows = [
      {
        ...base,
        id: 'c',
        title: 'done today',
        scheduled_date: YESTERDAY,
        completed: true,
        completed_at: `${TODAY}T10:00:00.000Z`,
      },
    ]
    const rows = await Rollover.listForDay(USER, TODAY)
    expect(rows.map(r => r.id)).toContain('c')
    expect(rows.find(r => r.id === 'c').scheduled_date).toBe(YESTERDAY)
  })

  it('adds carry-forward rows to dated rows and returns timeline order', async () => {
    mockRows = [{ ...base, id: 'carry', title: 'left from yesterday', scheduled_date: YESTERDAY }]
    const rows = await Rollover.addCarryForwardRows(USER, TODAY, [
      { ...base, id: 'dated', title: 'today at nine', scheduled_date: TODAY, start_time: '09:00' },
    ])

    expect(rows.map(r => r.id)).toEqual(['dated', 'carry'])
  })
})

describe('PUT /tasks/:id — editing a carried task (P1)', () => {
  const makeToken = (userId: string) => `Bearer ${jwt.sign({ userId }, process.env.JWT_SECRET!)}`

  it('(c) editing the title of a carried task does NOT change its scheduled_date', async () => {
    const realId = 'ffffffff-1111-2222-3333-444444444444'
    mockDb.getTaskById.mockResolvedValue({ id: realId, user_id: USER, type: 'task', scheduled_date: YESTERDAY })
    mockDb.updateTask.mockResolvedValue({ id: realId, title: 'renamed', scheduled_date: YESTERDAY })

    const res = await request(app)
      .put(`/api/tasks/${realId}`)
      .set('Authorization', makeToken(USER))
      .send({ title: 'renamed' })

    expect(res.status).toBe(200)
    expect(mockDb.updateTask).toHaveBeenCalledTimes(1)
    const [, updateData] = mockDb.updateTask.mock.calls[0]
    expect(updateData).toEqual({ title: 'renamed' })
    expect('scheduled_date' in updateData).toBe(false)
  })
})
