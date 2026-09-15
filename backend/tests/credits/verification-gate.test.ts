/**
 * The monthly grant requires a proven address (ADR-0026).
 *
 * Every case here is about who does and does not get free actions, so each one
 * is either a person wrongly refused or a farmed account wrongly paid.
 */
import { Credits, VERIFICATION_REQUIRED_FROM } from '../../src/credits'

const AFTER = new Date(VERIFICATION_REQUIRED_FROM.getTime() + 86_400_000).toISOString()
const BEFORE = new Date(VERIFICATION_REQUIRED_FROM.getTime() - 86_400_000).toISOString()

describe('monthlyGrantEligibility', () => {
  it('withholds the grant from a new unverified account', async () => {
    expect(await Credits.monthlyGrantEligibility({
      email: 'new@example.com',
      email_verified_at: null,
      created_at: AFTER,
    })).toBe('email_unverified')
  })

  it('pays a new account once the address is proven', async () => {
    expect(await Credits.monthlyGrantEligibility({
      email: 'new@example.com',
      email_verified_at: AFTER,
      created_at: AFTER,
    })).toBe('eligible')
  })

  it('leaves a Guest alone', async () => {
    // A Guest's ten are a different grant, already held to one per network per
    // day (ADR-0023), and they are how someone tries the app at all.
    expect(await Credits.monthlyGrantEligibility({
      email: null,
      email_verified_at: null,
      created_at: AFTER,
    })).toBe('eligible')
  })

  it('does not interrupt an account that predates the rule', async () => {
    expect(await Credits.monthlyGrantEligibility({
      email: 'old@example.com',
      email_verified_at: null,
      created_at: BEFORE,
    })).toBe('eligible')
  })

  it('pays out rather than locking someone out over an unreadable creation date', async () => {
    for (const created_at of [null, undefined, 'not-a-date']) {
      expect(await Credits.monthlyGrantEligibility({
        email: 'odd@example.com',
        email_verified_at: null,
        created_at,
      })).toBe('eligible')
    }
  })

  it('grandfathers by signup date, never by marking the address proven', async () => {
    // The distinction that matters: `email_verified_at` is also what lets
    // someone reset their password. Grandfathering credits by stamping it would
    // hand out account recovery on addresses nobody ever proved.
    const grandfathered = {
      email: 'old@example.com',
      email_verified_at: null,
      created_at: BEFORE,
    }
    expect(await Credits.monthlyGrantEligibility(grandfathered)).toBe('eligible')
    expect(grandfathered.email_verified_at).toBeNull()
  })
})
