import fs from 'fs'
import path from 'path'
import { Credits } from '../../src/credits'

// Admin shows each account's free-allowance state by the rule the server
// enforces (#302): the database's own get_free_credit_grant, with the ADR-0026
// verification rule applied by the same function the user's summary uses.

jest.mock('../../src/supabase-client', () => ({ db: {} }))

const claimedAfterTheRule = { email: 'new@example.com', email_verified_at: null, created_at: '2026-09-16T00:00:00.000Z' }
const verified = { email: 'ok@example.com', email_verified_at: '2026-09-16T00:00:00.000Z', created_at: '2026-09-16T00:00:00.000Z' }
const guest = { email: null, email_verified_at: null, created_at: '2026-09-16T00:00:00.000Z' }

describe('Credits.freeAllowanceFor', () => {
  it('passes a Guest state through untouched, network-limited included', async () => {
    const state = await Credits.freeAllowanceFor(guest, { state: 'network_limited', kind: 'guest_initial' })
    expect(state).toEqual({ state: 'network_limited', kind: 'guest_initial' })
  })

  it('withholds the monthly grant from an unproven address created after the rule', async () => {
    const state = await Credits.freeAllowanceFor(claimedAfterTheRule, { state: 'available', credits: 15, kind: 'monthly' })
    expect(state).toEqual({ state: 'email_unverified', kind: 'monthly' })
  })

  it('keeps a verified account’s monthly state', async () => {
    const granted = { state: 'claimed' as const, kind: 'monthly' as const, nextAvailableAt: '2026-10-01T00:00:00.000Z' }
    expect(await Credits.freeAllowanceFor(verified, granted)).toEqual(granted)
  })

  it('never turns a failed read into a guessed state', async () => {
    const state = await Credits.freeAllowanceFor(claimedAfterTheRule, null)
    expect(state.state).toBe('unavailable')
  })
})

describe('the bulk free-allowance read', () => {
  it('asks the database’s own rule for every account in one call', () => {
    const dir = path.join(__dirname, '../../../supabase/migrations')
    const sql = fs.readdirSync(dir)
      .filter(name => name.endsWith('_admin_free_credit_grants.sql'))
      .map(name => fs.readFileSync(path.join(dir, name), 'utf8'))
      .join('\n')
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION admin_free_credit_grants\(/)
    expect(sql).toMatch(/get_free_credit_grant\(/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION admin_free_credit_grants\(UUID\[\], INT, INT\) TO service_role/)
  })
})
