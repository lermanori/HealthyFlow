-- Daily Habit parents are virtual-first templates, not dated work rows.
-- Per-day state belongs to virtual or materialized Habit instances.
UPDATE tasks
SET scheduled_date = NULL,
    position = NULL,
    habit_outcome = NULL,
    completed = FALSE,
    completed_at = NULL
WHERE type = 'habit'
  AND repeat_type = 'daily'
  AND original_habit_id IS NULL
  AND (scheduled_date IS NOT NULL OR position IS NOT NULL OR completed OR habit_outcome IS NOT NULL);
