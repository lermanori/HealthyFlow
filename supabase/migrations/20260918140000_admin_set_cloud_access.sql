-- Turning Cloud on or off from Admin (#300). v1 sells no Cloud; this switch is
-- the operator path for the legacy founder exception and reflects whichever
-- account it is on for. The entitlement and its audit entry commit together,
-- replacing a console line in the server log. A Guest can never hold Cloud
-- (CloudAccess requires an email), so it is refused instead of given a row that
-- could never take effect.

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
      'balance_set',
      'cloud_granted',
      'cloud_revoked'
    )
  );

CREATE OR REPLACE FUNCTION admin_set_cloud_access(
  p_user_id UUID,
  p_active BOOLEAN,
  p_actor_id UUID
)
RETURNS TABLE (status TEXT, active BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_email TEXT;
  v_target_email TEXT;
  v_was_active BOOLEAN;
BEGIN
  SELECT users.email INTO v_actor_email
    FROM users
   WHERE users.id = p_actor_id
     AND users.role = 'admin';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Administrator account was not found';
  END IF;

  SELECT users.email INTO v_target_email
    FROM users
   WHERE users.id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, FALSE;
    RETURN;
  END IF;
  IF v_target_email IS NULL THEN
    RETURN QUERY SELECT 'guest'::TEXT, FALSE;
    RETURN;
  END IF;

  SELECT user_credit_subscriptions.active INTO v_was_active
    FROM user_credit_subscriptions
   WHERE user_credit_subscriptions.user_id = p_user_id;
  IF COALESCE(v_was_active, FALSE) = p_active THEN
    RETURN QUERY SELECT 'unchanged'::TEXT, p_active;
    RETURN;
  END IF;

  -- A row that already exists keeps its own terms; a new one starts at the
  -- regular phase, so an operator grant never counts as a founding-price seat.
  INSERT INTO user_credit_subscriptions (user_id, active, price_phase, monthly_credits, renewal_date, last_monthly_grant_at, updated_at)
  VALUES (p_user_id, p_active, 'regular', 0, NULL, NULL, now())
  ON CONFLICT (user_id) DO UPDATE
    SET active = EXCLUDED.active,
        updated_at = now();

  INSERT INTO admin_user_audit_log (actor_user_id, actor_email, target_user_id, target_email, action, details)
  VALUES (
    p_actor_id,
    v_actor_email,
    p_user_id,
    v_target_email,
    CASE WHEN p_active THEN 'cloud_granted' ELSE 'cloud_revoked' END,
    '{}'::JSONB
  );

  RETURN QUERY SELECT CASE WHEN p_active THEN 'granted' ELSE 'revoked' END::TEXT, p_active;
END;
$$;

REVOKE ALL ON FUNCTION admin_set_cloud_access(UUID, BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_cloud_access(UUID, BOOLEAN, UUID) TO service_role;
