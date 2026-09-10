import type { CreditSummary } from '../../backend/src/credit-contracts'

export type ActionExhaustionView =
  | { kind: 'guest'; title: string; detail: string }
  | { kind: 'network'; title: string; detail: string }
  | { kind: 'monthly'; title: string; nextAvailableAt: string }
  | { kind: 'unavailable'; title: string; detail: string }

export function actionExhaustionView(summary: CreditSummary): ActionExhaustionView | null {
  if (summary.freeGrant.state === 'unavailable') {
    return {
      kind: 'unavailable',
      title: 'Action availability is unavailable.',
      detail: summary.freeGrant.reason,
    }
  }

  if (summary.balance > 0 || summary.freeGrant.state === 'available') return null

  // The grant was never paid to this Guest because their network had already
  // taken one (ADR-0023). Saying "you used your 10 actions" here would be a lie
  // to everyone behind a shared NAT, which is most people on cellular.
  if (summary.freeGrant.state === 'network_limited') {
    return {
      kind: 'network',
      title: 'Free Guest AI actions have already been used on this network today.',
      detail: 'Create a free account for 15 AI actions each calendar month.',
    }
  }

  if (summary.freeGrant.kind === 'guest_initial') {
    return {
      kind: 'guest',
      title: 'You have used your 10 Guest AI actions.',
      detail: 'Create a free account for 15 AI actions each calendar month.',
    }
  }

  if (!summary.freeGrant.nextAvailableAt) {
    return {
      kind: 'unavailable',
      title: 'Action availability is unavailable.',
      detail: 'The next monthly grant could not be read.',
    }
  }

  return {
    kind: 'monthly',
    title: 'You have used this month’s 15 AI actions.',
    nextAvailableAt: summary.freeGrant.nextAvailableAt,
  }
}
