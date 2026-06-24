CREATE TABLE user_credits (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE ai_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT,
    model TEXT,
    prompt_tokens INT,
    completion_tokens INT,
    total_tokens INT,
    credits_delta INT,
    reason TEXT,
    request_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_log_user_id_created_at ON ai_usage_log(user_id, created_at);

-- Atomic reserve: decrements balance only if sufficient funds exist, in one
-- statement (no read-then-write race). Returns new balance on success, NULL
-- when insufficient.
CREATE OR REPLACE FUNCTION reserve_credits(p_user_id UUID, p_cost INT)
RETURNS INTEGER LANGUAGE sql AS $$
  UPDATE user_credits SET balance = balance - p_cost, updated_at = now()
  WHERE user_id = p_user_id AND balance >= p_cost
  RETURNING balance;
$$;

-- Atomic grant: upserts the row (creating it at `amount` if missing) and
-- returns the new balance. Used by signup seed, manual top-ups, refunds.
CREATE OR REPLACE FUNCTION grant_credits(p_user_id UUID, p_amount INT)
RETURNS INTEGER LANGUAGE sql AS $$
  INSERT INTO user_credits (user_id, balance, updated_at)
  VALUES (p_user_id, p_amount, now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance = user_credits.balance + p_amount, updated_at = now()
  RETURNING balance;
$$;

ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credit balance" ON user_credits
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own usage log" ON ai_usage_log
    FOR SELECT USING (auth.uid() = user_id);
