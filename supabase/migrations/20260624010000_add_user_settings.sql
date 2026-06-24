-- One row per user; single JSONB column so future toggles need no migration
CREATE TABLE IF NOT EXISTS user_settings (
    user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
