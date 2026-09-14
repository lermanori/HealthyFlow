-- Free-v1 Cloud and AI are independent entitlements. The founder's legacy
-- Cloud exception controls replication only and must not alter the claimed
-- account's monthly AI allowance or Token Manager balance.

COMMENT ON COLUMN user_credits.last_free_refill_month IS
  'First day of the calendar month in which this claimed account last received MONTHLY_FREE_CREDITS. NULL means never.';

-- The upsert predicate remains the eligibility gate, so identity and month
-- cannot drift between a TypeScript read and the write. The attempted AI action
-- is the activity check: no scheduler calls this for dormant rows (ADR-0017).
DROP FUNCTION IF EXISTS claim_monthly_free_credits(UUID, INT);

CREATE FUNCTION claim_monthly_free_credits(p_user_id UUID, p_credits INT)
RETURNS TABLE (status TEXT, balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_claimed BOOLEAN;
  claimed_balance INTEGER;
  current_balance INTEGER;
  refill_month DATE := date_trunc('month', now())::date;
BEGIN
  IF p_credits <= 0 THEN
    RAISE EXCEPTION 'Monthly free credit amount must be positive';
  END IF;

  INSERT INTO user_credits (
    user_id,
    balance,
    subscription_balance,
    topup_balance,
    last_free_refill_month,
    updated_at
  )
  SELECT p_user_id, p_credits, 0, p_credits, refill_month, now()
    FROM users
   WHERE users.id = p_user_id
     AND users.email IS NOT NULL
  ON CONFLICT (user_id) DO UPDATE
    SET balance = user_credits.balance + p_credits,
        topup_balance = user_credits.topup_balance + p_credits,
        last_free_refill_month = refill_month,
        updated_at = now()
    WHERE (user_credits.last_free_refill_month IS NULL
           OR user_credits.last_free_refill_month < refill_month)
      AND EXISTS (
        SELECT 1 FROM users
         WHERE users.id = p_user_id
           AND users.email IS NOT NULL
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
      'monthly_free_refill',
      claimed_balance - p_credits,
      claimed_balance
    );

    RETURN QUERY SELECT 'granted'::TEXT, claimed_balance;
    RETURN;
  END IF;

  SELECT users.email IS NOT NULL,
         COALESCE(user_credits.balance, 0)
    INTO account_claimed, current_balance
    FROM users
    LEFT JOIN user_credits ON user_credits.user_id = users.id
   WHERE users.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HealthyFlow user does not exist';
  END IF;

  IF NOT account_claimed THEN
    RETURN QUERY SELECT 'not_claimed'::TEXT, current_balance;
  ELSE
    RETURN QUERY SELECT 'already_granted'::TEXT, current_balance;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION claim_monthly_free_credits(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_monthly_free_credits(UUID, INT) TO service_role;
