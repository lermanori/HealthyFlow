-- Phase 6 (ADR-0009): make talk_workflows generic across the closed Talk
-- workflow set.
--
-- APPLIED to hosted Supabase (project jvdcaxdtmieedhwztdip) on 2026-08-04 via
-- `supabase db push`, at the user's explicit instruction.
--
-- Three shape changes:
--   1. workflow name becomes the closed Phase 6 set; plan_focused_work becomes
--      plan_work v1.
--   2. terminal status moves out of the stage column into its own column, and
--      stage becomes workflow-specific (validated by the application contract,
--      not by a shared CHECK that cannot know which workflow a row belongs to).
--   3. a generic `state` JSONB envelope replaces the Work-specific columns.
--
-- Generic safety columns (pending_action_id, source_fingerprint,
-- confirmation_state, revision, last_error) deliberately stay OUT of the JSON
-- envelope so constraints and foreign keys keep working.
--
-- The old Work-specific columns are retained and left nullable by this
-- migration. They are dropped only by a follow-up migration, after the Phase 6
-- read path has been verified in production, so there is never a window with two
-- sources of truth.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New generic columns
-- ---------------------------------------------------------------------------

ALTER TABLE talk_workflows
  ADD COLUMN IF NOT EXISTS definition_version INTEGER NOT NULL DEFAULT 1
    CHECK (definition_version > 0),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'declined', 'failed')),
  ADD COLUMN IF NOT EXISTS state JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  -- Rollback aid. Rewriting `stage` is the only lossy step in this migration
  -- (two Phase 5 stages collapse onto resolve_scope), so the original value is
  -- preserved verbatim. Dropped alongside the other deprecated columns once the
  -- Phase 6 read path is verified.
  ADD COLUMN IF NOT EXISTS legacy_stage TEXT;

-- ---------------------------------------------------------------------------
-- 2. Backfill status and stage from the Phase 5 combined stage column
-- ---------------------------------------------------------------------------

-- Phase 5 encoded terminal outcomes as stage values. Split them apart before
-- relaxing the stage constraint, so no row is left claiming to be mid-flow.
UPDATE talk_workflows
SET status = CASE stage
  WHEN 'applied'  THEN 'completed'
  WHEN 'declined' THEN 'declined'
  WHEN 'failed'   THEN 'failed'
  ELSE 'active'
END
WHERE status = 'active';

UPDATE talk_workflows
SET closed_at = COALESCE(closed_at, updated_at)
WHERE status <> 'active';

ALTER TABLE talk_workflows DROP CONSTRAINT IF EXISTS talk_workflows_stage_check;

-- Preserve the pre-migration stage before overwriting it.
UPDATE talk_workflows SET legacy_stage = stage WHERE legacy_stage IS NULL;

-- Map the generic Phase 5 stages onto plan_work domain stages.
--
-- 'clarifying' is deliberately mapped back to resolve_scope rather than guessed:
-- the Phase 5 column recorded that a question was asked but never which one, and
-- resolve_scope is a cheap deterministic application activity that re-derives the
-- correct branch. Inventing clarify_direction vs clarify_capacity here would be a
-- fabricated resumption point.
UPDATE talk_workflows
SET stage = CASE stage
  WHEN 'interpreting'       THEN 'resolve_project'
  WHEN 'gathering_context'  THEN 'resolve_scope'
  WHEN 'clarifying'         THEN 'resolve_scope'
  WHEN 'stale'              THEN 'draft_focus_block'
  WHEN 'failed'             THEN 'resolve_scope'
  WHEN 'awaiting_confirmation' THEN
    CASE WHEN pending_proposal IS NULL THEN 'await_task_confirmation'
         ELSE 'await_focus_confirmation' END
  WHEN 'applied'  THEN 'await_focus_confirmation'
  WHEN 'declined' THEN
    CASE WHEN pending_proposal IS NULL THEN 'await_task_confirmation'
         ELSE 'await_focus_confirmation' END
  ELSE stage
END
WHERE stage IN (
  'interpreting', 'clarifying', 'gathering_context', 'awaiting_confirmation',
  'applied', 'declined', 'stale', 'failed'
);

-- Stage stays TEXT with no enum CHECK: legal stage values depend on the
-- workflow, and the workflow-definition registry is the single source of truth.
-- The database still refuses empty and absurd values.
ALTER TABLE talk_workflows
  ADD CONSTRAINT talk_workflows_stage_shape_check
  CHECK (stage ~ '^[a-z][a-z0-9_]{2,63}$');

-- ---------------------------------------------------------------------------
-- 3. Backfill the state envelope from the Work-specific columns
-- ---------------------------------------------------------------------------

UPDATE talk_workflows
SET state = jsonb_strip_nulls(jsonb_build_object(
  'projectId',         selected_project_id,
  'selectedTaskIds',   COALESCE(to_jsonb(selected_task_ids), '[]'::jsonb),
  'alignmentApprovedTaskIds', '[]'::jsonb,
  'createdTaskId',     NULL,
  'createdFocusBlockId', NULL,
  'focusMeaning',      focus_meaning,
  'openQuestion',      NULL,
  'blockedReasonCodes', '[]'::jsonb
))
WHERE state = '{}'::jsonb;

-- Nullable-by-default keys the application expects to read back explicitly.
UPDATE talk_workflows
SET state = state
  || jsonb_build_object('projectId', COALESCE(state->'projectId', 'null'::jsonb))
  || jsonb_build_object('createdTaskId', COALESCE(state->'createdTaskId', 'null'::jsonb))
  || jsonb_build_object('createdFocusBlockId', COALESCE(state->'createdFocusBlockId', 'null'::jsonb))
  || jsonb_build_object('focusMeaning', COALESCE(state->'focusMeaning', 'null'::jsonb))
  || jsonb_build_object('openQuestion', COALESCE(state->'openQuestion', 'null'::jsonb))
  || jsonb_build_object('selectedTaskIds', COALESCE(state->'selectedTaskIds', '[]'::jsonb))
  || jsonb_build_object('alignmentApprovedTaskIds', COALESCE(state->'alignmentApprovedTaskIds', '[]'::jsonb))
  || jsonb_build_object('blockedReasonCodes', COALESCE(state->'blockedReasonCodes', '[]'::jsonb));

-- The Phase 5 columns remain readable during rollout. A follow-up migration
-- drops them once the Phase 6 read path is verified.
ALTER TABLE talk_workflows
  ALTER COLUMN selected_task_ids DROP NOT NULL;

COMMENT ON COLUMN talk_workflows.focus_meaning IS
  'DEPRECATED (Phase 6): superseded by state->>focusMeaning. Dropped after read-path verification.';
COMMENT ON COLUMN talk_workflows.selected_project_id IS
  'DEPRECATED (Phase 6): superseded by state->>projectId. Dropped after read-path verification.';
COMMENT ON COLUMN talk_workflows.selected_task_ids IS
  'DEPRECATED (Phase 6): superseded by state->selectedTaskIds. Dropped after read-path verification.';
COMMENT ON COLUMN talk_workflows.legacy_stage IS
  'DEPRECATED (Phase 6): pre-migration stage value, kept as a rollback aid. Dropped after read-path verification.';
COMMENT ON COLUMN talk_workflows.pending_proposal IS
  'DEPRECATED (Phase 6): the pending action holds the draft. Dropped after read-path verification.';

-- ---------------------------------------------------------------------------
-- 4. Closed workflow name set, with the Phase 5 name backfilled to plan_work
-- ---------------------------------------------------------------------------

ALTER TABLE talk_workflows DROP CONSTRAINT IF EXISTS talk_workflows_name_check;

UPDATE talk_workflows
SET name = 'plan_work', definition_version = 1
WHERE name = 'plan_focused_work';

ALTER TABLE talk_workflows
  ADD CONSTRAINT talk_workflows_name_check CHECK (name IN (
    'plan_day', 'plan_work', 'run_focus_block', 'review_focus_block',
    'replan_day', 'log_outcome', 'review_project', 'quick_chat'
  ));

-- ---------------------------------------------------------------------------
-- 5. Allow workflow history; enforce one ACTIVE workflow per conversation
-- ---------------------------------------------------------------------------

-- Phase 5 allowed exactly one row per (user, conversation) forever, so a
-- completed workflow permanently blocked the conversation. Phase 6 keeps history
-- and constrains only the active row.
ALTER TABLE talk_workflows
  DROP CONSTRAINT IF EXISTS talk_workflows_user_conversation_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_talk_workflows_active_conversation_unique
  ON talk_workflows(user_id, conversation_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_talk_workflows_conversation_history
  ON talk_workflows(user_id, conversation_id, created_at DESC);

-- A terminal workflow must record when it closed; an active one must not.
ALTER TABLE talk_workflows DROP CONSTRAINT IF EXISTS talk_workflows_closed_at_check;
ALTER TABLE talk_workflows
  ADD CONSTRAINT talk_workflows_closed_at_check
  CHECK ((status = 'active') = (closed_at IS NULL));

COMMIT;
