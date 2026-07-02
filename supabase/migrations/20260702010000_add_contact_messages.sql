CREATE TABLE IF NOT EXISTS contact_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('subscribe', 'topup')),
    message     TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'handled')),
    handled_at  TIMESTAMP WITH TIME ZONE,
    handled_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_messages_status_created_at_idx
    ON contact_messages (status, created_at DESC);

CREATE INDEX IF NOT EXISTS contact_messages_user_created_at_idx
    ON contact_messages (user_id, created_at DESC);

ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contact messages" ON contact_messages
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own contact messages" ON contact_messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);
