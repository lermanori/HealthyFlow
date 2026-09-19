import { z } from 'zod'

// What GET /admin/overview returns, read by the server and the
// client alike. The figures are still the ledger's legacy cost units; Spend
// (#305) and Ledger (#306) replace them.

export const UsageTotalsSchema = z.object({
  requestCount: z.number().int().nonnegative(),
  billedTokens: z.number(),
  markupTokens: z.number(),
  baseTokens: z.number(),
  openAiCostUsd: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalOpenAiTokens: z.number(),
})
export type UsageTotals = z.infer<typeof UsageTotalsSchema>

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

export const BillingAccountSchema = z.object({
  id: z.string(),
  // Null for a Guest.
  email: z.string().nullable(),
  name: z.string(),
  role: z.enum(['admin', 'user']),
  balance: z.number().int(),
  balance_updated_at: z.string().nullable(),
})
export type BillingAccount = z.infer<typeof BillingAccountSchema>

export const AdminOverviewSchema = z.object({
  users: z.array(BillingAccountSchema),
  totals: z.object({
    today: UsageTotalsSchema,
    thisWeek: UsageTotalsSchema,
    thisMonth: UsageTotalsSchema,
  }),
  activity: z.array(UsageActivitySchema),
})
export type AdminOverview = z.infer<typeof AdminOverviewSchema>

const AdminOverviewContracts = {
  UsageTotalsSchema,
  UsageActivitySchema,
  BillingAccountSchema,
  AdminOverviewSchema,
}

export default AdminOverviewContracts
