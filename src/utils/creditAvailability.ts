import type { CreditSummary } from '../../backend/src/credit-contracts'

/**
 * What the user can spend, including a lazy grant that has not been written yet.
 * `null` is deliberate: an unavailable entitlement read must never look like zero.
 */
export function availableActionCount(summary: CreditSummary): number | null {
  if (summary.freeGrant.state === 'unavailable') return null
  if (summary.freeGrant.state === 'available') {
    return summary.balance + summary.freeGrant.credits
  }
  return summary.balance
}
