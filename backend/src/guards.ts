import { AdminGuardsSchema, type AdminGuards } from './admin-overview-contracts'
import {
  ACTION_PRICE,
  FREE_DAILY_ACTION_CAP,
  GLOBAL_DAILY_COST_CEILING_USD,
  GUEST_GRANT_IP_WINDOW_HOURS,
  GUEST_INITIAL_CREDITS,
  MAX_IMAGES_PER_REQUEST,
  MAX_PROMPT_CHARS,
  MONTHLY_FREE_CREDITS,
  pricedModels,
  utcDayStart,
} from './credits'
import { TOOL_LOOP_MAX_MODEL_CALLS } from './openai'
import { AUTH_RATE_LIMITS } from './rate-limits'
import { db } from './supabase-client'

/** An account is "near" the daily cap at 80% of it. */
const NEAR_CAP_SHARE = 0.8

/**
 * Every guard with the limit the server enforces and today's state (#307). The
 * limits are the same constants the guards read. Each live value is read on its
 * own, and one that fails is reported unavailable rather than as zero.
 */
export async function readGuards(): Promise<AdminGuards> {
  const dayStart = utcDayStart()
  const nearCapActions = Math.floor(FREE_DAILY_ACTION_CAP * NEAR_CAP_SHARE)
  const [spent, status] = await Promise.all([
    db.sumAiCostUsdSince(dayStart).catch((error) => {
      console.error('Guards: today’s spend is unavailable:', error)
      return null
    }),
    db.adminGuardStatus(dayStart, nearCapActions).catch((error) => {
      console.error('Guards: today’s guard status is unavailable:', error)
      return null
    }),
  ])
  const unavailable = { state: 'unavailable' as const }

  return AdminGuardsSchema.parse({
    limits: {
      requestChars: MAX_PROMPT_CHARS,
      imagesPerRequest: MAX_IMAGES_PER_REQUEST,
      pricedModels: pricedModels(),
      globalDailyCeilingUsd: GLOBAL_DAILY_COST_CEILING_USD,
      accountDailyActions: FREE_DAILY_ACTION_CAP,
      nearCapActions,
      guestActions: GUEST_INITIAL_CREDITS,
      monthlyActions: MONTHLY_FREE_CREDITS,
      guestNetworkWindowHours: GUEST_GRANT_IP_WINDOW_HOURS,
      actionPrice: ACTION_PRICE,
      toolLoopModelCalls: TOOL_LOOP_MAX_MODEL_CALLS,
      entry: AUTH_RATE_LIMITS,
    },
    spentToday: spent === null ? unavailable : { state: 'ok', usd: spent },
    refusalsToday: status === null ? unavailable : { state: 'ok', byCode: status.refusals },
    nearCap: status === null ? unavailable : { state: 'ok', accounts: status.nearCap },
    guestsWithoutGrantToday: status === null ? unavailable : { state: 'ok', count: status.guestsWithoutGrant },
  })
}
