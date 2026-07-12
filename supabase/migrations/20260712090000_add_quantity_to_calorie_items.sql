-- Calorie item history must remember the quantity that nutrition totals apply to.
-- This lets reusable history distinguish "Eggs · 1 egg" from "Eggs · 2 eggs".

ALTER TABLE calorie_items
    ADD COLUMN IF NOT EXISTS quantity TEXT,
    ADD COLUMN IF NOT EXISTS normalized_quantity TEXT NOT NULL DEFAULT '';

UPDATE calorie_items
   SET normalized_quantity = ''
 WHERE normalized_quantity IS NULL;

ALTER TABLE calorie_items
    ALTER COLUMN normalized_quantity SET DEFAULT '';

ALTER TABLE calorie_items
    DROP CONSTRAINT IF EXISTS calorie_items_user_id_normalized_name_key;

ALTER TABLE calorie_items
    ADD CONSTRAINT calorie_items_user_id_normalized_name_quantity_key
    UNIQUE (user_id, normalized_name, normalized_quantity);

CREATE INDEX IF NOT EXISTS idx_calorie_items_user_name_quantity
    ON calorie_items(user_id, normalized_name, normalized_quantity);

DROP FUNCTION IF EXISTS upsert_calorie_item_usage(UUID, TEXT, TIMESTAMP WITH TIME ZONE);

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
         updated_at = p_now
   WHERE user_id = p_user_id
     AND normalized_name = p_normalized_name
     AND normalized_quantity = p_normalized_quantity
  RETURNING *;
$$;
