CREATE TABLE IF NOT EXISTS weight_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    weight_kg   NUMERIC NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT weight_entries_user_id_date_unique UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_weight_entries_user_id_date
ON weight_entries(user_id, date DESC);
