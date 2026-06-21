-- Add position column to tasks for manual ordering of untimed (Anytime) items
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS position INTEGER;
