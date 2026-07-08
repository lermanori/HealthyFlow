import express from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../supabase-client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { positionsFromIds } from '../utils/positionsFromIds'
import { parseHabitInstanceId } from '../utils/parseHabitInstanceId'
import { isPureDragUpdate } from '../utils/isPureDragUpdate'
import { deleteGoogleCalendarEvent, isGoogleCalendarNotConnectedError, syncTaskToGoogleCalendar } from '../calendar'
import { Rollover } from '../rollover'

const router = express.Router()

const ReorderBody = z.object({ ids: z.array(z.string()).nonempty() })
const DeleteBody = z.object({
  deleteScope: z.enum(['instance', 'habit']).optional(),
})

function normalizeLocation(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function clientTimeZone(req: AuthRequest): string | undefined {
  const value = req.header('x-client-time-zone')
  return value && value.length <= 100 ? value : undefined
}

// Shared PUT/materialize response shape (DB row → API task).
function formatTaskResponse(row: any, opts: { isHabitInstance?: boolean } = {}) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    category: row.category,
    startTime: row.start_time,
    location: row.location ?? null,
    duration: row.duration,
    repeat: row.repeat_type,
    completed: Boolean(row.completed),
    scheduledDate: row.scheduled_date,
    createdAt: row.created_at,
    originalHabitId: row.original_habit_id,
    isHabitInstance: opts.isHabitInstance ?? Boolean(row.original_habit_id),
    rolledOverFromTaskId: row.rolled_over_from_task_id,
    originalCreatedAt: row.original_created_at,
    position: row.position ?? null,
    googleEventId: row.google_event_id ?? null,
    syncedToGoogle: Boolean(row.synced_to_google),
    googleSyncStatus: row.google_sync_status ?? 'pending',
  }
}

async function syncTaskRowToGoogle(row: any, timeZone?: string) {
  try {
    const result = await syncTaskToGoogleCalendar(row, timeZone)
    return db.updateTask(row.id, {
      google_event_id: result.googleEventId,
      synced_to_google: result.synced,
      google_sync_status: result.status,
    })
  } catch (error) {
    if (isGoogleCalendarNotConnectedError(error)) {
      return db.updateTask(row.id, {
        google_event_id: null,
        synced_to_google: false,
        google_sync_status: 'skipped',
      })
    }

    console.error('Backend - Google Calendar task sync failed:', error)
    await db.updateTask(row.id, {
      synced_to_google: false,
      google_sync_status: 'failed',
    })
    throw error
  }
}

async function deleteGoogleEventsForRows(userId: string, rows: any[]) {
  await Promise.all(
    rows
      .filter(row => row.google_event_id)
      .map(row => deleteGoogleCalendarEventIfConnected(userId, row.google_event_id))
  )
}

async function deleteGoogleCalendarEventIfConnected(userId: string, googleEventId: string) {
  try {
    await deleteGoogleCalendarEvent(userId, googleEventId)
  } catch (error) {
    if (isGoogleCalendarNotConnectedError(error)) {
      return
    }
    throw error
  }
}

// Get tasks
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { date } = req.query

  console.log('Backend - Getting tasks for date:', date)
  console.log('Backend - User ID:', userId)

  try {
    let tasks;
    
    if (date) {
      // Dated rows and habit instances come from the DB facade; carry-forward
      // task rows stay behind Rollover so the rule lives in one module.
      const datedRows = await db.getTasksWithRecurringHabits(userId, date as string)
      tasks = await Rollover.addCarryForwardRows(userId, date as string, datedRows)
    } else {
      // If no date specified, get all tasks
      tasks = await db.getTasksByUserId(userId)
    }

    console.log('Backend - Raw tasks from database:', tasks)
    console.log('Backend - Number of tasks found:', tasks.length)

    const formattedTasks = tasks.map((task: any) => {
      let originalHabitId = task.original_habit_id;
      let isVirtualInstance = false;
      if (task.type === 'habit' && typeof task.id === 'string') {
        const parsed = parseHabitInstanceId(task.id)
        if (parsed) {
          originalHabitId = parsed.originalHabitId
          isVirtualInstance = true
        }
      }
      return {
        id: task.id,
        title: task.title,
        type: task.type,
        category: task.category,
        startTime: task.start_time,
        location: task.location ?? null,
        duration: task.duration,
        repeat: task.repeat_type,
        completed: Boolean(task.completed),
        scheduledDate: task.scheduled_date,
        createdAt: task.created_at,
        overdueNotified: Boolean(task.overdue_notified),
        isHabitInstance: isVirtualInstance || Boolean(task.is_habit_instance),
        originalHabitId,
        rolledOverFromTaskId: task.rolled_over_from_task_id,
        originalCreatedAt: task.original_created_at,
        completedAt: task.completed_at,
        position: task.position ?? null,
        googleEventId: task.google_event_id ?? null,
        syncedToGoogle: Boolean(task.synced_to_google),
        googleSyncStatus: task.google_sync_status ?? 'pending',
      }
    })

    console.log('Backend - Formatted tasks being sent:', formattedTasks)
    res.json(formattedTasks)
  } catch (error) {
    console.error('Backend - Error getting tasks:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

// Add task
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { title, type, category, startTime, duration, repeat } = req.body
  const location = type === 'task' ? normalizeLocation(req.body.location) : null
  // Normalize at the write boundary (ADR-0002): a time implies a day — start_time
  // with no scheduled_date is scheduled for today. No date and no time stays someday.
  let scheduledDate = req.body.scheduledDate
  if (startTime && !scheduledDate) {
    scheduledDate = new Date().toISOString().slice(0, 10)
  }

  console.log('Backend - Adding task with scheduledDate:', scheduledDate)
  console.log('Backend - Task details:', { title, type, category, startTime, duration, repeat, scheduledDate })

  try {
    // For untimed tasks, append to end of Anytime backlog (MAX position + 1, or null)
    let position: number | null = null
    if (!startTime && scheduledDate) {
      position = await db.getNextPosition(userId, scheduledDate)
    }

    const taskData = {
      id: uuidv4(),
      user_id: userId,
      title,
      type,
      category,
      start_time: startTime,
      location,
      duration,
      repeat_type: repeat,
      scheduled_date: scheduledDate,
      position,
    }

    let task = await db.createTask(taskData)
    if (task.type === 'task' && task.scheduled_date && task.start_time) {
      task = await syncTaskRowToGoogle(task, clientTimeZone(req))
    }

    res.json({
      id: task.id,
      title: task.title,
      type: task.type,
      category: task.category,
      startTime: task.start_time,
      location: task.location ?? null,
      duration: task.duration,
      repeat: task.repeat_type,
      completed: false,
      scheduledDate: task.scheduled_date,
      createdAt: task.created_at,
      rolledOverFromTaskId: task.rolled_over_from_task_id,
      originalCreatedAt: task.original_created_at,
      position: task.position ?? null,
      googleEventId: task.google_event_id ?? null,
      syncedToGoogle: Boolean(task.synced_to_google),
      googleSyncStatus: task.google_sync_status ?? 'pending',
    })
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

// Update task
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const taskId = req.params.id
  const updates = req.body

  const updateData: any = {}

  if (updates.title !== undefined) {
    updateData.title = updates.title
  }
  if (updates.startTime !== undefined) {
    updateData.start_time = updates.startTime
  }
  if (updates.duration !== undefined) {
    updateData.duration = updates.duration
  }
  if (updates.category !== undefined) {
    updateData.category = updates.category
  }
  if (updates.location !== undefined) {
    updateData.location = normalizeLocation(updates.location)
  }
  if (updates.scheduledDate !== undefined) {
    updateData.scheduled_date = updates.scheduledDate
  }
  if (updates.completed !== undefined) {
    updateData.completed = updates.completed
    if (updates.completed) {
      updateData.completed_at = new Date().toISOString()
    } else {
      updateData.completed_at = null
    }
  }
  if (updates.position !== undefined) {
    updateData.position = updates.position
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  // Habit edits carry a scope: 'habit' changes the whole habit (today + future),
  // 'instance' (default) keeps the change to that one day. Drags ignore this.
  const editScope: 'instance' | 'habit' = updates.editScope === 'habit' ? 'habit' : 'instance'

  try {
    // A habit interaction can target three identities; resolve all of them to the
    // parent habit id + the affected date (and the existing per-day row, if any):
    //  - virtual instance (synthetic id `${habitId}-${date}`) → task is the parent
    //  - materialized instance (real row with original_habit_id) → task is that row
    //  - the parent habit row itself (dated day)
    const parsedVirtual = parseHabitInstanceId(taskId)
    const lookupId = parsedVirtual ? parsedVirtual.originalHabitId : taskId
    const task = await db.getTaskById(lookupId)
    if (!task || task.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    let parentHabitId: string | null = null
    let instanceRow: any = null
    let instanceDate: string | null = null
    if (parsedVirtual) {
      parentHabitId = task.id
      instanceDate = parsedVirtual.date
    } else if (task.type === 'habit' && task.original_habit_id) {
      instanceRow = task
      parentHabitId = task.original_habit_id
      instanceDate = task.scheduled_date
    } else if (task.type === 'habit' && task.repeat_type) {
      parentHabitId = task.id
      instanceDate = task.scheduled_date
    }

    if (parentHabitId) {
      if (updateData.location !== undefined) {
        delete updateData.location
        if (Object.keys(updateData).length === 0) {
          return res.status(400).json({ error: 'No valid fields to update' })
        }
      }

      // DRAG (pure start_time/position): always a per-day override, never the parent.
      // The timeline dedup prefers the instance over the parent for the day. (#28)
      if (isPureDragUpdate(updateData)) {
        if (instanceRow) {
          const updated = await db.updateTask(instanceRow.id, updateData)
          return res.json(formatTaskResponse(updated, { isHabitInstance: true }))
        }
        // Omit `completed` so dragging a completed instance keeps it completed.
        const materialized = await db.createHabitInstance(parentHabitId, instanceDate!, userId, {
          ...(updateData.start_time !== undefined ? { start_time: updateData.start_time } : {}),
          ...(updateData.position !== undefined ? { position: updateData.position } : {}),
        })
        return res.json(formatTaskResponse(materialized, { isHabitInstance: true }))
      }

      // EDIT — WHOLE HABIT: update the parent so it applies to today + every future
      // virtual instance. Past completed/dragged days are their own rows and keep
      // their saved values ("freeze real history"). Don't write scheduled_date — a
      // recurring habit has no single date.
      if (editScope === 'habit') {
        const habitUpdate = { ...updateData }
        delete habitUpdate.scheduled_date
        const updatedHabit = await db.updateTask(parentHabitId, habitUpdate)
        return res.json(formatTaskResponse(updatedHabit, { isHabitInstance: false }))
      }

      // EDIT — THIS DAY ONLY: keep the change on a per-day instance.
      if (instanceRow) {
        const updated = await db.updateTask(instanceRow.id, updateData)
        return res.json(formatTaskResponse(updated, { isHabitInstance: true }))
      }
      // Virtual day or parent-row day: materialize an instance carrying the edits.
      const materialized = await db.createHabitInstance(
        parentHabitId,
        updateData.scheduled_date || instanceDate!,
        userId,
        {
          // Omit `completed` so editing a completed day keeps it completed.
          ...(updateData.start_time !== undefined ? { start_time: updateData.start_time } : {}),
          ...(updateData.title !== undefined ? { title: updateData.title } : {}),
          ...(updateData.category !== undefined ? { category: updateData.category } : {}),
          ...(updateData.duration !== undefined ? { duration: updateData.duration } : {}),
          ...(updateData.position !== undefined ? { position: updateData.position } : {}),
        }
      )
      return res.json(formatTaskResponse(materialized, { isHabitInstance: true }))
    }

    // Regular (non-habit) task update path. Normalize at the write boundary
    // (ADR-0002): giving a someday task a start_time with no date schedules it for
    // today (dragging out of the someday bucket onto a slot).
    if (updateData.start_time && updates.scheduledDate === undefined && !task.scheduled_date) {
      updateData.scheduled_date = new Date().toISOString().slice(0, 10)
    }
    let updatedTask = await db.updateTask(taskId, updateData)
    if (updatedTask.type === 'task') {
      updatedTask = await syncTaskRowToGoogle(updatedTask, clientTimeZone(req))
    }
    return res.json(formatTaskResponse(updatedTask, { isHabitInstance: false }))
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

// Batch-reorder untimed tasks (Anytime backlog)
router.patch('/reorder', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const parsed = ReorderBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'ids must be a non-empty array of strings' })
  }
  const { ids } = parsed.data

  try {
    const pairs = positionsFromIds(ids)
    // Owner-scoped batch write: db.reorderTasks filters each update by user_id so a
    // user can only reorder their own tasks (mirrors the ownership guard on PUT /:id).
    // ponytail: N parallel updates beats N serial; an rpc would be one call but adds a
    // migration dependency. Swap to rpc if contention matters.
    await db.reorderTasks(userId, pairs)
    res.json({ success: true, updated: pairs.length })
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

// Complete task
router.post('/complete/:id', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const taskId = req.params.id

  try {
    // Check if this is a virtual habit instance (format: originalId-date)
    const parsedInstance = parseHabitInstanceId(taskId)
    if (parsedInstance) {
      const { originalHabitId, date: fullDate } = parsedInstance
      console.log('Backend - Completing virtual habit instance:', { originalHabitId, date: fullDate, taskId })
      // Mark this date's instance complete (idempotent: updates an already-materialized
      // row in place, keeping any dragged time, instead of inserting an untimed dup).
      const habitInstance = await db.createHabitInstance(originalHabitId, fullDate, userId, { completed: true })
      res.json({
        id: habitInstance.id,
        title: habitInstance.title,
        type: habitInstance.type,
        category: habitInstance.category,
        startTime: habitInstance.start_time,
        duration: habitInstance.duration,
        location: habitInstance.location ?? null,
        repeat: habitInstance.repeat_type,
        completed: Boolean(habitInstance.completed),
        scheduledDate: habitInstance.scheduled_date,
        createdAt: habitInstance.created_at,
        originalHabitId: habitInstance.original_habit_id,
        rolledOverFromTaskId: habitInstance.rolled_over_from_task_id,
        originalCreatedAt: habitInstance.original_created_at
      })
    } else {
      // Handle regular task or existing habit instance completion (carried tasks are
      // real rows now — they complete here via the normal path, ADR-0002).
      const task = await db.updateTask(taskId, {
        completed: true,
        completed_at: new Date().toISOString()
      })

      res.json({
        id: task.id,
        title: task.title,
        type: task.type,
        category: task.category,
        startTime: task.start_time,
        duration: task.duration,
        location: task.location ?? null,
        repeat: task.repeat_type,
        completed: Boolean(task.completed),
        scheduledDate: task.scheduled_date,
        createdAt: task.created_at,
        originalHabitId: task.original_habit_id,
        rolledOverFromTaskId: task.rolled_over_from_task_id,
        originalCreatedAt: task.original_created_at
      })
    }
  } catch (error) {
    console.error('Backend - Error completing task:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

// Delete task
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const taskId = req.params.id
  const parsedBody = DeleteBody.safeParse(req.body ?? {})
  if (!parsedBody.success) {
    return res.status(400).json({ error: 'Invalid delete scope' })
  }
  const deleteScope = parsedBody.data.deleteScope ?? 'instance'

  try {
    const parsedVirtual = parseHabitInstanceId(taskId)
    const lookupId = parsedVirtual ? parsedVirtual.originalHabitId : taskId
    const task = await db.getTaskById(lookupId)
    if (!task || task.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (parsedVirtual) {
      if (task.type !== 'habit') {
        return res.status(400).json({ error: 'Task is not a recurring habit' })
      }
      if (deleteScope === 'habit') {
        const rows = await db.getHabitSeriesRows(task.id, userId)
        await deleteGoogleEventsForRows(userId, rows)
        await db.deleteHabitSeries(task.id, userId)
      } else {
        await db.softDeleteHabitInstance(task.id, parsedVirtual.date, userId)
      }
      return res.json({ success: true })
    }

    if (task.type === 'habit') {
      const parentHabitId = task.original_habit_id || task.id
      if (deleteScope === 'habit') {
        const rows = await db.getHabitSeriesRows(parentHabitId, userId)
        await deleteGoogleEventsForRows(userId, rows)
        await db.deleteHabitSeries(parentHabitId, userId)
      } else if (task.original_habit_id) {
        if (task.google_event_id) {
          await deleteGoogleCalendarEventIfConnected(userId, task.google_event_id)
        }
        await db.softDeleteTask(task.id)
      } else if (task.scheduled_date) {
        await db.softDeleteHabitInstance(parentHabitId, task.scheduled_date, userId)
      } else {
        return res.status(400).json({ error: 'Recurring habit delete requires a habit scope' })
      }
      return res.json({ success: true })
    }

    if (task.google_event_id) {
      await deleteGoogleCalendarEventIfConnected(userId, task.google_event_id)
    }
    await db.deleteTask(taskId)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

// Delete all tasks for a specific day or all tasks
router.delete('/', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { date } = req.query

  try {
    const tasks = await db.getTasksByUserId(userId, date as string | undefined)
    await Promise.all(
      tasks
        .filter((task: any) => task.google_event_id)
        .map((task: any) => deleteGoogleCalendarEventIfConnected(userId, task.google_event_id))
    )
    await db.deleteTasksByUserId(userId, date as string)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

// Mark tasks as overdue notified
router.patch('/overdue-notified', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { taskIds } = req.body
  
  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return res.status(400).json({ error: 'taskIds must be a non-empty array' })
  }
  
  try {
    await db.updateTasksOverdueNotified(userId, taskIds)
    res.json({ success: true, updated: taskIds.length })
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

export { router as taskRoutes }
