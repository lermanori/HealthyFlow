ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('admin', 'user'));

UPDATE users
SET role = 'user'
WHERE role IS NULL;

UPDATE users
SET role = 'admin'
WHERE lower(email) = 'lermanori@gmail.com';

CREATE TABLE IF NOT EXISTS ai_billing_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  app_tokens_per_usd INTEGER NOT NULL DEFAULT 1000,
  markup_rate NUMERIC NOT NULL DEFAULT 0.25,
  min_markup_tokens INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT ai_billing_settings_singleton CHECK (id = TRUE),
  CONSTRAINT ai_billing_settings_tokens_positive CHECK (app_tokens_per_usd > 0),
  CONSTRAINT ai_billing_settings_markup_nonnegative CHECK (markup_rate >= 0),
  CONSTRAINT ai_billing_settings_min_markup_nonnegative CHECK (min_markup_tokens >= 0)
);

INSERT INTO ai_billing_settings (id, app_tokens_per_usd, markup_rate, min_markup_tokens)
VALUES (TRUE, 1000, 0.25, 5)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS balance_before INTEGER,
  ADD COLUMN IF NOT EXISTS balance_after INTEGER;

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created_at ON ai_usage_log(created_at);
