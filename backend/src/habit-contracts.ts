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
    target: z.object({ value: z.number().positive(), unit: HabitTargetUnitSchema }).nullable(),
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
  HabitProgressInputSchema,
  HabitOutcomeInputSchema,
  HabitProgressUpdateSchema,
  HabitProgressEntrySchema,
  HabitInstanceSchema,
  HabitProgressDetailSchema,
  TOP_UP_NOTE,
  deriveHabitOutcome,
  resolveHabitOutcomeRequest,
}

export default HabitContracts
