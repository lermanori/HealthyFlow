import fs from 'fs'
import path from 'path'
import jwt from 'jsonwebtoken'
import request from 'supertest'

// The Guards panel (#307) lists every guard with the limit the server actually
// enforces and today's state. Refusals are recorded so they can be counted, in
// their own table: a refusal is never a charge and never counts toward a cap.

jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    sumAiCostUsdSince: jest.fn(),
    countUserActionsSince: jest.fn(),
    recordAiRefusal: jest.fn(),
    adminGuardStatus: jest.fn(),
    insertUsageLog: jest.fn(),
    reserveCredits: jest.fn(),
  },
}))

import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { Credits, MAX_PROMPT_CHARS, MAX_IMAGES_PER_REQUEST, FREE_DAILY_ACTION_CAP, GLOBAL_DAILY_COST_CEILING_USD, GUEST_INITIAL_CREDITS, MONTHLY_FREE_CREDITS, GUEST_GRANT_IP_WINDOW_HOURS, ACTION_PRICE } from '../../src/credits'
import { AUTH_RATE_LIMITS } from '../../src/rate-limits'

const mockDb = db as jest.Mocked<typeof db>
const ADMIN = `Bearer ${jwt.sign({ userId: 'admin-1' }, process.env.JWT_SECRET!)}`
const input = { endpoint: 'parse-tasks', model: 'gpt-4o-mini', userPrompt: 'plan my day' }

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserById.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'admin' } as never)
  mockDb.recordAiRefusal.mockResolvedValue(undefined)
  mockDb.sumAiCostUsdSince.mockResolvedValue(3.5)
  mockDb.adminGuardStatus.mockResolvedValue({
    refusals: { global_ceiling: 2, insufficient_credits: 7 },
    nearCap: [{ userId: 'user-9', email: 'busy@example.com', actions: 180 }],
    guestsWithoutGrant: 4,
  })
})

describe('recording refusals', () => {
  it('records a refused action by its code, and never charges or counts it', async () => {
    mockDb.sumAiCostUsdSince.mockResolvedValue(GLOBAL_DAILY_COST_CEILING_USD)

    const decision = await Credits.authorizeAction('user-1', input)

    expect(decision).toEqual({ ok: false, code: 'global_ceiling' })
    expect(mockDb.recordAiRefusal).toHaveBeenCalledWith({ userId: 'user-1', code: 'global_ceiling', endpoint: 'parse-tasks' })
    expect(mockDb.insertUsageLog).not.toHaveBeenCalled()
    expect(mockDb.reserveCredits).not.toHaveBeenCalled()
  })

  it('records a request-shape refusal too', async () => {
    const decision = await Credits.authorizeAction('user-1', { ...input, userPrompt: 'x'.repeat(MAX_PROMPT_CHARS + 1) })

    expect(decision).toEqual({ ok: false, code: 'prompt_too_large' })
    expect(mockDb.recordAiRefusal).toHaveBeenCalledWith(expect.objectContaining({ code: 'prompt_too_large' }))
  })

  it('a refusal that cannot be recorded is still the answer the person gets', async () => {
    mockDb.sumAiCostUsdSince.mockResolvedValue(GLOBAL_DAILY_COST_CEILING_USD)
    mockDb.recordAiRefusal.mockRejectedValue(new Error('connection reset'))

    await expect(Credits.authorizeAction('user-1', input)).resolves.toEqual({ ok: false, code: 'global_ceiling' })
  })
})

describe('GET /api/admin/guards', () => {
  it('serves the limits the server enforces, and today’s state', async () => {
    const res = await request(app).get('/api/admin/guards').set('Authorization', ADMIN)

    expect(res.status).toBe(200)
    expect(res.body.limits).toMatchObject({
      requestChars: MAX_PROMPT_CHARS,
      imagesPerRequest: MAX_IMAGES_PER_REQUEST,
      globalDailyCeilingUsd: GLOBAL_DAILY_COST_CEILING_USD,
      accountDailyActions: FREE_DAILY_ACTION_CAP,
      guestActions: GUEST_INITIAL_CREDITS,
      monthlyActions: MONTHLY_FREE_CREDITS,
      guestNetworkWindowHours: GUEST_GRANT_IP_WINDOW_HOURS,
      actionPrice: ACTION_PRICE,
      entry: AUTH_RATE_LIMITS,
    })
    expect(res.body.limits.pricedModels).toEqual(expect.arrayContaining(['gpt-4o-mini', 'gpt-5.4']))
    expect(res.body.spentToday).toEqual({ state: 'ok', usd: 3.5 })
    expect(res.body.refusalsToday).toEqual({ state: 'ok', byCode: { global_ceiling: 2, insufficient_credits: 7 } })
    expect(res.body.nearCap).toEqual({ state: 'ok', accounts: [{ userId: 'user-9', email: 'busy@example.com', actions: 180 }] })
    expect(res.body.guestsWithoutGrantToday).toEqual({ state: 'ok', count: 4 })
  })

  it('a failed read shows that guard as unavailable, never 0', async () => {
    mockDb.sumAiCostUsdSince.mockRejectedValue(new Error('connection reset'))
    mockDb.adminGuardStatus.mockRejectedValue(new Error('connection reset'))

    const res = await request(app).get('/api/admin/guards').set('Authorization', ADMIN)

    expect(res.status).toBe(200)
    expect(res.body.spentToday).toEqual({ state: 'unavailable' })
    expect(res.body.refusalsToday).toEqual({ state: 'unavailable' })
    expect(res.body.nearCap).toEqual({ state: 'unavailable' })
    expect(res.body.limits.accountDailyActions).toBe(FREE_DAILY_ACTION_CAP)
  })
})

describe('the guards migration', () => {
  const dir = path.join(__dirname, '../../../supabase/migrations')
  const sql = fs.readdirSync(dir)
    .filter(name => name.endsWith('_ai_refusals_and_guard_status.sql'))
    .map(name => fs.readFileSync(path.join(dir, name), 'utf8'))
    .join('\n')

  it('keeps refusals in their own table and reports the day in one call', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ai_refusals/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION admin_guard_status\(p_since TIMESTAMPTZ, p_near_cap INT\)/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION admin_guard_status\(TIMESTAMPTZ, INT\) TO service_role/)
  })
})
