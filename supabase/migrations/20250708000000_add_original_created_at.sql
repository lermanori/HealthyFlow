-- Add original_created_at column to tasks table for tracking original task creation date
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMP WITH TIME ZONE; 