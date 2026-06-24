import { db } from './supabase-client'
import type { TokenUsage } from './openai'

export const CREDITS_PER_ACTION = 1
// 0 = new users start empty; top up manually (see admin grant / SQL).
export const FREE_SIGNUP_CREDITS = 0

// ponytail: flat per-action pricing for now. Token-based pricing is the
// documented future switch — swap the constant charge below for:
//   Math.ceil(usage.totalTokens / TOKENS_PER_CREDIT * modelMultiplier)
// once usage data shows flat pricing under/over-charges relative to cost.
// const TOKENS_PER_CREDIT = 1000
// const MODEL_MULTIPLIER: Record<string, number> = { 'gpt-4o-mini': 1, 'gpt-4o': 5 }

export const Credits = {
  CREDITS_PER_ACTION,

  async getBalance(userId: string): Promise<number> {
    return db.getCreditBalance(userId)
  },

  // Atomic — backed by the `reserve_credits` Postgres function (see migration).
  // No read-then-write: the DB does the check-and-decrement in one statement.
  async reserve(userId: string, cost: number): Promise<boolean> {
    const newBalance = await db.reserveCredits(userId, cost)
    return newBalance !== null
  },

  // Records actual token usage for the already-charged action. With flat
  // pricing the charge was taken at reserve() time; this just appends the
  // audit row (negative delta = the credit charge).
  async settle(
    userId: string,
    usage: TokenUsage,
    meta: { endpoint: string; model: string }
  ): Promise<void> {
    await db.insertUsageLog({
      user_id: userId,
      endpoint: meta.endpoint,
      model: meta.model,
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      total_tokens: usage.totalTokens,
      credits_delta: -CREDITS_PER_ACTION,
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
}
