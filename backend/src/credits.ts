import { db } from './supabase-client'
import type { TokenUsage } from './openai'
import { z } from 'zod'

export const APP_TOKENS_PER_USD = 1000
export const MARKUP_RATE = 0.25
export const MIN_MARKUP_TOKENS = 5
export const MIN_RESERVE_TOKENS = 5
export const SUBSCRIPTION_MONTHLY_CREDITS = 500
export const PROMO_PRICE_USD = 9
export const REGULAR_PRICE_USD = 19
export const TOP_UP_PRICE_USD = 5
export const TOP_UP_CREDITS = 250
export const FOUNDING_MEMBER_LIMIT = 100
export const FOUNDING_SIGNUP_CREDITS = 250
export const STANDARD_SIGNUP_CREDITS = 50
// ponytail: flat heuristic, biased HIGH on purpose. gpt-4o-mini bills images at
// a large multiplier (a high-detail image can run ~25k tokens), so we over-reserve
// here; settle refunds the unused estimate. Better to over-hold than to underfund
// the call. Replace with a size/detail-aware estimate if image volume grows.
export const ESTIMATED_IMAGE_TOKENS = 25000
export const PROMPT_TOKEN_CHARS = 4

export type SupportedAiModel =
  | 'gpt-5.5'
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5-mini'
  | 'gpt-4o-mini'
  | 'gpt-3.5-turbo'

type ModelPricing = {
  inputUsdPerMillion: number
  outputUsdPerMillion: number
}

const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-5.5': {
    inputUsdPerMillion: 5.00,
    outputUsdPerMillion: 30.00,
  },
  'gpt-5.4': {
    inputUsdPerMillion: 2.50,
    outputUsdPerMillion: 15.00,
  },
  'gpt-5.4-mini': {
    inputUsdPerMillion: 0.75,
    outputUsdPerMillion: 4.50,
  },
  'gpt-5-mini': {
    inputUsdPerMillion: 0.25,
    outputUsdPerMillion: 2.00,
  },
  'gpt-4o-mini': {
    inputUsdPerMillion: 0.15,
    outputUsdPerMillion: 0.60,
  },
  'gpt-3.5-turbo': {
    inputUsdPerMillion: 0.50,
    outputUsdPerMillion: 1.50,
  },
}

// ponytail: prices default to the map above. Override without a code change by
// setting AI_MODEL_PRICING (JSON: model -> {inputUsdPerMillion, outputUsdPerMillion}).
// Moving pricing into a DB-admin table is the follow-up if non-engineers need to edit it.
export function loadModelPricing(
  raw = process.env.AI_MODEL_PRICING
): Record<string, ModelPricing> {
  if (!raw) return DEFAULT_MODEL_PRICING
  try {
    return { ...DEFAULT_MODEL_PRICING, ...JSON.parse(raw) }
  } catch (e) {
    console.error('Invalid AI_MODEL_PRICING env — falling back to default pricing:', e)
    return DEFAULT_MODEL_PRICING
  }
}

const MODEL_PRICING = loadModelPricing()

export class UnpricedModelError extends Error {
  constructor(model: string) {
    super(`AI token pricing is not configured for model: ${model}`)
    this.name = 'UnpricedModelError'
  }
}

export const SignupCreditGrantSchema = z.object({
  credits: z.number().int().nonnegative(),
  cohort: z.enum(['founding', 'standard']),
  balance: z.number().int().nonnegative(),
  alreadyGranted: z.boolean(),
})
export type SignupCreditGrant = z.infer<typeof SignupCreditGrantSchema>

export const LaunchOfferSchema = z.object({
  foundingMemberLimit: z.number().int().positive(),
  foundingMembersRemaining: z.number().int().nonnegative(),
  onboardingCredits: z.number().int().positive(),
  foundingOnboardingCredits: z.number().int().positive(),
  standardOnboardingCredits: z.number().int().positive(),
  foundingPriceUsd: z.number().positive(),
  regularPriceUsd: z.number().positive(),
  monthlyCredits: z.number().int().positive(),
  topUpPriceUsd: z.number().positive(),
  topUpCredits: z.number().int().positive(),
})
export type LaunchOffer = z.infer<typeof LaunchOfferSchema>

type BillingUsage = {
  promptTokens: number
  completionTokens: number
}

export type BillingSettings = {
  appTokensPerUsd: number
  markupRate: number
  minMarkupTokens: number
  updatedAt?: string | null
}

export type SubscriptionPhase = 'promo' | 'regular'

export type SubscriptionPricing = {
  promoActive: boolean
  phase: SubscriptionPhase
  priceUsd: number
  monthlyCredits: number
  sellCreditsPerUsd: number
  topUpPriceUsd: number
  topUpCredits: number
  foundingMemberLimit: number
  updatedAt?: string | null
}

export type ChargeBreakdown = {
  baseTokens: number
  markupTokens: number
  totalTokens: number
}

type EstimateReserveInput = {
  model: string
  systemPrompt: string
  userPrompt: string | Array<{ type: string; text?: string }>
  maxOutputTokens: number
}

// settle always completes: it either reconciles fully or drains the balance to
// 0 (underfunded). It never fails the request — the AI result is already paid for.
type SettlementResult = { ok: true; chargeTokens: number; adjustmentTokens: number }

const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  appTokensPerUsd: APP_TOKENS_PER_USD,
  markupRate: MARKUP_RATE,
  minMarkupTokens: MIN_MARKUP_TOKENS,
  updatedAt: null,
}

function getPricing(model: string): ModelPricing {
  const pricing = MODEL_PRICING[model as SupportedAiModel]
  if (!pricing) {
    throw new UnpricedModelError(model)
  }
  return pricing
}

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / PROMPT_TOKEN_CHARS)
}

function userPromptEstimate(userPrompt: EstimateReserveInput['userPrompt']): number {
  if (typeof userPrompt === 'string') {
    return estimateTextTokens(userPrompt)
  }

  return userPrompt.reduce((total, part) => {
    if (part.type === 'text') {
      return total + estimateTextTokens(part.text ?? '')
    }
    if (part.type === 'image_url') {
      return total + ESTIMATED_IMAGE_TOKENS
    }
    return total
  }, 0)
}

export function calculateAiTokenCharge(
  model: string,
  usage: BillingUsage,
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS
): ChargeBreakdown {
  const openAiCostUsd = calculateOpenAiCostUsd(model, usage)
  const baseRawTokens = openAiCostUsd * settings.appTokensPerUsd
  const markupRawTokens = Math.max(baseRawTokens * settings.markupRate, settings.minMarkupTokens)
  const totalTokens = Math.ceil(baseRawTokens + markupRawTokens)
  const markupTokens = Math.ceil(markupRawTokens)

  return {
    baseTokens: Math.max(0, totalTokens - markupTokens),
    markupTokens,
    totalTokens,
  }
}

export function calculateOpenAiCostUsd(model: string, usage: BillingUsage): number {
  const pricing = getPricing(model)
  const inputUsd = (usage.promptTokens / 1_000_000) * pricing.inputUsdPerMillion
  const outputUsd = (usage.completionTokens / 1_000_000) * pricing.outputUsdPerMillion
  return inputUsd + outputUsd
}

export function estimateReserveTokens(
  input: EstimateReserveInput,
  settings: BillingSettings = DEFAULT_BILLING_SETTINGS
): number {
  getPricing(input.model)
  const promptTokens =
    estimateTextTokens(input.systemPrompt) +
    userPromptEstimate(input.userPrompt) +
    20
  const charge = calculateAiTokenCharge(
    input.model,
    {
      promptTokens,
      completionTokens: input.maxOutputTokens,
    },
    settings
  )
  return Math.max(charge.totalTokens, MIN_RESERVE_TOKENS)
}

function normalizeBillingSettings(row: any): BillingSettings {
  return {
    appTokensPerUsd: Number(row?.app_tokens_per_usd ?? APP_TOKENS_PER_USD),
    markupRate: Number(row?.markup_rate ?? MARKUP_RATE),
    minMarkupTokens: Number(row?.min_markup_tokens ?? MIN_MARKUP_TOKENS),
    updatedAt: row?.updated_at ?? null,
  }
}

function normalizeSubscriptionPricing(row: any, promoActiveOverride?: boolean): SubscriptionPricing {
  const promoActive = promoActiveOverride ?? row?.promo_active ?? true
  const priceUsd = promoActive ? PROMO_PRICE_USD : REGULAR_PRICE_USD
  return {
    promoActive,
    phase: promoActive ? 'promo' : 'regular',
    priceUsd,
    monthlyCredits: SUBSCRIPTION_MONTHLY_CREDITS,
    sellCreditsPerUsd: TOP_UP_CREDITS / TOP_UP_PRICE_USD,
    topUpPriceUsd: TOP_UP_PRICE_USD,
    topUpCredits: TOP_UP_CREDITS,
    foundingMemberLimit: FOUNDING_MEMBER_LIMIT,
    updatedAt: row?.updated_at ?? null,
  }
}

function nextRenewalDate(now = new Date()) {
  const next = new Date(now)
  next.setMonth(next.getMonth() + 1)
  return next.toISOString().slice(0, 10)
}

function subscriptionToClient(row: any) {
  return row ? {
    active: Boolean(row.active),
    pricePhase: row.price_phase as SubscriptionPhase,
    monthlyCredits: Number(row.monthly_credits ?? SUBSCRIPTION_MONTHLY_CREDITS),
    renewalDate: row.renewal_date ?? null,
    lastMonthlyGrantAt: row.last_monthly_grant_at ?? null,
    updatedAt: row.updated_at ?? null,
  } : {
    active: false,
    pricePhase: null,
    monthlyCredits: SUBSCRIPTION_MONTHLY_CREDITS,
    renewalDate: null,
    lastMonthlyGrantAt: null,
    updatedAt: null,
  }
}

function rangeStarts(now = new Date()) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const week = new Date(today)
  const day = week.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  week.setDate(week.getDate() + mondayOffset)

  const month = new Date(today.getFullYear(), today.getMonth(), 1)

  return {
    today: today.toISOString(),
    thisWeek: week.toISOString(),
    thisMonth: month.toISOString(),
  }
}

function emptyTotals() {
  return {
    requestCount: 0,
    billedTokens: 0,
    markupTokens: 0,
    baseTokens: 0,
    openAiCostUsd: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalOpenAiTokens: 0,
  }
}

function openAiCostForLog(log: any): number {
  return log.model
    ? calculateOpenAiCostUsd(log.model, {
      promptTokens: Number(log.prompt_tokens ?? 0),
      completionTokens: Number(log.completion_tokens ?? 0),
    })
    : 0
}

function chargePartsForLog(log: any, settings: BillingSettings) {
  const billedTokens = Math.abs(Math.min(Number(log.credits_delta ?? 0), 0))
  const openAiCostUsd = openAiCostForLog(log)
  const derivedBaseTokens = Math.ceil(openAiCostUsd * settings.appTokensPerUsd)
  const baseTokens = Number(log.base_tokens ?? 0) || derivedBaseTokens
  const markupTokens = Number(log.markup_tokens ?? 0) || Math.max(billedTokens - baseTokens, 0)

  return {
    openAiCostUsd,
    billedTokens,
    baseTokens,
    markupTokens,
  }
}

function summarizeLogs(logs: any[], settings: BillingSettings) {
  return logs.reduce((totals, log) => {
    const charge = chargePartsForLog(log, settings)
    const isOpenAiRequest = Boolean(log.endpoint || log.model)
    if (isOpenAiRequest) totals.requestCount += 1
    totals.billedTokens += charge.billedTokens
    totals.markupTokens += charge.markupTokens
    totals.baseTokens += charge.baseTokens
    totals.openAiCostUsd += charge.openAiCostUsd
    totals.promptTokens += Number(log.prompt_tokens ?? 0)
    totals.completionTokens += Number(log.completion_tokens ?? 0)
    totals.totalOpenAiTokens += Number(log.total_tokens ?? 0)
    return totals
  }, emptyTotals())
}

export const Credits = {
  APP_TOKENS_PER_USD,
  MARKUP_RATE,
  MIN_MARKUP_TOKENS,
  MIN_RESERVE_TOKENS,
  SUBSCRIPTION_MONTHLY_CREDITS,
  PROMO_PRICE_USD,
  REGULAR_PRICE_USD,
  TOP_UP_PRICE_USD,
  TOP_UP_CREDITS,
  FOUNDING_MEMBER_LIMIT,
  FOUNDING_SIGNUP_CREDITS,
  STANDARD_SIGNUP_CREDITS,
  async getBillingSettings(): Promise<BillingSettings> {
    return normalizeBillingSettings(await db.getBillingSettings())
  },

  async getSubscriptionPricing(userId?: string): Promise<SubscriptionPricing> {
    const [settings, signupGrant, foundingMembersClaimed] = await Promise.all([
      db.getCreditSubscriptionSettings(),
      userId ? db.getSignupCreditGrant(userId) : Promise.resolve(null),
      db.getFoundingSignupCreditGrantCount(),
    ])

    const foundingOfferAvailable =
      (settings?.promo_active ?? true) &&
      foundingMembersClaimed < FOUNDING_MEMBER_LIMIT
    const promoActive = signupGrant
      ? signupGrant.cohort === 'founding'
      : foundingOfferAvailable

    return normalizeSubscriptionPricing(settings, promoActive)
  },

  async getLaunchOffer(): Promise<LaunchOffer> {
    const foundingMembersClaimed = await db.getFoundingSignupCreditGrantCount()
    const foundingMembersRemaining = Math.max(FOUNDING_MEMBER_LIMIT - foundingMembersClaimed, 0)
    return LaunchOfferSchema.parse({
      foundingMemberLimit: FOUNDING_MEMBER_LIMIT,
      foundingMembersRemaining,
      onboardingCredits: foundingMembersRemaining > 0
        ? FOUNDING_SIGNUP_CREDITS
        : STANDARD_SIGNUP_CREDITS,
      foundingOnboardingCredits: FOUNDING_SIGNUP_CREDITS,
      standardOnboardingCredits: STANDARD_SIGNUP_CREDITS,
      foundingPriceUsd: PROMO_PRICE_USD,
      regularPriceUsd: REGULAR_PRICE_USD,
      monthlyCredits: SUBSCRIPTION_MONTHLY_CREDITS,
      topUpPriceUsd: TOP_UP_PRICE_USD,
      topUpCredits: TOP_UP_CREDITS,
    })
  },

  async grantSignupCredits(userId: string): Promise<SignupCreditGrant> {
    const result = await db.claimSignupCreditGrant(userId, {
      foundingMemberLimit: FOUNDING_MEMBER_LIMIT,
      foundingCredits: FOUNDING_SIGNUP_CREDITS,
      standardCredits: STANDARD_SIGNUP_CREDITS,
    })
    return SignupCreditGrantSchema.parse(result)
  },

  async updateSubscriptionPricing(input: { promoActive: boolean }): Promise<SubscriptionPricing> {
    await db.updateCreditSubscriptionSettings({
      promo_active: input.promoActive,
    })
    return this.getSubscriptionPricing()
  },

  async updateBillingSettings(input: { markupRate: number; minMarkupTokens: number }): Promise<BillingSettings> {
    const settings = await db.updateBillingSettings({
      markup_rate: input.markupRate,
      min_markup_tokens: input.minMarkupTokens,
    })
    return normalizeBillingSettings(settings)
  },

  async estimateReserve(input: EstimateReserveInput): Promise<number> {
    const settings = await this.getBillingSettings()
    return estimateReserveTokens(input, settings)
  },
  calculateCharge: calculateAiTokenCharge,

  async getBalance(userId: string): Promise<number> {
    return db.getCreditBalance(userId)
  },

  async getCreditSummary(userId: string) {
    const [balance, buckets, subscription, pricing, monthLogs] = await Promise.all([
      db.getCreditBalance(userId),
      db.getCreditBuckets(userId),
      db.getUserCreditSubscription(userId),
      this.getSubscriptionPricing(userId),
      db.getUsageLogsSince(rangeStarts().thisMonth),
    ])
    const usedThisMonth = monthLogs
      .filter((log: any) => log.user_id === userId && Number(log.credits_delta ?? 0) < 0)
      .reduce((sum: number, log: any) => sum + Math.abs(Number(log.credits_delta ?? 0)), 0)
    const subscriptionBalance = Number(buckets?.subscription_balance ?? 0)
    const monthlyCredits = Number(subscription?.monthly_credits ?? SUBSCRIPTION_MONTHLY_CREDITS)
    const effectivePricing = subscription
      ? subscription.active
        ? {
            ...pricing,
            promoActive: subscription.price_phase === 'promo',
            phase: subscription.price_phase as SubscriptionPhase,
            priceUsd: subscription.price_phase === 'promo' ? PROMO_PRICE_USD : REGULAR_PRICE_USD,
          }
        : {
            ...pricing,
            promoActive: false,
            phase: 'regular' as const,
            priceUsd: REGULAR_PRICE_USD,
          }
      : pricing

    return {
      balance,
      subscriptionBalance,
      topupBalance: Number(buckets?.topup_balance ?? Math.max(balance - subscriptionBalance, 0)),
      usedThisMonth,
      monthlyGrantUsed: Math.max(0, monthlyCredits - subscriptionBalance),
      pricing: effectivePricing,
      subscription: subscriptionToClient(subscription),
    }
  },

  // Atomic — backed by the `reserve_credits` Postgres function (see migration).
  // No read-then-write: the DB does the check-and-decrement in one statement.
  async reserve(userId: string, cost: number): Promise<boolean> {
    const newBalance = await db.reserveCredits(userId, cost)
    return newBalance !== null
  },

  // Reverses an unlogged reserve hold. reserve() moves the balance without
  // writing a ledger row, so the refund must NOT write a balance-affecting row
  // either — otherwise SUM(credits_delta) drifts from the real balance on every
  // failed call. We write a 0-delta row purely as an audit trace of the attempt.
  async refundReserve(userId: string, amount: number, reason: string): Promise<void> {
    await db.grantCredits(userId, amount)
    await db.insertUsageLog({ user_id: userId, credits_delta: 0, reason })
  },

  // Adjusts the initial reserve to actual OpenAI usage, then writes one
  // negative usage-log row for the final charge.
  async settleReserved(
    userId: string,
    reservedTokens: number,
    usage: TokenUsage,
    meta: { endpoint: string; model: string }
  ): Promise<SettlementResult> {
    const settings = await this.getBillingSettings()
    const charge = calculateAiTokenCharge(meta.model, usage, settings)
    const adjustmentTokens = reservedTokens - charge.totalTokens

    if (adjustmentTokens > 0) {
      await db.grantCredits(userId, adjustmentTokens)
    } else if (adjustmentTokens < 0) {
      const newBalance = await db.reserveCredits(userId, Math.abs(adjustmentTokens))
      if (newBalance === null) {
        // Underfunded: the call already succeeded and OpenAI was already paid, so
        // we must NOT drop the user's result. Take whatever balance remains (down
        // to 0) and record the real usage. ponytail: we eat the small overage
        // rather than carry a negative balance. credits_delta reflects what was
        // actually charged (reserve + drained remainder) so the ledger stays
        // consistent with the balance; base/markup/total record true usage.
        const remaining = await db.getCreditBalance(userId)
        if (remaining > 0) await db.setCreditBalance(userId, 0)
        const billedTokens = reservedTokens + remaining
        await db.insertUsageLog({
          user_id: userId,
          endpoint: meta.endpoint,
          model: meta.model,
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
          total_tokens: usage.totalTokens,
          credits_delta: -billedTokens,
          reserved_tokens: reservedTokens,
          base_tokens: charge.baseTokens,
          markup_tokens: charge.markupTokens,
          estimated: false,
          reason: 'settlement_underfunded',
        })
        return { ok: true, chargeTokens: billedTokens, adjustmentTokens }
      }
    }

    await db.insertUsageLog({
      user_id: userId,
      endpoint: meta.endpoint,
      model: meta.model,
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      total_tokens: usage.totalTokens,
      credits_delta: -charge.totalTokens,
      reserved_tokens: reservedTokens,
      base_tokens: charge.baseTokens,
      markup_tokens: charge.markupTokens,
      estimated: false,
    })
    return { ok: true, chargeTokens: charge.totalTokens, adjustmentTokens }
  },

  // Adds credits (signup seed, manual top-up, refund-on-fail) and logs a
  // positive-delta ledger entry.
  async grant(userId: string, amount: number, reason: string): Promise<void> {
    await db.grantCredits(userId, amount)
    await db.insertUsageLog({
      user_id: userId,
      credits_delta: amount,
      reason,
    })
  },

  async activateSubscription(userId: string, input: { active: boolean; grantMonthlyCredits: boolean }) {
    const [eligiblePricing, existingSubscription] = await Promise.all([
      this.getSubscriptionPricing(userId),
      db.getUserCreditSubscription(userId),
    ])
    // The founding price remains locked while continuously subscribed. Once a
    // subscription has been deactivated, a later reactivation uses the regular
    // price even if the account originally belonged to the founding cohort.
    const pricing = input.active && existingSubscription && !existingSubscription.active
      ? normalizeSubscriptionPricing(null, false)
      : eligiblePricing
    const renewalDate = input.active ? nextRenewalDate() : null
    const previousBalance = await db.getCreditBalance(userId)

    const subscription = await db.upsertUserCreditSubscription({
      user_id: userId,
      active: input.active,
      price_phase: pricing.phase,
      monthly_credits: SUBSCRIPTION_MONTHLY_CREDITS,
      renewal_date: renewalDate,
      last_monthly_grant_at: input.active && input.grantMonthlyCredits ? new Date().toISOString() : null,
    })

    let balance = previousBalance
    if (input.active && input.grantMonthlyCredits) {
      balance = await db.grantSubscriptionCredits(userId, SUBSCRIPTION_MONTHLY_CREDITS)
      await db.insertUsageLog({
        user_id: userId,
        credits_delta: balance - previousBalance,
        reason: `subscription_monthly_grant_${pricing.phase}`,
        balance_before: previousBalance,
        balance_after: balance,
      })
    }

    return {
      subscription: subscriptionToClient(subscription),
      balance,
      pricing,
    }
  },

  async grantTopUp(userId: string, dollars: number) {
    const pricing = await this.getSubscriptionPricing()
    const credits = Math.round(dollars * pricing.sellCreditsPerUsd)
    const previousBalance = await db.getCreditBalance(userId)
    const balance = await db.grantCredits(userId, credits)
    await db.insertUsageLog({
      user_id: userId,
      credits_delta: credits,
      reason: `topup_${pricing.phase}_${dollars}_usd`,
      balance_before: previousBalance,
      balance_after: balance,
    })
    return { balance, credits, dollars, pricing }
  },

  async setBalance(userId: string, balance: number): Promise<{ balance: number; delta: number }> {
    const previousBalance = await db.getCreditBalance(userId)
    const newBalance = await db.setCreditBalance(userId, balance)
    const delta = newBalance - previousBalance

    await db.insertUsageLog({
      user_id: userId,
      credits_delta: delta,
      reason: 'admin_balance_set',
      balance_before: previousBalance,
      balance_after: newBalance,
    })

    return { balance: newBalance, delta }
  },

  async getTokenManagerOverview() {
    const users = await db.getUsersWithCreditBalances()
    const settings = await this.getBillingSettings()
    const subscriptionPricing = await this.getSubscriptionPricing()
    const starts = rangeStarts()
    const [monthLogs, recentLogs] = await Promise.all([
      db.getUsageLogsSince(starts.thisMonth),
      db.getRecentUsageLogs(100),
    ])

    const usersById = new Map(users.map(user => [user.id, user]))
    const withUser = (log: any) => {
      const user = usersById.get(log.user_id)
      const charge = chargePartsForLog(log, settings)
      return {
        id: log.id,
        userId: log.user_id,
        userEmail: user?.email ?? null,
        userName: user?.name ?? null,
        endpoint: log.endpoint ?? null,
        model: log.model ?? null,
        promptTokens: log.prompt_tokens ?? 0,
        completionTokens: log.completion_tokens ?? 0,
        totalOpenAiTokens: log.total_tokens ?? 0,
        openAiCostUsd: charge.openAiCostUsd,
        creditsDelta: log.credits_delta ?? 0,
        billedTokens: charge.billedTokens,
        reservedTokens: log.reserved_tokens ?? null,
        baseTokens: charge.baseTokens,
        markupTokens: charge.markupTokens,
        reason: log.reason ?? null,
        estimated: Boolean(log.estimated),
        balanceBefore: log.balance_before ?? null,
        balanceAfter: log.balance_after ?? null,
        createdAt: log.created_at,
      }
    }

    const inRange = (since: string) => monthLogs.filter(log => new Date(log.created_at).getTime() >= new Date(since).getTime())

    return {
      users,
      settings,
      subscriptionPricing,
      totals: {
        today: summarizeLogs(inRange(starts.today), settings),
        thisWeek: summarizeLogs(inRange(starts.thisWeek), settings),
        thisMonth: summarizeLogs(monthLogs, settings),
      },
      activity: recentLogs.map(withUser),
    }
  },
}
