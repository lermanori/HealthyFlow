-- Server-side writes must reach devices.
--
-- Devices pull "rows with synced_at after my watermark" (backend/src/sync.ts,
-- rowsChangedSince). Only the sync route stamped `synced_at`, so a row written
-- anywhere else — MCP tools used from ChatGPT or Claude, REST routes, rollover —
-- kept NULL (or an old stamp) and an already-synced device never pulled it. Tasks
-- added from ChatGPT existed on the server and never appeared in the app.
--
-- A trigger rather than application code, for the reason given in
-- 20260823120000_add_tasks_updated_at.sql: rows are written from many paths, and
-- setting the column at each of them means one is eventually missed.
--
-- The sync route always sets a new `synced_at` itself; that value is kept. Any
-- other write gets the server's current time.

CREATE OR REPLACE FUNCTION stamp_synced_at()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.synced_at := COALESCE(NEW.synced_at, NOW());
  ELSIF NEW.synced_at IS NOT DISTINCT FROM OLD.synced_at THEN
    NEW.synced_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  synced_table TEXT;
BEGIN
  FOREACH synced_table IN ARRAY ARRAY[
    'tasks',
    'habit_progress_entries',
    'calorie_entries',
    'calorie_items',
    'weight_entries',
    'workout_sessions',
    'workout_plans',
    'workout_exercise_items',
    'achievement_definitions',
    'achievement_entries',
    'goals'
  ]
  LOOP
    -- Rows written outside sync so far, including those from MCP, join the stream now.
    EXECUTE format('UPDATE %I SET synced_at = NOW() WHERE synced_at IS NULL', synced_table);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', synced_table || '_stamp_synced_at', synced_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION stamp_synced_at()',
      synced_table || '_stamp_synced_at',
      synced_table
    );
  END LOOP;
END;
$$;
