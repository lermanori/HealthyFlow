CREATE TABLE IF NOT EXISTS assistant_conversations (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title text NOT NULL,
    model text NOT NULL,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assistant_messages (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position integer NOT NULL,
    role text NOT NULL CHECK (role IN ('user', 'assistant')),
    content text NOT NULL,
    display_content text,
    hidden boolean NOT NULL DEFAULT false,
    attachment jsonb,
    tool_events jsonb,
    pending_actions jsonb,
    error boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_conversations_user_updated_at_idx
    ON assistant_conversations (user_id, updated_at DESC)
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS assistant_messages_conversation_position_idx
    ON assistant_messages (conversation_id, position);

ALTER TABLE assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assistant conversations" ON assistant_conversations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own assistant conversations" ON assistant_conversations
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own assistant messages" ON assistant_messages
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own assistant messages" ON assistant_messages
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
