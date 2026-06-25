CREATE TABLE IF NOT EXISTS achievement_definitions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    category         TEXT,
    metric_type      TEXT NOT NULL CHECK (metric_type IN ('reps', 'weight', 'duration', 'distance', 'custom')),
    unit             TEXT NOT NULL,
    better_direction TEXT NOT NULL CHECK (better_direction IN ('higher', 'lower')),
    target_value     NUMERIC,
    archived_at      TIMESTAMP WITH TIME ZONE,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT achievement_definitions_target_positive CHECK (target_value IS NULL OR target_value > 0)
);

CREATE INDEX IF NOT EXISTS idx_achievement_definitions_user_id
ON achievement_definitions(user_id, archived_at, created_at DESC);

CREATE TABLE IF NOT EXISTS achievement_entries (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    achievement_id UUID NOT NULL REFERENCES achievement_definitions(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date           DATE NOT NULL,
    value          NUMERIC NOT NULL CHECK (value > 0),
    supporting_value NUMERIC,
    supporting_unit  TEXT,
    notes          TEXT,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT achievement_entries_supporting_value_positive CHECK (supporting_value IS NULL OR supporting_value > 0),
    CONSTRAINT achievement_entries_supporting_unit_pair CHECK (
        (supporting_value IS NULL AND supporting_unit IS NULL)
        OR (supporting_value IS NOT NULL AND supporting_unit IS NOT NULL)
    ),
    CONSTRAINT achievement_entries_user_achievement_date_unique UNIQUE (user_id, achievement_id, date)
);

CREATE INDEX IF NOT EXISTS idx_achievement_entries_achievement_date
ON achievement_entries(achievement_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_achievement_entries_user_date
ON achievement_entries(user_id, date DESC);
