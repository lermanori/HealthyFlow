import { z } from 'zod'

// What the Admin Spend and Ledger reads return, read by the server and the
// client alike.

const ActionClassTotalsSchema = z.object({
  count: z.number().int().nonnegative(),
  credits: z.number().int().nonnegative(),
})

/**
 * One period of Spend (#305), aggregated in the database from the ledger:
 * cost from recorded cost_usd, charges in actions. Never recomputed, and never
 * mixing an administrator's balance change into what users spent.
 */
export const SpendSummarySchema = z.object({
  costUsd: z.coerce.number().nonnegative(),
  requests: z.number().int().nonnegative(),
  // AI calls whose cost could not be recorded: counted, never treated as free.
  uncostedCalls: z.number().int().nonnegative(),
  actions: z.object({
    text: ActionClassTotalsSchema,
    photo: ActionClassTotalsSchema,
    premium: ActionClassTotalsSchema,
  }),
  refundedAttempts: z.number().int().nonnegative(),
  freeGranted: z.object({
    guest: z.number().int(),
    monthly: z.number().int(),
  }),
  adminChanges: z.object({
    count: z.number().int().nonnegative(),
    net: z.number().int(),
  }),
  // AI calls written in the credit unit before ADR-0016; kept out of action totals.
  legacyUnitRows: z.number().int().nonnegative(),
})
export type SpendSummary = z.infer<typeof SpendSummarySchema>

export const AdminSpendSchema = z.object({
  today: SpendSummarySchema,
  thisWeek: SpendSummarySchema,
  thisMonth: SpendSummarySchema,
})
export type AdminSpend = z.infer<typeof AdminSpendSchema>

export const LedgerKindSchema = z.enum(['ai', 'refund', 'grant', 'admin', 'other'])
export const LedgerFilterSchema = z.enum(['all', 'ai', 'refund', 'grant', 'admin'])
export type LedgerFilter = z.infer<typeof LedgerFilterSchema>

/**
 * One ledger row as the Ledger shows it (#306): what happened, in signed
 * actions, with the cost that was recorded and who made an admin change.
 */
export const LedgerRowSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  userId: z.string(),
  // Null for a Guest.
  userEmail: z.string().nullable(),
  userName: z.string().nullable(),
  kind: LedgerKindSchema,
  endpoint: z.string().nullable(),
  model: z.string().nullable(),
  actionClass: z.enum(['text', 'photo', 'premium']).nullable(),
  reason: z.string().nullable(),
  // Positive for a grant or an increase, negative for a charge, 0 for a refund.
  creditsDelta: z.number().int(),
  balanceAfter: z.number().int().nullable(),
  // What the call cost as recorded. Null with costUnknown when an AI call's
  // usage was never reported; null without it for a row that is not a call.
  costUsd: z.number().nullable(),
  costUnknown: z.boolean(),
  actorEmail: z.string().nullable(),
  // Written in the credit unit used before ADR-0016, not in actions.
  legacyUnit: z.boolean(),
})
export type LedgerRow = z.infer<typeof LedgerRowSchema>

export const LedgerPageSchema = z.object({
  rows: z.array(LedgerRowSchema),
  nextOffset: z.number().int().nonnegative().nullable(),
})
export type LedgerPage = z.infer<typeof LedgerPageSchema>

const AdminOverviewContracts = {
  SpendSummarySchema,
  AdminSpendSchema,
  LedgerFilterSchema,
  LedgerRowSchema,
  LedgerPageSchema,
}

export default AdminOverviewContracts
