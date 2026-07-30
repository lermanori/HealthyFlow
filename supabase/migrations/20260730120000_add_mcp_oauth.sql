-- OAuth 2.1 authorization-code + PKCE support for the remote MCP server.
-- Access tokens are short-lived signed JWTs. Only authorization codes and
-- rotating refresh-token hashes need durable storage.

CREATE TABLE IF NOT EXISTS mcp_oauth_authorization_codes (
  id UUID PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  resource TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_active
  ON mcp_oauth_authorization_codes(code_hash, expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE mcp_oauth_authorization_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mcp_oauth_authorization_codes FROM PUBLIC;
REVOKE ALL ON TABLE mcp_oauth_authorization_codes FROM anon;
REVOKE ALL ON TABLE mcp_oauth_authorization_codes FROM authenticated;
GRANT ALL ON TABLE mcp_oauth_authorization_codes TO service_role;

CREATE TABLE IF NOT EXISTS mcp_oauth_grants (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  resource TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_grants_user_created
  ON mcp_oauth_grants(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_grants_refresh
  ON mcp_oauth_grants(refresh_token_hash)
  WHERE revoked_at IS NULL;

ALTER TABLE mcp_oauth_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mcp_oauth_grants FROM PUBLIC;
REVOKE ALL ON TABLE mcp_oauth_grants FROM anon;
REVOKE ALL ON TABLE mcp_oauth_grants FROM authenticated;
GRANT ALL ON TABLE mcp_oauth_grants TO service_role;

-- Consume a code and create its durable grant in one transaction. Matching the
-- client, redirect URI, and RFC 8707 resource here prevents a code issued for
-- one MCP client or audience from being exchanged by another.
CREATE OR REPLACE FUNCTION exchange_mcp_oauth_code(
  p_code_hash TEXT,
  p_client_id TEXT,
  p_redirect_uri TEXT,
  p_resource TEXT,
  p_grant_id UUID,
  p_refresh_token_hash TEXT,
  p_refresh_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
  grant_id UUID,
  user_id UUID,
  client_id TEXT,
  client_name TEXT,
  scopes TEXT[],
  resource TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched mcp_oauth_authorization_codes%ROWTYPE;
BEGIN
  UPDATE mcp_oauth_authorization_codes
  SET consumed_at = NOW()
  WHERE code_hash = p_code_hash
    AND client_id = p_client_id
    AND redirect_uri = p_redirect_uri
    AND resource = p_resource
    AND consumed_at IS NULL
    AND expires_at > NOW()
  RETURNING * INTO matched;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO mcp_oauth_grants (
    id,
    user_id,
    client_id,
    client_name,
    scopes,
    resource,
    refresh_token_hash,
    refresh_expires_at
  ) VALUES (
    p_grant_id,
    matched.user_id,
    matched.client_id,
    matched.client_name,
    matched.scopes,
    matched.resource,
    p_refresh_token_hash,
    p_refresh_expires_at
  );

  RETURN QUERY
  SELECT
    created_grant.id,
    created_grant.user_id,
    created_grant.client_id,
    created_grant.client_name,
    created_grant.scopes,
    created_grant.resource
  FROM mcp_oauth_grants AS created_grant
  WHERE created_grant.id = p_grant_id;
END;
$$;

REVOKE ALL ON FUNCTION exchange_mcp_oauth_code(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION exchange_mcp_oauth_code(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION exchange_mcp_oauth_code(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION exchange_mcp_oauth_code(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) TO service_role;

-- Public OAuth clients must use rotating refresh tokens. Updating only when
-- the presented hash is current makes replayed refresh tokens fail atomically.
CREATE OR REPLACE FUNCTION rotate_mcp_oauth_refresh_token(
  p_refresh_token_hash TEXT,
  p_client_id TEXT,
  p_resource TEXT,
  p_new_refresh_token_hash TEXT,
  p_new_refresh_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
  grant_id UUID,
  user_id UUID,
  client_id TEXT,
  client_name TEXT,
  scopes TEXT[],
  resource TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE mcp_oauth_grants AS current_grant
  SET
    refresh_token_hash = p_new_refresh_token_hash,
    refresh_expires_at = p_new_refresh_expires_at,
    last_used_at = NOW()
  WHERE current_grant.refresh_token_hash = p_refresh_token_hash
    AND current_grant.client_id = p_client_id
    AND current_grant.resource = p_resource
    AND current_grant.revoked_at IS NULL
    AND current_grant.refresh_expires_at > NOW()
  RETURNING
    current_grant.id,
    current_grant.user_id,
    current_grant.client_id,
    current_grant.client_name,
    current_grant.scopes,
    current_grant.resource;
END;
$$;

REVOKE ALL ON FUNCTION rotate_mcp_oauth_refresh_token(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION rotate_mcp_oauth_refresh_token(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION rotate_mcp_oauth_refresh_token(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION rotate_mcp_oauth_refresh_token(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
