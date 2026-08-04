-- Phase 5: durable Talk workflows and exactly-once Focus block confirmation.
-- The model runs outside database transactions. Short compare-and-swap updates
-- claim a workflow turn, and the app owns proposal confirmation and writes.

CREATE TABLE IF NOT EXISTS talk_workflows (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id       UUID NOT NULL,
  name                  TEXT NOT NULL CHECK (name IN ('plan_focused_work')),
  stage                 TEXT NOT NULL CHECK (stage IN (
                          'interpreting', 'clarifying', 'gathering_context',
                          'awaiting_confirmation', 'applied', 'declined',
                          'stale', 'failed'
                        )),
  anchor_date           DATE NOT NULL,
  time_zone             TEXT NOT NULL,
  focus_meaning         TEXT CHECK (focus_meaning IS NULL OR focus_meaning IN (
                          'focused_minutes', 'elapsed_window', 'both'
                        )),
  selected_project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  selected_task_ids     UUID[] NOT NULL DEFAULT '{}'::uuid[],
  pending_action_id     UUID,
  pending_proposal      JSONB,
  source_fingerprint    TEXT,
  confirmation_state    TEXT NOT NULL DEFAULT 'none' CHECK (confirmation_state IN (
                          'none', 'presented', 'confirmed', 'declined', 'stale'
                        )),
  runtime_version       TEXT NOT NULL,
  instruction_versions JSONB NOT NULL DEFAULT '[]'::jsonb,
  model                 TEXT NOT NULL,
  revision              INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  last_error            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT talk_workflows_user_conversation_unique UNIQUE (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_talk_workflows_user_updated
  ON talk_workflows(user_id, updated_at DESC);

ALTER TABLE ai_pending_actions
  ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES talk_workflows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_revision INTEGER,
  ADD COLUMN IF NOT EXISTS source_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'presented',
  ADD COLUMN IF NOT EXISTS result JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE ai_pending_actions DROP CONSTRAINT IF EXISTS ai_pending_actions_status_check;
ALTER TABLE ai_pending_actions
  ADD CONSTRAINT ai_pending_actions_status_check
  CHECK (status IN ('presented', 'executing', 'executed', 'declined', 'stale', 'failed'));

UPDATE ai_pending_actions
SET status = CASE
  WHEN executed_at IS NOT NULL THEN 'executed'
  WHEN canceled_at IS NOT NULL THEN 'declined'
  ELSE 'presented'
END;

ALTER TABLE talk_workflows DROP CONSTRAINT IF EXISTS talk_workflows_pending_action_id_fkey;
ALTER TABLE talk_workflows
  ADD CONSTRAINT talk_workflows_pending_action_id_fkey
  FOREIGN KEY (pending_action_id) REFERENCES ai_pending_actions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_workflow
  ON ai_pending_actions(workflow_id, created_at DESC)
  WHERE workflow_id IS NOT NULL;

-- A proposal id is the domain idempotency key. Even if a worker dies after the
-- Focus block insert but before it completes the pending action, a reclaimed
-- confirmation resolves to the same block instead of creating another one.
ALTER TABLE focus_blocks
  ADD COLUMN IF NOT EXISTS request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_focus_blocks_user_request_unique
  ON focus_blocks(user_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_audit_log_request_unique
  ON ai_audit_log(user_id, request_id, tool)
  WHERE request_id IS NOT NULL;

-- Atomically claims a presented proposal. An abandoned claim can be reclaimed
-- after two minutes; the Focus block request_id uniqueness makes recovery safe.
CREATE OR REPLACE FUNCTION claim_ai_pending_action(
  p_action_id UUID,
  p_user_id UUID
)
RETURNS SETOF ai_pending_actions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE ai_pending_actions
  SET status = 'executing', updated_at = NOW()
  WHERE id = p_action_id
    AND user_id = p_user_id
    AND executed_at IS NULL
    AND canceled_at IS NULL
    AND expires_at > NOW()
    AND (
      status = 'presented'
      OR (status = 'executing' AND updated_at < NOW() - INTERVAL '2 minutes')
    )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION claim_ai_pending_action(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_ai_pending_action(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION complete_ai_pending_action(
  p_action_id UUID,
  p_user_id UUID,
  p_result JSONB
)
RETURNS SETOF ai_pending_actions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE ai_pending_actions
  SET status = 'executed', result = p_result, executed_at = NOW(), updated_at = NOW()
  WHERE id = p_action_id
    AND user_id = p_user_id
    AND status = 'executing'
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION complete_ai_pending_action(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_ai_pending_action(UUID, UUID, JSONB) TO service_role;
