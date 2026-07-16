-- Keep the most recently logged prescription with each reusable exercise item.

ALTER TABLE workout_exercise_items
    ADD COLUMN IF NOT EXISTS sets NUMERIC,
    ADD COLUMN IF NOT EXISTS reps NUMERIC,
    ADD COLUMN IF NOT EXISTS weight_kg NUMERIC,
    ADD COLUMN IF NOT EXISTS duration_minutes NUMERIC,
    ADD COLUMN IF NOT EXISTS distance_km NUMERIC,
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- Recover prescriptions for existing history entries from the latest logged session.
WITH latest_logged_exercise AS (
    SELECT DISTINCT ON (session.user_id, LOWER(BTRIM(exercise.name)))
        session.user_id,
        LOWER(BTRIM(exercise.name)) AS normalized_name,
        exercise.sets,
        exercise.reps,
        exercise.weight_kg,
        exercise.duration_minutes,
        exercise.distance_km,
        exercise.notes
    FROM workout_session_exercises AS exercise
    JOIN workout_sessions AS session ON session.id = exercise.session_id
    ORDER BY
        session.user_id,
        LOWER(BTRIM(exercise.name)),
        session.date DESC,
        session.created_at DESC,
        exercise.position DESC
)
UPDATE workout_exercise_items AS item
SET sets = latest.sets,
    reps = latest.reps,
    weight_kg = latest.weight_kg,
    duration_minutes = latest.duration_minutes,
    distance_km = latest.distance_km,
    notes = latest.notes
FROM latest_logged_exercise AS latest
WHERE item.user_id = latest.user_id
  AND item.normalized_name = latest.normalized_name;

DROP FUNCTION IF EXISTS upsert_workout_exercise_item_usage(UUID, TEXT, TIMESTAMP WITH TIME ZONE);

CREATE OR REPLACE FUNCTION upsert_workout_exercise_item_usage(
    p_user_id UUID,
    p_normalized_name TEXT,
    p_name TEXT,
    p_sets NUMERIC,
    p_reps NUMERIC,
    p_weight_kg NUMERIC,
    p_duration_minutes NUMERIC,
    p_distance_km NUMERIC,
    p_notes TEXT,
    p_now TIMESTAMP WITH TIME ZONE
)
RETURNS workout_exercise_items LANGUAGE sql AS $$
  UPDATE workout_exercise_items
     SET name = p_name,
         sets = p_sets,
         reps = p_reps,
         weight_kg = p_weight_kg,
         duration_minutes = p_duration_minutes,
         distance_km = p_distance_km,
         notes = p_notes,
         usage_count = usage_count + 1,
         last_used_at = p_now,
         updated_at = p_now
   WHERE user_id = p_user_id AND normalized_name = p_normalized_name
  RETURNING *;
$$;
