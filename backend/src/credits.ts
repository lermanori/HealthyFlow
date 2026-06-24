import { db } from './supabase-client'
import type { TokenUsage } from './openai'

export const APP_TOKENS_PER_USD = 1000
export const MARKUP_RATE = 0.25
export const MIN_MARKUP_TOKENS = 5
export const MIN_RESERVE_TOKENS = 5
export const ESTIMATED_IMAGE_TOKENS = 2000
export const PROMPT_TOKEN_CHARS = 4

export type SupportedAiModel = 'gpt-4o-mini' | 'gpt-3.5-turbo'

type ModelPricing = {
  inputUsdPerMillion: number
  outputUsdPerMillion: number
}

const MODEL_PRICING: Record<SupportedAiModel, ModelPricing> = {
  'gpt-4o-mini': {
    inputUsdPerMillion: 0.15,
    outputUsdPerMillion: 0.60,
  },
  'gpt-3.5-turbo': {
    inputUsdPerMillion: 0.50,
    outputUsdPerMillion: 1.50,
  },
}

export class UnpricedModelError extends Error {
  constructor(model: string) {
    super(`AI token pricing is not configured for model: ${model}`)
    this.name = 'UnpricedModelError'
  }
}

// 0 = new users start empty; top up manually (see admin grant / SQL).
export const FREE_SIGNUP_CREDITS = 0

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

type SettlementResult =
  | { ok: true; chargeTokens: number; adjustmentTokens: number }
  | { ok: false; chargeTokens: number; adjustmentTokens: number; code: 'insufficient_settlement' }

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
  async getBillingSettings(): Promise<BillingSettings> {
    return normalizeBillingSettings(await db.getBillingSettings())
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

  // Atomic — backed by the `reserve_credits` Postgres function (see migration).
  // No read-then-write: the DB does the check-and-decrement in one statement.
  async reserve(userId: string, cost: number): Promise<boolean> {
    const newBalance = await db.reserveCredits(userId, cost)
    return newBalance !== null
  },

  async refundReserve(userId: string, amount: number, reason: string): Promise<void> {
    await this.grant(userId, amount, reason)
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
        await db.insertUsageLog({
          user_id: userId,
          endpoint: meta.endpoint,
          model: meta.model,
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
          total_tokens: usage.totalTokens,
          credits_delta: -reservedTokens,
          reserved_tokens: reservedTokens,
          base_tokens: charge.baseTokens,
          markup_tokens: charge.markupTokens,
          estimated: false,
          reason: 'settlement_underfunded',
        })
        return {
          ok: false,
          chargeTokens: charge.totalTokens,
          adjustmentTokens,
          code: 'insufficient_settlement',
        }
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
      totals: {
        today: summarizeLogs(inRange(starts.today), settings),
        thisWeek: summarizeLogs(inRange(starts.thisWeek), settings),
        thisMonth: summarizeLogs(monthLogs, settings),
      },
      activity: recentLogs.map(withUser),
    }
  },
}
