-- Workout Tracker: dated completed sessions plus reusable exercise-item history.

CREATE TABLE IF NOT EXISTS workout_exercise_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    usage_count     INTEGER NOT NULL DEFAULT 1,
    last_used_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_workout_exercise_items_user_id_last_used
    ON workout_exercise_items(user_id, last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_exercise_items_user_id_usage
    ON workout_exercise_items(user_id, usage_count DESC, last_used_at DESC);

CREATE TABLE IF NOT EXISTS workout_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    title       TEXT,
    notes       TEXT,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_id_date
    ON workout_sessions(user_id, date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS workout_session_exercises (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    sets             NUMERIC,
    reps             NUMERIC,
    weight_kg        NUMERIC,
    duration_minutes NUMERIC,
    distance_km      NUMERIC,
    notes            TEXT,
    position         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_workout_session_exercises_session_position
    ON workout_session_exercises(session_id, position ASC);

CREATE OR REPLACE FUNCTION upsert_workout_exercise_item_usage(
    p_user_id UUID,
    p_normalized_name TEXT,
    p_now TIMESTAMP WITH TIME ZONE
)
RETURNS workout_exercise_items LANGUAGE sql AS $$
  UPDATE workout_exercise_items
     SET usage_count = usage_count + 1,
         last_used_at = p_now,
         updated_at = p_now
   WHERE user_id = p_user_id AND normalized_name = p_normalized_name
  RETURNING *;
$$;
