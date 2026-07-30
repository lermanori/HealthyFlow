-- RFC 7591 Dynamic Client Registration for the remote MCP server.
--
-- ChatGPT's connector platform registers itself by POSTing client metadata; it
-- does not support Client ID Metadata Documents. Without a durable clients
-- table the authorization endpoint cannot resolve a registered client_id, so
-- ChatGPT never gets an authorization URL to open.

CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  grant_types TEXT[] NOT NULL,
  response_types TEXT[] NOT NULL,
  scope TEXT,
  client_uri TEXT,
  logo_uri TEXT,
  policy_uri TEXT,
  tos_uri TEXT,
  client_id_issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_clients_created
  ON mcp_oauth_clients(created_at DESC);

ALTER TABLE mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mcp_oauth_clients FROM PUBLIC;
REVOKE ALL ON TABLE mcp_oauth_clients FROM anon;
REVOKE ALL ON TABLE mcp_oauth_clients FROM authenticated;
GRANT ALL ON TABLE mcp_oauth_clients TO service_role;
