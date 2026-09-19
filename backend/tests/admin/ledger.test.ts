import jwt from 'jsonwebtoken'
import request from 'supertest'

// The Ledger (#306) shows every ledger row in signed actions with its recorded
// cost and, for an administrator's change, who made it. Rows written in the
// credit unit before ADR-0016 are marked. It filters by person and kind and
// pages rather than stopping at a fixed count.

jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    adminLedgerRows: jest.fn(),
    getUsersByIds: jest.fn(),
  },
}))

import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { Credits } from '../../src/credits'

const mockDb = db as jest.Mocked<typeof db>
const ADMIN = `Bearer ${jwt.sign({ userId: 'admin-1' }, process.env.JWT_SECRET!)}`

const base = {
  endpoint: null, model: null, action_class: null, cost_usd: null, reason: null,
  balance_after: null, actor_user_id: null, created_at: '2026-09-18T10:00:00.000Z',
}
const rows = [
  { ...base, id: 'r1', user_id: 'guest-1', endpoint: 'parse-tasks', model: 'gpt-4o-mini', action_class: 'text', credits_delta: -1, cost_usd: '0.00031000', balance_after: null },
  { ...base, id: 'r2', user_id: 'guest-1', endpoint: 'parse-meals', model: 'gpt-5.4-mini', action_class: 'photo', credits_delta: 0, cost_usd: null, reason: 'refund_failed_call_cost_unknown' },
  { ...base, id: 'r3', user_id: 'person-1', credits_delta: 15, reason: 'monthly_free_refill', balance_after: 15 },
  { ...base, id: 'r4', user_id: 'person-1', credits_delta: 10, reason: 'admin_balance_set', balance_after: 25, actor_user_id: 'admin-1' },
  { ...base, id: 'r5', user_id: 'person-1', endpoint: 'parse-tasks', model: 'gpt-4o-mini', action_class: null, credits_delta: -6, created_at: '2026-09-01T10:00:00.000Z' },
]

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserById.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'admin' } as never)
  mockDb.adminLedgerRows.mockResolvedValue(rows as never)
  mockDb.getUsersByIds.mockResolvedValue([
    { id: 'guest-1', email: null, name: 'Guest' },
    { id: 'person-1', email: 'person@example.com', name: 'Person' },
    { id: 'admin-1', email: 'admin@example.com', name: 'Admin' },
  ])
})

describe('Credits.getLedger', () => {
  it('says what each row is, in signed actions, with recorded cost and the actor', async () => {
    const ledger = await Credits.getLedger({ kind: 'all', offset: 0, limit: 5 })

    expect(ledger.rows.map(row => [row.kind, row.creditsDelta])).toEqual([
      ['ai', -1], ['refund', 0], ['grant', 15], ['admin', 10], ['ai', -6],
    ])
    expect(ledger.rows[0]).toMatchObject({ costUsd: 0.00031, userEmail: null, userName: 'Guest', legacyUnit: false })
    expect(ledger.rows[1]).toMatchObject({ costUsd: null, costUnknown: true })
    expect(ledger.rows[3]).toMatchObject({ actorEmail: 'admin@example.com', balanceAfter: 25 })
    expect(ledger.rows[4]).toMatchObject({ legacyUnit: true })
  })

  it('offers the next page when this one is full, and none when it is not', async () => {
    expect((await Credits.getLedger({ kind: 'all', offset: 0, limit: 5 })).nextOffset).toBe(5)
    expect((await Credits.getLedger({ kind: 'all', offset: 0, limit: 50 })).nextOffset).toBeNull()
  })
})

describe('GET /api/admin/ledger', () => {
  it('passes the person, kind and page through to the read', async () => {
    const res = await request(app)
      .get('/api/admin/ledger?userId=guest-1&kind=refund&offset=50')
      .set('Authorization', ADMIN)

    expect(res.status).toBe(200)
    expect(mockDb.adminLedgerRows).toHaveBeenCalledWith({ userId: 'guest-1', kind: 'refund', offset: 50, limit: 50 })
  })

  it('refuses a kind it does not know', async () => {
    const res = await request(app).get('/api/admin/ledger?kind=everything').set('Authorization', ADMIN)
    expect(res.status).toBe(400)
  })

  it('a failed read is an error, never an empty ledger', async () => {
    mockDb.adminLedgerRows.mockRejectedValue(new Error('connection reset'))
    const res = await request(app).get('/api/admin/ledger').set('Authorization', ADMIN)
    expect(res.status).toBe(500)
  })
})
