import fs from 'node:fs'
import path from 'node:path'

// The ceiling's total is one aggregate in the database, so it cannot stop
// counting at a row limit (#296).

jest.mock('@supabase/supabase-js', () => {
  const rpc = jest.fn()
  return { rpc, createClient: () => ({ rpc, from: jest.fn(), auth: { admin: {} } }) }
})

import { db } from '../../src/supabase-client'

describe('the ceiling total is one database aggregate', () => {
  const rpc = (jest.requireMock('@supabase/supabase-js') as { rpc: jest.Mock }).rpc

  beforeEach(() => jest.clearAllMocks())

  it('asks the database for the sum instead of fetching rows', async () => {
    rpc.mockResolvedValue({ data: '31.25000000', error: null })

    const total = await db.sumAiCostUsdSince('2026-09-18T00:00:00.000Z')

    expect(rpc).toHaveBeenCalledWith('sum_ai_cost_usd_since', { p_since: '2026-09-18T00:00:00.000Z' })
    expect(total).toBe(31.25)
  })

  it('a failed sum read throws, so AI is refused rather than treated as $0 spent', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } })

    await expect(db.sumAiCostUsdSince('2026-09-18T00:00:00.000Z')).rejects.toBeTruthy()
  })

  it('the migration defines the aggregate for the service role only', () => {
    const dir = path.join(__dirname, '../../../supabase/migrations')
    const file = fs.readdirSync(dir).find(name => name.endsWith('_sum_ai_cost_usd_since.sql'))
    expect(file).toBeDefined()
    const sql = fs.readFileSync(path.join(dir, file!), 'utf8')
    expect(sql).toMatch(/CREATE (OR REPLACE )?FUNCTION sum_ai_cost_usd_since\(p_since TIMESTAMPTZ\)/i)
    expect(sql).toMatch(/SUM\(cost_usd\)/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION sum_ai_cost_usd_since\(TIMESTAMPTZ\) FROM PUBLIC/i)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION sum_ai_cost_usd_since\(TIMESTAMPTZ\) TO service_role/i)
  })
})
