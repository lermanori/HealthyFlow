ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS google_event_id TEXT,
    ADD COLUMN IF NOT EXISTS synced_to_google BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS google_sync_status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_tasks_google_event_id ON tasks(google_event_id);
