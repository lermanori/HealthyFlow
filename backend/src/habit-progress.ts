import { z } from 'zod'
import { db } from './supabase-client'
import { parseHabitInstanceId } from './utils/parseHabitInstanceId'
import {
  deriveHabitOutcome,
  HabitInstanceSchema,
  HabitOutcomeInputSchema,
  HabitOutcomeSchema,
  HabitProgressDetailSchema,
  HabitProgressEntrySchema,
  HabitProgressInputSchema,
  HabitProgressUpdateSchema,
  HabitTargetUnitSchema,
  resolveHabitOutcomeRequest,
  type HabitOutcome,
} from './habit-contracts'

// The schemas and the outcome rules live in `habit-contracts.ts` so a device can
// run them without a database. Re-exported here because every existing caller
// imports them from this module.
export {
  HabitInstanceSchema,
  HabitOutcomeInputSchema,
  HabitOutcomeSchema,
  HabitProgressDetailSchema,
  HabitProgressEntrySchema,
  HabitProgressInputSchema,
  HabitProgressUpdateSchema,
  HabitTargetUnitSchema,
}
export type { HabitOutcome }

const numberOrNull = (value: unknown) => value == null ? null : Number(value)

function entryToClient(row: any) {
  return {
    id: row.id,
    amount: Number(row.amount),
    note: row.note ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function habitToClient(row: any, progressTotal: number) {
  const targetValue = numberOrNull(row.habit_target_value)
  return {
    id: row.id,
    title: row.title,
    type: 'habit',
    category: row.category,
    startTime: row.start_time ?? null,
    duration: row.duration,
    repeat: row.repeat_type,
    completed: row.habit_outcome === 'completed' || Boolean(row.completed),
    scheduledDate: row.scheduled_date,
    createdAt: row.created_at,
    originalHabitId: row.original_habit_id,
    isHabitInstance: true,
    position: row.position ?? null,
    habitInfo: {
      target: targetValue == null ? null : { value: targetValue, unit: row.habit_target_unit },
      outcome: (row.habit_outcome ?? (row.completed ? 'completed' : 'pending')) as HabitOutcome,
      progressTotal,
    },
  }
}

async function resolveInstance(userId: string, reference: string, date?: string) {
  const parsed = parseHabitInstanceId(reference)
  const lookupId = parsed?.originalHabitId ?? reference
  const row = await db.getTaskById(lookupId)
  if (!row || row.user_id !== userId) throw Object.assign(new Error('Habit not found'), { status: 404 })
  if (row.type !== 'habit') throw Object.assign(new Error('Item is not a Habit'), { status: 400 })

  if (row.original_habit_id) return row
  const instanceDate = parsed?.date ?? date ?? row.scheduled_date
  if (!instanceDate) throw Object.assign(new Error('A date is required'), { status: 400 })
  return db.createHabitInstance(row.id, instanceDate, userId)
}

async function detail(instance: any) {
  const rows = await db.getHabitProgressEntries(instance.id)
  const total = rows.reduce((sum: number, row: any) => sum + Number(row.amount), 0)
  return { habit: habitToClient(instance, total), entries: rows.map(entryToClient) }
}

async function deriveFromProgress(instance: any) {
  const rows = await db.getHabitProgressEntries(instance.id)
  const total = rows.reduce((sum: number, row: any) => sum + Number(row.amount), 0)
  const outcome = deriveHabitOutcome(total, numberOrNull(instance.habit_target_value))
  const updated = await db.updateTask(instance.id, {
    habit_outcome: outcome,
    completed: outcome === 'completed',
    completed_at: outcome === 'completed' ? new Date().toISOString() : null,
  })
  return { habit: habitToClient(updated, total), entries: rows.map(entryToClient) }
}

export const HabitProgress = {
  async get(userId: string, reference: string, date?: string) {
    return detail(await resolveInstance(userId, reference, date))
  },

  async update(userId: string, reference: string, entryId: string, input: z.infer<typeof HabitProgressUpdateSchema>, date?: string) {
    const instance = await resolveInstance(userId, reference, date)
    const entry = await db.getHabitProgressEntry(entryId)
    if (!entry || entry.user_id !== userId || entry.habit_instance_id !== instance.id) {
      throw Object.assign(new Error('Progress entry not found'), { status: 404 })
    }
    await db.updateHabitProgressEntry(entryId, input)
    return deriveFromProgress(instance)
  },

  async remove(userId: string, reference: string, entryId: string, date?: string) {
    const instance = await resolveInstance(userId, reference, date)
    const entry = await db.getHabitProgressEntry(entryId)
    if (!entry || entry.user_id !== userId || entry.habit_instance_id !== instance.id) {
      throw Object.assign(new Error('Progress entry not found'), { status: 404 })
    }
    await db.deleteHabitProgressEntry(entryId)
    return deriveFromProgress(instance)
  },

  async add(userId: string, reference: string, input: z.infer<typeof HabitProgressInputSchema>) {
    const instance = await resolveInstance(userId, reference, input.date)
    if (instance.habit_target_value == null) throw Object.assign(new Error('Binary Habits do not accept progress'), { status: 400 })
    await db.createHabitProgressEntry({
      habit_instance_id: instance.id,
      user_id: userId,
      amount: input.amount,
      note: input.note ?? null,
    })
    return deriveFromProgress(instance)
  },

  async setOutcome(userId: string, reference: string, input: z.infer<typeof HabitOutcomeInputSchema>) {
    const instance = await resolveInstance(userId, reference, input.date)
    const rows = await db.getHabitProgressEntries(instance.id)
    const total = rows.reduce((sum: number, row: any) => sum + Number(row.amount), 0)
    const decision = resolveHabitOutcomeRequest({
      requested: input.outcome,
      total,
      target: numberOrNull(instance.habit_target_value),
    })

    if (decision.kind === 'top_up') {
      await db.createHabitProgressEntry({
        habit_instance_id: instance.id, user_id: userId, amount: decision.amount, note: decision.note,
      })
      return deriveFromProgress(instance)
    }
    if (decision.kind === 'refuse') {
      throw Object.assign(new Error(decision.reason), { status: 409 })
    }

    const outcome = decision.outcome
    const updated = await db.updateTask(instance.id, {
      habit_outcome: outcome,
      completed: outcome === 'completed',
      completed_at: outcome === 'completed' ? new Date().toISOString() : null,
    })
    return detail(updated)
  },

  async recalculateTargetDay(userId: string, reference: string, date?: string) {
    const instance = await resolveInstance(userId, reference, date)
    if (instance.habit_target_value == null) return detail(instance)
    return deriveFromProgress(instance)
  },
}
