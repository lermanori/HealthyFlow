import express from 'express'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { ApiTokens } from '../api-tokens'
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

function createServer(auth: { tokenId: string; userId: string; scopes: string[] }) {
  const server = new McpServer({ name: 'healthyflow', version: '1.0.0' })
  const tools = aiCapabilityTools({ mode: 'mcp', scopes: auth.scopes, caller: 'mcp' })

  for (const tool of tools) {
    const isWrite = Boolean(tool.scope)
    const annotations = {
      readOnlyHint: !isWrite,
      openWorldHint: false,
      destructiveHint: tool.name === 'delete_item',
    }
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations,
      },
      async (args) => {
        if (!checkRate(auth.tokenId, isWrite)) {
          throw new Error('Rate limit exceeded')
        }
        return jsonContent(await tool.execute({ userId: auth.userId, caller: 'mcp' }, args))
      }
    )
  }

  const readResource = async (uri: URL, variables: Record<string, unknown>, capabilityName: keyof typeof AiCapabilities) => {
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
  server.registerResource('tasks', new ResourceTemplate('healthyflow://tasks/{date}', { list: undefined }), { mimeType: 'application/json' }, (uri, variables) => readResource(uri, variables, 'list_tasks'))
  server.registerResource('calories', new ResourceTemplate('healthyflow://calories/{date}', { list: undefined }), { mimeType: 'application/json' }, (uri, variables) => readResource(uri, variables, 'list_calorie_entries'))
  server.registerResource('achievements', 'healthyflow://achievements', { mimeType: 'application/json' }, (uri) => readResource(new URL(uri), {}, 'list_achievements'))
  server.registerResource('workouts', new ResourceTemplate('healthyflow://workouts/{date}', { list: undefined }), { mimeType: 'application/json' }, (uri, variables) => readResource(uri, variables, 'list_workout_sessions'))

  return server
}

router.post('/', async (req, res) => {
  const token = bearerToken(req)
  if (!token) return res.status(401).json({ error: 'Missing MCP bearer token' })

  const auth = await ApiTokens.authenticate(token, 'mcp')
  if (!auth) return res.status(401).json({ error: 'Invalid MCP token' })
  if (!auth.scopes.includes('hf:read')) return res.status(403).json({ error: 'Missing hf:read scope' })

  const server = createServer(auth)
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
