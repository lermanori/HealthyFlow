-- Reusable workout plans pre-fill editable Workout sessions.

CREATE TABLE IF NOT EXISTS workout_plans (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT,
    note        TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_plans_user_position
    ON workout_plans(user_id, position ASC, created_at ASC);

CREATE TABLE IF NOT EXISTS workout_plan_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id          UUID NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    sets             NUMERIC,
    reps             NUMERIC,
    weight_kg        NUMERIC,
    duration_minutes NUMERIC,
    distance_km      NUMERIC,
    notes            TEXT,
    position         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_workout_plan_items_plan_position
    ON workout_plan_items(plan_id, position ASC);
