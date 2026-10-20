import { z } from 'zod'
import { DemoPersonaIdSchema, demoPersonaById } from './demoPersonas'
import TalkHandoffContracts from '../backend/src/talk-handoff-schema'
import DaySummaryContracts, { type DaySummary } from '../backend/src/day-summary-schema'
import type { TalkReviewContext } from '../backend/src/settings-schema'

const { WorkoutPlanTalkHandoffSchema } = TalkHandoffContracts
const { isDaySummaryItemAddressed } = DaySummaryContracts

const TalkDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()

export const TalkHandoffContextSchema = z.discriminatedUnion('intent', [
  z.object({
    source: z.literal('today'),
    intent: z.literal('plan_day'),
    date: TalkDateSchema,
    demoPersona: DemoPersonaIdSchema.optional(),
  }).strict(),
  z.object({
    source: z.literal('add'),
    intent: z.literal('add_items'),
    date: TalkDateSchema,
    itemType: z.enum(['task', 'habit', 'meal', 'workout']).optional(),
  }).strict(),
  z.object({
    source: z.literal('nutrition'),
    intent: z.literal('log_nutrition'),
    date: TalkDateSchema,
  }).strict(),
  WorkoutPlanTalkHandoffSchema,
])

export type TalkHandoffContext = z.infer<typeof TalkHandoffContextSchema>

export const TALK_HANDOFF_STATE_KEY = 'talkHandoffContext'

export function talkHandoffContext(value: unknown): TalkHandoffContext | null {
  if (!value || typeof value !== 'object') return null
  const candidate = (value as Record<string, unknown>)[TALK_HANDOFF_STATE_KEY]
  const parsed = TalkHandoffContextSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

export function talkHandoffState(context: TalkHandoffContext) {
  return { [TALK_HANDOFF_STATE_KEY]: TalkHandoffContextSchema.parse(context) }
}

/** A review reads actual records, never infers an outcome from a Calendar event. */
export function reviewDayEvidence(day: DaySummary) {
  const addressed = day.items.filter(isDaySummaryItemAddressed)
  const unavailable: Array<'nutrition' | 'workouts' | 'progress'> = []
  if (day.supporting.nutrition.status === 'unavailable') unavailable.push('nutrition')
  if (day.supporting.workouts.status === 'unavailable') unavailable.push('workouts')
  if (day.supporting.progress.status === 'unavailable') unavailable.push('progress')
  const evidence: Extract<TalkReviewContext['days'][number], { status: 'ready' }> = {
    date: day.date,
    status: 'ready',
    addressedItems: addressed.slice(0, 12).map((item) => ({ title: item.title, type: item.type, completed: item.completed })),
    addressedItemCount: addressed.length,
    habitsWithProgress: day.items.filter((item) => item.type === 'habit' && (item.habitInfo?.progressTotal ?? 0) > 0).length,
    openItems: day.items.filter((item) => !isDaySummaryItemAddressed(item) && !item.isHabitInstance)
      .slice(0, 12).map((item) => item.title),
    calorieEntryCount: day.supporting.nutrition.entries.length,
    workoutSessionCount: day.supporting.workouts.sessions.length,
    weightRecorded: day.supporting.nutrition.weight.status === 'recorded',
    progressEntryCount: day.supporting.progress.entries.length,
    unavailable,
  }
  const hasOutcome = evidence.addressedItemCount > 0
    || evidence.habitsWithProgress > 0
    || evidence.calorieEntryCount > 0
    || evidence.workoutSessionCount > 0
    || evidence.weightRecorded
    || evidence.progressEntryCount > 0
  return { evidence, hasOutcome }
}

export function dailyReviewPrompt(date: string): string {
  return `Review what actually happened on ${date}. Ask me one useful question and help me record my answer. Treat planned Items and Calendar events as plans, not outcomes.`
}

export function weeklyReviewPrompt(dates: string[]): string {
  return `Review recorded outcomes for ${dates.join(', ')}. If enough days have actual records, help me see one pattern and one small improvement. If not, ask me what happened. Do not treat plans as outcomes.`
}

/**
 * Reject a stale backend choosing a session write for a reusable-plan handoff.
 * A pending action is not a write yet, so failing here leaves user data alone
 * and makes version skew explicit instead of offering the wrong confirmation.
 */
export function assertTalkHandoffPendingActions(
  context: TalkHandoffContext | null,
  actions: Array<{ capability: string }>,
) {
  if (context?.intent !== 'draft_workout_plan') return
  const unexpected = actions.find((action) => action.capability !== 'add_workout_plan')
  if (unexpected) {
    throw new Error(
      `Talk proposed ${unexpected.capability} for a reusable Workout plan. Nothing was saved. Update HealthyFlow and try again.`,
    )
  }
}

const sourceLabels: Record<TalkHandoffContext['source'], string> = {
  today: 'Today',
  add: 'Add',
  nutrition: 'Nutrition',
  workouts: 'Workouts',
}

export function talkHandoffLabel(context: TalkHandoffContext) {
  const date = context.date ? ` · ${context.date}` : ''
  return `${sourceLabels[context.source]}${date}`
}

const itemLabels = {
  task: 'Task',
  habit: 'Habit',
  meal: 'planned Meal',
  workout: 'planned Workout',
} as const

function forDate(date?: string) {
  return date ? ` for ${date}` : ''
}

/**
 * A closed, user-visible prompt derived from structured router state.
 * Entry surfaces never smuggle arbitrary text into Talk: the user sees this
 * draft in the composer and can edit or remove it before sending.
 */
export function talkHandoffPrompt(context: TalkHandoffContext) {
  switch (context.intent) {
    case 'plan_day': {
      const opening = context.demoPersona
        ? demoPersonaById(context.demoPersona).activationPrompt
        : `Help me plan my day${forDate(context.date)}.`
      return [
        opening,
        'Help me turn what I say into a small number of concrete Items. Ask for missing details, and show every proposed change for approval before saving it.',
      ].join('\n')
    }
    case 'add_items': {
      const item = context.itemType ? itemLabels[context.itemType] : 'Item'
      return `Help me add a ${item}${forDate(context.date)}. Ask for any missing details, then show the proposed change for approval before saving it.`
    }
    case 'log_nutrition':
      return `Help me log what I ate${forDate(context.date)}. I can describe it or attach a photo. Show the estimated Calorie entries for review and approval before saving them.`
    case 'draft_workout_plan':
      return 'Help me design a reusable Workout plan. Ask about my goal, available time, equipment and constraints, then prepare a structured draft I can review and edit. Show every proposed exercise field and require my approval before saving it.'
  }
}
