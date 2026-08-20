-- Guest mode. A Guest is a `users` row with no email (CONTEXT.md).
--
-- Nothing else about the row differs: the same id keys Items, credits, settings
-- and the day summary, and Claim later sets an email and a password on this very
-- row. There is no guest table, no guest credit ledger, and no data migration.

ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL;

-- users_email_lower_idx stays unique. Postgres treats NULLs as distinct, so any
-- number of Guests coexist while claimed email addresses remain unique.

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_signup_method_check;

ALTER TABLE users
  ADD CONSTRAINT users_signup_method_check
  CHECK (signup_method IN ('password', 'google', 'apple', 'guest'));

-- The invariant Claim depends on: a row that still says `guest` has no email,
-- and Claim flips both fields in one statement. Without this the two markers of
-- "is this a Guest" could drift apart.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_guest_has_no_email;

ALTER TABLE users
  ADD CONSTRAINT users_guest_has_no_email
  CHECK (signup_method <> 'guest' OR email IS NULL);

-- Administrator actions are logged against an email address. A Guest has none,
-- so the label is absent rather than invented.
ALTER TABLE admin_user_audit_log
  ALTER COLUMN target_email DROP NOT NULL;
