CREATE TABLE IF NOT EXISTS ai_audit_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    caller       TEXT NOT NULL CHECK (caller IN ('internal', 'mcp')),
    tool         TEXT NOT NULL,
    args_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    target_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,
    result       JSONB NOT NULL DEFAULT '{}'::jsonb,
    model        TEXT,
    request_id   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_log_user_created
ON ai_audit_log(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_idempotency (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    tool       TEXT NOT NULL,
    result     JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_idempotency_user_request_tool_unique UNIQUE (user_id, request_id, tool)
);

CREATE TABLE IF NOT EXISTS ai_pending_actions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    capability  TEXT NOT NULL,
    args        JSONB NOT NULL,
    preview     JSONB NOT NULL,
    caller      TEXT NOT NULL DEFAULT 'internal' CHECK (caller IN ('internal', 'mcp')),
    expires_at  TIMESTAMPTZ NOT NULL,
    executed_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_user_active
ON ai_pending_actions(user_id, expires_at)
WHERE executed_at IS NULL AND canceled_at IS NULL;

CREATE TABLE IF NOT EXISTS api_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    scopes       TEXT[] NOT NULL DEFAULT ARRAY['hf:read'],
    audience     TEXT NOT NULL DEFAULT 'mcp',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user_created
ON api_tokens(user_id, created_at DESC);
