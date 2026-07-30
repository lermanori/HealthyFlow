import express from 'express'
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js'
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js'
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js'
import {
  getMcpOAuthProvider,
  McpOAuth,
  McpOAuthConsentBodySchema,
  mcpOAuthAuthorizationServerMetadata,
  mcpOAuthProtectedResourceMetadata,
  resolveMcpOAuthConfig,
} from '../api-tokens'
import { authenticateToken, type AuthRequest } from '../middleware/auth'

const router = express.Router()
const config = resolveMcpOAuthConfig()
const provider = getMcpOAuthProvider(config)
const handleAuthorize = authorizationHandler({ provider })
const handleToken = tokenHandler({ provider })
const handleRevoke = revocationHandler({ provider })

function sendMetadata(res: express.Response, value: unknown) {
  res.set('Cache-Control', 'public, max-age=3600')
  res.json(value)
}

router.get(
  '/.well-known/oauth-protected-resource',
  (_req, res) => sendMetadata(res, mcpOAuthProtectedResourceMetadata(config))
)
router.get(
  '/.well-known/oauth-protected-resource/mcp',
  (_req, res) => sendMetadata(res, mcpOAuthProtectedResourceMetadata(config))
)
router.get(
  '/.well-known/oauth-protected-resource/mcp/chatgpt',
  (_req, res) => sendMetadata(res, mcpOAuthProtectedResourceMetadata(config))
)
router.get('/.well-known/oauth-authorization-server', (_req, res) =>
  sendMetadata(res, mcpOAuthAuthorizationServerMetadata(config))
)

router.use('/oauth/authorize', handleAuthorize)
router.use('/oauth/token', handleToken)
router.use('/oauth/revoke', handleRevoke)

router.get(
  '/api/oauth/authorize/request',
  authenticateToken,
  async (req: AuthRequest, res) => {
    const request = typeof req.query.request === 'string' ? req.query.request : ''
    try {
      res.set('Cache-Control', 'no-store')
      res.json(McpOAuth.describeAuthorizationRequest(request, config))
    } catch {
      res.status(400).json({ error: 'Authorization request is invalid or expired.' })
    }
  }
)

router.post(
  '/api/oauth/authorize',
  authenticateToken,
  async (req: AuthRequest, res) => {
    const parsed = McpOAuthConsentBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid authorization decision.' })
    }

    try {
      res.set('Cache-Control', 'no-store')
      res.json(
        await McpOAuth.completeAuthorization(
          req.user.userId,
          parsed.data,
          config
        )
      )
    } catch {
      res.status(400).json({ error: 'Authorization request is invalid or expired.' })
    }
  }
)

export { router as oauthRoutes }
