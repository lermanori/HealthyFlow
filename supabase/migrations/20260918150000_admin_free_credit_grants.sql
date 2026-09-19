-- Admin shows each account's free-allowance state (#302) by the rule the server
-- enforces: the same get_free_credit_grant the user's own summary reads, asked
-- for every listed account in one call. An id that no longer exists is skipped
-- rather than failing the whole list.

CREATE OR REPLACE FUNCTION admin_free_credit_grants(
  p_user_ids UUID[],
  p_guest_credits INT,
  p_monthly_credits INT
)
RETURNS TABLE (user_id UUID, free_grant JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT users.id, get_free_credit_grant(users.id, p_guest_credits, p_monthly_credits)
    FROM users
   WHERE users.id = ANY(p_user_ids);
$$;

REVOKE ALL ON FUNCTION admin_free_credit_grants(UUID[], INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_free_credit_grants(UUID[], INT, INT) TO service_role;
