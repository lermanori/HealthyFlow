-- Setting an account's action balance from Admin (#299). The balance stays an
-- absolute value, but it is applied only if it is still the one the
-- administrator was shown: a spend or a grant that landed in between turns the
-- write into a refusal instead of being silently overwritten. The decision, the
-- write, its ledger row and its audit entry commit together.

ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN ai_usage_log.actor_user_id IS
  'The administrator who made this change, for rows an administrator wrote (admin_balance_set). NULL for rows the system wrote.';

ALTER TABLE admin_user_audit_log
  DROP CONSTRAINT IF EXISTS admin_user_audit_log_action_check;

ALTER TABLE admin_user_audit_log
  ADD CONSTRAINT admin_user_audit_log_action_check CHECK (
    action IN (
      'marked_test',
      'marked_live',
      'disabled',
      'enabled',
      'delete_requested',
      'delete_completed',
      'delete_auth_cleanup_failed',
      'balance_set'
    )
  );

CREATE OR REPLACE FUNCTION admin_set_credit_balance(
  p_user_id UUID,
  p_expected INTEGER,
  p_balance INTEGER,
  p_actor_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS TABLE (status TEXT, balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_email TEXT;
  v_target_email TEXT;
  v_current INTEGER;
BEGIN
  IF p_balance < 0 THEN
    RAISE EXCEPTION 'An action balance cannot be negative';
  END IF;

  SELECT users.email INTO v_actor_email
    FROM users
   WHERE users.id = p_actor_id
     AND users.role = 'admin';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Administrator account was not found';
  END IF;

  SELECT users.email INTO v_target_email
    FROM users
   WHERE users.id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HealthyFlow user does not exist';
  END IF;

  -- An account that never held actions has no row; a zero row is the same
  -- balance. Locking it makes a concurrent spend or grant wait for this decision.
  INSERT INTO user_credits (user_id, balance, subscription_balance, topup_balance, updated_at)
  VALUES (p_user_id, 0, 0, 0, now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT user_credits.balance INTO v_current
    FROM user_credits
   WHERE user_credits.user_id = p_user_id
   FOR UPDATE;

  IF v_current <> p_expected THEN
    RETURN QUERY SELECT 'conflict'::TEXT, v_current;
    RETURN;
  END IF;

  UPDATE user_credits
     SET balance = p_balance,
         subscription_balance = 0,
         topup_balance = p_balance,
         updated_at = now()
   WHERE user_credits.user_id = p_user_id;

  INSERT INTO ai_usage_log (user_id, credits_delta, reason, balance_before, balance_after, actor_user_id)
  VALUES (p_user_id, p_balance - v_current, 'admin_balance_set', v_current, p_balance, p_actor_id);

  INSERT INTO admin_user_audit_log (actor_user_id, actor_email, target_user_id, target_email, action, details)
  VALUES (
    p_actor_id,
    v_actor_email,
    p_user_id,
    v_target_email,
    'balance_set',
    jsonb_build_object('from', v_current, 'to', p_balance, 'note', p_note)
  );

  RETURN QUERY SELECT 'applied'::TEXT, p_balance;
END;
$$;

REVOKE ALL ON FUNCTION admin_set_credit_balance(UUID, INTEGER, INTEGER, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_credit_balance(UUID, INTEGER, INTEGER, UUID, TEXT) TO service_role;
