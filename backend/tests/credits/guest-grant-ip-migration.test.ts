/**
 * Contract tests for the per-network Guest grant reservation (ADR-0023).
 *
 * Two guards matter here and neither is visible from TypeScript: the reservation
 * must be atomic, because two Guests created from one network at the same instant
 * must not both win it; and the grant RPC must refuse to pay out to a Guest whose
 * network was never reserved, so the reservation cannot be bypassed by calling
 * the grant directly.
 */
import fs from 'node:fs'
import path from 'node:path'

describe('per-network Guest grant migration', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../../../supabase/migrations/20260910150000_guest_grant_ip_guard.sql'),
    'utf8',
  )

  const reserveFunction = migration.slice(
    migration.indexOf('CREATE FUNCTION reserve_guest_grant_ip'),
    migration.indexOf('REVOKE ALL ON FUNCTION reserve_guest_grant_ip'),
  )
  const grantFunction = migration.slice(
    migration.indexOf('CREATE FUNCTION claim_guest_initial_credits'),
    migration.indexOf('REVOKE ALL ON FUNCTION claim_guest_initial_credits'),
  )

  it('stores only a derived key and when it was taken, never an address', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS guest_grant_ips')
    expect(migration).toContain('ip_hash TEXT PRIMARY KEY')
    expect(migration).toContain('granted_at TIMESTAMPTZ NOT NULL')
    expect(migration).not.toMatch(/\bip_address\b|\braw_ip\b|\bclient_ip\b/)
  })

  it('reserves a network atomically, so a concurrent second Guest cannot also win it', () => {
    expect(reserveFunction).toContain('INSERT INTO guest_grant_ips')
    expect(reserveFunction).toContain('ON CONFLICT (ip_hash) DO UPDATE')
    // The conditional UPDATE is the whole guard: it takes the row lock and
    // returns nothing when a live reservation already exists.
    expect(reserveFunction).toContain('make_interval(hours => p_window_hours)')
    expect(reserveFunction).toContain('RETURN COALESCE(reserved, FALSE)')
  })

  it('pays the grant only to a Guest whose network was reserved', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS guest_grant_ip_reserved BOOLEAN NOT NULL DEFAULT FALSE')
    // Both halves of the upsert must carry the predicate; guarding only the
    // INSERT would let an existing zero-balance row collect the grant.
    const guarded = grantFunction.match(/users\.guest_grant_ip_reserved/g) ?? []
    expect(guarded.length).toBeGreaterThanOrEqual(2)
  })

  it('reports an unreserved network as its own cause, not as an exhausted grant', () => {
    expect(grantFunction).toContain("'network_limited'")
    expect(migration).toContain("'network_limited'")
  })

  it('leaves the claimed-account monthly refill untouched', () => {
    expect(grantFunction).not.toContain('last_free_refill_month')
    const readFunction = migration.slice(
      migration.indexOf('CREATE FUNCTION get_free_credit_grant'),
      migration.indexOf('REVOKE ALL ON FUNCTION get_free_credit_grant'),
    )
    // The network reservation is a Guest concern only. It is read once up front,
    // but it may only be *branched on* inside `email IS NULL` — a claimed
    // account's monthly grant must never depend on the network it signs in from.
    const guestBranch = readFunction.slice(
      readFunction.indexOf('IF account_email IS NULL THEN'),
      readFunction.indexOf('IF last_refill_month >= current_month THEN'),
    )
    const monthlyBranch = readFunction.slice(
      readFunction.indexOf('IF last_refill_month >= current_month THEN'),
    )
    expect(guestBranch).toContain('guest_network_reserved')
    expect(monthlyBranch).not.toContain('guest_network_reserved')
  })
})
