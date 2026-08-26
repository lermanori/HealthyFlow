-- Free-speech direction per existing HealthyFlow module.
-- Goals do not carry dates, completion or progress; owning modules record those.

CREATE TABLE IF NOT EXISTS goals (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module      TEXT NOT NULL CHECK (module IN (
      'whole_day', 'work', 'tasks', 'habits', 'nutrition', 'workouts', 'progress'
    )),
    statement   TEXT NOT NULL CHECK (char_length(statement) BETWEEN 1 AND 500),
    context     TEXT NOT NULL DEFAULT '' CHECK (char_length(context) <= 4000),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_goals_user_module
    ON goals(user_id, module, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_goals_user_updated
    ON goals(user_id, updated_at ASC);

-- Preserve the Personal assistant prototype's free-speech direction. Its
-- priority/constraint split was a Settings concern only by accident; both kinds
-- become unclassified Whole day Goals so migration never guesses an owning
-- module. The user can reassign or combine them in Goals afterwards.
INSERT INTO goals (id, user_id, module, statement, created_at, updated_at, deleted_at)
SELECT
    gen_random_uuid(),
    settings_row.user_id,
    'whole_day',
    direction.statement,
    NOW(),
    NOW(),
    NULL
FROM user_settings AS settings_row
CROSS JOIN LATERAL (
  SELECT DISTINCT btrim(value) AS statement
  FROM jsonb_array_elements_text(
    (CASE
      WHEN jsonb_typeof(settings_row.settings #> '{assistantProfile,priorities}') = 'array'
        THEN settings_row.settings #> '{assistantProfile,priorities}'
      ELSE '[]'::jsonb
    END)
    ||
    (CASE
      WHEN jsonb_typeof(settings_row.settings #> '{assistantProfile,constraints}') = 'array'
        THEN settings_row.settings #> '{assistantProfile,constraints}'
      ELSE '[]'::jsonb
    END)
  ) AS legacy_direction(value)
) AS direction
WHERE char_length(direction.statement) BETWEEN 1 AND 500;

UPDATE user_settings
SET
  settings = jsonb_set(
    settings,
    '{assistantProfile}',
    (settings -> 'assistantProfile') - 'priorities' - 'constraints',
    true
  ),
  updated_at = NOW()
WHERE jsonb_typeof(settings -> 'assistantProfile') = 'object'
  AND (
    (settings -> 'assistantProfile') ? 'priorities'
    OR (settings -> 'assistantProfile') ? 'constraints'
  );
