-- The Guards panel (#307). Refusals were never recorded, so nobody could see
-- which guard fired or how often. They get their own table: a refusal is not a
-- charge, and keeping it out of ai_usage_log means it can never count toward
-- the global ceiling or an account's daily cap.

CREATE TABLE IF NOT EXISTS ai_refusals (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  endpoint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_refusals_created_at_idx ON ai_refusals (created_at);

ALTER TABLE ai_refusals ENABLE ROW LEVEL SECURITY;

-- Today's guard state in one call: refusals by code, the accounts at or near
-- the per-account daily cap, and Guests created without the network grant
-- (ADR-0023).
CREATE OR REPLACE FUNCTION admin_guard_status(p_since TIMESTAMPTZ, p_near_cap INT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'refusals', COALESCE((
      SELECT jsonb_object_agg(code, refused)
        FROM (
          SELECT code, COUNT(*) AS refused
            FROM ai_refusals
           WHERE created_at >= p_since
           GROUP BY code
        ) by_code
    ), '{}'::JSONB),
    'nearCap', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('userId', busy.user_id, 'email', users.email, 'actions', busy.actions) ORDER BY busy.actions DESC)
        FROM (
          SELECT user_id, COUNT(*) AS actions
            FROM ai_usage_log
           WHERE created_at >= p_since
             AND action_class IS NOT NULL
           GROUP BY user_id
          HAVING COUNT(*) >= p_near_cap
           ORDER BY COUNT(*) DESC
           LIMIT 20
        ) busy
        JOIN users ON users.id = busy.user_id
    ), '[]'::JSONB),
    'guestsWithoutGrant', (
      SELECT COUNT(*)
        FROM users
       WHERE users.created_at >= p_since
         AND users.email IS NULL
         AND NOT users.guest_grant_ip_reserved
    )
  );
$$;

REVOKE ALL ON FUNCTION admin_guard_status(TIMESTAMPTZ, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_guard_status(TIMESTAMPTZ, INT) TO service_role;
