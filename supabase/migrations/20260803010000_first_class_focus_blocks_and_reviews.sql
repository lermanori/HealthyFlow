-- Follow-up to 20260803000000_add_work_module.sql. That migration has already
-- been applied, so its Project columns and early work_sessions table are
-- evolved in place rather than rewritten.

-- Align stored Task relationships with the accepted Phase 1 vocabulary.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_target_relation_check;
UPDATE tasks SET target_relation = 'Optional polish' WHERE target_relation = 'Optional';
UPDATE tasks SET target_relation = 'Unrelated' WHERE target_relation = 'Unrelated now';
ALTER TABLE tasks
  ADD CONSTRAINT tasks_target_relation_check
  CHECK (target_relation IS NULL OR target_relation IN (
    'Direct progress', 'Unblocking', 'Maintenance', 'Optional polish', 'Unrelated'
  ));

-- A Focus block is an execution record, not a Project JSON field. task_ids are
-- references to canonical tasks rows; validation and the review RPC ensure
-- every referenced Task belongs to the same owner and scope.
CREATE TABLE IF NOT EXISTS focus_blocks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id          UUID REFERENCES projects(id) ON DELETE RESTRICT,
  task_ids            UUID[] NOT NULL DEFAULT '{}'::uuid[],
  standalone_title    TEXT,
  standalone_context  TEXT,
  scheduled_date      DATE NOT NULL,
  start_time          TIME WITHOUT TIME ZONE NOT NULL,
  planned_minutes     INTEGER NOT NULL CHECK (planned_minutes > 0 AND planned_minutes <= 1440),
  intended_outcome    TEXT NOT NULL,
  intended_evidence   TEXT NOT NULL,
  transition_minutes  INTEGER CHECK (transition_minutes IS NULL OR transition_minutes BETWEEN 0 AND 180),
  break_minutes       INTEGER CHECK (break_minutes IS NULL OR break_minutes BETWEEN 0 AND 180),
  status              TEXT NOT NULL DEFAULT 'planned'
                      CHECK (status IN ('planned', 'active', 'reviewing', 'completed', 'canceled')),
  review_trigger      TEXT CHECK (review_trigger IS NULL OR review_trigger IN ('finished', 'blocked', 'drifted')),
  started_at          TIMESTAMP WITH TIME ZONE,
  ended_at            TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT focus_blocks_scope_check CHECK (
    project_id IS NOT NULL
    OR (standalone_title IS NOT NULL AND length(trim(standalone_title)) BETWEEN 1 AND 120)
  ),
  CONSTRAINT focus_blocks_task_scope_check CHECK (
    project_id IS NULL OR cardinality(task_ids) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_focus_blocks_user_schedule
  ON focus_blocks (user_id, scheduled_date DESC, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_focus_blocks_project_schedule
  ON focus_blocks (project_id, scheduled_date DESC, start_time DESC)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_focus_blocks_active
  ON focus_blocks (user_id, status)
  WHERE status IN ('active', 'reviewing');

CREATE TABLE IF NOT EXISTS work_reviews (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  focus_block_id       UUID NOT NULL UNIQUE REFERENCES focus_blocks(id) ON DELETE CASCADE,
  trigger              TEXT NOT NULL CHECK (trigger IN ('finished', 'blocked', 'drifted')),
  what_changed         TEXT NOT NULL,
  evidence_produced    TEXT NOT NULL DEFAULT '',
  milestone_impact     TEXT NOT NULL CHECK (milestone_impact IN ('advanced', 'unblocked', 'both', 'neither')),
  what_got_in_way      TEXT NOT NULL DEFAULT '',
  unnecessary_work     TEXT NOT NULL DEFAULT '',
  actual_minutes       INTEGER NOT NULL CHECK (actual_minutes BETWEEN 0 AND 1440),
  next_step            TEXT NOT NULL,
  attention            TEXT NOT NULL CHECK (attention IN ('Focused', 'Mixed', 'Drifted')),
  confirmed_updates    JSONB NOT NULL DEFAULT '{"tasks":[],"project":{}}'::jsonb,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Evolve early Work sessions without destroying any rows already created by
-- the applied migration. `minutes` and the old free-text `review` remain as
-- compatibility columns; new code writes actual_minutes and a WorkReview.
ALTER TABLE work_sessions
  ADD COLUMN IF NOT EXISTS focus_block_id UUID REFERENCES focus_blocks(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS review_id UUID REFERENCES work_reviews(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS task_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS standalone_title TEXT,
  ADD COLUMN IF NOT EXISTS standalone_context TEXT,
  ADD COLUMN IF NOT EXISTS planned_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS actual_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS blocker_info TEXT,
  ADD COLUMN IF NOT EXISTS drift_info TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;

UPDATE work_sessions
SET actual_minutes = minutes
WHERE actual_minutes IS NULL;

UPDATE work_sessions
SET task_ids = ARRAY[task_id]
WHERE task_id IS NOT NULL AND cardinality(task_ids) = 0;

ALTER TABLE work_sessions ALTER COLUMN actual_minutes SET NOT NULL;
ALTER TABLE work_sessions ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE work_sessions DROP CONSTRAINT IF EXISTS work_sessions_minutes_check;
ALTER TABLE work_sessions
  ADD CONSTRAINT work_sessions_minutes_check CHECK (minutes BETWEEN 0 AND 1440);
ALTER TABLE work_sessions
  ADD CONSTRAINT work_sessions_actual_minutes_check CHECK (actual_minutes BETWEEN 0 AND 1440);
ALTER TABLE work_sessions
  ADD CONSTRAINT work_sessions_planned_minutes_check
  CHECK (planned_minutes IS NULL OR planned_minutes BETWEEN 1 AND 1440);

ALTER TABLE work_sessions DROP CONSTRAINT IF EXISTS work_sessions_project_id_fkey;
ALTER TABLE work_sessions
  ADD CONSTRAINT work_sessions_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_sessions_focus_block_unique
  ON work_sessions (focus_block_id) WHERE focus_block_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_sessions_review_unique
  ON work_sessions (review_id) WHERE review_id IS NOT NULL;

-- One transaction owns the invariant: reviewing block + structured review ->
-- exactly one Work session + only the explicitly confirmed updates.
CREATE OR REPLACE FUNCTION complete_work_review(
  p_user_id UUID,
  p_focus_block_id UUID,
  p_review JSONB,
  p_updates JSONB DEFAULT '{"tasks":[],"project":{}}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_block focus_blocks%ROWTYPE;
  v_project projects%ROWTYPE;
  v_review_id UUID := gen_random_uuid();
  v_session_id UUID := gen_random_uuid();
  v_task_update JSONB;
  v_task_id UUID;
  v_action TEXT;
  v_project_updates JSONB := COALESCE(p_updates->'project', '{}'::jsonb);
  v_context JSONB;
BEGIN
  SELECT * INTO v_block
  FROM focus_blocks
  WHERE id = p_focus_block_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Focus block not found';
  END IF;
  IF v_block.status <> 'reviewing' OR v_block.review_trigger IS NULL THEN
    RAISE EXCEPTION 'Focus block is not awaiting review';
  END IF;
  IF EXISTS (SELECT 1 FROM work_reviews WHERE focus_block_id = v_block.id) THEN
    RAISE EXCEPTION 'Focus block review already completed';
  END IF;

  IF v_block.project_id IS NOT NULL THEN
    SELECT * INTO v_project
    FROM projects
    WHERE id = v_block.project_id AND user_id = p_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Project not found';
    END IF;
  ELSIF v_project_updates <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Standalone Work has no Project to update';
  END IF;

  FOR v_task_update IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_updates->'tasks', '[]'::jsonb))
  LOOP
    v_task_id := (v_task_update->>'taskId')::uuid;
    v_action := v_task_update->>'action';
    IF NOT (v_task_id = ANY(v_block.task_ids)) THEN
      RAISE EXCEPTION 'Review update references a Task outside the Focus block';
    END IF;

    IF v_action = 'complete' THEN
      UPDATE tasks SET completed = TRUE, completed_at = NOW(), deferred_at = NULL
      WHERE id = v_task_id AND user_id = p_user_id AND deleted_at IS NULL;
    ELSIF v_action IN ('reopen', 'reactivate') THEN
      UPDATE tasks SET completed = FALSE, completed_at = NULL, deferred_at = NULL
      WHERE id = v_task_id AND user_id = p_user_id AND deleted_at IS NULL;
    ELSIF v_action = 'defer' THEN
      UPDATE tasks SET completed = FALSE, completed_at = NULL, deferred_at = NOW()
      WHERE id = v_task_id AND user_id = p_user_id AND deleted_at IS NULL;
    ELSE
      RAISE EXCEPTION 'Invalid Task review action';
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced Task not found';
    END IF;
  END LOOP;

  IF v_block.project_id IS NOT NULL AND v_project_updates <> '{}'::jsonb THEN
    v_context := COALESCE(v_project.context, '{}'::jsonb);
    IF v_project_updates ? 'addBlocker' THEN
      v_context := jsonb_set(
        v_context,
        '{blockers}',
        COALESCE(v_context->'blockers', '[]'::jsonb) || to_jsonb(v_project_updates->>'addBlocker'),
        TRUE
      );
    END IF;
    IF v_project_updates ? 'nextStep' THEN
      v_context := jsonb_set(v_context, '{nextStep}', to_jsonb(v_project_updates->>'nextStep'), TRUE);
    END IF;

    UPDATE projects
    SET context = v_context,
        milestone = CASE
          WHEN v_project_updates ? 'milestone' THEN v_project_updates->>'milestone'
          ELSE milestone
        END
    WHERE id = v_block.project_id AND user_id = p_user_id;
  END IF;

  INSERT INTO work_reviews (
    id, user_id, focus_block_id, trigger, what_changed, evidence_produced,
    milestone_impact, what_got_in_way, unnecessary_work, actual_minutes,
    next_step, attention, confirmed_updates
  ) VALUES (
    v_review_id,
    p_user_id,
    v_block.id,
    v_block.review_trigger,
    p_review->>'whatChanged',
    COALESCE(p_review->>'evidenceProduced', ''),
    p_review->>'milestoneImpact',
    COALESCE(p_review->>'whatGotInWay', ''),
    COALESCE(p_review->>'unnecessaryWork', ''),
    (p_review->>'actualMinutes')::integer,
    p_review->>'nextStep',
    p_review->>'attention',
    COALESCE(p_updates, '{"tasks":[],"project":{}}'::jsonb)
  );

  INSERT INTO work_sessions (
    id, user_id, project_id, focus_block_id, review_id, task_id, task_ids,
    standalone_title, standalone_context, occurred_at, minutes, actual_minutes,
    planned_minutes, outcome, evidence, attention, note, blocker_info,
    drift_info, next_step, started_at, ended_at
  ) VALUES (
    v_session_id,
    p_user_id,
    v_block.project_id,
    v_block.id,
    v_review_id,
    CASE WHEN cardinality(v_block.task_ids) > 0 THEN v_block.task_ids[1] ELSE NULL END,
    v_block.task_ids,
    v_block.standalone_title,
    v_block.standalone_context,
    COALESCE(v_block.ended_at, NOW()),
    (p_review->>'actualMinutes')::integer,
    (p_review->>'actualMinutes')::integer,
    v_block.planned_minutes,
    p_review->>'whatChanged',
    NULLIF(p_review->>'evidenceProduced', ''),
    p_review->>'attention',
    NULLIF(p_review->>'whatGotInWay', ''),
    NULLIF(p_review->>'whatGotInWay', ''),
    CASE WHEN v_block.review_trigger = 'drifted'
      THEN NULLIF(p_review->>'unnecessaryWork', '') ELSE NULL END,
    p_review->>'nextStep',
    v_block.started_at,
    COALESCE(v_block.ended_at, NOW())
  );

  UPDATE focus_blocks
  SET status = 'completed', ended_at = COALESCE(ended_at, NOW()), updated_at = NOW()
  WHERE id = v_block.id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'focusBlockId', v_block.id,
    'reviewId', v_review_id,
    'sessionId', v_session_id
  );
END;
$$;

-- Project deletion preserves canonical Tasks, Focus blocks, and Work sessions
-- by converting historical Project references into bounded standalone context.
CREATE OR REPLACE FUNCTION delete_work_project_safely(
  p_user_id UUID,
  p_project_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project projects%ROWTYPE;
  v_context_snapshot TEXT;
BEGIN
  SELECT * INTO v_project
  FROM projects
  WHERE id = p_project_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM focus_blocks
    WHERE project_id = p_project_id AND user_id = p_user_id
      AND status IN ('active', 'reviewing')
  ) THEN
    RAISE EXCEPTION 'Project has an active Focus block';
  END IF;

  v_context_snapshot := left(concat_ws(E'\n',
    NULLIF(v_project.target, ''),
    NULLIF(v_project.milestone, ''),
    NULLIF(v_project.context::text, '{}')
  ), 2000);

  UPDATE focus_blocks
  SET project_id = NULL,
      standalone_title = COALESCE(standalone_title, v_project.name),
      standalone_context = COALESCE(standalone_context, v_context_snapshot),
      updated_at = NOW()
  WHERE project_id = p_project_id AND user_id = p_user_id;

  UPDATE work_sessions
  SET project_id = NULL,
      standalone_title = COALESCE(standalone_title, v_project.name),
      standalone_context = COALESCE(standalone_context, v_context_snapshot)
  WHERE project_id = p_project_id AND user_id = p_user_id;

  UPDATE tasks
  SET project_id = NULL, target_relation = NULL
  WHERE project_id = p_project_id AND user_id = p_user_id;

  DELETE FROM projects WHERE id = p_project_id AND user_id = p_user_id;
  RETURN jsonb_build_object('deleted', TRUE, 'projectId', p_project_id);
END;
$$;

REVOKE ALL ON FUNCTION complete_work_review(UUID, UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_work_review(UUID, UUID, JSONB, JSONB) TO service_role;
REVOKE ALL ON FUNCTION delete_work_project_safely(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_work_project_safely(UUID, UUID) TO service_role;

COMMENT ON COLUMN projects.focus_block IS
  'Deprecated display-string JSON from the early Work prototype. New Focus blocks live in focus_blocks.';
