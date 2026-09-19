import fs from 'fs'
import path from 'path'
import jwt from 'jsonwebtoken'
import request from 'supertest'

// Spend (#305) is built on recorded cost and counted in actions: each period is
// one database aggregate, periods start at UTC boundaries (a week from its own
// Monday, even when that Monday is last month), and test accounts are left out
// unless asked for.

jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    adminSpendSummary: jest.fn(),
  },
}))

import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { spendPeriodStarts } from '../../src/credits'

const mockDb = db as jest.Mocked<typeof db>
const ADMIN = `Bearer ${jwt.sign({ userId: 'admin-1' }, process.env.JWT_SECRET!)}`

const summary = {
  costUsd: 1.25,
  requests: 40,
  uncostedCalls: 2,
  actions: {
    text: { count: 30, credits: 30 },
    photo: { count: 2, credits: 10 },
    premium: { count: 1, credits: 10 },
  },
  refundedAttempts: 3,
  freeGranted: { guest: 20, monthly: 45 },
  adminChanges: { count: 1, net: -5 },
  legacyUnitRows: 0,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserById.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'admin' } as never)
  mockDb.adminSpendSummary.mockResolvedValue(summary)
})

describe('spend periods', () => {
  it('starts a week on its own Monday, even when that Monday is last month', () => {
    // Thursday 1 October 2026, 12:00 UTC.
    const starts = spendPeriodStarts(new Date('2026-10-01T12:00:00.000Z'))
    expect(starts).toEqual({
      today: '2026-10-01T00:00:00.000Z',
      thisWeek: '2026-09-28T00:00:00.000Z',
      thisMonth: '2026-10-01T00:00:00.000Z',
    })
  })

  it('counts in UTC whatever the server timezone', () => {
    const tz = process.env.TZ
    process.env.TZ = 'Asia/Jerusalem'
    try {
      // 01:30 on Monday the 21st in Jerusalem is still Sunday the 20th in UTC.
      expect(spendPeriodStarts(new Date('2026-09-20T22:30:00.000Z'))).toEqual({
        today: '2026-09-20T00:00:00.000Z',
        thisWeek: '2026-09-14T00:00:00.000Z',
        thisMonth: '2026-09-01T00:00:00.000Z',
      })
    } finally {
      process.env.TZ = tz
    }
  })
})

describe('GET /api/admin/spend', () => {
  it('returns one aggregate per period and leaves test accounts out by default', async () => {
    const res = await request(app).get('/api/admin/spend').set('Authorization', ADMIN)

    expect(res.status).toBe(200)
    expect(res.body.thisMonth).toEqual(summary)
    expect(Object.keys(res.body).sort()).toEqual(['thisMonth', 'thisWeek', 'today'])
    expect(mockDb.adminSpendSummary).toHaveBeenCalledTimes(3)
    for (const call of mockDb.adminSpendSummary.mock.calls) expect(call[1]).toBe(false)
  })

  it('includes test accounts when asked', async () => {
    await request(app).get('/api/admin/spend?includeTest=true').set('Authorization', ADMIN)

    for (const call of mockDb.adminSpendSummary.mock.calls) expect(call[1]).toBe(true)
  })

  it('a failed aggregate is an error, never a row of zeros', async () => {
    mockDb.adminSpendSummary.mockRejectedValue(new Error('connection reset'))

    const res = await request(app).get('/api/admin/spend').set('Authorization', ADMIN)

    expect(res.status).toBe(500)
  })
})

describe('the spend migration', () => {
  const dir = path.join(__dirname, '../../../supabase/migrations')
  const sql = fs.readdirSync(dir)
    .filter(name => name.endsWith('_admin_spend_summary.sql'))
    .map(name => fs.readFileSync(path.join(dir, name), 'utf8'))
    .join('\n')

  it('sums recorded cost and never counts an admin change as spending', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION admin_spend_summary\(p_since TIMESTAMPTZ, p_include_test BOOLEAN\)/)
    expect(sql).toMatch(/SUM\(cost_usd\)/)
    expect(sql).toMatch(/action_class = 'text' AND credits_delta < 0/)
    expect(sql).toMatch(/reason = 'admin_balance_set'/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION admin_spend_summary\(TIMESTAMPTZ, BOOLEAN\) TO service_role/)
  })
})
