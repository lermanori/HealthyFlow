import { db } from './supabase-client'
import type { TokenUsage } from './openai'
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// COST LEDGER — internal accounting only. Never prices anything a user sees.
//
// One app token is one milli-dollar of OpenAI spend. These constants meter what
// a call cost us so `cost_usd` can be recorded and reported; since ADR-0013 they
// have no bearing on what the user is charged. Do not reintroduce them into a
// price: a user-facing price is an ACTION_PRICE below, and the two must never
// share a unit again.
// ─────────────────────────────────────────────────────────────────────────────
export const APP_TOKENS_PER_USD = 1000
export const MARKUP_RATE = 0.25
export const MIN_MARKUP_TOKENS = 5
export const MIN_RESERVE_TOKENS = 5

// ─────────────────────────────────────────────────────────────────────────────
// SALE UNITS — what a user holds and spends. A credit is one action (ADR-0013).
//
// The weights are deliberately not cost-proportional: a photo costs ~13x a text
// call to serve and a premium model ~63x, compressed here to 5x and 10x so the
// expensive surfaces stay affordable. Every class still carries margin — 98%,
// 95% and 88% of the pack price respectively.
// ─────────────────────────────────────────────────────────────────────────────
export type ActionClass = 'text' | 'photo' | 'premium'

export const ACTION_PRICE: Record<ActionClass, number> = {
  text: 1,
  photo: 5,
  premium: 10,
}

/** Models a user may opt into that bill as `premium`. Everything else is standard. */
export const PREMIUM_MODELS: readonly string[] = ['gpt-5.4', 'gpt-5.5']

export const PROMO_PRICE_USD = 9
export const REGULAR_PRICE_USD = 19
export const TOP_UP_PRICE_USD = 5
export const TOP_UP_CREDITS = 300
export const FOUNDING_MEMBER_LIMIT = 100

/** Granted once, to every new account, with no cohort branch (ADR-0012, ADR-0013). */
export const WELCOME_CREDITS = 50
/** Refilled to a free account on its first action of a calendar month. */
export const MONTHLY_FREE_CREDITS = 15

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION ENTITLEMENTS — what Cloud includes before the balance is touched.
//
// Text is not metered: at $0.0003 a call, metering costs more in lost conversions
// than it saves. The caps sit only where cost is real. Past a cap a subscriber
// falls through to their credit balance; they are never refused for being over.
// ─────────────────────────────────────────────────────────────────────────────
export const SUB_TEXT_DAILY_CAP = 100
export const SUB_PHOTO_MONTHLY_CAP = 100
export const SUB_PREMIUM_MONTHLY_CAP = 50

// ─────────────────────────────────────────────────────────────────────────────
// COST GUARDS — the blast radius of a bug, a loop, or an abusive account.
//
// These bound spending on the one service billed by usage. They are deliberately
// generous against real use and tight against runaway: FREE_DAILY_ACTION_CAP is
// ~60x a heavy day, and the global ceiling is ~100x a thousand-subscriber day.
// See docs/runbooks/cost-guards.md for the vendor-side limits that back these.
// ─────────────────────────────────────────────────────────────────────────────
/** Actions a single account may take in one day, whatever its balance. */
export const FREE_DAILY_ACTION_CAP = 200
/** Total OpenAI spend, all users, in one UTC day, before AI refuses to run. */
export const GLOBAL_DAILY_COST_CEILING_USD = Number(
  process.env.GLOBAL_DAILY_COST_CEILING_USD ?? 25
)
/** Longest prompt we will send. One paste cannot buy an unbounded call. */
export const MAX_PROMPT_CHARS = 24_000
/** Images accepted in a single request. */
export const MAX_IMAGES_PER_REQUEST = 4
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

export const ActionPriceSchema = z.object({
  text: z.number().int().positive(),
  photo: z.number().int().positive(),
  premium: z.number().int().positive(),
})

export const LaunchOfferSchema = z.object({
  foundingMemberLimit: z.number().int().positive(),
  /** Remaining seats at the founding *price*. Not a credit cohort (ADR-0012). */
  foundingMembersRemaining: z.number().int().nonnegative(),
  welcomeCredits: z.number().int().positive(),
  monthlyFreeCredits: z.number().int().nonnegative(),
  foundingPriceUsd: z.number().positive(),
  regularPriceUsd: z.number().positive(),
  topUpPriceUsd: z.number().positive(),
  topUpCredits: z.number().int().positive(),
  actionPrice: ActionPriceSchema,
  subscriptionIncludes: z.object({
    unlimitedText: z.literal(true),
    textDailyCap: z.number().int().positive(),
    photoMonthly: z.number().int().positive(),
    premiumMonthly: z.number().int().positive(),
  }),
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

/** Why an action was refused. Every one is a real, distinguishable cause. */
export type ActionRefusal =
  | 'insufficient_credits'
  | 'account_daily_cap'
  | 'global_ceiling'
  | 'prompt_too_large'
  | 'too_many_images'

export type ActionAuthorization =
  | {
      ok: true
      actionClass: ActionClass
      /** The list price of this action. */
      credits: number
      /** What was actually taken from the balance. Zero when Cloud covered it. */
      charged: number
      coveredBy: 'entitlement' | 'balance'
    }
  | { ok: false; code: ActionRefusal }

export type SubscriptionPhase = 'promo' | 'regular'

export type SubscriptionPricing = {
  promoActive: boolean
  phase: SubscriptionPhase
  priceUsd: number
  topUpPriceUsd: number
  topUpCredits: number
  actionPrice: Record<ActionClass, number>
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

/**
 * Everything needed to price an action, all of it known before the call is made.
 * That is the whole point of ADR-0013: the price does not move with actual usage,
 * so there is nothing to reconcile at settlement.
 */
export type ActionPricingInput = {
  endpoint: string
  model: string
  userPrompt: string | Array<{ type: string; text?: string }>
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

export function countImages(userPrompt: ActionPricingInput['userPrompt']): number {
  if (typeof userPrompt === 'string') return 0
  return userPrompt.filter((part) => part.type === 'image_url').length
}

/**
 * Which of the three prices applies. An image beats a premium model: a photo sent
 * to gpt-5.4 is one action, and charging both weights would double-bill a single
 * request. Photo is the cheaper of the two, deliberately — the surface we most
 * want people to use is the one we least want to make expensive.
 */
export function classifyAction(input: ActionPricingInput): ActionClass {
  if (countImages(input.userPrompt) > 0) return 'photo'
  if (PREMIUM_MODELS.includes(input.model)) return 'premium'
  return 'text'
}

/** What the user is charged, in credits. Known before the call, never adjusted after. */
export function priceAction(input: ActionPricingInput): number {
  // Throws UnpricedModelError for a model we cannot cost. A model we cannot cost is
  // a model we must not call: this is the guard that stops an unbudgeted model
  // reaching production behind an env var.
  getPricing(input.model)
  return ACTION_PRICE[classifyAction(input)]
}

/** Total characters of prompt text, images excluded. Bounds one request's cost. */
export function promptChars(input: ActionPricingInput & { systemPrompt?: string }): number {
  const system = input.systemPrompt?.length ?? 0
  if (typeof input.userPrompt === 'string') return system + input.userPrompt.length
  return system + input.userPrompt.reduce((n, part) => n + (part.text?.length ?? 0), 0)
}

export class PromptTooLargeError extends Error {
  constructor(public readonly chars: number) {
    super(`Prompt is ${chars} characters; the limit is ${MAX_PROMPT_CHARS}`)
    this.name = 'PromptTooLargeError'
  }
}

export class TooManyImagesError extends Error {
  constructor(public readonly count: number) {
    super(`Request carries ${count} images; the limit is ${MAX_IMAGES_PER_REQUEST}`)
    this.name = 'TooManyImagesError'
  }
}

export class CostCeilingError extends Error {
  constructor(public readonly scope: 'global_daily' | 'account_daily') {
    super(
      scope === 'global_daily'
        ? 'The daily AI spending ceiling has been reached'
        : 'This account has reached its daily action limit'
    )
    this.name = 'CostCeilingError'
  }
}

/**
 * Request-shape guards, run before a single token is spent. These throw rather
 * than returning a code so a caller cannot forget to check — the billing wrapper
 * turns them into typed refusals, and no silent fallback stands in for them.
 */
export function assertRequestWithinLimits(
  input: ActionPricingInput & { systemPrompt?: string }
): void {
  const images = countImages(input.userPrompt)
  if (images > MAX_IMAGES_PER_REQUEST) throw new TooManyImagesError(images)
  const chars = promptChars(input)
  if (chars > MAX_PROMPT_CHARS) throw new PromptTooLargeError(chars)
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
    // No sellCreditsPerUsd. There is no dollar-to-credit rate any more, only packs
    // — that rate is what drifted twenty-fold away from the meter before ADR-0013,
    // precisely because it was derived from the pack it was meant to justify.
    actionPrice: ACTION_PRICE,
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
    // Always zero since ADR-0013: Cloud includes text AI as an entitlement checked
    // per call, not as a monthly credit allowance. Kept on the wire so an older
    // client reading this field sees "no allowance" rather than undefined.
    monthlyCredits: 0,
    renewalDate: row.renewal_date ?? null,
    lastMonthlyGrantAt: row.last_monthly_grant_at ?? null,
    updatedAt: row.updated_at ?? null,
  } : {
    active: false,
    pricePhase: null,
    monthlyCredits: 0,
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
  ACTION_PRICE,
  PROMO_PRICE_USD,
  REGULAR_PRICE_USD,
  TOP_UP_PRICE_USD,
  TOP_UP_CREDITS,
  FOUNDING_MEMBER_LIMIT,
  WELCOME_CREDITS,
  MONTHLY_FREE_CREDITS,
  SUB_TEXT_DAILY_CAP,
  SUB_PHOTO_MONTHLY_CAP,
  SUB_PREMIUM_MONTHLY_CAP,
  FREE_DAILY_ACTION_CAP,
  GLOBAL_DAILY_COST_CEILING_USD,
  classifyAction,
  priceAction,
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
      welcomeCredits: WELCOME_CREDITS,
      monthlyFreeCredits: MONTHLY_FREE_CREDITS,
      foundingPriceUsd: PROMO_PRICE_USD,
      regularPriceUsd: REGULAR_PRICE_USD,
      topUpPriceUsd: TOP_UP_PRICE_USD,
      topUpCredits: TOP_UP_CREDITS,
      actionPrice: ACTION_PRICE,
      subscriptionIncludes: {
        unlimitedText: true,
        textDailyCap: SUB_TEXT_DAILY_CAP,
        photoMonthly: SUB_PHOTO_MONTHLY_CAP,
        premiumMonthly: SUB_PREMIUM_MONTHLY_CAP,
      },
    })
  },

  /**
   * The welcome grant. Every account receives the same amount: "founding" is a
   * Cloud price, not a credit cohort (ADR-0012), and the cohort branch that used
   * to award 250 and burn a founding seat must not be reached from here.
   */
  async grantSignupCredits(userId: string): Promise<SignupCreditGrant> {
    const result = await db.claimSignupCreditGrant(userId, {
      foundingMemberLimit: FOUNDING_MEMBER_LIMIT,
      foundingCredits: WELCOME_CREDITS,
      standardCredits: WELCOME_CREDITS,
    })
    return SignupCreditGrantSchema.parse(result)
  },

  /**
   * Tops a free account back up to MONTHLY_FREE_CREDITS worth of headroom once per
   * calendar month, so the hook never fully dies (TARGET.md, Money). Lazy on
   * purpose: no scheduler to babysit, and a month nobody opened the app costs
   * nothing. Never throws — a refill that fails must not fail the action behind it.
   */
  async applyMonthlyFreeRefill(userId: string): Promise<number | null> {
    try {
      const subscription = await db.getUserCreditSubscription(userId)
      if (subscription?.active) return null
      const granted = await db.claimMonthlyFreeCredits(userId, MONTHLY_FREE_CREDITS)
      if (granted === null) return null
      await db.insertUsageLog({
        user_id: userId,
        credits_delta: MONTHLY_FREE_CREDITS,
        reason: 'monthly_free_refill',
        balance_after: granted,
      })
      return granted
    } catch (error) {
      console.error('Monthly free refill failed:', error)
      return null
    }
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

  /**
   * Decides — before any tokens are spent — whether this action may run, what it
   * costs, and who pays for it. One call so a caller cannot check three guards and
   * forget the fourth; a typed result rather than a throw so every refusal is
   * explicit at the call site.
   *
   * Order matters. Request shape first (free to check, catches bugs), then the
   * global ceiling (protects the company), then the account's daily cap (protects
   * one account's balance from a loop), then entitlement, then balance.
   */
  async authorizeAction(
    userId: string,
    input: ActionPricingInput & { systemPrompt?: string }
  ): Promise<ActionAuthorization> {
    let actionClass: ActionClass
    let credits: number
    try {
      assertRequestWithinLimits(input)
      actionClass = classifyAction(input)
      credits = priceAction(input)
    } catch (error) {
      if (error instanceof TooManyImagesError) return { ok: false, code: 'too_many_images' }
      if (error instanceof PromptTooLargeError) return { ok: false, code: 'prompt_too_large' }
      throw error
    }

    const spentToday = await db.sumAiCostUsdSince(rangeStarts().today)
    if (spentToday >= GLOBAL_DAILY_COST_CEILING_USD) {
      console.error(
        `AI refused: global daily ceiling reached ($${spentToday.toFixed(2)} of ` +
        `$${GLOBAL_DAILY_COST_CEILING_USD})`
      )
      return { ok: false, code: 'global_ceiling' }
    }

    const actionsToday = await db.countUserActionsSince(userId, rangeStarts().today)
    if (actionsToday >= FREE_DAILY_ACTION_CAP) {
      return { ok: false, code: 'account_daily_cap' }
    }

    const subscription = await db.getUserCreditSubscription(userId)
    if (subscription?.active) {
      const covered = await this.entitlementCovers(userId, actionClass, actionsToday)
      if (covered) {
        return { ok: true, actionClass, credits, charged: 0, coveredBy: 'entitlement' }
      }
    } else {
      await this.applyMonthlyFreeRefill(userId)
    }

    const reserved = await this.reserve(userId, credits)
    if (!reserved) return { ok: false, code: 'insufficient_credits' }
    return { ok: true, actionClass, credits, charged: credits, coveredBy: 'balance' }
  },

  /**
   * Whether Cloud covers this action without touching the balance. Text is always
   * covered under the daily fair-use ceiling; photo and premium are covered until
   * their monthly cap, then fall through to the balance rather than being refused.
   */
  async entitlementCovers(
    userId: string,
    actionClass: ActionClass,
    textActionsToday: number
  ): Promise<boolean> {
    if (actionClass === 'text') return textActionsToday < SUB_TEXT_DAILY_CAP
    const cap = actionClass === 'photo' ? SUB_PHOTO_MONTHLY_CAP : SUB_PREMIUM_MONTHLY_CAP
    const used = await db.countUserActionsSince(userId, rangeStarts().thisMonth, actionClass)
    return used < cap
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
      // What Cloud covered this month, per capped class. A subscriber has no credit
      // allowance to report — the subscription stopped selling credits in ADR-0013.
      entitlementUsed: {
        photo: await db.countUserActionsSince(userId, rangeStarts().thisMonth, 'photo'),
        premium: await db.countUserActionsSince(userId, rangeStarts().thisMonth, 'premium'),
        photoCap: SUB_PHOTO_MONTHLY_CAP,
        premiumCap: SUB_PREMIUM_MONTHLY_CAP,
      },
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

  /**
   * Records what happened. Since ADR-0013 the price was fixed before the call, so
   * there is nothing to reconcile here: the row exists to record COST, in its own
   * units, beside the PRICE that was already taken.
   *
   * `credits_delta` is what the user paid. `cost_usd`, `base_tokens` and
   * `markup_tokens` are what it cost us. They are different currencies in one row
   * and must never be summed together.
   *
   * The reserve/adjust/settle reconciliation this replaced — including the branch
   * that drained a balance to zero to cover an overage — existed only because the
   * charge was derived from usage after the fact. It cannot happen now.
   */
  async settleAction(
    userId: string,
    authorization: Extract<ActionAuthorization, { ok: true }>,
    usage: TokenUsage,
    meta: { endpoint: string; model: string }
  ): Promise<void> {
    const settings = await this.getBillingSettings()
    const charge = calculateAiTokenCharge(meta.model, usage, settings)
    const costUsd = calculateOpenAiCostUsd(meta.model, usage)

    await db.insertUsageLog({
      user_id: userId,
      endpoint: meta.endpoint,
      model: meta.model,
      action_class: authorization.actionClass,
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      total_tokens: usage.totalTokens,
      // `|| 0` keeps a covered action at 0 rather than -0: a signed zero in a
      // ledger is a question every later reader has to stop and answer.
      credits_delta: -authorization.charged || 0,
      cost_usd: costUsd,
      base_tokens: charge.baseTokens,
      markup_tokens: charge.markupTokens,
      estimated: false,
      reason: authorization.coveredBy === 'entitlement' ? 'covered_by_subscription' : undefined,
    })
  },

  /**
   * Returns an authorized action's credits after a failed call. An entitlement
   * action took nothing, so there is nothing to give back — but the attempt is
   * still logged, because a failure we cannot see is a failure we cannot fix.
   */
  async refundAction(
    userId: string,
    authorization: Extract<ActionAuthorization, { ok: true }>,
    reason: string
  ): Promise<void> {
    if (authorization.charged > 0) {
      await db.grantCredits(userId, authorization.charged)
    }
    // A zero-delta row: reserve() moved the balance without a ledger row, so a
    // balance-affecting refund row here would drift SUM(credits_delta) from the
    // real balance on every failed call.
    await db.insertUsageLog({
      user_id: userId,
      action_class: authorization.actionClass,
      credits_delta: 0,
      reason,
    })
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

  /**
   * `grantMonthlyCredits` is retained in the signature and ignored: Cloud no longer
   * grants credits (ADR-0013). Callers are left in place so the admin surface keeps
   * working; the parameter is removed when they are next touched.
   */
  async activateSubscription(userId: string, input: { active: boolean; grantMonthlyCredits?: boolean }) {
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
      monthly_credits: 0,
      renewal_date: renewalDate,
      last_monthly_grant_at: null,
    })

    // No credit grant. Cloud sells the day on every device and includes text AI as
    // an entitlement checked per call, not as a balance handed over once a month.
    const balance = previousBalance

    return {
      subscription: subscriptionToClient(subscription),
      balance,
      pricing,
    }
  },

  /**
   * Grants whole packs. `dollars` is an audit label, never a rate: multiplying
   * dollars by a credits-per-dollar figure is exactly how the sale unit drifted
   * twenty-fold from the cost meter before ADR-0013.
   */
  async grantTopUp(userId: string, dollars: number) {
    const pricing = await this.getSubscriptionPricing()
    const packs = Math.max(1, Math.round(dollars / TOP_UP_PRICE_USD))
    const credits = packs * TOP_UP_CREDITS
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
