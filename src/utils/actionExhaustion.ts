import type { CreditSummary } from '../../backend/src/credit-contracts'

export type ActionExhaustionView =
  | { kind: 'guest'; title: string; detail: string }
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
