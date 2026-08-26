-- ADR-0013 — a credit is an action, not a unit of cost.
--
-- Two things happen here, and they are the same thing: the ledger learns to record
-- PRICE and COST as separate quantities, and the free monthly allowance gets an
-- atomic claim so two devices cannot both be granted it at midnight.
--
-- Existing balances are NOT migrated. A balance denominated in old credits is worth
-- roughly six times more in actions, which across every account in existence costs
-- under a dollar. Correcting it downward would cost more in code and goodwill than
-- it saves. See ADR-0013, Consequences.

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

-- Atomic claim: the WHERE clause is the lock. Two devices opening the app in the
-- same second cannot both be granted, because the second UPDATE matches no row and
-- returns nothing — which the caller reads as "already claimed", not as an error.
CREATE OR REPLACE FUNCTION claim_monthly_free_credits(p_user_id UUID, p_credits INT)
RETURNS TABLE (balance INTEGER) LANGUAGE sql AS $$
  UPDATE user_credits
  SET balance = user_credits.balance + p_credits,
      topup_balance = user_credits.topup_balance + p_credits,
      last_free_refill_month = date_trunc('month', now())::date,
      updated_at = now()
  WHERE user_id = p_user_id
    AND (last_free_refill_month IS NULL
         OR last_free_refill_month < date_trunc('month', now())::date)
  RETURNING user_credits.balance;
$$;

-- ── 3. the signup grant stops branching on a cohort ──────────────────────────
--
-- claim_signup_credit_grant awarded 250 credits and burned one of 100 founding
-- seats while any remained. ADR-0012 already decided that founding is a Cloud
-- PRICE rather than a credit cohort, and that this branch must not be reached.
-- The function keeps its signature — callers pass the same shape — but both
-- branches now award the same amount, so no seat is consumed by a credit grant.
--
-- The cohort column is left in place and keeps recording which cohort an account
-- would have belonged to; it is history, and the founding *price* counter is being
-- rebuilt on top of it rather than beside it.
COMMENT ON TABLE signup_credit_grants IS
  'One row per account that received its welcome credits. Since ADR-0013 every account receives the same WELCOME_CREDITS and the cohort column is historical: founding is a Cloud price, not a credit tier.';
