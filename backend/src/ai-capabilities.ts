import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import {
  AchievementEntryCreateSchema,
  Achievements,
} from './achievements'
import { Rollover } from './rollover'
import { db } from './supabase-client'
import { parseHabitInstanceId } from './utils/parseHabitInstanceId'
import {
  WorkoutSessionCreateSchema,
  Workouts,
} from './workouts'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const DateInput = z.object({
  date: z.string().regex(DATE_RE).optional(),
})

const LimitInput = DateInput.extend({
  limit: z.number().int().min(1).max(50).default(20),
})

const RecentLimitInput = z.object({
  limit: z.number().int().min(1).max(100).default(30),
})

const EmptyInput = z.object({})
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
type LimitInputValue = z.infer<typeof LimitInput>
type RecentLimitInputValue = z.infer<typeof RecentLimitInput>

const RequestId = z.string().trim().min(1).max(120).optional()
const Category = z.enum(['health', 'work', 'personal', 'fitness', 'grocery', 'nutrition'])
const TaskOutput = z.object({ item: z.unknown(), duplicated: z.boolean().optional() })

const AddTaskInput = z.object({
  title: z.string().trim().min(1).max(200),
  category: Category.default('personal'),
  duration: z.number().int().positive().default(15),
  startTime: z.string().regex(TIME_RE).nullable().optional(),
  scheduledDate: z.string().regex(DATE_RE).optional(),
  requestId: RequestId,
})

const AddHabitInput = z.object({
  title: z.string().trim().min(1).max(200),
  category: Category.default('health'),
  duration: z.number().int().positive().default(15),
  startTime: z.string().regex(TIME_RE).nullable().optional(),
  repeat: z.enum(['daily', 'weekly']).default('daily'),
  requestId: RequestId,
})

const AddCalorieEntryInput = z.object({
  date: z.string().regex(DATE_RE).optional(),
  time: z.string().regex(TIME_RE).nullable().optional(),
  name: z.string().trim().min(1).max(200),
  calories: z.number().int().nonnegative(),
  protein: z.number().nonnegative().nullable().optional(),
  carbs: z.number().nonnegative().nullable().optional(),
  fat: z.number().nonnegative().nullable().optional(),
  quantity: z.string().trim().max(120).nullable().optional(),
  requestId: RequestId,
})

const AddWeightEntryInput = z.object({
  date: z.string().regex(DATE_RE).optional(),
  weightKg: z.number().positive(),
  requestId: RequestId,
})

const AddAchievementEntryInput = AchievementEntryCreateSchema.extend({
  achievementId: z.string().uuid(),
  requestId: RequestId,
})

const AddWorkoutSessionInput = WorkoutSessionCreateSchema.extend({
  requestId: RequestId,
})

const UpdateItemInput = z.object({
  itemId: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  category: Category.optional(),
  duration: z.number().int().positive().optional(),
  startTime: z.string().regex(TIME_RE).nullable().optional(),
  scheduledDate: z.string().regex(DATE_RE).optional(),
  position: z.number().int().nonnegative().nullable().optional(),
  requestId: RequestId,
})

const CompleteTaskInput = z.object({
  itemId: z.string().min(1),
  requestId: RequestId,
})

const DeleteItemInput = z.object({
  itemId: z.string().min(1),
  deleteScope: z.enum(['instance', 'habit']).default('instance'),
  requestId: RequestId,
})

const taskToClient = (row: any) => ({
  id: row.id,
  title: row.title,
  type: row.type,
  category: row.category,
  completed: Boolean(row.completed),
  scheduledDate: row.scheduled_date,
  startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
  duration: row.duration,
  repeat: row.repeat_type,
  position: row.position ?? null,
  isHabitInstance: Boolean(row.is_habit_instance),
  originalHabitId: row.original_habit_id ?? null,
  createdAt: row.created_at,
})

const calorieToClient = (row: any) => ({
  id: row.id,
  date: row.date,
  time: row.time ? String(row.time).slice(0, 5) : null,
  name: row.name,
  calories: row.calories,
  protein: row.protein ?? null,
  carbs: row.carbs ?? null,
  fat: row.fat ?? null,
  quantity: row.quantity ?? null,
  createdAt: row.created_at,
})

const weightToClient = (row: any) => ({
  id: row.id,
  date: row.date,
  weightKg: Number(row.weight_kg),
  createdAt: row.created_at,
})

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function clampRows<T>(rows: T[], limit: number) {
  return rows.slice(0, limit)
}

async function tasksForDay(userId: string, date: string, limit: number) {
  const datedRows = await db.getTasksWithRecurringHabits(userId, date)
  const rows = await Rollover.addCarryForwardRows(userId, date, datedRows)
  return clampRows(rows.map(taskToClient), limit)
}

export type AiCapabilityRisk = 'auto' | 'confirm'
export type AiCaller = 'internal' | 'mcp'
export type AiCapabilityContext = { userId: string }

export type AiCapabilityDefinition<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> = {
  name: string
  description: string
  risk: AiCapabilityRisk
  scope?: string
  inputSchema: TInput
  outputSchema: TOutput
  execute: (ctx: AiCapabilityContext, input: any) => Promise<any>
  preview?: (ctx: AiCapabilityContext, input: any) => Promise<unknown>
}

type WriteContext = AiCapabilityContext & { caller?: AiCaller; model?: string | null }

async function withIdempotency<T>(
  ctx: WriteContext,
  tool: string,
  requestId: string | undefined,
  execute: () => Promise<T>
): Promise<any> {
  if (requestId) {
    const existing = await db.getAiIdempotency(ctx.userId, requestId, tool)
    if (existing) return { ...(existing.result as any), duplicated: true }
  }

  const result = await execute()
  if (requestId) {
    await db.createAiIdempotency({
      user_id: ctx.userId,
      request_id: requestId,
      tool,
      result,
    })
  }
  return result
}

async function auditWrite(ctx: WriteContext, tool: string, args: unknown, result: unknown, targetIds: unknown[] = []) {
  await db.createAiAuditLog({
    user_id: ctx.userId,
    caller: ctx.caller ?? 'internal',
    tool,
    args_summary: args,
    target_ids: targetIds,
    result,
    model: ctx.model ?? null,
    request_id: typeof args === 'object' && args && 'requestId' in args ? String((args as any).requestId ?? '') || null : null,
  })
}

function taskRow(input: z.infer<typeof AddTaskInput>, userId: string, type: 'task' | 'habit') {
  const scheduledDate = type === 'task'
    ? input.scheduledDate ?? (input.startTime ? todayIso() : todayIso())
    : null
  return {
    id: uuidv4(),
    user_id: userId,
    title: input.title,
    type,
    category: input.category,
    start_time: input.startTime ?? null,
    duration: input.duration,
    repeat_type: type === 'habit' ? (input as z.infer<typeof AddHabitInput>).repeat : 'none',
    scheduled_date: scheduledDate,
    position: type === 'task' && !input.startTime ? null : null,
  }
}

async function getOwnedTask(userId: string, itemId: string) {
  const parsed = parseHabitInstanceId(itemId)
  const task = await db.getTaskById(parsed ? parsed.originalHabitId : itemId)
  if (!task || task.user_id !== userId) throw new Error('Item not found')
  return { task, parsedVirtual: parsed }
}

function taskPreview(action: string, row: any, extra: Record<string, unknown> = {}) {
  return {
    action,
    item: taskToClient(row),
    ...extra,
  }
}

export const AiCapabilities = {
  get_today: {
    name: 'get_today',
    description: "Return a bounded overview of today's HealthyFlow Tasks, Habit instances, calories, weight, achievements, and workout sessions.",
    risk: 'auto',
    inputSchema: EmptyInput,
    outputSchema: z.object({
      date: z.string(),
      tasks: z.array(z.unknown()),
      calorieEntries: z.array(z.unknown()),
      weight: z.unknown().nullable(),
      achievements: z.array(z.unknown()),
      workoutSessions: z.array(z.unknown()),
    }),
    async execute(ctx) {
      const date = todayIso()
      const [tasks, calorieRows, weightRow, achievements, workoutSessions] = await Promise.all([
        tasksForDay(ctx.userId, date, 20),
        db.getCalorieEntriesByDay(ctx.userId, date),
        db.getWeightEntryByDay(ctx.userId, date),
        Achievements.list(ctx.userId, { includeArchived: false, entryLimit: 10 }),
        Workouts.listSessions(ctx.userId, date),
      ])
      return {
        date,
        tasks,
        calorieEntries: clampRows(calorieRows.map(calorieToClient), 20),
        weight: weightRow ? weightToClient(weightRow) : null,
        achievements: clampRows(achievements, 20),
        workoutSessions: clampRows(workoutSessions, 20),
      }
    },
  },
  list_tasks: {
    name: 'list_tasks',
    description: 'List bounded Tasks and Habit instances for a specific date, defaulting to today.',
    risk: 'auto',
    inputSchema: LimitInput,
    outputSchema: z.object({
      date: z.string(),
      tasks: z.array(z.unknown()),
    }),
    async execute(ctx, input) {
      const parsed = input as LimitInputValue
      const date = parsed.date ?? todayIso()
      return { date, tasks: await tasksForDay(ctx.userId, date, parsed.limit) }
    },
  },
  list_calorie_entries: {
    name: 'list_calorie_entries',
    description: 'List bounded Calorie entries for a specific date, defaulting to today.',
    risk: 'auto',
    inputSchema: LimitInput,
    outputSchema: z.object({
      date: z.string(),
      entries: z.array(z.unknown()),
    }),
    async execute(ctx, input) {
      const parsed = input as LimitInputValue
      const date = parsed.date ?? todayIso()
      const rows = await db.getCalorieEntriesByDay(ctx.userId, date)
      return { date, entries: clampRows(rows.map(calorieToClient), parsed.limit) }
    },
  },
  list_weight_summary: {
    name: 'list_weight_summary',
    description: 'Return recent Weight entries with latest, previous, and delta values.',
    risk: 'auto',
    inputSchema: RecentLimitInput,
    outputSchema: z.object({
      entries: z.array(z.unknown()),
      latest: z.unknown().nullable(),
      previous: z.unknown().nullable(),
      deltaKg: z.number().nullable(),
    }),
    async execute(ctx, input) {
      const parsed = input as RecentLimitInputValue
      const rows = await db.getRecentWeightEntries(ctx.userId, parsed.limit)
      const entries = rows.map(weightToClient).reverse()
      const latest = entries[entries.length - 1] ?? null
      const previous = entries[entries.length - 2] ?? null
      const deltaKg = latest && previous ? latest.weightKg - previous.weightKg : null
      return { entries, latest, previous, deltaKg }
    },
  },
  list_achievements: {
    name: 'list_achievements',
    description: 'List active Achievement definitions with recent entries and progress summaries.',
    risk: 'auto',
    inputSchema: z.object({
      entryLimit: z.number().int().min(1).max(100).default(30),
    }),
    outputSchema: z.object({
      achievements: z.array(z.unknown()),
    }),
    async execute(ctx, input) {
      const parsed = input as { entryLimit: number }
      return {
        achievements: await Achievements.list(ctx.userId, {
          includeArchived: false,
          entryLimit: parsed.entryLimit,
        }),
      }
    },
  },
  list_workout_sessions: {
    name: 'list_workout_sessions',
    description: 'List bounded Workout sessions for a specific date, defaulting to today.',
    risk: 'auto',
    inputSchema: LimitInput,
    outputSchema: z.object({
      date: z.string(),
      sessions: z.array(z.unknown()),
    }),
    async execute(ctx, input) {
      const parsed = input as LimitInputValue
      const date = parsed.date ?? todayIso()
      const sessions = await Workouts.listSessions(ctx.userId, date)
      return { date, sessions: clampRows(sessions, parsed.limit) }
    },
  },
  add_task: {
    name: 'add_task',
    description: 'Add a one-shot Task. Auto-runs when the user plainly asks to add a Task.',
    risk: 'auto',
    scope: 'hf:write:add',
    inputSchema: AddTaskInput,
    outputSchema: TaskOutput,
    async execute(ctx, input) {
      const writeCtx = ctx as WriteContext
      return withIdempotency(writeCtx, 'add_task', input.requestId, async () => {
        const row = await db.createTask(taskRow(input, ctx.userId, 'task'))
        const result = { item: taskToClient(row) }
        await auditWrite(writeCtx, 'add_task', input, result, [row.id])
        return result
      })
    },
  },
  add_habit: {
    name: 'add_habit',
    description: 'Add a recurring Habit template. Auto-runs when the user plainly asks to add a Habit.',
    risk: 'auto',
    scope: 'hf:write:add',
    inputSchema: AddHabitInput,
    outputSchema: TaskOutput,
    async execute(ctx, input) {
      const writeCtx = ctx as WriteContext
      return withIdempotency(writeCtx, 'add_habit', input.requestId, async () => {
        const row = await db.createTask(taskRow(input, ctx.userId, 'habit'))
        const result = { item: taskToClient(row) }
        await auditWrite(writeCtx, 'add_habit', input, result, [row.id])
        return result
      })
    },
  },
  add_calorie_entry: {
    name: 'add_calorie_entry',
    description: 'Add a Calorie entry. Auto-runs when the user plainly asks to log food or calories.',
    risk: 'auto',
    scope: 'hf:write:add',
    inputSchema: AddCalorieEntryInput,
    outputSchema: z.object({ entry: z.unknown(), duplicated: z.boolean().optional() }),
    async execute(ctx, input) {
      const writeCtx = ctx as WriteContext
      return withIdempotency(writeCtx, 'add_calorie_entry', input.requestId, async () => {
        const row = await db.createCalorieEntry({
          id: uuidv4(),
          user_id: ctx.userId,
          date: input.date ?? todayIso(),
          time: input.time ?? null,
          name: input.name,
          calories: input.calories,
          protein: input.protein ?? null,
          carbs: input.carbs ?? null,
          fat: input.fat ?? null,
          quantity: input.quantity ?? null,
        })
        const result = { entry: calorieToClient(row) }
        await auditWrite(writeCtx, 'add_calorie_entry', input, result, [row.id])
        return result
      })
    },
  },
  add_weight_entry: {
    name: 'add_weight_entry',
    description: 'Add a Weight entry for a date. Auto-runs when the user plainly asks to log weight.',
    risk: 'auto',
    scope: 'hf:write:add',
    inputSchema: AddWeightEntryInput,
    outputSchema: z.object({ entry: z.unknown(), duplicated: z.boolean().optional() }),
    async execute(ctx, input) {
      const writeCtx = ctx as WriteContext
      return withIdempotency(writeCtx, 'add_weight_entry', input.requestId, async () => {
        const row = await db.createWeightEntry({
          id: uuidv4(),
          user_id: ctx.userId,
          date: input.date ?? todayIso(),
          weight_kg: input.weightKg,
        })
        const result = { entry: weightToClient(row) }
        await auditWrite(writeCtx, 'add_weight_entry', input, result, [row.id])
        return result
      })
    },
  },
  add_achievement_entry: {
    name: 'add_achievement_entry',
    description: 'Add an Achievement entry to an existing Achievement definition.',
    risk: 'auto',
    scope: 'hf:write:add',
    inputSchema: AddAchievementEntryInput,
    outputSchema: z.object({ entry: z.unknown(), duplicated: z.boolean().optional() }),
    async execute(ctx, input) {
      const writeCtx = ctx as WriteContext
      return withIdempotency(writeCtx, 'add_achievement_entry', input.requestId, async () => {
        const { achievementId, requestId: _requestId, ...entry } = input
        const result = { entry: await Achievements.createEntry(ctx.userId, achievementId, entry) }
        await auditWrite(writeCtx, 'add_achievement_entry', input, result, [result.entry.id])
        return result
      })
    },
  },
  add_workout_session: {
    name: 'add_workout_session',
    description: 'Add a Workout session with exercises.',
    risk: 'auto',
    scope: 'hf:write:add',
    inputSchema: AddWorkoutSessionInput,
    outputSchema: z.object({ session: z.unknown(), duplicated: z.boolean().optional() }),
    async execute(ctx, input) {
      const writeCtx = ctx as WriteContext
      return withIdempotency(writeCtx, 'add_workout_session', input.requestId, async () => {
        const { requestId: _requestId, ...sessionInput } = input
        const result = { session: await Workouts.createSession(ctx.userId, sessionInput) }
        await auditWrite(writeCtx, 'add_workout_session', input, result, [result.session.id])
        return result
      })
    },
  },
  update_item: {
    name: 'update_item',
    description: 'Preview then update a Task or Habit instance. Internal chat must ask for confirmation before executing.',
    risk: 'confirm',
    scope: 'hf:write:update',
    inputSchema: UpdateItemInput,
    outputSchema: TaskOutput,
    async preview(ctx, input) {
      const { task } = await getOwnedTask(ctx.userId, input.itemId)
      return taskPreview('update_item', task, { updates: input })
    },
    async execute(ctx, input) {
      const writeCtx = ctx as WriteContext
      return withIdempotency(writeCtx, 'update_item', input.requestId, async () => {
        const { task } = await getOwnedTask(ctx.userId, input.itemId)
        const updates: Record<string, unknown> = {}
        if (input.title !== undefined) updates.title = input.title
        if (input.category !== undefined) updates.category = input.category
        if (input.duration !== undefined) updates.duration = input.duration
        if (input.startTime !== undefined) updates.start_time = input.startTime
        if (input.scheduledDate !== undefined) updates.scheduled_date = input.scheduledDate
        if (input.position !== undefined) updates.position = input.position
        const row = await db.updateTask(task.id, updates)
        const result = { item: taskToClient(row) }
        await auditWrite(writeCtx, 'update_item', input, result, [row.id])
        return result
      })
    },
  },
  complete_task: {
    name: 'complete_task',
    description: 'Preview then complete a Task or Habit instance. Internal chat must ask for confirmation before executing.',
    risk: 'confirm',
    scope: 'hf:write:complete',
    inputSchema: CompleteTaskInput,
    outputSchema: TaskOutput,
    async preview(ctx, input) {
      const { task } = await getOwnedTask(ctx.userId, input.itemId)
      return taskPreview('complete_task', task)
    },
    async execute(ctx, input) {
      const writeCtx = ctx as WriteContext
      return withIdempotency(writeCtx, 'complete_task', input.requestId, async () => {
        const { task, parsedVirtual } = await getOwnedTask(ctx.userId, input.itemId)
        const row = parsedVirtual
          ? await db.createHabitInstance(parsedVirtual.originalHabitId, parsedVirtual.date, ctx.userId, { completed: true })
          : await db.updateTask(task.id, { completed: true, completed_at: new Date().toISOString() })
        const result = { item: taskToClient(row) }
        await auditWrite(writeCtx, 'complete_task', input, result, [row.id])
        return result
      })
    },
  },
  delete_item: {
    name: 'delete_item',
    description: 'Preview then delete a Task or Habit instance. Internal chat must ask for confirmation before executing.',
    risk: 'confirm',
    scope: 'hf:write:delete',
    inputSchema: DeleteItemInput,
    outputSchema: z.object({ deleted: z.boolean(), itemId: z.string(), duplicated: z.boolean().optional() }),
    async preview(ctx, input) {
      const { task } = await getOwnedTask(ctx.userId, input.itemId)
      return taskPreview('delete_item', task, { deleteScope: input.deleteScope })
    },
    async execute(ctx, input) {
      const writeCtx = ctx as WriteContext
      return withIdempotency(writeCtx, 'delete_item', input.requestId, async () => {
        const { task, parsedVirtual } = await getOwnedTask(ctx.userId, input.itemId)
        if (parsedVirtual) {
          await db.softDeleteHabitInstance(parsedVirtual.originalHabitId, parsedVirtual.date, ctx.userId)
        } else if (task.type === 'habit' && input.deleteScope === 'habit') {
          await db.deleteHabitSeries(task.original_habit_id || task.id, ctx.userId)
        } else if (task.type === 'habit') {
          await db.softDeleteTask(task.id)
        } else {
          await db.deleteTask(task.id)
        }
        const result = { deleted: true, itemId: input.itemId }
        await auditWrite(writeCtx, 'delete_item', input, result, [input.itemId])
        return result
      })
    },
  },
} satisfies Record<string, AiCapabilityDefinition>

export type AiCapabilityName = keyof typeof AiCapabilities

function pendingActionToClient(row: any) {
  return {
    id: row.id,
    capability: row.capability,
    preview: row.preview,
    expiresAt: row.expires_at,
  }
}

export function aiCapabilityTools(options: { mode?: 'internal' | 'mcp'; scopes?: string[]; caller?: AiCaller } = {}) {
  const mode = options.mode ?? 'internal'
  const scopes = options.scopes ?? []
  return (Object.values(AiCapabilities) as AiCapabilityDefinition[]).filter((capability) => {
    if (mode === 'mcp' && capability.scope && !scopes.includes(capability.scope)) return false
    return true
  }).map((capability) => ({
    name: capability.name,
    description: capability.risk === 'confirm' && mode === 'mcp'
      ? `${capability.description} Destructive or state-changing action: MCP clients should ask the user before calling this tool.`
      : capability.description,
    risk: capability.risk,
    scope: capability.scope,
    inputSchema: capability.inputSchema,
    parameters: z.toJSONSchema(capability.inputSchema),
    execute: async (ctx: AiCapabilityContext, args: unknown) => {
      const parsed = capability.inputSchema.parse(args ?? {})
      if (capability.risk === 'confirm' && mode === 'internal') {
        const preview = await capability.preview?.(ctx, parsed)
        const row = await db.createAiPendingAction({
          user_id: ctx.userId,
          capability: capability.name,
          args: parsed,
          preview,
          caller: 'internal',
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        })
        return { pendingAction: pendingActionToClient(row) }
      }
      return capability.execute(ctx, parsed)
    },
  }))
}

export async function executePendingAiAction(userId: string, actionId: string) {
  const action = await db.getAiPendingAction(actionId)
  if (!action || action.user_id !== userId) throw new Error('Pending action not found')
  if (action.executed_at || action.canceled_at || new Date(action.expires_at).getTime() <= Date.now()) {
    throw new Error('Pending action is no longer available')
  }
  const capability = AiCapabilities[action.capability as AiCapabilityName] as AiCapabilityDefinition | undefined
  if (!capability || capability.risk !== 'confirm') throw new Error('Invalid pending action')
  const parsed = capability.inputSchema.parse(action.args)
  const result = await capability.execute({ userId, caller: action.caller ?? 'internal' } as WriteContext, parsed)
  await db.markAiPendingActionExecuted(actionId)
  return { result, action: pendingActionToClient(action) }
}

export async function cancelPendingAiAction(userId: string, actionId: string) {
  const row = await db.cancelAiPendingAction(actionId, userId)
  if (!row) throw new Error('Pending action not found')
  return pendingActionToClient(row)
}
