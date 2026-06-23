CREATE TABLE external_calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google')),
    provider_calendar_id TEXT NOT NULL,
    provider_event_id TEXT NOT NULL,
    etag TEXT,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_at TIMESTAMP WITH TIME ZONE,
    end_at TIMESTAMP WITH TIME ZONE,
    all_day BOOLEAN DEFAULT FALSE,
    status TEXT,
    html_link TEXT,
    raw JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (user_id, provider, provider_calendar_id, provider_event_id)
);

CREATE INDEX idx_external_calendar_events_user_date
    ON external_calendar_events(user_id, start_at, end_at);

ALTER TABLE external_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own external calendar events" ON external_calendar_events
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own external calendar events" ON external_calendar_events
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own external calendar events" ON external_calendar_events
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own external calendar events" ON external_calendar_events
    FOR DELETE USING (auth.uid() = user_id);
