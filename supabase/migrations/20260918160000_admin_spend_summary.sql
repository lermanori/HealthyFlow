-- Spend in Admin (#305): what AI cost, counted from the recorded cost_usd, and
-- what users were charged, counted in actions, as one aggregate per period.
-- Fetching ledger rows and adding them up stopped at the API's row limit, and
-- mixed a price column with a cost column; this keeps them apart:
--   * cost is SUM(cost_usd); an AI call whose cost is unknown is counted, never
--     treated as free;
--   * actions charged are negative credits_delta on rows that carry an action
--     class, so an administrator lowering a balance is never "spending";
--   * rows written in the credit unit before ADR-0016 (an AI call with no action
--     class) are counted separately rather than mixed into action totals.

CREATE OR REPLACE FUNCTION admin_spend_summary(p_since TIMESTAMPTZ, p_include_test BOOLEAN)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ledger AS (
    SELECT log.*
      FROM ai_usage_log log
      JOIN users ON users.id = log.user_id
     WHERE log.created_at >= p_since
       AND (p_include_test OR NOT users.is_test)
  )
  SELECT jsonb_build_object(
    'costUsd', COALESCE(SUM(cost_usd), 0),
    'requests', COUNT(*) FILTER (WHERE model IS NOT NULL),
    'uncostedCalls', COUNT(*) FILTER (WHERE model IS NOT NULL AND cost_usd IS NULL),
    'actions', jsonb_build_object(
      'text', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE action_class = 'text' AND credits_delta < 0),
        'credits', COALESCE(-SUM(credits_delta) FILTER (WHERE action_class = 'text' AND credits_delta < 0), 0)),
      'photo', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE action_class = 'photo' AND credits_delta < 0),
        'credits', COALESCE(-SUM(credits_delta) FILTER (WHERE action_class = 'photo' AND credits_delta < 0), 0)),
      'premium', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE action_class = 'premium' AND credits_delta < 0),
        'credits', COALESCE(-SUM(credits_delta) FILTER (WHERE action_class = 'premium' AND credits_delta < 0), 0))
    ),
    'refundedAttempts', COUNT(*) FILTER (WHERE reason LIKE 'refund_failed_call%'),
    'freeGranted', jsonb_build_object(
      'guest', COALESCE(SUM(credits_delta) FILTER (WHERE reason = 'guest_initial_grant'), 0),
      'monthly', COALESCE(SUM(credits_delta) FILTER (WHERE reason = 'monthly_free_refill'), 0)
    ),
    'adminChanges', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE reason = 'admin_balance_set'),
      'net', COALESCE(SUM(credits_delta) FILTER (WHERE reason = 'admin_balance_set'), 0)
    ),
    'legacyUnitRows', COUNT(*) FILTER (WHERE model IS NOT NULL AND action_class IS NULL AND credits_delta <> 0)
  )
  FROM ledger;
$$;

REVOKE ALL ON FUNCTION admin_spend_summary(TIMESTAMPTZ, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_spend_summary(TIMESTAMPTZ, BOOLEAN) TO service_role;
