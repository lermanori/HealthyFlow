import { z } from 'zod'

// What the Admin read endpoints return, read by the server and the client
// alike. The overview's activity rows still carry legacy cost units; Ledger
// (#306) replaces them.

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

export const UsageActivitySchema = z.object({
  id: z.string(),
  userId: z.string(),
  userEmail: z.string().nullable(),
  userName: z.string().nullable(),
  endpoint: z.string().nullable(),
  model: z.string().nullable(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalOpenAiTokens: z.number(),
  openAiCostUsd: z.number(),
  creditsDelta: z.number(),
  billedTokens: z.number(),
  reservedTokens: z.number().nullable(),
  baseTokens: z.number(),
  markupTokens: z.number(),
  reason: z.string().nullable(),
  estimated: z.boolean(),
  balanceBefore: z.number().nullable(),
  balanceAfter: z.number().nullable(),
  createdAt: z.string(),
})
export type UsageActivity = z.infer<typeof UsageActivitySchema>

export const AdminOverviewSchema = z.object({
  activity: z.array(UsageActivitySchema),
})
export type AdminOverview = z.infer<typeof AdminOverviewSchema>

const AdminOverviewContracts = {
  SpendSummarySchema,
  AdminSpendSchema,
  UsageActivitySchema,
  AdminOverviewSchema,
}

export default AdminOverviewContracts
