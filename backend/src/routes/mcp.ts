import express from 'express'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import {
  ApiTokens,
  type ApiTokenScope,
  type McpAuthContext,
  type McpOAuthConfig,
  MCP_OAUTH_SCOPES,
  mcpOAuthChallenge,
  resolveMcpOAuthConfig,
} from '../api-tokens'
import { AiCapabilities, aiCapabilityTools } from '../ai-capabilities'

const router = express.Router()
const tokenRateLimit = new Map<string, { count: number; writeCount: number; resetAt: number }>()
const WINDOW_MS = 60_000
const READ_LIMIT = 60
const WRITE_LIMIT = 15

function sweepExpiredTokenRateLimits(now: number) {
  if (tokenRateLimit.size <= 500) return
  for (const [key, value] of tokenRateLimit.entries()) {
    if (value.resetAt <= now) tokenRateLimit.delete(key)
  }
}

function bearerToken(req: express.Request) {
  const header = req.header('authorization') ?? ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
}

function checkRate(tokenId: string, isWrite: boolean) {
  const now = Date.now()
  sweepExpiredTokenRateLimits(now)
  const current = tokenRateLimit.get(tokenId)
  if (!current || current.resetAt <= now) {
    tokenRateLimit.set(tokenId, { count: 1, writeCount: isWrite ? 1 : 0, resetAt: now + WINDOW_MS })
    return true
  }
  if (current.count >= READ_LIMIT) return false
  if (isWrite && current.writeCount >= WRITE_LIMIT) return false
  current.count += 1
  if (isWrite) current.writeCount += 1
  return true
}

function jsonContent(value: unknown) {
  return {
    structuredContent: value as Record<string, unknown>,
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  }
}

function oauthErrorContent(
  requiredScopes: ApiTokenScope[],
  error: 'invalid_token' | 'insufficient_scope',
  description: string,
  config: McpOAuthConfig
) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: description }],
    _meta: {
      'mcp/www_authenticate': [
        mcpOAuthChallenge(requiredScopes, {
          error,
          errorDescription: description,
          config,
        }),
      ],
    },
  }
}

function toolsForAuth(auth: McpAuthContext | null) {
  return aiCapabilityTools({
    mode: 'mcp',
    scopes: auth?.kind === 'pat' ? auth.scopes : [...MCP_OAUTH_SCOPES],
    caller: 'mcp',
  })
}

function requiredScopesForTool(tool: ReturnType<typeof toolsForAuth>[number]) {
  return [
    'hf:read',
    ...(tool.scope ? [tool.scope] : []),
  ] as ApiTokenScope[]
}

function toolAnnotations(tool: ReturnType<typeof toolsForAuth>[number]) {
  const isWrite = Boolean(tool.scope)
  return {
    readOnlyHint: !isWrite,
    openWorldHint: false,
    destructiveHint: tool.name === 'delete_item',
  }
}

function toolDescriptors(auth: McpAuthContext | null) {
  return toolsForAuth(auth).map((tool) => {
    const requiredScopes = requiredScopesForTool(tool)
    const securitySchemes = [{ type: 'oauth2', scopes: requiredScopes }]
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters,
      outputSchema: z.toJSONSchema(tool.outputSchema),
      annotations: toolAnnotations(tool),
      securitySchemes,
      _meta: { securitySchemes },
    }
  })
}

function createServer(auth: McpAuthContext | null, config: McpOAuthConfig) {
  const server = new McpServer({ name: 'healthyflow', version: '1.0.0' })
  const tools = toolsForAuth(auth)

  for (const tool of tools) {
    const isWrite = Boolean(tool.scope)
    const requiredScopes = requiredScopesForTool(tool)
    const securitySchemes = [{ type: 'oauth2', scopes: requiredScopes }]
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: toolAnnotations(tool),
        _meta: {
          securitySchemes,
        },
      },
      async (args) => {
        if (!auth) {
          return oauthErrorContent(
            requiredScopes,
            'invalid_token',
            'Connect HealthyFlow to use this tool.',
            config
          )
        }
        if (requiredScopes.some((scope) => !auth.scopes.includes(scope))) {
          return oauthErrorContent(
            requiredScopes,
            'insufficient_scope',
            'The HealthyFlow connection does not grant this tool permission.',
            config
          )
        }
        if (!checkRate(auth.tokenId, isWrite)) {
          throw new Error('Rate limit exceeded')
        }
        return jsonContent(await tool.execute({ userId: auth.userId, caller: 'mcp' }, args))
      }
    )
  }

  const readResource = async (uri: URL, variables: Record<string, unknown>, capabilityName: keyof typeof AiCapabilities) => {
    if (!auth || !auth.scopes.includes('hf:read')) {
      throw new Error('HealthyFlow authentication with hf:read is required')
    }
    if (!checkRate(auth.tokenId, false)) throw new Error('Rate limit exceeded')
    const date = typeof variables.date === 'string' ? variables.date : undefined
    const capability = AiCapabilities[capabilityName]
    const input = date ? { date } : {}
    const result = await capability.execute({ userId: auth.userId }, capability.inputSchema.parse(input))
    return {
      contents: [{ uri: uri.toString(), mimeType: 'application/json', text: JSON.stringify(result, null, 2) }],
    }
  }

  server.registerResource('today', new ResourceTemplate('healthyflow://today/{date}', { list: undefined }), { mimeType: 'application/json' }, (uri, variables) => readResource(uri, variables, 'get_today'))
  server.registerResource('daily-context', new ResourceTemplate('healthyflow://daily-context/{date}', { list: undefined }), { mimeType: 'application/json' }, (uri, variables) => readResource(uri, variables, 'get_daily_context'))
  server.registerResource('tasks', new ResourceTemplate('healthyflow://tasks/{date}', { list: undefined }), { mimeType: 'application/json' }, (uri, variables) => readResource(uri, variables, 'list_tasks'))
  server.registerResource('calories', new ResourceTemplate('healthyflow://calories/{date}', { list: undefined }), { mimeType: 'application/json' }, (uri, variables) => readResource(uri, variables, 'list_calorie_entries'))
  server.registerResource('achievements', 'healthyflow://achievements', { mimeType: 'application/json' }, (uri) => readResource(new URL(uri), {}, 'list_achievements'))
  server.registerResource('workouts', new ResourceTemplate('healthyflow://workouts/{date}', { list: undefined }), { mimeType: 'application/json' }, (uri, variables) => readResource(uri, variables, 'list_workout_sessions'))

  return server
}

router.post('/', async (req, res) => {
  const token = bearerToken(req)
  const config = resolveMcpOAuthConfig()
  const auth = token ? await ApiTokens.authenticateMcp(token, config) : null
  if (token && !auth) {
    res.set(
      'WWW-Authenticate',
      mcpOAuthChallenge(['hf:read'], {
        error: 'invalid_token',
        errorDescription: 'The HealthyFlow access token is invalid or expired.',
        config,
      })
    )
    return res.status(401).json({ error: 'Invalid MCP token' })
  }

  if (
    req.body?.jsonrpc === '2.0' &&
    req.body?.method === 'tools/list' &&
    (typeof req.body?.id === 'string' || typeof req.body?.id === 'number')
  ) {
    return res.json({
      jsonrpc: '2.0',
      id: req.body.id,
      result: { tools: toolDescriptors(auth) },
    })
  }

  const server = createServer(auth, config)
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
    res.on('close', () => {
      transport.close()
      server.close()
    })
  } catch (error) {
    console.error('MCP request failed:', error)
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null })
    }
  }
})

router.get('/', (_req, res) => {
  res.status(405).json({ error: 'Method not allowed' })
})

export { router as mcpRoutes }
