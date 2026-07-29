-- Link HealthyFlow application users to their verified Supabase Auth Google
-- identity. Password accounts keep their existing signup method when linked so
-- they are not treated as new accounts or granted onboarding credits again.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_auth_subject TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS signup_method TEXT NOT NULL DEFAULT 'password';

-- An invited Google signup spans several network calls. Persist the token only
-- until redemption so a retry cannot finish while leaving the invitation
-- reusable.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pending_invite_token TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_signup_method_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_signup_method_check
      CHECK (signup_method IN ('password', 'google'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_auth_subject_idx
  ON users (google_auth_subject)
  WHERE google_auth_subject IS NOT NULL;

-- Google returns a canonical lower-case email. Normalize legacy password
-- accounts before adding the case-insensitive uniqueness guard so linking by
-- verified email cannot create a second HealthyFlow account.
DO $$
BEGIN
  IF EXISTS (
    SELECT LOWER(email)
    FROM users
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize users.email: case-insensitive duplicates exist';
  END IF;
END
$$;

UPDATE users SET email = LOWER(TRIM(email)) WHERE email <> LOWER(TRIM(email));

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));

-- Invitations previously had no expiry. Existing and future invitations are
-- valid for seven days; service-layer checks still distinguish used, invalid,
-- and expired tokens for clear UI feedback.
ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

UPDATE invites
SET expires_at = created_at + INTERVAL '7 days'
WHERE expires_at IS NULL;

ALTER TABLE invites
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '7 days'),
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS invites_expires_at_idx ON invites (expires_at);
