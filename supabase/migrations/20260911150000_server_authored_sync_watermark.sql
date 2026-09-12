-- A sync watermark must come from the clock it is compared against.
--
-- `rowsChangedSince` filtered on `updated_at`, which is written by whichever
-- device changed the row, while `since` is a server-clock reading. Those are
-- different clocks, so a row written by one device could sit below another
-- device's watermark and never be handed over — permanently, because
-- `updated_at` never moves again. Two devices on one account stopped seeing each
-- other's edits and deletions.
--
-- `synced_at` is stamped by the server on every accepted write, so the filter and
-- the watermark now share one clock and one authority. `updated_at` goes back to
-- its real job — deciding which of two versions of a row wins — and is never
-- used as a stream position again.

-- Backfill to `updated_at` so existing rows keep a sensible position rather than
-- all arriving at once on the next pull.
ALTER TABLE tasks                    ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE habit_progress_entries   ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE calorie_entries          ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE calorie_items            ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE weight_entries           ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE workout_sessions         ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE workout_plans            ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE workout_exercise_items   ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE achievement_definitions  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE achievement_entries      ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE goals                    ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

UPDATE tasks                   SET synced_at = COALESCE(updated_at, created_at) WHERE synced_at IS NULL;
UPDATE habit_progress_entries  SET synced_at = COALESCE(updated_at, created_at) WHERE synced_at IS NULL;
UPDATE calorie_entries         SET synced_at = COALESCE(updated_at, created_at) WHERE synced_at IS NULL;
UPDATE calorie_items           SET synced_at = COALESCE(updated_at, created_at) WHERE synced_at IS NULL;
UPDATE weight_entries          SET synced_at = COALESCE(updated_at, created_at) WHERE synced_at IS NULL;
UPDATE workout_sessions        SET synced_at = COALESCE(updated_at, created_at) WHERE synced_at IS NULL;
UPDATE workout_plans           SET synced_at = COALESCE(updated_at, created_at) WHERE synced_at IS NULL;
UPDATE workout_exercise_items  SET synced_at = COALESCE(updated_at, created_at) WHERE synced_at IS NULL;
UPDATE achievement_definitions SET synced_at = COALESCE(updated_at, created_at) WHERE synced_at IS NULL;
UPDATE achievement_entries     SET synced_at = COALESCE(updated_at, created_at) WHERE synced_at IS NULL;
UPDATE goals                   SET synced_at = COALESCE(updated_at, created_at) WHERE synced_at IS NULL;

-- Every pull is "this user's rows above this watermark", so that is the index.
CREATE INDEX IF NOT EXISTS idx_tasks_user_synced_at                   ON tasks(user_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_habit_progress_user_synced_at          ON habit_progress_entries(user_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_calorie_entries_user_synced_at         ON calorie_entries(user_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_calorie_items_user_synced_at           ON calorie_items(user_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_weight_entries_user_synced_at          ON weight_entries(user_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_synced_at        ON workout_sessions(user_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_workout_plans_user_synced_at           ON workout_plans(user_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_workout_exercise_items_user_synced_at  ON workout_exercise_items(user_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_achievement_definitions_user_synced_at ON achievement_definitions(user_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_achievement_entries_user_synced_at     ON achievement_entries(user_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_goals_user_synced_at                   ON goals(user_id, synced_at);

COMMENT ON COLUMN tasks.synced_at IS
  'When the server accepted this row. The sync pull watermark compares against this, never against updated_at, which is written by the device that made the change and therefore carries that device''s clock.';
