-- ADR-0018 — a Guest receives ten actions once.
--
-- The Guest grant is deliberately independent from the claimed account's
-- monthly refill: separate marker, separate RPC, opposite identity predicate.
-- Both grants remain lazy and are claimed only by an attempted AI action.

ALTER TABLE user_credits
  ADD COLUMN IF NOT EXISTS guest_grant_claimed_at TIMESTAMPTZ;

COMMENT ON COLUMN user_credits.guest_grant_claimed_at IS
  'When this Guest row received its once-ever GUEST_INITIAL_CREDITS grant. Independent from last_free_refill_month; NULL means still eligible while users.email is NULL.';

DROP FUNCTION IF EXISTS claim_guest_initial_credits(UUID, INT);

CREATE FUNCTION claim_guest_initial_credits(p_user_id UUID, p_credits INT)
RETURNS TABLE (status TEXT, balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_balance INTEGER;
  account_is_guest BOOLEAN;
  current_balance INTEGER;
BEGIN
  IF p_credits <= 0 THEN
    RAISE EXCEPTION 'Guest initial credit amount must be positive';
  END IF;

  INSERT INTO user_credits (
    user_id,
    balance,
    subscription_balance,
    topup_balance,
    guest_grant_claimed_at,
    updated_at
  )
  SELECT p_user_id, p_credits, 0, p_credits, now(), now()
    FROM users
   WHERE users.id = p_user_id
     AND users.email IS NULL
  ON CONFLICT (user_id) DO UPDATE
    SET balance = user_credits.balance + p_credits,
        topup_balance = user_credits.topup_balance + p_credits,
        guest_grant_claimed_at = now(),
        updated_at = now()
    WHERE user_credits.guest_grant_claimed_at IS NULL
      AND EXISTS (
        SELECT 1
          FROM users
         WHERE users.id = p_user_id
           AND users.email IS NULL
      )
  RETURNING user_credits.balance INTO claimed_balance;

  IF claimed_balance IS NOT NULL THEN
    INSERT INTO ai_usage_log (
      user_id,
      credits_delta,
      reason,
      balance_before,
      balance_after
    )
    VALUES (
      p_user_id,
      p_credits,
      'guest_initial_grant',
      claimed_balance - p_credits,
      claimed_balance
    );

    RETURN QUERY SELECT 'granted'::TEXT, claimed_balance;
    RETURN;
  END IF;

  SELECT users.email IS NULL,
         COALESCE(user_credits.balance, 0)
    INTO account_is_guest, current_balance
    FROM users
    LEFT JOIN user_credits ON user_credits.user_id = users.id
   WHERE users.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HealthyFlow user does not exist';
  END IF;

  IF account_is_guest THEN
    RETURN QUERY SELECT 'already_claimed'::TEXT, current_balance;
  ELSE
    RETURN QUERY SELECT 'not_guest'::TEXT, current_balance;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION claim_guest_initial_credits(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_guest_initial_credits(UUID, INT) TO service_role;

-- Read the grant entitlement without claiming it. This keeps an available lazy
-- grant distinct from stored balance and uses the database clock for the calendar
-- month boundary.
DROP FUNCTION IF EXISTS get_free_credit_grant(UUID, INT, INT);

CREATE FUNCTION get_free_credit_grant(
  p_user_id UUID,
  p_guest_credits INT,
  p_monthly_credits INT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_email TEXT;
  guest_claimed_at TIMESTAMPTZ;
  last_refill_month DATE;
  active_subscription BOOLEAN;
  current_month DATE := date_trunc('month', now())::date;
BEGIN
  IF p_guest_credits <= 0 OR p_monthly_credits <= 0 THEN
    RAISE EXCEPTION 'Free credit amounts must be positive';
  END IF;

  SELECT users.email,
         user_credits.guest_grant_claimed_at,
         user_credits.last_free_refill_month,
         EXISTS (
           SELECT 1
             FROM user_credit_subscriptions
            WHERE user_credit_subscriptions.user_id = p_user_id
              AND user_credit_subscriptions.active = TRUE
         )
    INTO account_email, guest_claimed_at, last_refill_month, active_subscription
    FROM users
    LEFT JOIN user_credits ON user_credits.user_id = users.id
   WHERE users.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HealthyFlow user does not exist';
  END IF;

  IF account_email IS NULL THEN
    IF guest_claimed_at IS NULL THEN
      RETURN jsonb_build_object(
        'state', 'available',
        'credits', p_guest_credits,
        'kind', 'guest_initial'
      );
    END IF;
    RETURN jsonb_build_object('state', 'claimed');
  END IF;

  IF active_subscription OR last_refill_month >= current_month THEN
    RETURN jsonb_build_object('state', 'claimed');
  END IF;

  RETURN jsonb_build_object(
    'state', 'available',
    'credits', p_monthly_credits,
    'kind', 'monthly'
  );
END;
$$;

REVOKE ALL ON FUNCTION get_free_credit_grant(UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_free_credit_grant(UUID, INT, INT) TO service_role;
