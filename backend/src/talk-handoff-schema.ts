import { z } from 'zod'

/**
 * The closed Workouts -> Talk request context shared by the browser and API.
 * It is intentionally narrower than a prompt: application routing, not model
 * interpretation, decides that this conversation may prepare a reusable plan.
 */
export const WorkoutPlanTalkHandoffSchema = z.object({
  source: z.literal('workouts'),
  intent: z.literal('draft_workout_plan'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict()

export type WorkoutPlanTalkHandoff = z.infer<typeof WorkoutPlanTalkHandoffSchema>

export default {
  WorkoutPlanTalkHandoffSchema,
}
