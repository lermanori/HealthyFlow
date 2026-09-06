-- ADR-0016 — a credit is an action, not a unit of cost.
-- Assigned a unique migration version on 2026-09-06; the original branch had
-- reused 20260826120000, which already belongs to add_goals on the linked DB.
--
-- Two things happen here, and they are the same thing: the ledger learns to record
-- PRICE and COST as separate quantities, and the free monthly allowance gets an
-- atomic claim so two devices cannot both be granted it at midnight.
--
-- Existing balances are NOT migrated. A balance denominated in old credits is worth
-- roughly six times more in actions, which across every account in existence costs
-- under a dollar. Correcting it downward would cost more in code and goodwill than
-- it saves. See ADR-0016, Consequences.

-- ── 1. price and cost stop sharing a unit ────────────────────────────────────
--
-- credits_delta has always meant "what the user paid". Until now that was also,
-- accidentally, a measure of our cost — the two rates were the same number and then
-- drifted twenty-fold apart without anything noticing. cost_usd ends that: it is
-- dollars, credits_delta is actions, and no query may sum them together.
ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS action_class TEXT
    CHECK (action_class IS NULL OR action_class IN ('text', 'photo', 'premium')),
  ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(12, 8);

COMMENT ON COLUMN ai_usage_log.credits_delta IS
  'What the USER paid, in credits (actions). Negative for a charge. Zero when a Cloud entitlement covered the action. Never the same unit as cost_usd.';
COMMENT ON COLUMN ai_usage_log.cost_usd IS
  'What the call COST US at the provider, in USD. Cost accounting only — never a price, never summed with credits_delta.';
COMMENT ON COLUMN ai_usage_log.action_class IS
  'Which price applied: text (1 credit), photo (5) or premium (10). NULL for non-AI ledger rows such as grants and admin adjustments.';

-- Backs the global daily spending ceiling, which scans one day of cost.
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created_at_cost
  ON ai_usage_log (created_at)
  WHERE cost_usd IS NOT NULL;

-- Backs the per-account daily cap and the Cloud monthly caps. The existing
-- (user_id, created_at) index already covers the range; this narrows it to rows
-- that are actual AI actions rather than grants.
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user_action_class
  ON ai_usage_log (user_id, action_class, created_at)
  WHERE action_class IS NOT NULL;

-- ── 2. the monthly free allowance ────────────────────────────────────────────
ALTER TABLE user_credits
  ADD COLUMN IF NOT EXISTS last_free_refill_month DATE;

COMMENT ON COLUMN user_credits.last_free_refill_month IS
  'First day of the calendar month in which this account last received MONTHLY_FREE_CREDITS. NULL means never. Only free accounts are refilled.';

-- The RPC resolves all four meaningful states explicitly. The upsert predicate is
-- the eligibility gate itself, so identity, subscription and month cannot drift
-- between a TypeScript read and the write. The attempted AI action is the activity
-- check: no scheduler calls this for dormant rows (ADR-0017).
DROP FUNCTION IF EXISTS claim_monthly_free_credits(UUID, INT);

CREATE FUNCTION claim_monthly_free_credits(p_user_id UUID, p_credits INT)
RETURNS TABLE (status TEXT, balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_claimed BOOLEAN;
  active_subscription BOOLEAN;
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
     AND NOT EXISTS (
       SELECT 1
         FROM user_credit_subscriptions
        WHERE user_credit_subscriptions.user_id = p_user_id
          AND user_credit_subscriptions.active = TRUE
     )
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
      AND NOT EXISTS (
        SELECT 1
          FROM user_credit_subscriptions
         WHERE user_credit_subscriptions.user_id = p_user_id
           AND user_credit_subscriptions.active = TRUE
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
         EXISTS (
           SELECT 1
             FROM user_credit_subscriptions
            WHERE user_credit_subscriptions.user_id = p_user_id
              AND user_credit_subscriptions.active = TRUE
         ),
         COALESCE(user_credits.balance, 0)
    INTO account_claimed, active_subscription, current_balance
    FROM users
    LEFT JOIN user_credits ON user_credits.user_id = users.id
   WHERE users.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HealthyFlow user does not exist';
  END IF;

  IF NOT account_claimed THEN
    RETURN QUERY SELECT 'not_claimed'::TEXT, current_balance;
  ELSIF active_subscription THEN
    RETURN QUERY SELECT 'subscription_active'::TEXT, current_balance;
  ELSE
    RETURN QUERY SELECT 'already_granted'::TEXT, current_balance;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION claim_monthly_free_credits(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_monthly_free_credits(UUID, INT) TO service_role;

-- ── 3. retire the signup grant ───────────────────────────────────────────────
-- ADR-0017 removed the welcome grant. Historical rows stay queryable, but there
-- is no longer an executable application path that can create another one.
DROP FUNCTION IF EXISTS claim_signup_credit_grant(UUID, INTEGER, INTEGER, INTEGER);

COMMENT ON TABLE signup_credit_grants IS
  'Historical welcome-credit grants. ADR-0017 removed this grant; founding now describes a discounted Cloud subscription price, not a credit tier.';
