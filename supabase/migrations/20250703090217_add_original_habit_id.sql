-- Add original_habit_id column to tasks table for habit instance tracking
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS original_habit_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
