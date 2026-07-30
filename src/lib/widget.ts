import { Capacitor, registerPlugin } from '@capacitor/core'
import { z } from 'zod'
import type { DaySummary } from '../../backend/src/day-summary-schema'

export const TodayWidgetSummarySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  addressed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100).nullable(),
  nextTitle: z.string().min(1).optional(),
  nextTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  deepLink: z.string().url(),
}).strict()

export type TodayWidgetSummary = z.infer<typeof TodayWidgetSummarySchema>

interface HealthyFlowWidgetPlugin {
  update(options: TodayWidgetSummary): Promise<void>
  clear(): Promise<void>
}

const HealthyFlowWidget = registerPlugin<HealthyFlowWidgetPlugin>('HealthyFlowWidget')

export function buildTodayWidgetSummary(summary: DaySummary): TodayWidgetSummary {
  const next = summary.attention.nextObligation
  return TodayWidgetSummarySchema.parse({
    date: summary.date,
    addressed: summary.completion.addressed ?? summary.completion.completed,
    total: summary.completion.total,
    remaining: summary.completion.remaining,
    percent: summary.completion.percent,
    nextTitle: next?.title,
    nextTime: next?.startTime,
    deepLink: `healthyflow://app?date=${encodeURIComponent(summary.date)}`,
  })
}

export async function updateTodayWidget(summary: DaySummary) {
  if (!Capacitor.isNativePlatform()) return
  await HealthyFlowWidget.update(buildTodayWidgetSummary(summary))
}

export async function clearTodayWidget() {
  if (!Capacitor.isNativePlatform()) return
  await HealthyFlowWidget.clear()
}
