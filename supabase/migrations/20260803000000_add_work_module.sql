-- The Work module turns a Project from a coloured label into a durable record:
-- a target the Project is aimed at, the bounded context needed to judge whether
-- a Task still serves that target, and the Work sessions that actually happened.

-- A Project's target and the record of what it is bounded by. Everything is
-- nullable or defaulted: existing Projects stay valid and simply have nothing
-- recorded yet, which the UI states plainly rather than inventing.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS target TEXT,
  ADD COLUMN IF NOT EXISTS milestone TEXT,
  ADD COLUMN IF NOT EXISTS definition_of_done TEXT,
  ADD COLUMN IF NOT EXISTS deadline TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Planned';

-- Bounded context, shaped by work-contracts.ts (summary, blockers, constraints,
-- nonGoals, decisions, links, nextStep). One document per Project rather than
-- six join tables: it is always read and written whole, and Talk consumes it
-- whole. An empty object is a Project with no context recorded yet.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The single planned Focus block for a Project (time, task, evidence, duration,
-- status). NULL means no block is planned. A Focus block is a *plan*, so it is
-- overwritten rather than accumulated — what actually happened is a Work
-- session, which is a separate, append-only record.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS focus_block JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_status_check
      CHECK (status IN ('Planned', 'Active', 'Paused', 'Done'));
  END IF;
END
$$;

-- Tasks have carried a projectId on the client since Projects shipped, but it
-- was never persisted. Adding the column is what makes "the Tasks of a Project"
-- answerable at all. ON DELETE SET NULL: deleting a Project must not delete the
-- user's Tasks.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- How this Task relates to its Project's target. Recorded by the user, not
-- inferred: it is the judgement the Work module exists to make visible.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS target_relation TEXT;

-- Deferred is a third state alongside open and completed: consciously set aside
-- without being finished. A timestamp rather than a boolean so "when did I stop
-- caring about this" stays answerable.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS deferred_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_target_relation_check'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_target_relation_check
      CHECK (target_relation IS NULL OR target_relation IN (
        'Unblocking', 'Direct progress', 'Maintenance', 'Optional', 'Unrelated now'
      ));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id) WHERE project_id IS NOT NULL;

-- What actually happened. Append-only history, deliberately separate from the
-- Focus block plan so a recorded session can never be silently rewritten by
-- re-planning, and so "planned vs recorded" stays an honest comparison.
CREATE TABLE IF NOT EXISTS work_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    -- The Task worked on, if the session came from a Focus block. Kept as a
    -- reference so completing or deleting the Task does not erase the record
    -- that time was spent on it.
    task_id     UUID REFERENCES tasks(id) ON DELETE SET NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    minutes     INTEGER NOT NULL CHECK (minutes > 0 AND minutes <= 1440),
    outcome     TEXT NOT NULL,
    evidence    TEXT,
    attention   TEXT NOT NULL DEFAULT 'Focused' CHECK (attention IN ('Focused', 'Mixed', 'Drifted')),
    note        TEXT,
    next_step   TEXT,
    -- Written after the fact, in Talk. Empty until the session is reviewed.
    review      TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_sessions_project_id
  ON work_sessions (project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_sessions_user_id ON work_sessions (user_id);
