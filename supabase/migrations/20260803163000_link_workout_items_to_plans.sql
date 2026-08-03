-- Phase 3: a planned Workout is an Item that references a reusable Workout plan.
-- Completing the Item never writes a Workout session; the plan and actual remain
-- independently owned records.

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_type_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_type_check
  CHECK (type IN ('task', 'habit', 'grocery', 'meal', 'workout'));

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS workout_plan_id UUID
  REFERENCES workout_plans(id) ON DELETE SET NULL;

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_workout_plan_type_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_workout_plan_type_check
  CHECK (workout_plan_id IS NULL OR type = 'workout');

CREATE INDEX IF NOT EXISTS idx_tasks_workout_plan_id
  ON tasks(workout_plan_id)
  WHERE workout_plan_id IS NOT NULL;
