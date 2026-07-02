-- Simple manual credit subscription. Keep APP_TOKENS_PER_USD / cost metering
-- separate from sell rates used for subscription and top-up grants.

ALTER TABLE user_credits
  ADD COLUMN IF NOT EXISTS subscription_balance INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS topup_balance INTEGER NOT NULL DEFAULT 0;

UPDATE user_credits
   SET topup_balance = balance
 WHERE topup_balance = 0 AND subscription_balance = 0 AND balance > 0;

CREATE TABLE IF NOT EXISTS credit_subscription_settings (
    id           BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
    promo_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO credit_subscription_settings (id, promo_active)
VALUES (TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_credit_subscriptions (
    user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    active                  BOOLEAN NOT NULL DEFAULT FALSE,
    price_phase             TEXT NOT NULL DEFAULT 'promo' CHECK (price_phase IN ('promo', 'regular')),
    monthly_credits         INTEGER NOT NULL DEFAULT 500,
    renewal_date            DATE,
    last_monthly_grant_at   TIMESTAMP WITH TIME ZONE,
    updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Reserve from non-rollover subscription credits first, then stackable top-up
-- credits. The displayed balance remains subscription_balance + topup_balance.
CREATE OR REPLACE FUNCTION reserve_credits(p_user_id UUID, p_cost INT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  current_subscription INT;
  current_topup INT;
  from_subscription INT;
  from_topup INT;
  new_balance INT;
BEGIN
  SELECT subscription_balance, topup_balance
    INTO current_subscription, current_topup
    FROM user_credits
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND OR (current_subscription + current_topup) < p_cost THEN
    RETURN NULL;
  END IF;

  from_subscription := LEAST(current_subscription, p_cost);
  from_topup := p_cost - from_subscription;
  new_balance := current_subscription + current_topup - p_cost;

  UPDATE user_credits
     SET subscription_balance = current_subscription - from_subscription,
         topup_balance = current_topup - from_topup,
         balance = new_balance,
         updated_at = NOW()
   WHERE user_id = p_user_id;

  RETURN new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION grant_credits(p_user_id UUID, p_amount INT)
RETURNS INTEGER LANGUAGE sql AS $$
  INSERT INTO user_credits (user_id, balance, topup_balance, updated_at)
  VALUES (p_user_id, p_amount, p_amount, now())
  ON CONFLICT (user_id) DO UPDATE
    SET topup_balance = user_credits.topup_balance + p_amount,
        balance = user_credits.subscription_balance + user_credits.topup_balance + p_amount,
        updated_at = now()
  RETURNING balance;
$$;

CREATE OR REPLACE FUNCTION grant_subscription_credits(p_user_id UUID, p_amount INT)
RETURNS INTEGER LANGUAGE sql AS $$
  INSERT INTO user_credits (user_id, balance, subscription_balance, topup_balance, updated_at)
  VALUES (p_user_id, p_amount, p_amount, 0, now())
  ON CONFLICT (user_id) DO UPDATE
    SET subscription_balance = p_amount,
        balance = p_amount + user_credits.topup_balance,
        updated_at = now()
  RETURNING balance;
$$;

ALTER TABLE user_credit_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_subscription_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription" ON user_credit_subscriptions
    FOR SELECT USING (auth.uid() = user_id);
