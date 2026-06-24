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

type ChargeBreakdown = {
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

export function calculateAiTokenCharge(model: string, usage: BillingUsage): ChargeBreakdown {
  const pricing = getPricing(model)
  const inputUsd = (usage.promptTokens / 1_000_000) * pricing.inputUsdPerMillion
  const outputUsd = (usage.completionTokens / 1_000_000) * pricing.outputUsdPerMillion
  const baseRawTokens = (inputUsd + outputUsd) * APP_TOKENS_PER_USD
  const markupRawTokens = Math.max(baseRawTokens * MARKUP_RATE, MIN_MARKUP_TOKENS)
  const totalTokens = Math.ceil(baseRawTokens + markupRawTokens)
  const markupTokens = Math.ceil(markupRawTokens)

  return {
    baseTokens: Math.max(0, totalTokens - markupTokens),
    markupTokens,
    totalTokens,
  }
}

export function estimateReserveTokens(input: EstimateReserveInput): number {
  getPricing(input.model)
  const promptTokens =
    estimateTextTokens(input.systemPrompt) +
    userPromptEstimate(input.userPrompt) +
    20
  const charge = calculateAiTokenCharge(input.model, {
    promptTokens,
    completionTokens: input.maxOutputTokens,
  })
  return Math.max(charge.totalTokens, MIN_RESERVE_TOKENS)
}

export const Credits = {
  APP_TOKENS_PER_USD,
  MARKUP_RATE,
  MIN_MARKUP_TOKENS,
  MIN_RESERVE_TOKENS,
  estimateReserve: estimateReserveTokens,
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
    const charge = calculateAiTokenCharge(meta.model, usage)
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
}
