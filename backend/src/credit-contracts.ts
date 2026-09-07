import { z } from 'zod'

/** Browser-safe credit and entitlement contracts shared by the API and client. */

export const ActionPriceSchema = z.object({
  text: z.number().int().positive(),
  photo: z.number().int().positive(),
  premium: z.number().int().positive(),
})
export type ActionPrice = z.infer<typeof ActionPriceSchema>

export const CreditSubscriptionPricingSchema = z.object({
  promoActive: z.boolean(),
  phase: z.enum(['promo', 'regular']),
  priceUsd: z.number().positive(),
  topUpPriceUsd: z.number().positive(),
  topUpCredits: z.number().int().positive(),
  actionPrice: ActionPriceSchema,
  foundingMemberLimit: z.number().int().positive(),
  updatedAt: z.string().nullable().optional(),
})
export type CreditSubscriptionPricing = z.infer<typeof CreditSubscriptionPricingSchema>

export const CreditSubscriptionStateSchema = z.object({
  active: z.boolean(),
  pricePhase: z.enum(['promo', 'regular']).nullable(),
  monthlyCredits: z.number().int().nonnegative(),
  renewalDate: z.string().nullable(),
  lastMonthlyGrantAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})
export type CreditSubscriptionState = z.infer<typeof CreditSubscriptionStateSchema>

export const FreeCreditGrantSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('available'),
    credits: z.number().int().positive(),
    kind: z.enum(['guest_initial', 'monthly']),
  }),
  z.object({ state: z.literal('claimed') }),
  z.object({
    state: z.literal('unavailable'),
    reason: z.string().min(1),
  }),
])
export type FreeCreditGrant = z.infer<typeof FreeCreditGrantSchema>

export const CreditSummarySchema = z.object({
  balance: z.number().int().nonnegative(),
  subscriptionBalance: z.number().int().nonnegative(),
  topupBalance: z.number().int().nonnegative(),
  usedThisMonth: z.number().int().nonnegative(),
  freeGrant: FreeCreditGrantSchema,
  entitlementUsed: z.object({
    photo: z.number().int().nonnegative(),
    premium: z.number().int().nonnegative(),
    photoCap: z.number().int().positive(),
    premiumCap: z.number().int().positive(),
  }),
  pricing: CreditSubscriptionPricingSchema,
  subscription: CreditSubscriptionStateSchema,
})
export type CreditSummary = z.infer<typeof CreditSummarySchema>

const CreditContracts = {
  ActionPriceSchema,
  CreditSubscriptionPricingSchema,
  CreditSubscriptionStateSchema,
  FreeCreditGrantSchema,
  CreditSummarySchema,
}

export default CreditContracts
