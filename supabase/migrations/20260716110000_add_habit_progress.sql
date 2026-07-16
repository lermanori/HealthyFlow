-- Habit outcomes and chunked progress for per-day Habit instances.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS habit_target_value NUMERIC,
  ADD COLUMN IF NOT EXISTS habit_target_unit TEXT,
  ADD COLUMN IF NOT EXISTS habit_outcome TEXT;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_habit_target_pair_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_habit_target_pair_check CHECK (
  (habit_target_value IS NULL AND habit_target_unit IS NULL)
  OR (habit_target_value > 0 AND habit_target_unit IN ('minutes', 'reps', 'count'))
);

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_habit_outcome_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_habit_outcome_check CHECK (
  habit_outcome IS NULL OR habit_outcome IN ('pending', 'partial', 'completed', 'failed')
);

UPDATE tasks
SET habit_outcome = CASE WHEN completed THEN 'completed' ELSE 'pending' END
WHERE type = 'habit' AND original_habit_id IS NOT NULL AND habit_outcome IS NULL;

CREATE TABLE IF NOT EXISTS habit_progress_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_instance_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 120),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_habit_progress_instance_created
  ON habit_progress_entries(habit_instance_id, created_at);
CREATE INDEX IF NOT EXISTS idx_habit_progress_user
  ON habit_progress_entries(user_id);

ALTER TABLE habit_progress_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own habit progress" ON habit_progress_entries;
CREATE POLICY "Users can view own habit progress" ON habit_progress_entries FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own habit progress" ON habit_progress_entries;
CREATE POLICY "Users can insert own habit progress" ON habit_progress_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own habit progress" ON habit_progress_entries;
CREATE POLICY "Users can update own habit progress" ON habit_progress_entries FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own habit progress" ON habit_progress_entries;
CREATE POLICY "Users can delete own habit progress" ON habit_progress_entries FOR DELETE USING (auth.uid() = user_id);

-- Keep progress totals, outcome, and the legacy completed mirror in the same
-- transaction as every chunk mutation. Explicit failed outcomes are cleared by
-- the next entry change, then derived from the remaining total again.
CREATE OR REPLACE FUNCTION sync_habit_progress_outcome()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  instance_id UUID := COALESCE(NEW.habit_instance_id, OLD.habit_instance_id);
  progress_total NUMERIC;
  target_value NUMERIC;
  next_outcome TEXT;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO progress_total
  FROM habit_progress_entries
  WHERE habit_instance_id = instance_id;

  SELECT habit_target_value
  INTO target_value
  FROM tasks
  WHERE id = instance_id;

  next_outcome := CASE
    WHEN target_value IS NOT NULL AND progress_total >= target_value THEN 'completed'
    WHEN progress_total > 0 THEN 'partial'
    ELSE 'pending'
  END;

  UPDATE tasks
  SET habit_outcome = next_outcome,
      completed = next_outcome = 'completed',
      completed_at = CASE
        WHEN next_outcome = 'completed' THEN COALESCE(completed_at, NOW())
        ELSE NULL
      END
  WHERE id = instance_id AND type = 'habit';

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS habit_progress_sync_outcome ON habit_progress_entries;
CREATE TRIGGER habit_progress_sync_outcome
AFTER INSERT OR UPDATE OR DELETE ON habit_progress_entries
FOR EACH ROW EXECUTE FUNCTION sync_habit_progress_outcome();
