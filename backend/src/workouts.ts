import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { db } from './supabase-client'

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

export type WorkoutExerciseInput = z.infer<typeof WorkoutExerciseInputSchema>
export type WorkoutSessionCreate = z.infer<typeof WorkoutSessionCreateSchema>
export type WorkoutSessionUpdate = z.infer<typeof WorkoutSessionUpdateSchema>

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message)
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super('Forbidden')
  }
}

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
  usageCount: row.usage_count,
  lastUsedAt: row.last_used_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

function exerciseToRow(sessionId: string, input: WorkoutExerciseInput, fallbackPosition: number) {
  return {
    id: uuidv4(),
    session_id: sessionId,
    name: input.name,
    sets: input.sets ?? null,
    reps: input.reps ?? null,
    weight_kg: input.weightKg ?? null,
    duration_minutes: input.durationMinutes ?? null,
    distance_km: input.distanceKm ?? null,
    notes: input.notes ?? null,
    position: input.position ?? fallbackPosition,
  }
}

function exerciseUpdates(input: Partial<WorkoutExerciseInput>) {
  const updates: Record<string, unknown> = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.sets !== undefined) updates.sets = input.sets
  if (input.reps !== undefined) updates.reps = input.reps
  if (input.weightKg !== undefined) updates.weight_kg = input.weightKg
  if (input.durationMinutes !== undefined) updates.duration_minutes = input.durationMinutes
  if (input.distanceKm !== undefined) updates.distance_km = input.distanceKm
  if (input.notes !== undefined) updates.notes = input.notes
  if (input.position !== undefined) updates.position = input.position
  return updates
}

async function assertSessionOwner(userId: string, sessionId: string) {
  const session = await db.getWorkoutSessionById(sessionId)
  if (!session) throw new NotFoundError('Workout session not found')
  if (session.user_id !== userId) throw new ForbiddenError()
  return session
}

export const Workouts = {
  async listSessions(userId: string, date: string) {
    const sessions = await db.getWorkoutSessionsByDay(userId, date)
    const rows = await Promise.all(
      sessions.map(async (session: any) => {
        const exercises = await db.getWorkoutSessionExercises(session.id)
        return workoutSessionToClient(session, exercises)
      })
    )
    return rows
  },

  async listExerciseItems(userId: string, options: { sort: 'recent' | 'most-used'; limit: number }) {
    const rows = options.sort === 'most-used'
      ? await db.getMostUsedWorkoutExerciseItems(userId, options.limit)
      : await db.getRecentWorkoutExerciseItems(userId, options.limit)
    return rows.map(workoutExerciseItemToClient)
  },

  async createSession(userId: string, input: WorkoutSessionCreate) {
    const session = await db.createWorkoutSession({
      id: uuidv4(),
      user_id: userId,
      date: input.date,
      title: input.title ?? null,
      notes: input.notes ?? null,
    })

    for (const exercise of input.exercises) {
      await db.upsertWorkoutExerciseItem(userId, exercise.name)
    }

    const exerciseRows = await db.createWorkoutSessionExercises(
      input.exercises.map((exercise, index) => exerciseToRow(session.id, exercise, index))
    )
    return workoutSessionToClient(session, exerciseRows)
  },

  async updateSession(userId: string, sessionId: string, input: WorkoutSessionUpdate) {
    await assertSessionOwner(userId, sessionId)
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.date !== undefined) updates.date = input.date
    if (input.title !== undefined) updates.title = input.title
    if (input.notes !== undefined) updates.notes = input.notes

    const row = await db.updateWorkoutSession(sessionId, updates)
    const exercises = await db.getWorkoutSessionExercises(sessionId)
    return workoutSessionToClient(row, exercises)
  },

  async deleteSession(userId: string, sessionId: string) {
    await assertSessionOwner(userId, sessionId)
    await db.deleteWorkoutSession(sessionId)
  },

  async addExercise(userId: string, sessionId: string, input: WorkoutExerciseInput) {
    const session = await assertSessionOwner(userId, sessionId)
    await db.upsertWorkoutExerciseItem(userId, input.name)
    const current = await db.getWorkoutSessionExercises(session.id)
    const row = await db.createWorkoutSessionExercise(exerciseToRow(session.id, input, current.length))
    return workoutExerciseToClient(row)
  },

  async updateExercise(userId: string, exerciseId: string, input: Partial<WorkoutExerciseInput>) {
    const existing = await db.getWorkoutSessionExerciseById(exerciseId)
    if (!existing) throw new NotFoundError('Workout exercise not found')
    await assertSessionOwner(userId, existing.session_id)

    if (input.name !== undefined) {
      await db.upsertWorkoutExerciseItem(userId, input.name)
    }

    const row = await db.updateWorkoutSessionExercise(exerciseId, exerciseUpdates(input))
    return workoutExerciseToClient(row)
  },

  async deleteExercise(userId: string, exerciseId: string) {
    const existing = await db.getWorkoutSessionExerciseById(exerciseId)
    if (!existing) throw new NotFoundError('Workout exercise not found')
    await assertSessionOwner(userId, existing.session_id)
    await db.deleteWorkoutSessionExercise(exerciseId)
  },
}
