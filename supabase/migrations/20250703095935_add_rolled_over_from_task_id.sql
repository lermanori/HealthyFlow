-- Add rolled_over_from_task_id column to tasks table for robust rollover tracking
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rolled_over_from_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
