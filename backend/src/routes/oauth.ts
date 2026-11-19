import express from 'express'
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js'
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js'
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
import { logger } from '../utils/logger'

const router = express.Router()
const config = resolveMcpOAuthConfig()
const provider = getMcpOAuthProvider(config)
const handleAuthorize = authorizationHandler({ provider })
const handleToken = tokenHandler({ provider })
const handleRevoke = revocationHandler({ provider })
// HealthyFlow issues no client secrets, so there is nothing to expire.
const handleRegister = clientRegistrationHandler({
  clientsStore: provider.clientsStore,
  clientSecretExpirySeconds: 0,
})

function sendMetadata(res: express.Response, value: unknown) {
  res.set('Cache-Control', 'public, max-age=3600')
  res.json(value)
}

// RFC 9728 locates this document by suffixing the resource's own path, so it may
// only be served where the path matches. Advertising the same resource under a
// path that is not that resource makes strict clients abandon the flow, which is
// why there is no alias here: `resourceMetadataUrl` is derived from
// MCP_PUBLIC_URL and is the single place the resource is declared.
const resourceMetadataPath = new URL(config.resourceMetadataUrl).pathname
const sendResourceMetadata = (_req: express.Request, res: express.Response) =>
  sendMetadata(res, mcpOAuthProtectedResourceMetadata(config))

router.get('/.well-known/oauth-protected-resource', sendResourceMetadata)
if (resourceMetadataPath !== '/.well-known/oauth-protected-resource') {
  router.get(resourceMetadataPath, sendResourceMetadata)
}
router.get('/.well-known/oauth-authorization-server', (_req, res) =>
  sendMetadata(res, mcpOAuthAuthorizationServerMetadata(config))
)

router.use('/oauth/register', handleRegister)
router.use('/oauth/authorize', handleAuthorize)
// The SDK token handler answers OAuth errors without logging them, which leaves a
// failed connector sign-in invisible. Record why, with field names only: codes,
// verifiers, assertions and refresh tokens are credentials.
function logTokenFailures(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const json = res.json.bind(res)
  res.json = (body: any) => {
    if (res.statusCode >= 400) {
      const fields = req.body && typeof req.body === 'object' ? Object.keys(req.body).sort() : []
      logger.warn('[oauth] token request failed', {
        status: res.statusCode,
        error: body?.error,
        errorDescription: body?.error_description,
        grantType: typeof req.body?.grant_type === 'string' ? req.body.grant_type : undefined,
        fields,
      })
    }
    return json(body)
  }
  next()
}

router.use(
  '/oauth/token',
  express.urlencoded({ extended: false }),
  logTokenFailures,
  handleToken
)
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
