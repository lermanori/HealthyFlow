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
  z.object({
    state: z.literal('claimed'),
    kind: z.enum(['guest_initial', 'monthly']),
    nextAvailableAt: z.string().datetime().nullable(),
  }),
  // The Guest grant was never payable here because this network already took one
  // inside the window (ADR-0023). Distinct from `claimed`, which means the ten
  // actions were received and spent, and from `unavailable`, which means a read
  // broke. Telling a person on a shared network that they used ten actions they
  // never got is the dishonest exhaustion this state exists to prevent.
  z.object({
    state: z.literal('network_limited'),
    kind: z.literal('guest_initial'),
  }),
  // The recurring monthly grant is withheld until the address is proven
  // reachable, because an unverified address is the cheap part of minting an
  // account and the grant is the thing worth minting one for (ADR-0026).
  // Distinct from `claimed`, which means this month's fifteen were received and
  // spent: telling someone they used actions they were never given is the same
  // dishonest exhaustion `network_limited` exists to prevent.
  z.object({
    state: z.literal('email_unverified'),
    kind: z.literal('monthly'),
  }),
  z.object({
    state: z.literal('unavailable'),
    reason: z.string().min(1),
  }),
])
export type FreeCreditGrant = z.infer<typeof FreeCreditGrantSchema>

/**
 * The same contract, for a reader that may be older than the server.
 *
 * A state this build has never heard of degrades to `unavailable` — which is
 * true of it: the client genuinely cannot read the entitlement. The alternative
 * is what shipping `network_limited` did, where one added state made every
 * credit summary fail to parse on clients that predated it. An iOS build can be
 * weeks old with no way to force an update, so the server cannot wait for
 * everyone to catch up.
 */
export const ReadableFreeCreditGrantSchema = FreeCreditGrantSchema.catch({
  state: 'unavailable' as const,
  reason: 'This version cannot read the current action entitlement. Updating the app will fix it.',
})

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

/**
 * The summary as a client reads it.
 *
 * Identical except that an unrecognised free-grant state degrades instead of
 * failing the whole summary. The server keeps the strict schema — it is the one
 * producing the value and must not be allowed to emit something malformed.
 */
export const ReadableCreditSummarySchema = CreditSummarySchema.extend({
  freeGrant: ReadableFreeCreditGrantSchema,
})

const CreditContracts = {
  ActionPriceSchema,
  CreditSubscriptionPricingSchema,
  CreditSubscriptionStateSchema,
  FreeCreditGrantSchema,
  ReadableFreeCreditGrantSchema,
  CreditSummarySchema,
  ReadableCreditSummarySchema,
}

export default CreditContracts
