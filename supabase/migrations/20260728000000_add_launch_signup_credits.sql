-- Launch offer: the first 100 real signups receive 250 non-expiring AI
-- credits; later signups receive 50. The claim and balance grant happen in one
-- transaction so concurrent signups cannot both take the final founding spot,
-- and retrying for the same user cannot grant twice.

CREATE TABLE IF NOT EXISTS signup_credit_grants (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cohort TEXT NOT NULL CHECK (cohort IN ('founding', 'standard')),
  credits INTEGER NOT NULL CHECK (credits > 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS signup_credit_grants_cohort_idx
  ON signup_credit_grants (cohort, created_at);

ALTER TABLE signup_credit_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own signup credit grant" ON signup_credit_grants
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION claim_signup_credit_grant(
  p_user_id UUID,
  p_founding_limit INTEGER,
  p_founding_credits INTEGER,
  p_standard_credits INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_grant signup_credit_grants%ROWTYPE;
  founding_claimed INTEGER;
  awarded_credits INTEGER;
  awarded_cohort TEXT;
  previous_balance INTEGER;
  new_balance INTEGER;
BEGIN
  IF p_founding_limit <= 0 OR p_founding_credits <= 0 OR p_standard_credits <= 0 THEN
    RAISE EXCEPTION 'Signup credit offer values must be positive';
  END IF;

  SELECT *
    INTO existing_grant
    FROM signup_credit_grants
   WHERE user_id = p_user_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'credits', existing_grant.credits,
      'cohort', existing_grant.cohort,
      'balance', existing_grant.balance_after,
      'alreadyGranted', TRUE
    );
  END IF;

  -- signup_access is the existing single-row launch gate. Locking it serializes
  -- cohort assignment without adding a second counter that could drift.
  PERFORM 1 FROM signup_access WHERE id = TRUE FOR UPDATE;

  -- A concurrent retry for this same user may have completed while we waited.
  SELECT *
    INTO existing_grant
    FROM signup_credit_grants
   WHERE user_id = p_user_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'credits', existing_grant.credits,
      'cohort', existing_grant.cohort,
      'balance', existing_grant.balance_after,
      'alreadyGranted', TRUE
    );
  END IF;

  SELECT COUNT(*)
    INTO founding_claimed
    FROM signup_credit_grants
   WHERE cohort = 'founding';

  IF founding_claimed < p_founding_limit THEN
    awarded_cohort := 'founding';
    awarded_credits := p_founding_credits;
  ELSE
    awarded_cohort := 'standard';
    awarded_credits := p_standard_credits;
  END IF;

  SELECT balance
    INTO previous_balance
    FROM user_credits
   WHERE user_id = p_user_id;
  previous_balance := COALESCE(previous_balance, 0);

  new_balance := grant_credits(p_user_id, awarded_credits);

  INSERT INTO signup_credit_grants (user_id, cohort, credits, balance_after)
  VALUES (p_user_id, awarded_cohort, awarded_credits, new_balance);

  INSERT INTO ai_usage_log (
    user_id,
    credits_delta,
    reason,
    balance_before,
    balance_after
  )
  VALUES (
    p_user_id,
    awarded_credits,
    'signup_bonus_' || awarded_cohort,
    previous_balance,
    new_balance
  );

  RETURN jsonb_build_object(
    'credits', awarded_credits,
    'cohort', awarded_cohort,
    'balance', new_balance,
    'alreadyGranted', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION claim_signup_credit_grant(UUID, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_signup_credit_grant(UUID, INTEGER, INTEGER, INTEGER) TO service_role;
