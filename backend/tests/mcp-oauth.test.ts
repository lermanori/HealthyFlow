import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import request from 'supertest'

let storedCode: Record<string, any> | null = null
let storedGrant: Record<string, any> | null = null

jest.mock('../src/supabase-client', () => ({
  db: {
    createMcpOAuthAuthorizationCode: jest.fn(async (row) => {
      storedCode = { ...row, consumed_at: null }
      return { id: row.id }
    }),
    getMcpOAuthAuthorizationCodeByHash: jest.fn(async (codeHash) => {
      if (!storedCode || storedCode.code_hash !== codeHash) return null
      return {
        client_id: storedCode.client_id,
        code_challenge: storedCode.code_challenge,
        expires_at: storedCode.expires_at,
        consumed_at: storedCode.consumed_at,
      }
    }),
    exchangeMcpOAuthAuthorizationCode: jest.fn(async (input) => {
      if (
        !storedCode ||
        storedCode.consumed_at ||
        storedCode.code_hash !== input.code_hash ||
        storedCode.client_id !== input.client_id ||
        storedCode.redirect_uri !== input.redirect_uri ||
        storedCode.resource !== input.resource
      ) {
        return null
      }
      storedCode.consumed_at = new Date().toISOString()
      storedGrant = {
        id: input.grant_id,
        grant_id: input.grant_id,
        user_id: storedCode.user_id,
        client_id: storedCode.client_id,
        client_name: storedCode.client_name,
        scopes: storedCode.scopes,
        resource: storedCode.resource,
        revoked_at: null,
      }
      return storedGrant
    }),
    getMcpOAuthGrantByRefreshHash: jest.fn(async () =>
      storedGrant
        ? { id: storedGrant.id, scopes: storedGrant.scopes }
        : null
    ),
    rotateMcpOAuthRefreshToken: jest.fn(async () => storedGrant),
    getMcpOAuthGrant: jest.fn(async (grantId) =>
      storedGrant?.id === grantId ? storedGrant : null
    ),
    touchMcpOAuthGrant: jest.fn(),
    getUserById: jest.fn(async (userId) => ({
      id: userId,
      email: 'user@example.com',
      name: 'HealthyFlow User',
      role: 'user',
      disabled_at: null,
    })),
    listMcpOAuthGrants: jest.fn(),
    revokeMcpOAuthGrant: jest.fn(),
    revokeMcpOAuthGrantByRefreshHash: jest.fn(async () => {
      if (storedGrant) storedGrant.revoked_at = new Date().toISOString()
    }),
    getApiTokenByHash: jest.fn(),
    touchApiToken: jest.fn(),
  },
}))

import {
  clearMcpOAuthClientCache,
  getMcpOAuthProvider,
  resolveMcpOAuthConfig,
} from '../src/api-tokens'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

const CLIENT_ID = 'https://chatgpt.com/oauth/healthyflow-test/client.json'
const REDIRECT_URI = 'https://chatgpt.com/connector/oauth/healthyflow-test'
const RESOURCE = 'http://localhost:3001/mcp'
const APP_TOKEN = `Bearer ${jwt.sign(
  { userId: 'user-1' },
  process.env.JWT_SECRET!
)}`

function clientMetadata() {
  return {
    client_id: CLIENT_ID,
    client_name: 'ChatGPT',
    redirect_uris: [REDIRECT_URI],
    token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  }
}

function form(input: Record<string, string>) {
  return new URLSearchParams(input).toString()
}

function mcpMessage(response: request.Response) {
  if (response.body && Object.keys(response.body).length > 0) return response.body
  const data = response.text
    .split('\n')
    .find((line) => line.startsWith('data: '))
    ?.slice('data: '.length)
  return data ? JSON.parse(data) : null
}

beforeEach(() => {
  storedCode = null
  storedGrant = null
  clearMcpOAuthClientCache()
  global.fetch = jest.fn(async () =>
    new Response(JSON.stringify(clientMetadata()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  ) as jest.Mock
})

describe('HealthyFlow MCP OAuth', () => {
  it('publishes resource and authorization-server discovery metadata', async () => {
    const resource = await request(app).get(
      '/.well-known/oauth-protected-resource/mcp'
    )
    expect(resource.status).toBe(200)
    expect(resource.body).toMatchObject({
      resource: RESOURCE,
      authorization_servers: ['http://localhost:3001'],
      bearer_methods_supported: ['header'],
    })

    const issuer = await request(app).get(
      '/.well-known/oauth-authorization-server'
    )
    expect(issuer.status).toBe(200)
    expect(issuer.body).toMatchObject({
      issuer: 'http://localhost:3001',
      authorization_endpoint: 'http://localhost:3001/oauth/authorize',
      token_endpoint: 'http://localhost:3001/oauth/token',
      revocation_endpoint: 'http://localhost:3001/oauth/revoke',
      code_challenge_methods_supported: ['S256'],
      client_id_metadata_document_supported: true,
    })
  })

  it('allows the ChatGPT browser origin to bootstrap MCP OAuth', async () => {
    const metadata = await request(app)
      .get('/.well-known/oauth-authorization-server')
      .set('Origin', 'https://chatgpt.com')

    expect(metadata.status).toBe(200)
    expect(metadata.headers['access-control-allow-origin']).toBe(
      'https://chatgpt.com'
    )

    const authorizePreflight = await request(app)
      .options('/oauth/authorize')
      .set('Origin', 'https://chatgpt.com')
      .set('Access-Control-Request-Method', 'GET')

    expect(authorizePreflight.status).toBe(204)
    expect(authorizePreflight.headers['access-control-allow-origin']).toBe(
      'https://chatgpt.com'
    )

    const accountApi = await request(app)
      .get('/api/health')
      .set('Origin', 'https://chatgpt.com')
    expect(accountApi.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('completes CIMD, consent, PKCE code exchange, and refresh rotation', async () => {
    const verifier = crypto.randomBytes(32).toString('base64url')
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url')
    const authorize = await request(app)
      .get('/oauth/authorize')
      .query({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: 'hf:read hf:write:add',
        state: 'state-123',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        resource: RESOURCE,
      })

    expect(authorize.status).toBe(302)
    const consentLocation = new URL(authorize.headers.location)
    expect(consentLocation.origin).toBe('http://localhost:5173')
    expect(consentLocation.pathname).toBe('/app/oauth/authorize')
    const signedRequest = consentLocation.searchParams.get('request')
    expect(signedRequest).toBeTruthy()

    const consentDetails = await request(app)
      .get('/api/oauth/authorize/request')
      .set('Authorization', APP_TOKEN)
      .query({ request: signedRequest })
    expect(consentDetails.status).toBe(200)
    expect(consentDetails.body).toEqual({
      clientName: 'ChatGPT',
      scopes: ['hf:read', 'hf:write:add'],
    })

    const approval = await request(app)
      .post('/api/oauth/authorize')
      .set('Authorization', APP_TOKEN)
      .send({ request: signedRequest, decision: 'approve' })
    expect(approval.status).toBe(200)
    const callback = new URL(approval.body.redirectUrl)
    expect(callback.origin + callback.pathname).toBe(REDIRECT_URI)
    expect(callback.searchParams.get('state')).toBe('state-123')
    const code = callback.searchParams.get('code')
    expect(code).toMatch(/^hf_code_/)
    expect(JSON.stringify(storedCode)).not.toContain(code)

    const exchange = await request(app)
      .post('/oauth/token')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(
        form({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          code: code!,
          code_verifier: verifier,
          redirect_uri: REDIRECT_URI,
          resource: RESOURCE,
        })
      )
    expect(exchange.status).toBe(200)
    expect(exchange.body).toMatchObject({
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'hf:read hf:write:add',
    })
    expect(exchange.body.refresh_token).toMatch(/^hf_refresh_/)

    const verified = await getMcpOAuthProvider(
      resolveMcpOAuthConfig()
    ).verifyAccessToken(exchange.body.access_token)
    expect(verified.extra).toMatchObject({
      userId: 'user-1',
      credentialKind: 'oauth',
    })

    const refresh = await request(app)
      .post('/oauth/token')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(
        form({
          grant_type: 'refresh_token',
          client_id: CLIENT_ID,
          refresh_token: exchange.body.refresh_token,
          resource: RESOURCE,
        })
      )
    expect(refresh.status).toBe(200)
    expect(refresh.body.refresh_token).toMatch(/^hf_refresh_/)
    expect(refresh.body.refresh_token).not.toBe(exchange.body.refresh_token)

    const revoke = await request(app)
      .post('/oauth/revoke')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(
        form({
          client_id: CLIENT_ID,
          token: refresh.body.refresh_token,
          token_type_hint: 'refresh_token',
        })
      )
    expect(revoke.status).toBe(200)

    const replay = await request(app)
      .post('/oauth/token')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(
        form({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          code: code!,
          code_verifier: verifier,
          redirect_uri: REDIRECT_URI,
          resource: RESOURCE,
        })
      )
    expect(replay.status).toBe(400)
    expect(replay.body.error).toBe('invalid_grant')
  })

  it('rejects authorization for a different MCP resource', async () => {
    const response = await request(app)
      .get('/oauth/authorize')
      .query({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: 'hf:read',
        state: 'wrong-resource',
        code_challenge: crypto.randomBytes(32).toString('base64url'),
        code_challenge_method: 'S256',
        resource: 'https://example.com/mcp',
      })

    expect(response.status).toBe(302)
    const callback = new URL(response.headers.location)
    expect(callback.origin + callback.pathname).toBe(REDIRECT_URI)
    expect(callback.searchParams.get('error')).toBe('invalid_target')
  })

  it('lists and revokes OAuth grants through authenticated Settings routes', async () => {
    const grant = {
      id: 'grant-1',
      client_name: 'ChatGPT',
      scopes: ['hf:read'],
      created_at: '2026-07-30T12:00:00.000Z',
      last_used_at: null,
      revoked_at: null,
    }
    ;(db.listMcpOAuthGrants as jest.Mock).mockResolvedValueOnce([grant])
    ;(db.revokeMcpOAuthGrant as jest.Mock).mockResolvedValueOnce({
      ...grant,
      revoked_at: '2026-07-30T12:30:00.000Z',
    })

    const list = await request(app)
      .get('/api/settings/connections/oauth')
      .set('Authorization', APP_TOKEN)
    expect(list.status).toBe(200)
    expect(list.body).toEqual([
      {
        id: 'grant-1',
        clientName: 'ChatGPT',
        scopes: ['hf:read'],
        createdAt: '2026-07-30T12:00:00.000Z',
        lastUsedAt: null,
        revokedAt: null,
      },
    ])

    const revoke = await request(app)
      .delete('/api/settings/connections/oauth/grant-1')
      .set('Authorization', APP_TOKEN)
    expect(revoke.status).toBe(200)
    expect(revoke.body.revokedAt).toBe('2026-07-30T12:30:00.000Z')
    expect(db.revokeMcpOAuthGrant).toHaveBeenCalledWith('user-1', 'grant-1')
  })
})

describe('mixed-auth MCP discovery', () => {
  const mcpHeaders = {
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2025-03-26',
  }

  it('accepts ChatGPT connector bootstrap requests sent as raw bytes', async () => {
    const initialize = Buffer.from(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'ChatGPT', version: '1.0' },
        },
      })
    )

    const response = await request(app)
      .post('/mcp/chatgpt')
      .set('Content-Type', 'application/octet-stream')
      .set('Accept', '*/*')
      .send(initialize)

    expect(response.status).toBe(200)
    expect(response.text).toContain('"name":"healthyflow"')

    const metadata = await request(app).get(
      '/.well-known/oauth-protected-resource/mcp/chatgpt'
    )
    expect(metadata.status).toBe(200)
    expect(metadata.body.resource).toBe(RESOURCE)
  })

  it('lists tools before login and returns an OAuth challenge on use', async () => {
    const list = await request(app)
      .post('/mcp')
      .set(mcpHeaders)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })

    expect(list.status).toBe(200)
    const listMessage = mcpMessage(list)
    const today = listMessage.result?.tools?.find(
      (tool: { name: string }) => tool.name === 'get_today'
    )
    expect(today?.securitySchemes).toEqual([
      { type: 'oauth2', scopes: ['hf:read'] },
    ])
    expect(today?._meta?.securitySchemes).toEqual([
      { type: 'oauth2', scopes: ['hf:read'] },
    ])

    const call = await request(app)
      .post('/mcp')
      .set(mcpHeaders)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_today', arguments: {} },
      })

    expect(call.status).toBe(200)
    const callMessage = mcpMessage(call)
    expect(callMessage.result?.isError).toBe(true)
    expect(
      callMessage.result?._meta?.['mcp/www_authenticate']?.[0]
    ).toContain('resource_metadata=')
    expect(
      callMessage.result?._meta?.['mcp/www_authenticate']?.[0]
    ).toContain('error="invalid_token"')
  })

  it('returns an HTTP bearer challenge for an invalid access token', async () => {
    const response = await request(app)
      .post('/mcp')
      .set(mcpHeaders)
      .set('Authorization', 'Bearer invalid-access-token')
      .send({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} })

    expect(response.status).toBe(401)
    expect(response.headers['www-authenticate']).toContain(
      'resource_metadata='
    )
    expect(response.headers['www-authenticate']).toContain(
      'error="invalid_token"'
    )
  })
})
