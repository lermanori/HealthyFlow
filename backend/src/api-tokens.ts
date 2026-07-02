import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { db } from './supabase-client'

export const ApiTokenScopeSchema = z.enum([
  'hf:read',
  'hf:write:add',
  'hf:write:update',
  'hf:write:complete',
  'hf:write:delete',
])
export const ApiTokenAudienceSchema = z.enum(['mcp'])

export type ApiTokenScope = z.infer<typeof ApiTokenScopeSchema>

const TOKEN_PREFIX = 'hf_pat_'

export function hashApiToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function plaintextToken() {
  return `${TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`
}

export const apiTokenToClient = (row: any) => ({
  id: row.id,
  name: row.name,
  scopes: row.scopes as ApiTokenScope[],
  audience: row.audience,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at ?? null,
  revokedAt: row.revoked_at ?? null,
})

export const ApiTokens = {
  async create(userId: string, input: { name: string; scopes: ApiTokenScope[]; audience?: 'mcp' }) {
    const token = plaintextToken()
    const row = await db.createApiToken({
      id: uuidv4(),
      user_id: userId,
      name: input.name,
      token_hash: hashApiToken(token),
      scopes: input.scopes,
      audience: input.audience ?? 'mcp',
    })
    return { token, record: apiTokenToClient(row) }
  },

  async list(userId: string) {
    const rows = await db.listApiTokens(userId)
    return rows.map(apiTokenToClient)
  },

  async revoke(userId: string, tokenId: string) {
    const row = await db.revokeApiToken(userId, tokenId)
    return row ? apiTokenToClient(row) : null
  },

  async authenticate(rawToken: string, audience: 'mcp') {
    if (!rawToken.startsWith(TOKEN_PREFIX)) return null
    const row = await db.getApiTokenByHash(hashApiToken(rawToken))
    if (!row || row.revoked_at || row.audience !== audience) return null
    await db.touchApiToken(row.id)
    return {
      tokenId: row.id as string,
      userId: row.user_id as string,
      scopes: row.scopes as ApiTokenScope[],
      audience: row.audience as 'mcp',
    }
  },
}
