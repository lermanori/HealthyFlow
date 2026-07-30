process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key'
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token'
process.env.MCP_PUBLIC_URL =
  process.env.MCP_PUBLIC_URL || 'http://localhost:3001/mcp'
process.env.MCP_OAUTH_ISSUER =
  process.env.MCP_OAUTH_ISSUER || 'http://localhost:3001'
process.env.FRONTEND_URL =
  process.env.FRONTEND_URL || 'http://localhost:5173'
process.env.MCP_OAUTH_CLIENT_ID_ORIGINS =
  process.env.MCP_OAUTH_CLIENT_ID_ORIGINS || 'https://chatgpt.com'
// supabase-client constructs a client at import time; give it dummy
// credentials so suites that import it (via the service layer) can load.
// Real Supabase calls are mocked in the individual tests.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'
