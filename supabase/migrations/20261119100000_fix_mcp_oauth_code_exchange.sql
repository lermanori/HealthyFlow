-- Fix every MCP OAuth authorization-code exchange failing with
-- `column reference "client_id" is ambiguous`.
--
-- exchange_mcp_oauth_code RETURNS TABLE (..., client_id, ..., resource), and
-- PL/pgSQL turns those output columns into variables. The original UPDATE named
-- `client_id` and `resource` without a table qualifier, so Postgres refused the
-- statement and the token endpoint answered 500 for every client (ChatGPT, Claude).
-- Same contract; every column reference is now qualified.

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
  UPDATE mcp_oauth_authorization_codes AS code
  SET consumed_at = NOW()
  WHERE code.code_hash = p_code_hash
    AND code.client_id = p_client_id
    AND code.redirect_uri = p_redirect_uri
    AND code.resource = p_resource
    AND code.consumed_at IS NULL
    AND code.expires_at > NOW()
  RETURNING code.* INTO matched;

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
