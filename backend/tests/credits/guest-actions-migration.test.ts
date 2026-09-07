import fs from 'node:fs'
import path from 'node:path'

describe('one-time Guest action grant migration', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../../../supabase/migrations/20260907090000_guest_initial_actions.sql'),
    'utf8',
  )
  const monthlyMigration = fs.readFileSync(
    path.join(__dirname, '../../../supabase/migrations/20260906131500_credit_is_an_action.sql'),
    'utf8',
  )

  it('uses a dedicated once-ever marker and atomic Guest-only upsert', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS guest_grant_claimed_at TIMESTAMPTZ')
    expect(migration).toContain('CREATE FUNCTION claim_guest_initial_credits')
    expect(migration).toContain('users.email IS NULL')
    expect(migration).toContain('ON CONFLICT (user_id) DO UPDATE')
    expect(migration).toContain('user_credits.guest_grant_claimed_at IS NULL')
    expect(migration).toContain("'guest_initial_grant'")
  })

  it('keeps the Guest marker independent from the monthly refill marker', () => {
    const guestFunction = migration.slice(
      migration.indexOf('CREATE FUNCTION claim_guest_initial_credits'),
      migration.indexOf('REVOKE ALL ON FUNCTION claim_guest_initial_credits'),
    )

    expect(guestFunction).not.toContain('last_free_refill_month')

    const monthlyFunction = monthlyMigration.slice(
      monthlyMigration.indexOf('CREATE FUNCTION claim_monthly_free_credits'),
      monthlyMigration.indexOf('REVOKE ALL ON FUNCTION claim_monthly_free_credits'),
    )
    expect(monthlyFunction).not.toContain('guest_grant_claimed_at')
  })

  it('adds a read-only entitlement resolver without writing either grant', () => {
    expect(migration).toContain('CREATE FUNCTION get_free_credit_grant')
    expect(migration).toContain("'guest_initial'")
    expect(migration).toContain("'monthly'")
    expect(migration).toContain("'available'")
    expect(migration).toContain("'claimed'")

    const readFunction = migration.slice(
      migration.indexOf('CREATE FUNCTION get_free_credit_grant'),
      migration.indexOf('REVOKE ALL ON FUNCTION get_free_credit_grant'),
    )
    expect(readFunction).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/)
  })
})
