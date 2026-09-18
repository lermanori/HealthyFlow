-- The global daily spending ceiling (#296) sums recorded OpenAI cost as one
-- aggregate. Fetching the rows and adding them in TypeScript stopped counting at
-- the API's row limit, so a busy day could run past the ceiling unseen.

CREATE OR REPLACE FUNCTION sum_ai_cost_usd_since(p_since TIMESTAMPTZ)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(cost_usd), 0)
    FROM ai_usage_log
   WHERE created_at >= p_since
     AND cost_usd IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION sum_ai_cost_usd_since(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sum_ai_cost_usd_since(TIMESTAMPTZ) TO service_role;
