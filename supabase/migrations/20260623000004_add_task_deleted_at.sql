ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_tasks_user_deleted_at
  ON tasks(user_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_tasks_original_habit_deleted_date
  ON tasks(original_habit_id, deleted_at, scheduled_date);
