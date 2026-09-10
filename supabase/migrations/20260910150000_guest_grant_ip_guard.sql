-- ADR-0023 — one Guest action grant per network per 24 hours.
--
-- ADR-0018 gives a Guest ten actions once. "Once" was keyed only to the `users`
-- row, so deleting and reinstalling the app minted a new row and a new grant.
-- The reservation below makes "once" durable against that, keyed to the network
-- the Guest was created from.
--
-- The address is never stored. The server sends an HMAC of it under a server
-- secret (`hashClientIp` in backend/src/credits.ts); a bare hash of an IPv4
-- address is brute-forceable across the whole 32-bit space in seconds.
--
-- A shared network — carrier NAT, an office, a café — therefore yields one Guest
-- grant per day. That is deliberate, and it is why the refusal is its own state:
-- an ordinary person behind a busy NAT must be told their network is the reason
-- and offered the Claim path, never told they used ten actions they never got.

CREATE TABLE IF NOT EXISTS guest_grant_ips (
  ip_hash TEXT PRIMARY KEY,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE guest_grant_ips IS
  'One row per network that has taken a Guest action grant. The key is an HMAC of the client address under a server secret; no address is stored.';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS guest_grant_ip_reserved BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.guest_grant_ip_reserved IS
  'TRUE when this Guest won its network reservation at creation. FALSE means the network had already taken a grant inside the window, so the once-ever Guest grant is not payable to this row.';

-- Take the reservation, or report that it is already held.
--
-- The conditional ON CONFLICT UPDATE is the entire guard. It takes the row lock,
-- so two Guests created from one network in the same instant serialise: the
-- loser's UPDATE finds `granted_at` fresh, matches no row, and returns nothing.
DROP FUNCTION IF EXISTS reserve_guest_grant_ip(TEXT, INT);

CREATE FUNCTION reserve_guest_grant_ip(p_ip_hash TEXT, p_window_hours INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved BOOLEAN;
BEGIN
  IF p_ip_hash IS NULL OR length(p_ip_hash) = 0 THEN
    RAISE EXCEPTION 'A Guest grant network key is required';
  END IF;

  IF p_window_hours <= 0 THEN
    RAISE EXCEPTION 'The Guest grant network window must be positive';
  END IF;

  INSERT INTO guest_grant_ips AS g (ip_hash, granted_at)
  VALUES (p_ip_hash, now())
  ON CONFLICT (ip_hash) DO UPDATE
    SET granted_at = now()
    WHERE g.granted_at <= now() - make_interval(hours => p_window_hours)
  RETURNING TRUE INTO reserved;

  RETURN COALESCE(reserved, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION reserve_guest_grant_ip(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reserve_guest_grant_ip(TEXT, INT) TO service_role;

-- The grant RPC now refuses a Guest whose network was never reserved, so the
-- reservation cannot be skipped by calling the grant directly.
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
  network_reserved BOOLEAN;
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
     AND users.guest_grant_ip_reserved
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
           AND users.guest_grant_ip_reserved
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
         users.guest_grant_ip_reserved,
         COALESCE(user_credits.balance, 0)
    INTO account_is_guest, network_reserved, current_balance
    FROM users
    LEFT JOIN user_credits ON user_credits.user_id = users.id
   WHERE users.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HealthyFlow user does not exist';
  END IF;

  IF NOT account_is_guest THEN
    RETURN QUERY SELECT 'not_guest'::TEXT, current_balance;
    RETURN;
  END IF;

  -- An unreserved network and an exhausted grant are different causes and the
  -- app says different things about them. Collapsing them would tell a person
  -- on a busy NAT that they spent ten actions they never received.
  IF NOT network_reserved THEN
    RETURN QUERY SELECT 'network_limited'::TEXT, current_balance;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'already_claimed'::TEXT, current_balance;
END;
$$;

REVOKE ALL ON FUNCTION claim_guest_initial_credits(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_guest_initial_credits(UUID, INT) TO service_role;

-- The read-only resolver gains the same distinction, so Talk can explain the
-- refusal before an action is attempted.
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
  guest_network_reserved BOOLEAN;
  last_refill_month DATE;
  current_month DATE := date_trunc('month', now())::date;
  next_month TIMESTAMPTZ := date_trunc('month', now()) + interval '1 month';
BEGIN
  IF p_guest_credits <= 0 OR p_monthly_credits <= 0 THEN
    RAISE EXCEPTION 'Free action amounts must be positive';
  END IF;

  SELECT users.email,
         users.guest_grant_ip_reserved,
         user_credits.guest_grant_claimed_at,
         user_credits.last_free_refill_month
    INTO account_email, guest_network_reserved, guest_claimed_at, last_refill_month
    FROM users
    LEFT JOIN user_credits ON user_credits.user_id = users.id
   WHERE users.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HealthyFlow user does not exist';
  END IF;

  IF account_email IS NULL THEN
    IF guest_claimed_at IS NULL THEN
      IF NOT guest_network_reserved THEN
        RETURN jsonb_build_object(
          'state', 'network_limited',
          'kind', 'guest_initial'
        );
      END IF;
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
