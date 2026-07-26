-- Waitlist-centred access control: registration is closed by default; the owner
-- opens it either by inviting a specific waitlist row or by opening N public slots.

CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored lowercased by the service layer so uniqueness is case-insensitive.
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'registered')),
  source TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  invited_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS waitlist_status_created_idx ON waitlist (status, created_at DESC);

CREATE TABLE IF NOT EXISTS invites (
  token TEXT PRIMARY KEY,
  waitlist_id UUID NOT NULL REFERENCES waitlist(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  redeemed_at TIMESTAMP WITH TIME ZONE,
  redeemed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS invites_waitlist_idx ON invites (waitlist_id);

-- One-row settings table, same shape as ai_billing_settings (id BOOLEAN PK = TRUE).
CREATE TABLE IF NOT EXISTS signup_access (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  public_slots_open INTEGER NOT NULL DEFAULT 10 CHECK (public_slots_open >= 0),
  public_slots_claimed INTEGER NOT NULL DEFAULT 0 CHECK (public_slots_claimed >= 0),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO signup_access (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

-- Atomic slot claim. The WHERE guard and the increment happen in one statement, so
-- two concurrent signups cannot both take the last slot. Returns TRUE if claimed.
CREATE OR REPLACE FUNCTION claim_public_signup_slot()
RETURNS BOOLEAN AS $$
DECLARE
  claimed BOOLEAN;
BEGIN
  UPDATE signup_access
  SET public_slots_claimed = public_slots_claimed + 1,
      updated_at = NOW()
  WHERE id = TRUE AND public_slots_claimed < public_slots_open
  RETURNING TRUE INTO claimed;
  RETURN COALESCE(claimed, FALSE);
END;
$$ LANGUAGE plpgsql;
