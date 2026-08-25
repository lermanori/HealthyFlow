-- A deleted health record has to stay deleted.
--
-- Items have soft-deleted since 20260623000004: `deleted_at` is set, the row
-- stays, and the deletion travels as data. The eight health tables never did, so
-- to a delta sync "absent" and "deleted" are the same thing and the next pull
-- resurrects the row. Nothing reports an error — the meal simply comes back.
--
-- No trigger here. Unlike `tasks`, these tables are written from a handful of
-- services that already stamp `updated_at` themselves, and the sync writes the
-- column explicitly with the device's own timestamp: which of two edits happened
-- later is a question only the device can answer.

ALTER TABLE calorie_entries         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE calorie_items           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE weight_entries          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE workout_sessions        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE workout_plans           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE workout_exercise_items  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE achievement_definitions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE achievement_entries     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- The delta query is "mine, changed since X", so each table is indexed that way.
CREATE INDEX IF NOT EXISTS idx_calorie_entries_user_updated_at
  ON calorie_entries (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_calorie_items_user_updated_at
  ON calorie_items (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_weight_entries_user_updated_at
  ON weight_entries (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_updated_at
  ON workout_sessions (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_workout_plans_user_updated_at
  ON workout_plans (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_workout_exercise_items_user_updated_at
  ON workout_exercise_items (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_achievement_definitions_user_updated_at
  ON achievement_definitions (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_achievement_entries_user_updated_at
  ON achievement_entries (user_id, updated_at);

-- Reusing a history item revives it. The natural-key row must stay in place so
-- another device can receive its tombstone, but logging the same food/exercise
-- again makes it live history once more.
CREATE OR REPLACE FUNCTION upsert_calorie_item_usage(
    p_user_id UUID,
    p_normalized_name TEXT,
    p_normalized_quantity TEXT,
    p_now TIMESTAMP WITH TIME ZONE
)
RETURNS calorie_items LANGUAGE sql AS $$
  UPDATE calorie_items
     SET usage_count = usage_count + 1,
         last_used_at = p_now,
         updated_at = p_now,
         deleted_at = NULL
   WHERE user_id = p_user_id
     AND normalized_name = p_normalized_name
     AND normalized_quantity = p_normalized_quantity
  RETURNING *;
$$;

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
         updated_at = p_now,
         deleted_at = NULL
   WHERE user_id = p_user_id AND normalized_name = p_normalized_name
  RETURNING *;
$$;
