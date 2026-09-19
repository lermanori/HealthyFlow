// The bulk allowance read asks in chunks, so no single answer approaches the
// API's 1,000-row response limit (#303).

jest.mock('@supabase/supabase-js', () => {
  const rpc = jest.fn()
  return { rpc, createClient: () => ({ rpc, from: jest.fn(), auth: { admin: {} } }) }
})

import { db } from '../../src/supabase-client'

const rpc = (jest.requireMock('@supabase/supabase-js') as { rpc: jest.Mock }).rpc

it('reads 1,200 accounts as three chunks and merges the answers', async () => {
  rpc.mockImplementation(async (_name: string, args: { p_user_ids: string[] }) => ({
    data: args.p_user_ids.map(id => ({ user_id: id, free_grant: { state: 'available', credits: 15, kind: 'monthly' } })),
    error: null,
  }))
  const ids = Array.from({ length: 1200 }, (_, i) => `user-${i}`)

  const grants = await db.adminFreeCreditGrants(ids, 10, 15)

  expect(rpc.mock.calls.map(call => call[1].p_user_ids.length)).toEqual([500, 500, 200])
  expect(grants.size).toBe(1200)
})

it('a failed chunk fails the read rather than returning part of it', async () => {
  rpc.mockReset()
  rpc.mockResolvedValueOnce({ data: [], error: null })
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } })

  await expect(db.adminFreeCreditGrants(Array.from({ length: 700 }, (_, i) => `u-${i}`), 10, 15)).rejects.toBeTruthy()
})
