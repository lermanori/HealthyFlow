-- Keep public signup capacity tied to the account that consumed it. Legacy
-- accounts default to FALSE because their original signup path cannot be
-- inferred safely; administrators can reconcile the aggregate counter.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS claimed_public_signup_slot BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS users_claimed_public_signup_slot_idx
  ON users (claimed_public_signup_slot)
  WHERE claimed_public_signup_slot = TRUE;

-- Repair waitlist rows left behind by deletions that happened before this
-- migration. Pending rows are intentionally preserved because most represent
-- people who have never had an account.
DELETE FROM waitlist
WHERE status = 'registered'
  AND NOT EXISTS (
    SELECT 1
    FROM users
    WHERE lower(users.email) = lower(waitlist.email)
  );

CREATE OR REPLACE FUNCTION release_public_signup_slot()
RETURNS BOOLEAN AS $$
DECLARE
  released BOOLEAN;
BEGIN
  UPDATE signup_access
  SET public_slots_claimed = public_slots_claimed - 1,
      updated_at = NOW()
  WHERE id = TRUE AND public_slots_claimed > 0
  RETURNING TRUE INTO released;
  RETURN COALESCE(released, FALSE);
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION release_public_signup_slot() FROM PUBLIC;
REVOKE ALL ON FUNCTION release_public_signup_slot() FROM anon;
REVOKE ALL ON FUNCTION release_public_signup_slot() FROM authenticated;
GRANT EXECUTE ON FUNCTION release_public_signup_slot() TO service_role;

-- Deletes the application account, matching waitlist/invite state, and the
-- owned public signup claim in one transaction. Supabase Auth cleanup remains
-- outside Postgres and is attempted after this function succeeds.
CREATE OR REPLACE FUNCTION delete_user_with_signup_cleanup(p_user_id UUID)
RETURNS TABLE (
  waitlist_entries_deleted BIGINT,
  public_signup_seats_released INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_email TEXT;
  owned_public_slot BOOLEAN;
  deleted_waitlist_count BIGINT := 0;
  released_slot_count INTEGER := 0;
BEGIN
  SELECT email, claimed_public_signup_slot
  INTO target_email, owned_public_slot
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  WITH deleted_waitlist AS (
    DELETE FROM waitlist
    WHERE lower(email) = lower(target_email)
       OR id IN (
         SELECT waitlist_id
         FROM invites
         WHERE redeemed_by_user_id = p_user_id
       )
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_waitlist_count FROM deleted_waitlist;

  -- Handles legacy or inconsistent invite rows whose waitlist row did not
  -- match the account email.
  DELETE FROM invites WHERE redeemed_by_user_id = p_user_id;
  DELETE FROM users WHERE id = p_user_id;

  IF owned_public_slot THEN
    UPDATE signup_access
    SET public_slots_claimed = public_slots_claimed - 1,
        updated_at = NOW()
    WHERE id = TRUE AND public_slots_claimed > 0;
    IF FOUND THEN
      released_slot_count := 1;
    END IF;
  END IF;

  RETURN QUERY SELECT deleted_waitlist_count, released_slot_count;
END;
$$;

REVOKE ALL ON FUNCTION delete_user_with_signup_cleanup(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_user_with_signup_cleanup(UUID) FROM anon;
REVOKE ALL ON FUNCTION delete_user_with_signup_cleanup(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION delete_user_with_signup_cleanup(UUID) TO service_role;

-- The result shape changes, so PostgreSQL requires dropping the old function
-- before recreating it with waitlist and signup-seat preview fields.
DROP FUNCTION IF EXISTS admin_user_deletion_counts(UUID[]);

CREATE FUNCTION admin_user_deletion_counts(p_user_ids UUID[])
RETURNS TABLE (
  user_id UUID,
  items BIGINT,
  health BIGINT,
  calendar BIGINT,
  assistant BIGINT,
  billing BIGINT,
  account BIGINT,
  waitlist BIGINT,
  public_signup_seats BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target.id,
    (
      (SELECT COUNT(*) FROM tasks WHERE tasks.user_id = target.id) +
      (SELECT COUNT(*) FROM projects WHERE projects.user_id = target.id) +
      (SELECT COUNT(*) FROM habit_progress_entries WHERE habit_progress_entries.user_id = target.id)
    ) AS items,
    (
      (SELECT COUNT(*) FROM calorie_entries WHERE calorie_entries.user_id = target.id) +
      (SELECT COUNT(*) FROM calorie_items WHERE calorie_items.user_id = target.id) +
      (SELECT COUNT(*) FROM weight_entries WHERE weight_entries.user_id = target.id) +
      (SELECT COUNT(*) FROM achievement_definitions WHERE achievement_definitions.user_id = target.id) +
      (SELECT COUNT(*) FROM achievement_entries WHERE achievement_entries.user_id = target.id) +
      (SELECT COUNT(*) FROM workout_exercise_items WHERE workout_exercise_items.user_id = target.id) +
      (SELECT COUNT(*) FROM workout_plans WHERE workout_plans.user_id = target.id) +
      (SELECT COUNT(*) FROM workout_plan_items
        JOIN workout_plans ON workout_plans.id = workout_plan_items.plan_id
        WHERE workout_plans.user_id = target.id) +
      (SELECT COUNT(*) FROM workout_sessions WHERE workout_sessions.user_id = target.id) +
      (SELECT COUNT(*) FROM workout_session_exercises
        JOIN workout_sessions ON workout_sessions.id = workout_session_exercises.session_id
        WHERE workout_sessions.user_id = target.id)
    ) AS health,
    (
      (SELECT COUNT(*) FROM calendar_connections WHERE calendar_connections.user_id = target.id) +
      (SELECT COUNT(*) FROM external_calendar_events WHERE external_calendar_events.user_id = target.id)
    ) AS calendar,
    (
      (SELECT COUNT(*) FROM assistant_conversations WHERE assistant_conversations.user_id = target.id) +
      (SELECT COUNT(*) FROM assistant_messages WHERE assistant_messages.user_id = target.id) +
      (SELECT COUNT(*) FROM ai_recommendations WHERE ai_recommendations.user_id = target.id) +
      (SELECT COUNT(*) FROM ai_pending_actions WHERE ai_pending_actions.user_id = target.id) +
      (SELECT COUNT(*) FROM ai_audit_log WHERE ai_audit_log.user_id = target.id) +
      (SELECT COUNT(*) FROM ai_idempotency WHERE ai_idempotency.user_id = target.id)
    ) AS assistant,
    (
      (SELECT COUNT(*) FROM user_credits WHERE user_credits.user_id = target.id) +
      (SELECT COUNT(*) FROM user_credit_subscriptions WHERE user_credit_subscriptions.user_id = target.id) +
      (SELECT COUNT(*) FROM signup_credit_grants WHERE signup_credit_grants.user_id = target.id) +
      (SELECT COUNT(*) FROM ai_usage_log WHERE ai_usage_log.user_id = target.id)
    ) AS billing,
    (
      (SELECT COUNT(*) FROM user_settings WHERE user_settings.user_id = target.id) +
      (SELECT COUNT(*) FROM user_rhythm WHERE user_rhythm.user_id = target.id) +
      (SELECT COUNT(*) FROM push_subscriptions WHERE push_subscriptions.user_id = target.id) +
      (SELECT COUNT(*) FROM contact_messages WHERE contact_messages.user_id = target.id) +
      (SELECT COUNT(*) FROM api_tokens WHERE api_tokens.user_id = target.id)
    ) AS account,
    (
      SELECT COUNT(DISTINCT waitlist.id)
      FROM waitlist
      LEFT JOIN invites ON invites.waitlist_id = waitlist.id
      WHERE lower(waitlist.email) = lower(target.email)
         OR invites.redeemed_by_user_id = target.id
    ) AS waitlist,
    CASE
      WHEN target.claimed_public_signup_slot THEN 1::BIGINT
      ELSE 0::BIGINT
    END AS public_signup_seats
  FROM UNNEST(p_user_ids) AS requested(user_id)
  JOIN users AS target ON target.id = requested.user_id;
$$;

REVOKE ALL ON FUNCTION admin_user_deletion_counts(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_user_deletion_counts(UUID[]) FROM anon;
REVOKE ALL ON FUNCTION admin_user_deletion_counts(UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_user_deletion_counts(UUID[]) TO service_role;
