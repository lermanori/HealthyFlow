import fs from 'fs'
import path from 'path'
import {
  AdminUserDeletionInputSchema,
  adminDeletionBlockers,
  adminDeletionConfirmationPhrase,
  adminUserProtectionFor,
} from '../../src/account-data'

describe('admin user-management migration', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../../../supabase/migrations/20260729120000_add_admin_user_management.sql'),
    'utf8',
  )

  it('stores explicit test, disabled, and login state with an audit trail', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP WITH TIME ZONE')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS admin_user_audit_log')
  })

  it('previews every cascade group without exposing row contents', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION admin_user_deletion_counts')
    expect(migration).toContain('REVOKE ALL ON FUNCTION admin_user_deletion_counts(UUID[]) FROM authenticated')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION admin_user_deletion_counts(UUID[]) TO service_role')
  })
})

describe('signup seat accounting migration', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../../../supabase/migrations/20260729170000_reconcile_signup_seats.sql'),
    'utf8',
  )

  it('tracks public seat ownership and cleans account access state transactionally', () => {
    expect(migration).toContain('claimed_public_signup_slot BOOLEAN NOT NULL DEFAULT FALSE')
    expect(migration).toContain("WHERE status = 'registered'")
    expect(migration).toContain('CREATE OR REPLACE FUNCTION delete_user_with_signup_cleanup')
    expect(migration).toContain('DELETE FROM waitlist')
    expect(migration).toContain('public_slots_claimed = public_slots_claimed - 1')
  })

  it('limits destructive cleanup helpers to the service role', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION delete_user_with_signup_cleanup(UUID) FROM authenticated')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION delete_user_with_signup_cleanup(UUID) TO service_role')
    expect(migration).toContain('REVOKE ALL ON FUNCTION release_public_signup_slot() FROM authenticated')
  })

  it('adds waitlist records and public seats to the deletion preview', () => {
    expect(migration).toContain('waitlist BIGINT')
    expect(migration).toContain('public_signup_seats BIGINT')
  })
})

describe('admin user protections', () => {
  const regularUser = {
    id: 'user-1',
    email: 'person@example.com',
    role: 'user' as const,
  }

  it('protects the current administrator, every administrator, demos, and the durable test fixture', () => {
    expect(adminUserProtectionFor('admin-1', {
      ...regularUser,
      id: 'admin-1',
    })).toBe('current_admin')
    expect(adminUserProtectionFor('admin-1', {
      ...regularUser,
      id: 'admin-2',
      role: 'admin',
    })).toBe('administrator')
    expect(adminUserProtectionFor('admin-1', {
      ...regularUser,
      email: 'demo-maya@healthyflow.com',
    })).toBe('demo_account')
    expect(adminUserProtectionFor('admin-1', {
      ...regularUser,
      email: 'demo@healthyflow.com',
    })).toBe('demo_account')
    expect(adminUserProtectionFor('admin-1', {
      ...regularUser,
      email: 'e2e@test.healthyflow.local',
    })).toBe('test_fixture')
  })

  it('does not infer test status from an ordinary email address', () => {
    expect(adminUserProtectionFor('admin-1', {
      ...regularUser,
      email: 'test-account@example.com',
    })).toBeNull()
  })
})

describe('test-user deletion contract', () => {
  it('blocks live users and active subscribers in addition to protected accounts', () => {
    expect(adminDeletionBlockers({
      protection: 'administrator',
      isTest: false,
      subscriptionActive: true,
    })).toEqual(['administrator', 'not_test', 'active_subscription'])
  })

  it('allows only an explicit unprotected test user without a subscription', () => {
    expect(adminDeletionBlockers({
      protection: null,
      isTest: true,
      subscriptionActive: false,
    })).toEqual([])
  })

  it('uses an exact, batch-sized confirmation phrase', () => {
    expect(adminDeletionConfirmationPhrase(1)).toBe('DELETE 1 TEST USER')
    expect(adminDeletionConfirmationPhrase(4)).toBe('DELETE 4 TEST USERS')
  })

  it('limits destructive batches and requires confirmation input', () => {
    expect(AdminUserDeletionInputSchema.safeParse({
      userIds: ['user-1'],
      confirmation: '',
    }).success).toBe(false)
    expect(AdminUserDeletionInputSchema.safeParse({
      userIds: Array.from({ length: 21 }, (_, index) => `user-${index}`),
      confirmation: 'DELETE 21 TEST USERS',
    }).success).toBe(false)
  })
})
