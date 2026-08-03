import { z } from 'zod'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const nullablePositive = z.number().positive().nullable().optional()

export const WorkoutExerciseInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sets: nullablePositive,
  reps: nullablePositive,
  weightKg: nullablePositive,
  durationMinutes: nullablePositive,
  distanceKm: nullablePositive,
  notes: z.string().trim().max(500).nullable().optional(),
  position: z.number().int().nonnegative().optional(),
})

export const WorkoutExerciseUpdateSchema = WorkoutExerciseInputSchema.partial()

const WorkoutPlanGeneratedExerciseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sets: z.number().positive().nullable(),
  reps: z.number().positive().nullable(),
  weightKg: z.number().positive().nullable(),
  durationMinutes: z.number().positive().nullable(),
  distanceKm: z.number().positive().nullable(),
  notes: z.string().trim().max(500).nullable(),
})

// Strict structured-output contract for AI-generated plans. Nullable fields
// remain required because OpenAI strict JSON schemas reject optional properties.
export const WorkoutPlanDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().trim().max(32).nullable(),
  note: z.string().trim().max(1000).nullable(),
  exercises: z.array(WorkoutPlanGeneratedExerciseSchema).min(1).max(30),
})

export const WorkoutPlanCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().trim().max(32).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  exercises: z.array(WorkoutExerciseInputSchema).min(1),
  position: z.number().int().nonnegative().optional(),
})

export const WorkoutPlanUpdateSchema = WorkoutPlanCreateSchema.partial()

export const WorkoutPlanGenerationRequestSchema = z.object({
  intent: z.string().trim().min(3).max(2000),
})

export const WorkoutSessionCreateSchema = z.object({
  date: z.string().regex(DATE_RE),
  title: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  exercises: z.array(WorkoutExerciseInputSchema).min(1),
})

export const WorkoutSessionUpdateSchema = z.object({
  date: z.string().regex(DATE_RE).optional(),
  title: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
})

export const WorkoutListQuerySchema = z.object({
  date: z.string().regex(DATE_RE),
})

export const WorkoutExerciseItemQuerySchema = z.object({
  sort: z.enum(['recent', 'most-used']).default('recent'),
  limit: z.coerce.number().int().positive().max(50).default(10),
})

export const WorkoutExerciseSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  name: z.string(),
  sets: z.number().positive().nullable(),
  reps: z.number().positive().nullable(),
  weightKg: z.number().positive().nullable(),
  durationMinutes: z.number().positive().nullable(),
  distanceKm: z.number().positive().nullable(),
  notes: z.string().nullable(),
  position: z.number().int().nonnegative(),
})

export const WorkoutSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  date: z.string().regex(DATE_RE),
  title: z.string().nullable(),
  notes: z.string().nullable(),
  exercises: z.array(WorkoutExerciseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const WorkoutPlanExerciseSchema = WorkoutExerciseSchema.omit({ sessionId: true }).extend({
  planId: z.string(),
})

export const WorkoutPlanSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  note: z.string().nullable(),
  position: z.number().int().nonnegative(),
  exercises: z.array(WorkoutPlanExerciseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type WorkoutExerciseInput = z.infer<typeof WorkoutExerciseInputSchema>
export type WorkoutPlanDraft = z.infer<typeof WorkoutPlanDraftSchema>
export type WorkoutPlanCreate = z.infer<typeof WorkoutPlanCreateSchema>
export type WorkoutPlanUpdate = z.infer<typeof WorkoutPlanUpdateSchema>
export type WorkoutSessionCreate = z.infer<typeof WorkoutSessionCreateSchema>
export type WorkoutSessionUpdate = z.infer<typeof WorkoutSessionUpdateSchema>
