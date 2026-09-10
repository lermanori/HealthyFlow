/**
 * The once-ever Guest grant is reserved per network, not per account row.
 *
 * Without this, deleting and reinstalling the app mints a fresh Guest row and a
 * fresh ten-action grant, so one person can farm founder-paid AI actions from a
 * single device. The reservation is taken at Guest creation — the one moment the
 * client IP is naturally in hand — so an ordinary person who starts on café
 * WiFi and then acts on cellular keeps the grant they were already given.
 *
 * The address itself is never stored. A bare SHA-256 of an IPv4 address is
 * brute-forceable in seconds across the whole 32-bit space, so the reservation
 * key is an HMAC under a server secret.
 */
import { GUEST_GRANT_IP_WINDOW_HOURS, hashClientIp } from '../../src/credits'

describe('Guest grant network reservation key', () => {
  const secret = 'test-guest-ip-secret'

  it('is stable for one address and distinct across addresses', () => {
    expect(hashClientIp('203.0.113.7', secret)).toBe(hashClientIp('203.0.113.7', secret))
    expect(hashClientIp('203.0.113.7', secret)).not.toBe(hashClientIp('203.0.113.8', secret))
  })

  it('never carries the address it was derived from', () => {
    const hash = hashClientIp('203.0.113.7', secret)
    expect(hash).not.toContain('203.0.113.7')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is keyed by the secret, so a rotated secret cannot be reversed with a rainbow table', () => {
    expect(hashClientIp('203.0.113.7', secret)).not.toBe(hashClientIp('203.0.113.7', 'other'))
  })

  it('refuses to derive a key without a secret rather than hashing unprotected', () => {
    expect(() => hashClientIp('203.0.113.7', '')).toThrow(/secret/i)
  })

  it('treats a missing address as unreservable rather than reserving a shared blank key', () => {
    expect(() => hashClientIp(undefined, secret)).toThrow(/address/i)
  })

  it('holds a reservation for a full day', () => {
    expect(GUEST_GRANT_IP_WINDOW_HOURS).toBe(24)
  })
})
