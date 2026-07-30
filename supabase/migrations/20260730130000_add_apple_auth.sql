-- Link HealthyFlow users to their verified Supabase Auth Apple identity.
-- Apple may provide a private relay email, so the stable provider subject is
-- stored independently from the email address.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS apple_auth_subject TEXT;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_signup_method_check;

ALTER TABLE users
  ADD CONSTRAINT users_signup_method_check
  CHECK (signup_method IN ('password', 'google', 'apple'));

CREATE UNIQUE INDEX IF NOT EXISTS users_apple_auth_subject_idx
  ON users (apple_auth_subject)
  WHERE apple_auth_subject IS NOT NULL;
