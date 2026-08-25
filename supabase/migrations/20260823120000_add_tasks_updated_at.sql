-- Delta sync asks "what changed since X". The tasks table could not answer:
-- every other table carries updated_at and this one never did.
--
-- A trigger rather than application code, deliberately. Task rows are written from
-- the routes, the AI capabilities, the Talk workflows, rollover and habit
-- materialization. Setting the column at each of those means one of them is
-- eventually missed, and a row that silently stops syncing is indistinguishable
-- from one that never changed.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

-- Existing rows have only ever been created, as far as anything can now tell.
UPDATE tasks SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE tasks
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE tasks
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_touch_updated_at ON tasks;

CREATE TRIGGER tasks_touch_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION touch_updated_at();

-- The delta query is "mine, changed since X", so it is indexed that way.
CREATE INDEX IF NOT EXISTS idx_tasks_user_updated_at
  ON tasks (user_id, updated_at);
