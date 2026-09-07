-- Free v1 has no purchasable Cloud entitlement. Preserve historical rows while
-- disabling every active subscription, then expose honest free-grant state.

UPDATE user_credit_subscriptions
   SET active = FALSE,
       updated_at = now()
 WHERE active = TRUE;

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
  current_month DATE := date_trunc('month', now())::date;
  next_month TIMESTAMPTZ := date_trunc('month', now()) + interval '1 month';
BEGIN
  IF p_guest_credits <= 0 OR p_monthly_credits <= 0 THEN
    RAISE EXCEPTION 'Free action amounts must be positive';
  END IF;

  SELECT users.email,
         user_credits.guest_grant_claimed_at,
         user_credits.last_free_refill_month
    INTO account_email, guest_claimed_at, last_refill_month
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
    RETURN jsonb_build_object(
      'state', 'claimed',
      'kind', 'guest_initial',
      'nextAvailableAt', NULL
    );
  END IF;

  IF last_refill_month >= current_month THEN
    RETURN jsonb_build_object(
      'state', 'claimed',
      'kind', 'monthly',
      'nextAvailableAt', to_char(
        next_month AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    );
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
