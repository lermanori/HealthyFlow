-- Create calorie_entries table (own concern, separate from tasks)
CREATE TABLE IF NOT EXISTS calorie_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    name        TEXT NOT NULL,
    calories    INTEGER NOT NULL,
    protein     NUMERIC,
    carbs       NUMERIC,
    fat         NUMERIC,
    quantity    TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calorie_entries_user_id_date ON calorie_entries(user_id, date);
