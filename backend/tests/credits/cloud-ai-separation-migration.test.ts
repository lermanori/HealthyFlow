import fs from 'node:fs'
import path from 'node:path'

describe('legacy Cloud stays independent from free AI actions', () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      '../../../supabase/migrations/20260914195000_decouple_cloud_from_free_ai_actions.sql',
    ),
    'utf8',
  )

  const monthlyClaim = migration.slice(
    migration.indexOf('CREATE FUNCTION claim_monthly_free_credits'),
    migration.indexOf('REVOKE ALL ON FUNCTION claim_monthly_free_credits'),
  )

  it('does not consult Cloud while deciding the monthly AI grant', () => {
    expect(monthlyClaim).not.toContain('user_credit_subscriptions')
    expect(monthlyClaim).not.toContain('subscription_active')
  })

  it('keeps the monthly grant atomic and once per calendar month', () => {
    expect(monthlyClaim).toContain('ON CONFLICT (user_id) DO UPDATE')
    expect(monthlyClaim).toContain('last_free_refill_month')
    expect(monthlyClaim).toContain("'monthly_free_refill'")
  })
})
