import { z } from 'zod'

/**
 * What a Habit's day is worth, and how it is settled — browser-safe.
 *
 * `habit-progress.ts` reaches for the database; these rules do not, so they live
 * here where a device composing a Habit offline can run the identical decision.
 * The rule is the thing that must not fork; where the entries are stored is not.
 */

export const HabitOutcomeSchema = z.enum(['pending', 'partial', 'completed', 'failed'])
export type HabitOutcome = z.infer<typeof HabitOutcomeSchema>

export const HabitTargetUnitSchema = z.enum(['minutes', 'reps', 'count'])

export const HabitTargetSchema = z.object({
  value: z.number().positive(),
  unit: HabitTargetUnitSchema,
})

const HabitHistoryDateSchema = z.string().date()

export const HabitHistoryQuerySchema = z.object({
  to: HabitHistoryDateSchema,
  days: z.coerce.number().int().min(1).max(30).default(30),
}).strict()

export const HabitHistorySourceSchema = HabitHistoryQuerySchema.extend({
  habits: z.array(z.object({
    id: z.string().min(1),
    title: z.string(),
    category: z.string().nullable(),
    createdDate: HabitHistoryDateSchema,
    target: HabitTargetSchema.nullable(),
  })).max(50),
  instances: z.array(z.object({
    habitId: z.string().min(1),
    date: HabitHistoryDateSchema,
    outcome: HabitOutcomeSchema,
    progressTotal: z.number().nonnegative(),
    target: HabitTargetSchema.nullable(),
  })).max(1500),
}).strict()

export const HabitHistoryDaySchema = z.object({
  date: HabitHistoryDateSchema,
  recordState: z.enum(['recorded', 'not_recorded']),
  outcome: HabitOutcomeSchema.nullable(),
  progressTotal: z.number().nonnegative(),
  target: HabitTargetSchema.nullable(),
})

export const HabitHistorySchema = z.object({
  from: HabitHistoryDateSchema,
  to: HabitHistoryDateSchema,
  habits: z.array(z.object({
    habitId: z.string().min(1),
    title: z.string(),
    category: z.string().nullable(),
    days: z.array(HabitHistoryDaySchema).max(30),
    summary: z.object({
      completedDays: z.number().int().nonnegative(),
      partialDays: z.number().int().nonnegative(),
      failedDays: z.number().int().nonnegative(),
      pendingDays: z.number().int().nonnegative(),
      recordedDays: z.number().int().nonnegative(),
      notRecordedDays: z.number().int().nonnegative(),
      currentStreak: z.number().int().nonnegative(),
      bestStreak: z.number().int().nonnegative(),
      completionRate: z.number().min(0).max(1).nullable(),
    }),
  })).max(50),
})

export type HabitHistory = z.infer<typeof HabitHistorySchema>

export const HabitHistoryContextSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready'), record: HabitHistorySchema }).strict(),
  z.object({ status: z.literal('unavailable') }).strict(),
])
export type HabitHistoryContext = z.infer<typeof HabitHistoryContextSchema>

function shiftDate(date: string, offset: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`)
  shifted.setUTCDate(shifted.getUTCDate() + offset)
  return shifted.toISOString().slice(0, 10)
}

export function composeHabitHistory(raw: z.input<typeof HabitHistorySourceSchema>): HabitHistory {
  const input = HabitHistorySourceSchema.parse(raw)
  const requestedFrom = shiftDate(input.to, -(input.days - 1))
  const instances = new Map(input.instances.map(instance => [`${instance.habitId}:${instance.date}`, instance]))

  return HabitHistorySchema.parse({
    from: requestedFrom,
    to: input.to,
    habits: input.habits
      .filter(habit => habit.createdDate <= input.to)
      .map((habit) => {
        const from = habit.createdDate > requestedFrom ? habit.createdDate : requestedFrom
        const length = Math.round(
          (Date.parse(`${input.to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000,
        ) + 1
        const days = Array.from({ length }, (_, index) => {
          const date = shiftDate(from, index)
          const instance = instances.get(`${habit.id}:${date}`)
          return instance
            ? {
                date,
                recordState: 'recorded' as const,
                outcome: instance.outcome,
                progressTotal: instance.progressTotal,
                target: instance.target,
              }
            : {
                date,
                recordState: 'not_recorded' as const,
                outcome: null,
                progressTotal: 0,
                target: habit.target,
              }
        })
        let bestStreak = 0
        let run = 0
        for (const day of days) {
          run = day.outcome === 'completed' ? run + 1 : 0
          bestStreak = Math.max(bestStreak, run)
        }
        let currentIndex = days.length - 1
        const currentDay = days[currentIndex]
        if (currentDay && (currentDay.recordState === 'not_recorded' || currentDay.outcome === 'pending')) {
          currentIndex -= 1
        }
        let currentStreak = 0
        for (let index = currentIndex; index >= 0 && days[index].outcome === 'completed'; index -= 1) {
          currentStreak += 1
        }
        const currentDayIsUnsettled = currentDay
          && (currentDay.recordState === 'not_recorded' || currentDay.outcome === 'pending')
        const eligibleDays = currentDayIsUnsettled ? days.slice(0, -1) : days
        const completedDays = days.filter(day => day.outcome === 'completed').length
        return {
          habitId: habit.id,
          title: habit.title,
          category: habit.category,
          days,
          summary: {
            completedDays,
            partialDays: days.filter(day => day.outcome === 'partial').length,
            failedDays: days.filter(day => day.outcome === 'failed').length,
            pendingDays: days.filter(day => day.outcome === 'pending').length,
            recordedDays: days.filter(day => day.recordState === 'recorded').length,
            notRecordedDays: days.filter(day => day.recordState === 'not_recorded').length,
            currentStreak,
            bestStreak,
            completionRate: eligibleDays.length === 0
              ? null
              : eligibleDays.filter(day => day.outcome === 'completed').length / eligibleDays.length,
          },
        }
      }),
  })
}

export const HabitProgressInputSchema = z.object({
  amount: z.number().positive().max(100000),
  note: z.string().trim().max(120).nullable().optional(),
  date: z.string().date().optional(),
})

export const HabitOutcomeInputSchema = z.object({
  outcome: z.enum(['pending', 'completed', 'failed']),
  date: z.string().date().optional(),
})

export const HabitProgressUpdateSchema = z.object({
  amount: z.number().positive().max(100000).optional(),
  note: z.string().trim().max(120).nullable().optional(),
}).refine(value => value.amount !== undefined || value.note !== undefined, 'No progress changes supplied')

export const HabitProgressEntrySchema = z.object({
  id: z.string(),
  amount: z.number().positive(),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const HabitInstanceSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.literal('habit'),
  category: z.string().nullable(),
  startTime: z.string().nullable(),
  duration: z.number().nullable(),
  repeat: z.enum(['daily', 'weekly']).nullable(),
  completed: z.boolean(),
  scheduledDate: z.string().nullable(),
  createdAt: z.string(),
  originalHabitId: z.string().nullable(),
  isHabitInstance: z.literal(true),
  position: z.number().int().nullable(),
  habitInfo: z.object({
    target: HabitTargetSchema.nullable(),
    outcome: HabitOutcomeSchema,
    progressTotal: z.number().nonnegative(),
  }),
})

export const HabitProgressDetailSchema = z.object({
  habit: HabitInstanceSchema,
  entries: z.array(HabitProgressEntrySchema),
})

/**
 * What measured progress makes a Habit's day.
 *
 * A binary Habit — no target — is never `partial`: there is nothing to be part of.
 */
export function deriveHabitOutcome(total: number, target: number | null): HabitOutcome {
  if (target != null && total >= target) return 'completed'
  return total > 0 ? 'partial' : 'pending'
}

/**
 * What the user asked for, reconciled with what they have actually recorded.
 *
 * Three answers, and the caller must handle all three:
 *
 * - `top_up` — marking a measured Habit done when the target is not yet met adds
 *   the remainder as a real entry rather than overriding the number. The record
 *   stays true to the total it claims.
 * - `refuse` — marking it Not done when the target *is* met would contradict
 *   entries that exist. The progress has to be corrected first.
 * - `set` — write the outcome. Asking for `pending` on a Habit with recorded
 *   progress lands on `partial`, because a day with fifteen minutes in it is not
 *   a day nothing happened on.
 */
export type HabitOutcomeDecision =
  | { kind: 'top_up'; amount: number; note: string }
  | { kind: 'refuse'; reason: string }
  | { kind: 'set'; outcome: HabitOutcome }

export const TOP_UP_NOTE = 'Completed remaining target'

export function resolveHabitOutcomeRequest(input: {
  requested: 'pending' | 'completed' | 'failed'
  total: number
  target: number | null
}): HabitOutcomeDecision {
  const { requested, total, target } = input
  if (requested === 'completed' && target != null && total < target) {
    return { kind: 'top_up', amount: target - total, note: TOP_UP_NOTE }
  }
  if (requested === 'failed' && target != null && total >= target) {
    return { kind: 'refuse', reason: 'Completed progress must be corrected before marking Not done' }
  }
  return { kind: 'set', outcome: requested === 'pending' && total > 0 ? 'partial' : requested }
}

const HabitContracts = {
  HabitOutcomeSchema,
  HabitTargetUnitSchema,
  HabitTargetSchema,
  HabitHistoryQuerySchema,
  HabitHistorySourceSchema,
  HabitHistoryDaySchema,
  HabitHistorySchema,
  HabitHistoryContextSchema,
  HabitProgressInputSchema,
  HabitOutcomeInputSchema,
  HabitProgressUpdateSchema,
  HabitProgressEntrySchema,
  HabitInstanceSchema,
  HabitProgressDetailSchema,
  TOP_UP_NOTE,
  deriveHabitOutcome,
  composeHabitHistory,
  resolveHabitOutcomeRequest,
}

export default HabitContracts
