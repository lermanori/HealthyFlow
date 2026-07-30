import crypto from 'crypto'
import type { Response } from 'express'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import {
  OAuthClientInformationFullSchema,
  type OAuthClientInformationFull,
  type OAuthProtectedResourceMetadata,
  type OAuthMetadata,
  type OAuthTokens,
  type OAuthTokenRevocationRequest,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js'
import {
  AccessDeniedError,
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js'
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
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

export const MCP_OAUTH_SCOPES = [...ApiTokenScopeSchema.options] as const
export const MCP_OAUTH_GRANT_TYPES = ['authorization_code', 'refresh_token']

const TOKEN_PREFIX = 'hf_pat_'
const AUTHORIZATION_CODE_PREFIX = 'hf_code_'
const REFRESH_TOKEN_PREFIX = 'hf_refresh_'
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000
const CONSENT_REQUEST_TTL_SECONDS = 10 * 60
const CLIENT_METADATA_MAX_BYTES = 64 * 1024
const CLIENT_METADATA_CACHE_MS = 5 * 60 * 1000
const CONSENT_AUDIENCE = 'healthyflow-mcp-oauth-consent'

export const McpOAuthConfigSchema = z.object({
  issuer: z.string().url(),
  resource: z.string().url(),
  frontendUrl: z.string().url(),
  resourceMetadataUrl: z.string().url(),
})
export type McpOAuthConfig = z.infer<typeof McpOAuthConfigSchema>

const McpOAuthRequestClaimsSchema = z.object({
  tokenUse: z.literal('mcp_oauth_request'),
  // Dynamically registered clients get an opaque UUID; CIMD clients a URL.
  clientId: z.string().min(1).max(512),
  clientName: z.string().min(1).max(200),
  redirectUri: z.string().url(),
  scopes: z.array(ApiTokenScopeSchema).min(1),
  state: z.string().max(4096).optional(),
  codeChallenge: z.string().min(32).max(256),
  resource: z.string().url(),
})
type McpOAuthRequestClaims = z.infer<typeof McpOAuthRequestClaimsSchema>

const McpOAuthAccessClaimsSchema = z.object({
  tokenUse: z.literal('mcp_oauth_access'),
  grantId: z.string().uuid(),
  clientId: z.string().min(1).max(512),
  scopes: z.array(ApiTokenScopeSchema).min(1),
  resource: z.string().url(),
  sub: z.string().min(1),
  exp: z.number().int().positive(),
})

export const McpOAuthConsentBodySchema = z.object({
  request: z.string().min(1).max(20_000),
  decision: z.enum(['approve', 'deny']),
})
export type McpOAuthConsentBody = z.infer<typeof McpOAuthConsentBodySchema>

export const McpOAuthConsentRequestSchema = z.object({
  clientName: z.string().min(1),
  scopes: z.array(ApiTokenScopeSchema),
})
export type McpOAuthConsentRequest = z.infer<typeof McpOAuthConsentRequestSchema>

export const McpOAuthGrantClientSchema = z.object({
  id: z.string(),
  clientName: z.string(),
  scopes: z.array(ApiTokenScopeSchema),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
})
export type McpOAuthGrantClient = z.infer<typeof McpOAuthGrantClientSchema>

export const McpAuthContextSchema = z.object({
  tokenId: z.string(),
  userId: z.string(),
  scopes: z.array(ApiTokenScopeSchema),
  audience: z.literal('mcp'),
  kind: z.enum(['pat', 'oauth']),
})
export type McpAuthContext = z.infer<typeof McpAuthContextSchema>

function withoutTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

export function resolveMcpOAuthConfig(): McpOAuthConfig {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RAILWAY_ENVIRONMENT)
  const port = process.env.PORT || '3001'
  const resource = withoutTrailingSlash(
    process.env.MCP_PUBLIC_URL ||
      (isProduction
        ? 'https://healthyflow-production.up.railway.app/mcp'
        : `http://localhost:${port}/mcp`)
  )
  const resourceUrl = new URL(resource)
  if (resourceUrl.search || resourceUrl.hash) {
    throw new Error('MCP_PUBLIC_URL must not contain a query string or fragment')
  }

  const issuer = withoutTrailingSlash(
    process.env.MCP_OAUTH_ISSUER || resourceUrl.origin
  )
  const frontendUrl = withoutTrailingSlash(
    process.env.FRONTEND_URL ||
      (isProduction ? 'https://healthyflow.app' : 'http://localhost:5173')
  )
  const resourcePath = resourceUrl.pathname === '/' ? '' : resourceUrl.pathname
  const resourceMetadataUrl = new URL(
    `/.well-known/oauth-protected-resource${resourcePath}`,
    resourceUrl.origin
  ).toString()

  if (
    isProduction &&
    (
      resourceUrl.protocol !== 'https:' ||
      new URL(issuer).protocol !== 'https:' ||
      new URL(frontendUrl).protocol !== 'https:'
    )
  ) {
    throw new Error('Production MCP OAuth URLs must use HTTPS')
  }

  return McpOAuthConfigSchema.parse({
    issuer,
    resource,
    frontendUrl,
    resourceMetadataUrl,
  })
}

function oauthSecret() {
  const secret = process.env.MCP_OAUTH_JWT_SECRET || process.env.JWT_SECRET
  if (!secret) throw new Error('MCP_OAUTH_JWT_SECRET or JWT_SECRET is required')
  if (
    (
      process.env.NODE_ENV === 'production' ||
      Boolean(process.env.RAILWAY_ENVIRONMENT)
    ) &&
    Buffer.byteLength(secret, 'utf8') < 32
  ) {
    throw new Error('MCP OAuth JWT secret must be at least 32 bytes in production')
  }
  return secret
}

export function hashApiToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function opaqueToken(prefix: string) {
  return `${prefix}${crypto.randomBytes(32).toString('base64url')}`
}

function plaintextToken() {
  return opaqueToken(TOKEN_PREFIX)
}

function normalizeScopes(scopes: string[] | undefined) {
  const requested = scopes?.length ? scopes : ['hf:read']
  const parsed = z.array(ApiTokenScopeSchema).safeParse([...new Set(requested)])
  if (!parsed.success || !parsed.data.includes('hf:read')) {
    throw new InvalidScopeError('HealthyFlow OAuth grants must include hf:read')
  }
  return parsed.data
}

function accountIsAvailable(account: { disabled_at?: string | null } | null | undefined) {
  return Boolean(account && !account.disabled_at)
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

function oauthGrantToClient(row: any): McpOAuthGrantClient {
  return McpOAuthGrantClientSchema.parse({
    id: row.id,
    clientName: row.client_name,
    scopes: row.scopes,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? null,
    revokedAt: row.revoked_at ?? null,
  })
}

function allowedClientIdOrigins() {
  const configured = process.env.MCP_OAUTH_CLIENT_ID_ORIGINS
  const values = configured
    ? configured.split(',').map((value) => value.trim()).filter(Boolean)
    : ['https://chatgpt.com', 'https://www.chatgpt.com']
  return new Set(values.map((value) => new URL(value).origin))
}

const clientMetadataCache = new Map<
  string,
  { client: OAuthClientInformationFull; expiresAt: number }
>()

const McpOAuthClientMetadataDocumentSchema =
  OAuthClientInformationFullSchema.extend({
    token_endpoint_auth_methods_supported: z.array(z.string()).min(1).optional(),
  })

export function clearMcpOAuthClientCache() {
  clientMetadataCache.clear()
}

// A dynamically registered client_id is an opaque UUID with no hostname to show.
function clientDisplayName(clientId: string) {
  try {
    return new URL(clientId).hostname
  } catch {
    return 'MCP client'
  }
}

// A redirect URI must be a fixed https endpoint (or a loopback URL for local
// development) with no fragment, whether it arrives via dynamic registration or
// a Client ID Metadata Document.
function redirectUriIsAllowed(redirectUri: string) {
  let url: URL
  try {
    url = new URL(redirectUri)
  } catch {
    return false
  }
  if (url.hash) return false
  const isLoopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]'
  return url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback)
}

function registeredClientToInformation(row: {
  client_id: string
  client_name: string
  redirect_uris: string[]
  grant_types: string[]
  response_types: string[]
  scope: string | null
  client_uri: string | null
  logo_uri: string | null
  policy_uri: string | null
  tos_uri: string | null
  client_id_issued_at: string
}): OAuthClientInformationFull {
  return OAuthClientInformationFullSchema.parse({
    client_id: row.client_id,
    client_name: row.client_name,
    redirect_uris: row.redirect_uris,
    grant_types: row.grant_types,
    response_types: row.response_types,
    token_endpoint_auth_method: 'none',
    client_id_issued_at: Math.floor(
      new Date(row.client_id_issued_at).getTime() / 1000
    ),
    ...(row.scope ? { scope: row.scope } : {}),
    ...(row.client_uri ? { client_uri: row.client_uri } : {}),
    ...(row.logo_uri ? { logo_uri: row.logo_uri } : {}),
    ...(row.policy_uri ? { policy_uri: row.policy_uri } : {}),
    ...(row.tos_uri ? { tos_uri: row.tos_uri } : {}),
  })
}

class McpOAuthClientsStore implements OAuthRegisteredClientsStore {
  // ChatGPT registers dynamically (RFC 7591); other clients may present a
  // Client ID Metadata Document URL. Registered clients win: their client_id is
  // an opaque UUID and can never be mistaken for a document URL.
  async registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'> &
      Partial<Pick<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>>
  ): Promise<OAuthClientInformationFull> {
    if (!client.client_id) {
      throw new InvalidClientMetadataError('A client_id could not be issued')
    }
    if (client.token_endpoint_auth_method && client.token_endpoint_auth_method !== 'none') {
      throw new InvalidClientMetadataError(
        'HealthyFlow only issues credentials to public clients using PKCE'
      )
    }
    if (!client.redirect_uris?.length) {
      throw new InvalidClientMetadataError('At least one redirect_uri is required')
    }
    if (!client.redirect_uris.every(redirectUriIsAllowed)) {
      throw new InvalidClientMetadataError(
        'Every redirect_uri must be an https URL without a fragment'
      )
    }

    const grantTypes = client.grant_types?.length
      ? client.grant_types
      : [...MCP_OAUTH_GRANT_TYPES]
    if (grantTypes.some((grant) => !MCP_OAUTH_GRANT_TYPES.includes(grant))) {
      throw new InvalidClientMetadataError(
        'HealthyFlow supports the authorization_code and refresh_token grants'
      )
    }
    const responseTypes = client.response_types?.length
      ? client.response_types
      : ['code']
    if (responseTypes.some((responseType) => responseType !== 'code')) {
      throw new InvalidClientMetadataError('Only the code response type is supported')
    }

    const row = await db.createMcpOAuthClient({
      client_id: client.client_id,
      client_name: client.client_name?.slice(0, 200) || 'MCP client',
      redirect_uris: client.redirect_uris,
      grant_types: grantTypes,
      response_types: responseTypes,
      scope: client.scope ?? MCP_OAUTH_SCOPES.join(' '),
      client_uri: client.client_uri ?? null,
      logo_uri: client.logo_uri ?? null,
      policy_uri: client.policy_uri ?? null,
      tos_uri: client.tos_uri ?? null,
    })
    const registered = registeredClientToInformation(row)
    clientMetadataCache.set(registered.client_id, {
      client: registered,
      expiresAt: Date.now() + CLIENT_METADATA_CACHE_MS,
    })
    return registered
  }

  async getClient(clientId: string) {
    const cached = clientMetadataCache.get(clientId)
    if (cached && cached.expiresAt > Date.now()) return cached.client

    const registered = await db.getMcpOAuthClient(clientId)
    if (registered) {
      const client = registeredClientToInformation(registered)
      clientMetadataCache.set(clientId, {
        client,
        expiresAt: Date.now() + CLIENT_METADATA_CACHE_MS,
      })
      return client
    }

    let clientUrl: URL
    try {
      clientUrl = new URL(clientId)
    } catch {
      return undefined
    }
    if (
      clientUrl.protocol !== 'https:' ||
      !clientUrl.pathname ||
      Boolean(clientUrl.search || clientUrl.hash) ||
      !allowedClientIdOrigins().has(clientUrl.origin)
    ) {
      return undefined
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    try {
      const response = await fetch(clientUrl, {
        headers: { Accept: 'application/json' },
        redirect: 'manual',
        signal: controller.signal,
      })
      if (!response.ok || response.status >= 300) return undefined
      const body = await response.text()
      if (Buffer.byteLength(body, 'utf8') > CLIENT_METADATA_MAX_BYTES) return undefined

      const json = JSON.parse(body)
      const parsed = McpOAuthClientMetadataDocumentSchema.safeParse(json)
      const supportsPublicClient =
        parsed.success &&
        (parsed.data.token_endpoint_auth_method === 'none' ||
          parsed.data.token_endpoint_auth_methods_supported?.includes('none'))
      if (
        !parsed.success ||
        parsed.data.client_id !== clientId ||
        parsed.data.redirect_uris.length === 0 ||
        !supportsPublicClient
      ) {
        return undefined
      }
      if (!parsed.data.redirect_uris.every(redirectUriIsAllowed)) {
        return undefined
      }

      const client = OAuthClientInformationFullSchema.parse({
        ...parsed.data,
        token_endpoint_auth_method: 'none',
      })
      clientMetadataCache.set(clientId, {
        client,
        expiresAt: Date.now() + CLIENT_METADATA_CACHE_MS,
      })
      return client
    } catch {
      return undefined
    } finally {
      clearTimeout(timeout)
    }
  }
}

function signConsentRequest(
  config: McpOAuthConfig,
  claims: McpOAuthRequestClaims
) {
  return jwt.sign(McpOAuthRequestClaimsSchema.parse(claims), oauthSecret(), {
    algorithm: 'HS256',
    issuer: config.issuer,
    audience: CONSENT_AUDIENCE,
    expiresIn: CONSENT_REQUEST_TTL_SECONDS,
  })
}

function verifyConsentRequest(
  config: McpOAuthConfig,
  requestToken: string
) {
  const decoded = jwt.verify(requestToken, oauthSecret(), {
    algorithms: ['HS256'],
    issuer: config.issuer,
    audience: CONSENT_AUDIENCE,
  })
  if (typeof decoded === 'string') throw new InvalidGrantError('Invalid authorization request')
  const parsed = McpOAuthRequestClaimsSchema.safeParse(decoded)
  if (!parsed.success || parsed.data.resource !== config.resource) {
    throw new InvalidGrantError('Invalid or expired authorization request')
  }
  return parsed.data
}

function authorizationRedirect(
  claims: McpOAuthRequestClaims,
  result: { code?: string; error?: string; errorDescription?: string }
) {
  const url = new URL(claims.redirectUri)
  if (result.code) url.searchParams.set('code', result.code)
  if (result.error) url.searchParams.set('error', result.error)
  if (result.errorDescription) {
    url.searchParams.set('error_description', result.errorDescription)
  }
  if (claims.state) url.searchParams.set('state', claims.state)
  return url.toString()
}

function accessTokenForGrant(
  config: McpOAuthConfig,
  grant: {
    grant_id: string
    user_id: string
    client_id: string
    scopes: ApiTokenScope[]
    resource: string
  },
  scopes = grant.scopes
) {
  return jwt.sign(
    {
      tokenUse: 'mcp_oauth_access',
      grantId: grant.grant_id,
      clientId: grant.client_id,
      scopes,
      resource: grant.resource,
    },
    oauthSecret(),
    {
      algorithm: 'HS256',
      issuer: config.issuer,
      audience: config.resource,
      subject: grant.user_id,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    }
  )
}

function tokenResponse(
  config: McpOAuthConfig,
  grant: {
    grant_id: string
    user_id: string
    client_id: string
    scopes: ApiTokenScope[]
    resource: string
  },
  refreshToken: string,
  scopes = grant.scopes
): OAuthTokens {
  return {
    access_token: accessTokenForGrant(config, grant, scopes),
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: scopes.join(' '),
  }
}

export class HealthyFlowMcpOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new McpOAuthClientsStore()

  constructor(readonly config: McpOAuthConfig) {}

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ) {
    if (!params.resource || params.resource.toString() !== this.config.resource) {
      throw new InvalidTargetError('The resource must be the HealthyFlow MCP endpoint')
    }
    const scopes = normalizeScopes(params.scopes)
    const clientName = client.client_name || clientDisplayName(client.client_id)
    const request = signConsentRequest(this.config, {
      tokenUse: 'mcp_oauth_request',
      clientId: client.client_id,
      clientName,
      redirectUri: params.redirectUri,
      scopes,
      state: params.state,
      codeChallenge: params.codeChallenge,
      resource: this.config.resource,
    })
    const consentUrl = new URL('/app/oauth/authorize', this.config.frontendUrl)
    consentUrl.searchParams.set('request', request)
    res.redirect(302, consentUrl.toString())
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ) {
    const row = await db.getMcpOAuthAuthorizationCodeByHash(
      hashApiToken(authorizationCode)
    )
    if (
      !row ||
      row.client_id !== client.client_id ||
      row.consumed_at ||
      new Date(row.expires_at).getTime() <= Date.now()
    ) {
      throw new InvalidGrantError('Authorization code is invalid or expired')
    }
    return row.code_challenge as string
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL
  ) {
    if (!redirectUri || !resource || resource.toString() !== this.config.resource) {
      throw new InvalidGrantError('Authorization code exchange does not match its original request')
    }

    const refreshToken = opaqueToken(REFRESH_TOKEN_PREFIX)
    const grantId = uuidv4()
    const grant = await db.exchangeMcpOAuthAuthorizationCode({
      code_hash: hashApiToken(authorizationCode),
      client_id: client.client_id,
      redirect_uri: redirectUri,
      resource: this.config.resource,
      grant_id: grantId,
      refresh_token_hash: hashApiToken(refreshToken),
      refresh_expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(),
    })
    if (!grant) throw new InvalidGrantError('Authorization code is invalid or already used')

    const account = await db.getUserById(grant.user_id)
    if (!accountIsAvailable(account)) {
      await db.revokeMcpOAuthGrant(grant.user_id, grant.grant_id)
      throw new AccessDeniedError('HealthyFlow account is unavailable')
    }
    return tokenResponse(this.config, grant, refreshToken)
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    requestedScopes?: string[],
    resource?: URL
  ) {
    if (!resource || resource.toString() !== this.config.resource) {
      throw new InvalidTargetError('Refresh token is for a different resource')
    }

    const scopes = requestedScopes?.length
      ? normalizeScopes(requestedScopes)
      : undefined
    const currentGrant = await db.getMcpOAuthGrantByRefreshHash({
      refresh_token_hash: hashApiToken(refreshToken),
      client_id: client.client_id,
      resource: this.config.resource,
    })
    if (!currentGrant) {
      throw new InvalidGrantError('Refresh token is invalid, expired, or already used')
    }
    if (
      scopes?.some((scope) => !(currentGrant.scopes as string[]).includes(scope))
    ) {
      throw new InvalidScopeError('Requested scopes exceed the original grant')
    }

    const nextRefreshToken = opaqueToken(REFRESH_TOKEN_PREFIX)
    const grant = await db.rotateMcpOAuthRefreshToken({
      refresh_token_hash: hashApiToken(refreshToken),
      client_id: client.client_id,
      resource: this.config.resource,
      new_refresh_token_hash: hashApiToken(nextRefreshToken),
      new_refresh_expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(),
    })
    if (!grant) throw new InvalidGrantError('Refresh token is invalid, expired, or already used')

    const account = await db.getUserById(grant.user_id)
    if (!accountIsAvailable(account)) {
      await db.revokeMcpOAuthGrant(grant.user_id, grant.grant_id)
      throw new AccessDeniedError('HealthyFlow account is unavailable')
    }
    return tokenResponse(
      this.config,
      grant,
      nextRefreshToken,
      scopes ?? (grant.scopes as ApiTokenScope[])
    )
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    let decoded: string | JwtPayload
    try {
      decoded = jwt.verify(token, oauthSecret(), {
        algorithms: ['HS256'],
        issuer: this.config.issuer,
        audience: this.config.resource,
      })
    } catch {
      throw new InvalidTokenError('Access token is invalid or expired')
    }
    if (typeof decoded === 'string') throw new InvalidTokenError('Access token is invalid')

    const parsed = McpOAuthAccessClaimsSchema.safeParse(decoded)
    if (!parsed.success || parsed.data.resource !== this.config.resource) {
      throw new InvalidTokenError('Access token claims are invalid')
    }
    const grant = await db.getMcpOAuthGrant(parsed.data.grantId)
    if (
      !grant ||
      grant.revoked_at ||
      grant.user_id !== parsed.data.sub ||
      grant.client_id !== parsed.data.clientId ||
      grant.resource !== this.config.resource ||
      parsed.data.scopes.some((scope) => !(grant.scopes as string[]).includes(scope))
    ) {
      throw new InvalidTokenError('Access grant is invalid or revoked')
    }
    const account = await db.getUserById(parsed.data.sub)
    if (!accountIsAvailable(account)) throw new InvalidTokenError('HealthyFlow account is unavailable')

    await db.touchMcpOAuthGrant(grant.id)
    return {
      token,
      clientId: parsed.data.clientId,
      scopes: parsed.data.scopes,
      expiresAt: parsed.data.exp,
      resource: new URL(this.config.resource),
      extra: {
        userId: parsed.data.sub,
        tokenId: parsed.data.grantId,
        credentialKind: 'oauth',
      },
    }
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ) {
    if (request.token.startsWith(REFRESH_TOKEN_PREFIX)) {
      await db.revokeMcpOAuthGrantByRefreshHash({
        refresh_token_hash: hashApiToken(request.token),
        client_id: client.client_id,
        resource: this.config.resource,
      })
      return
    }

    try {
      const decoded = jwt.verify(request.token, oauthSecret(), {
        algorithms: ['HS256'],
        issuer: this.config.issuer,
        audience: this.config.resource,
      })
      if (typeof decoded === 'string') return
      const parsed = McpOAuthAccessClaimsSchema.safeParse(decoded)
      if (
        !parsed.success ||
        parsed.data.clientId !== client.client_id ||
        parsed.data.resource !== this.config.resource
      ) {
        return
      }
      await db.revokeMcpOAuthGrant(parsed.data.sub, parsed.data.grantId)
    } catch {
      // RFC 7009 token revocation is intentionally idempotent for unknown tokens.
    }
  }
}

let cachedOAuthProvider:
  | { key: string; provider: HealthyFlowMcpOAuthProvider }
  | undefined

export function getMcpOAuthProvider(
  config = resolveMcpOAuthConfig()
) {
  const key = JSON.stringify(config)
  if (!cachedOAuthProvider || cachedOAuthProvider.key !== key) {
    cachedOAuthProvider = {
      key,
      provider: new HealthyFlowMcpOAuthProvider(config),
    }
  }
  return cachedOAuthProvider.provider
}

export function mcpOAuthProtectedResourceMetadata(
  config = resolveMcpOAuthConfig()
): OAuthProtectedResourceMetadata {
  return {
    resource: config.resource,
    authorization_servers: [config.issuer],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'HealthyFlow',
    resource_documentation: new URL(
      '/app/settings/connections-advanced',
      config.frontendUrl
    ).toString(),
  }
}

export function mcpOAuthAuthorizationServerMetadata(
  config = resolveMcpOAuthConfig()
): OAuthMetadata {
  return {
    issuer: config.issuer,
    authorization_endpoint: new URL('/oauth/authorize', config.issuer).toString(),
    token_endpoint: new URL('/oauth/token', config.issuer).toString(),
    revocation_endpoint: new URL('/oauth/revoke', config.issuer).toString(),
    // ChatGPT's connector platform only supports RFC 7591 dynamic registration.
    registration_endpoint: new URL('/oauth/register', config.issuer).toString(),
    scopes_supported: [...MCP_OAUTH_SCOPES],
    response_types_supported: ['code'],
    grant_types_supported: [...MCP_OAUTH_GRANT_TYPES],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    client_id_metadata_document_supported: true,
    service_documentation: new URL(
      '/app/settings/connections-advanced',
      config.frontendUrl
    ).toString(),
  }
}

function quotedChallengeValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function mcpOAuthChallenge(
  requiredScopes: ApiTokenScope[],
  {
    error,
    errorDescription,
    config = resolveMcpOAuthConfig(),
  }: {
    error?: 'invalid_token' | 'insufficient_scope'
    errorDescription?: string
    config?: McpOAuthConfig
  } = {}
) {
  const parts = [
    `resource_metadata="${quotedChallengeValue(config.resourceMetadataUrl)}"`,
    `scope="${quotedChallengeValue(requiredScopes.join(' '))}"`,
  ]
  if (error) parts.push(`error="${error}"`)
  if (errorDescription) {
    parts.push(`error_description="${quotedChallengeValue(errorDescription)}"`)
  }
  return `Bearer ${parts.join(', ')}`
}

export const McpOAuth = {
  describeAuthorizationRequest(
    requestToken: string,
    config = resolveMcpOAuthConfig()
  ) {
    const request = verifyConsentRequest(config, requestToken)
    return McpOAuthConsentRequestSchema.parse({
      clientName: request.clientName,
      scopes: request.scopes,
    })
  },

  async completeAuthorization(
    userId: string,
    input: McpOAuthConsentBody,
    config = resolveMcpOAuthConfig()
  ) {
    const request = verifyConsentRequest(config, input.request)
    if (input.decision === 'deny') {
      return {
        redirectUrl: authorizationRedirect(request, {
          error: 'access_denied',
          errorDescription: 'The user denied HealthyFlow access.',
        }),
      }
    }

    const code = opaqueToken(AUTHORIZATION_CODE_PREFIX)
    await db.createMcpOAuthAuthorizationCode({
      id: uuidv4(),
      code_hash: hashApiToken(code),
      user_id: userId,
      client_id: request.clientId,
      client_name: request.clientName,
      redirect_uri: request.redirectUri,
      scopes: request.scopes,
      resource: request.resource,
      code_challenge: request.codeChallenge,
      expires_at: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS).toISOString(),
    })
    return {
      redirectUrl: authorizationRedirect(request, { code }),
    }
  },

  async listGrants(userId: string) {
    const rows = await db.listMcpOAuthGrants(userId)
    return rows.map(oauthGrantToClient)
  },

  async revokeGrant(userId: string, grantId: string) {
    const row = await db.revokeMcpOAuthGrant(userId, grantId)
    return row ? oauthGrantToClient(row) : null
  },
}

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

  async authenticateMcp(
    rawToken: string,
    config = resolveMcpOAuthConfig()
  ): Promise<McpAuthContext | null> {
    if (rawToken.startsWith(TOKEN_PREFIX)) {
      const auth = await this.authenticate(rawToken, 'mcp')
      if (!auth) return null
      const account = await db.getUserById(auth.userId)
      if (!accountIsAvailable(account)) return null
      return McpAuthContextSchema.parse({ ...auth, kind: 'pat' })
    }

    try {
      const auth = await getMcpOAuthProvider(config).verifyAccessToken(rawToken)
      return McpAuthContextSchema.parse({
        tokenId: auth.extra?.tokenId,
        userId: auth.extra?.userId,
        scopes: auth.scopes,
        audience: 'mcp',
        kind: 'oauth',
      })
    } catch {
      return null
    }
  },
}
