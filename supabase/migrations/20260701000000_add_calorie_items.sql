-- Calorie items: reusable per-user food history powering the quick-insert modal.
-- The code in supabase-client.ts (createCalorieEntry → upsertCalorieItem) already
-- reads/writes this table and calls the upsert_calorie_item_usage RPC, but the
-- migration was never shipped with the quick-insert feature. Result: every calorie
-- entry create (manual AND AI) threw on the missing relation before the entry row
-- was inserted, so nothing persisted and the log always looked empty.

CREATE TABLE IF NOT EXISTS calorie_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    calories        INTEGER NOT NULL,
    protein         NUMERIC,
    carbs           NUMERIC,
    fat             NUMERIC,
    usage_count     INTEGER NOT NULL DEFAULT 1,
    last_used_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    -- One item per normalized name per user; the upsert path depends on this.
    UNIQUE (user_id, normalized_name)
);

-- getRecentCalorieItems orders by last_used_at desc; getMostUsedCalorieItems by
-- usage_count desc, last_used_at desc. Both filter by user_id.
CREATE INDEX IF NOT EXISTS idx_calorie_items_user_id_last_used
    ON calorie_items(user_id, last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_calorie_items_user_id_usage
    ON calorie_items(user_id, usage_count DESC, last_used_at DESC);

-- Atomic bump of an existing item's usage in one statement (no read-then-write
-- race). Returns the updated row so the caller can map it to the client shape.
CREATE OR REPLACE FUNCTION upsert_calorie_item_usage(
    p_user_id UUID,
    p_normalized_name TEXT,
    p_now TIMESTAMP WITH TIME ZONE
)
RETURNS calorie_items LANGUAGE sql AS $$
  UPDATE calorie_items
     SET usage_count = usage_count + 1,
         last_used_at = p_now,
         updated_at = p_now
   WHERE user_id = p_user_id AND normalized_name = p_normalized_name
  RETURNING *;
$$;
