ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS users_is_test_idx ON users (is_test);
CREATE INDEX IF NOT EXISTS users_disabled_at_idx ON users (disabled_at);
CREATE INDEX IF NOT EXISTS users_last_login_at_idx ON users (last_login_at DESC);

-- This is the one account created by the repository's E2E harness. Other
-- accounts must be classified explicitly by an administrator.
UPDATE users
SET is_test = TRUE
WHERE lower(email) = 'e2e@test.healthyflow.local';

CREATE TABLE IF NOT EXISTS admin_user_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT NOT NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_email TEXT NOT NULL,
  action TEXT NOT NULL CHECK (
    action IN (
      'marked_test',
      'marked_live',
      'disabled',
      'enabled',
      'delete_requested',
      'delete_completed',
      'delete_auth_cleanup_failed'
    )
  ),
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_user_audit_created_at_idx
  ON admin_user_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_user_audit_target_email_idx
  ON admin_user_audit_log (lower(target_email));

ALTER TABLE admin_user_audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION admin_user_deletion_counts(p_user_ids UUID[])
RETURNS TABLE (
  user_id UUID,
  items BIGINT,
  health BIGINT,
  calendar BIGINT,
  assistant BIGINT,
  billing BIGINT,
  account BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target.user_id,
    (
      (SELECT COUNT(*) FROM tasks WHERE tasks.user_id = target.user_id) +
      (SELECT COUNT(*) FROM projects WHERE projects.user_id = target.user_id) +
      (SELECT COUNT(*) FROM habit_progress_entries WHERE habit_progress_entries.user_id = target.user_id)
    ) AS items,
    (
      (SELECT COUNT(*) FROM calorie_entries WHERE calorie_entries.user_id = target.user_id) +
      (SELECT COUNT(*) FROM calorie_items WHERE calorie_items.user_id = target.user_id) +
      (SELECT COUNT(*) FROM weight_entries WHERE weight_entries.user_id = target.user_id) +
      (SELECT COUNT(*) FROM achievement_definitions WHERE achievement_definitions.user_id = target.user_id) +
      (SELECT COUNT(*) FROM achievement_entries WHERE achievement_entries.user_id = target.user_id) +
      (SELECT COUNT(*) FROM workout_exercise_items WHERE workout_exercise_items.user_id = target.user_id) +
      (SELECT COUNT(*) FROM workout_plans WHERE workout_plans.user_id = target.user_id) +
      (SELECT COUNT(*) FROM workout_plan_items
        JOIN workout_plans ON workout_plans.id = workout_plan_items.plan_id
        WHERE workout_plans.user_id = target.user_id) +
      (SELECT COUNT(*) FROM workout_sessions WHERE workout_sessions.user_id = target.user_id) +
      (SELECT COUNT(*) FROM workout_session_exercises
        JOIN workout_sessions ON workout_sessions.id = workout_session_exercises.session_id
        WHERE workout_sessions.user_id = target.user_id)
    ) AS health,
    (
      (SELECT COUNT(*) FROM calendar_connections WHERE calendar_connections.user_id = target.user_id) +
      (SELECT COUNT(*) FROM external_calendar_events WHERE external_calendar_events.user_id = target.user_id)
    ) AS calendar,
    (
      (SELECT COUNT(*) FROM assistant_conversations WHERE assistant_conversations.user_id = target.user_id) +
      (SELECT COUNT(*) FROM assistant_messages WHERE assistant_messages.user_id = target.user_id) +
      (SELECT COUNT(*) FROM ai_recommendations WHERE ai_recommendations.user_id = target.user_id) +
      (SELECT COUNT(*) FROM ai_pending_actions WHERE ai_pending_actions.user_id = target.user_id) +
      (SELECT COUNT(*) FROM ai_audit_log WHERE ai_audit_log.user_id = target.user_id) +
      (SELECT COUNT(*) FROM ai_idempotency WHERE ai_idempotency.user_id = target.user_id)
    ) AS assistant,
    (
      (SELECT COUNT(*) FROM user_credits WHERE user_credits.user_id = target.user_id) +
      (SELECT COUNT(*) FROM user_credit_subscriptions WHERE user_credit_subscriptions.user_id = target.user_id) +
      (SELECT COUNT(*) FROM signup_credit_grants WHERE signup_credit_grants.user_id = target.user_id) +
      (SELECT COUNT(*) FROM ai_usage_log WHERE ai_usage_log.user_id = target.user_id)
    ) AS billing,
    (
      (SELECT COUNT(*) FROM user_settings WHERE user_settings.user_id = target.user_id) +
      (SELECT COUNT(*) FROM user_rhythm WHERE user_rhythm.user_id = target.user_id) +
      (SELECT COUNT(*) FROM push_subscriptions WHERE push_subscriptions.user_id = target.user_id) +
      (SELECT COUNT(*) FROM contact_messages WHERE contact_messages.user_id = target.user_id) +
      (SELECT COUNT(*) FROM api_tokens WHERE api_tokens.user_id = target.user_id)
    ) AS account
  FROM UNNEST(p_user_ids) AS target(user_id);
$$;

REVOKE ALL ON FUNCTION admin_user_deletion_counts(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_user_deletion_counts(UUID[]) FROM anon;
REVOKE ALL ON FUNCTION admin_user_deletion_counts(UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_user_deletion_counts(UUID[]) TO service_role;
