CREATE TABLE calendar_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google')),
    provider_account_email TEXT,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT NOT NULL,
    token_expiry TIMESTAMP WITH TIME ZONE,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    disconnected_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (user_id, provider)
);

CREATE INDEX idx_calendar_connections_user_id ON calendar_connections(user_id);

ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calendar connections" ON calendar_connections
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calendar connections" ON calendar_connections
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calendar connections" ON calendar_connections
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own calendar connections" ON calendar_connections
    FOR DELETE USING (auth.uid() = user_id);
