-- The device an account was last used on (#308, ADR-0027). The iPhone app keeps
-- a random ID in its Keychain as a this-device-only item, so it survives
-- deleting and reinstalling the app; on the web it is per browser. It labels and
-- groups accounts in Admin only and is never read by any grant (ADR-0017,
-- ADR-0018 and ADR-0023 are unchanged).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS device_id UUID;

COMMENT ON COLUMN users.device_id IS
  'The device this account was last used on, for Admin to tell accounts apart. Never used for grant eligibility.';

CREATE INDEX IF NOT EXISTS users_device_id_idx ON users (device_id) WHERE device_id IS NOT NULL;
