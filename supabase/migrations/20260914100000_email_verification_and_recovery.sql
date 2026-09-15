-- Verified email and self-serve recovery (#235).
--
-- One table for both challenge kinds. They share every rule that matters — a
-- random secret the server never stores, a single use, an expiry, and
-- invalidation by a newer challenge of the same kind — so splitting them would
-- duplicate the rules and invite them to drift apart.
--
-- The token itself is never stored. Only a SHA-256 of it is, so a database read
-- cannot be turned into a working reset link. That is also why lookup is by
-- hash: the server hashes what it was given and matches, rather than fetching a
-- row and comparing.

CREATE TABLE IF NOT EXISTS auth_email_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('verify_email', 'reset_password')),
  token_hash TEXT NOT NULL,
  -- The address the challenge was issued for. A later address change must not
  -- let an older link verify the new one.
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup is always "this exact token, of this kind", so that is the index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_email_challenges_token
  ON auth_email_challenges(kind, token_hash);

-- Superseding a user's older challenges of one kind is the other access path.
CREATE INDEX IF NOT EXISTS idx_auth_email_challenges_user_kind
  ON auth_email_challenges(user_id, kind, consumed_at, superseded_at);

COMMENT ON COLUMN auth_email_challenges.token_hash IS
  'SHA-256 of the emailed token. The token itself is never stored, so a database read cannot be turned into a working link.';

-- Whether this address has been proven reachable by the person holding it.
--
-- Google and Apple accounts arrive already provider-verified, so they are
-- stamped at once rather than being asked to prove what their provider proved.
-- Password accounts start null and earn it.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN users.email_verified_at IS
  'When this address was proven reachable. Set immediately for Google/Apple, which are provider-verified; earned by a verification link for password accounts. Null means unproven, not invalid — verification gates account recovery only, never access (ADR-0025).';

-- Existing provider accounts were verified by their provider before this column
-- existed, and asking them to prove it again would be asking them to repeat
-- something already done.
UPDATE users
   SET email_verified_at = COALESCE(created_at, now())
 WHERE email IS NOT NULL
   AND signup_method IN ('google', 'apple')
   AND email_verified_at IS NULL;
