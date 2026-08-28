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

/**
 * Row mappers, browser-safe.
 *
 * A device adopting an account's day reads the same export the server writes, so
 * it needs the same snake_case-to-client mapping. Fourth rule to move here rather
 * than fork: composeDayTaskRows, deriveHabitOutcome, summarizeAchievement, these.
 */
const numberOrNull = (value: unknown) => value == null ? null : Number(value)

export const workoutExerciseToClient = (row: any) => ({
  id: row.id,
  sessionId: row.session_id,
  name: row.name,
  sets: numberOrNull(row.sets),
  reps: numberOrNull(row.reps),
  weightKg: numberOrNull(row.weight_kg),
  durationMinutes: numberOrNull(row.duration_minutes),
  distanceKm: numberOrNull(row.distance_km),
  notes: row.notes ?? null,
  position: row.position,
})

export const workoutSessionToClient = (row: any, exercises: any[] = []) => ({
  id: row.id,
  userId: row.user_id,
  date: row.date,
  title: row.title ?? null,
  notes: row.notes ?? null,
  exercises: exercises.map(workoutExerciseToClient),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const workoutExerciseItemToClient = (row: any) => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  normalizedName: row.normalized_name,
  sets: numberOrNull(row.sets),
  reps: numberOrNull(row.reps),
  weightKg: numberOrNull(row.weight_kg),
  durationMinutes: numberOrNull(row.duration_minutes),
  distanceKm: numberOrNull(row.distance_km),
  notes: row.notes ?? null,
  usageCount: row.usage_count,
  lastUsedAt: row.last_used_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const workoutPlanExerciseToClient = (row: any) => ({
  id: row.id,
  planId: row.plan_id,
  name: row.name,
  sets: numberOrNull(row.sets),
  reps: numberOrNull(row.reps),
  weightKg: numberOrNull(row.weight_kg),
  durationMinutes: numberOrNull(row.duration_minutes),
  distanceKm: numberOrNull(row.distance_km),
  notes: row.notes ?? null,
  position: row.position,
})

export const workoutPlanToClient = (row: any, exercises: any[] = []) => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  color: row.color ?? null,
  note: row.note ?? null,
  position: row.position,
  exercises: exercises.map(workoutPlanExerciseToClient),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/**
 * The other direction, for the sync exchange.
 *
 * A device stores a session's exercises **inside** the session; the server keeps
 * them in `workout_session_exercises`, and plans the same way in
 * `workout_plan_items`. So a session does not map to a row — it maps to a row and
 * a set of child rows, which is why these return both rather than pretending the
 * shapes match.
 *
 * Deliberately beside the `*ToClient` they mirror: a column added to one and
 * forgotten in the other is exactly how this codebase has lost data before.
 */
const exerciseMeasurements = (exercise: any) => ({
  name: String(exercise.name ?? ''),
  sets: numberOrNull(exercise.sets),
  reps: numberOrNull(exercise.reps),
  weight_kg: numberOrNull(exercise.weightKg ?? exercise.weight_kg),
  duration_minutes: numberOrNull(exercise.durationMinutes ?? exercise.duration_minutes),
  distance_km: numberOrNull(exercise.distanceKm ?? exercise.distance_km),
  notes: exercise.notes ?? null,
})

export const workoutExerciseToRow = (exercise: any, sessionId: string, index: number) => ({
  id: String(exercise.id),
  session_id: sessionId,
  ...exerciseMeasurements(exercise),
  position: Number(exercise.position ?? index),
})

export const workoutPlanExerciseToRow = (exercise: any, planId: string, index: number) => ({
  id: String(exercise.id),
  plan_id: planId,
  ...exerciseMeasurements(exercise),
  position: Number(exercise.position ?? index),
})

export const workoutSessionToRows = (session: any, userId: string) => ({
  row: {
    id: String(session.id),
    user_id: userId,
    date: String(session.date),
    title: session.title ?? null,
    notes: session.notes ?? null,
    created_at: session.createdAt ?? session.created_at ?? null,
    updated_at: session.updatedAt ?? session.updated_at ?? null,
    deleted_at: session.deletedAt ?? session.deleted_at ?? null,
  },
  exercises: (Array.isArray(session.exercises) ? session.exercises : [])
    .map((exercise: any, index: number) => workoutExerciseToRow(exercise, String(session.id), index)),
})

export const workoutPlanToRows = (plan: any, userId: string) => ({
  row: {
    id: String(plan.id),
    user_id: userId,
    name: String(plan.name ?? ''),
    color: plan.color ?? null,
    note: plan.note ?? null,
    position: Number(plan.position ?? 0),
    created_at: plan.createdAt ?? plan.created_at ?? null,
    updated_at: plan.updatedAt ?? plan.updated_at ?? null,
    deleted_at: plan.deletedAt ?? plan.deleted_at ?? null,
  },
  exercises: (Array.isArray(plan.exercises) ? plan.exercises : [])
    .map((exercise: any, index: number) => workoutPlanExerciseToRow(exercise, String(plan.id), index)),
})

export const workoutExerciseItemToRow = (item: any, userId: string) => ({
  id: String(item.id),
  user_id: userId,
  name: String(item.name ?? ''),
  // The unique key the table is indexed on, kept or derived on the same terms as
  // `calorie_items`.
  normalized_name: String(item.normalizedName ?? item.normalized_name ?? item.name ?? '')
    .trim().toLowerCase(),
  ...(() => { const { name: _name, ...rest } = exerciseMeasurements(item); return rest })(),
  usage_count: Number(item.usageCount ?? item.usage_count ?? 1),
  last_used_at: item.lastUsedAt ?? item.last_used_at ?? null,
  created_at: item.createdAt ?? item.created_at ?? null,
  updated_at: item.updatedAt ?? item.updated_at ?? null,
  deleted_at: item.deletedAt ?? item.deleted_at ?? null,
})

const WorkoutContracts = {
  WorkoutPlanSchema,
  WorkoutSessionSchema,
  workoutExerciseToClient,
  workoutSessionToClient,
  workoutExerciseItemToClient,
  workoutPlanExerciseToClient,
  workoutPlanToClient,
  workoutExerciseToRow,
  workoutPlanExerciseToRow,
  workoutSessionToRows,
  workoutPlanToRows,
  workoutExerciseItemToRow,
}

export default WorkoutContracts
