ALTER TABLE calorie_entries
ADD COLUMN IF NOT EXISTS time TIME;

CREATE INDEX IF NOT EXISTS idx_calorie_entries_user_id_date_time
ON calorie_entries(user_id, date, time);
