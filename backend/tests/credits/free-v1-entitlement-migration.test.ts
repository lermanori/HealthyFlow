import fs from 'node:fs'
import path from 'node:path'

describe('free-v1 entitlement migration', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../../../supabase/migrations/20260907170000_disable_v1_cloud.sql'),
    'utf8',
  )

  it('deactivates legacy Cloud rows without deleting their history', () => {
    expect(migration).toContain('UPDATE user_credit_subscriptions')
    expect(migration).toContain('SET active = FALSE')
    expect(migration).not.toContain('DELETE FROM user_credit_subscriptions')
  })

  it('makes the free-grant read model independent of Cloud', () => {
    expect(migration).toContain('CREATE FUNCTION get_free_credit_grant')
    const resolver = migration.slice(migration.indexOf('CREATE FUNCTION get_free_credit_grant'))
    expect(resolver).not.toContain('active_subscription')
    expect(resolver).toContain("'nextAvailableAt'")
  })
})
