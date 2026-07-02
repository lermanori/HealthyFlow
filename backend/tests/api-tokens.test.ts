jest.mock('../src/supabase-client', () => ({
  db: {
    createApiToken: jest.fn(async (row) => ({
      ...row,
      created_at: '2026-07-02T10:00:00.000Z',
      last_used_at: null,
      revoked_at: null,
    })),
    listApiTokens: jest.fn(),
    revokeApiToken: jest.fn(),
    getApiTokenByHash: jest.fn(),
    touchApiToken: jest.fn(),
  },
}))

import { ApiTokens, hashApiToken } from '../src/api-tokens'
import { db } from '../src/supabase-client'

describe('ApiTokens', () => {
  it('stores only the token hash and returns plaintext once', async () => {
    const created = await ApiTokens.create('user-1', { name: 'Claude', scopes: ['hf:read'] })

    expect(created.token).toMatch(/^hf_pat_/)
    expect(db.createApiToken).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      name: 'Claude',
      token_hash: hashApiToken(created.token),
      scopes: ['hf:read'],
      audience: 'mcp',
    }))
    expect(JSON.stringify((db.createApiToken as jest.Mock).mock.calls[0][0])).not.toContain(created.token)
  })

  it('rejects a wrong-audience token', async () => {
    ;(db.getApiTokenByHash as jest.Mock).mockResolvedValueOnce({
      id: 'token-1',
      user_id: 'user-1',
      scopes: ['hf:read'],
      audience: 'rest',
      revoked_at: null,
    })

    await expect(ApiTokens.authenticate('hf_pat_test', 'mcp')).resolves.toBeNull()
    expect(db.touchApiToken).not.toHaveBeenCalled()
  })
})
