import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../supabase-client'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()

// Get tasks
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { date } = req.query

  console.log('Backend - Getting tasks for date:', date)
  console.log('Backend - User ID:', userId)

  try {
    let tasks;
    
    if (date) {
      // Use the enhanced function that handles recurring habits
      tasks = await db.getTasksWithRecurringHabits(userId, date as string)
    } else {
      // If no date specified, get all tasks
      tasks = await db.getTasksByUserId(userId)
    }

    console.log('Backend - Raw tasks from database:', tasks)
    console.log('Backend - Number of tasks found:', tasks.length)

    const formattedTasks = tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      type: task.type,
      category: task.category,
      startTime: task.start_time,
      duration: task.duration,
      repeat: task.repeat_type,
      completed: Boolean(task.completed),
      scheduledDate: task.scheduled_date,
      createdAt: task.created_at,
      overdueNotified: Boolean(task.overdue_notified),
      isHabitInstance: Boolean(task.is_habit_instance),
      originalHabitId: task.original_habit_id
    }))

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
  const { title, type, category, startTime, duration, repeat, scheduledDate } = req.body

  console.log('Backend - Adding task with scheduledDate:', scheduledDate)
  console.log('Backend - Task details:', { title, type, category, startTime, duration, repeat, scheduledDate })

  try {
    const taskData = {
      id: uuidv4(),
      user_id: userId,
      title,
      type,
      category,
      start_time: startTime,
      duration,
      repeat_type: repeat,
      scheduled_date: scheduledDate
    }

    const task = await db.createTask(taskData)

    res.json({
      id: task.id,
      title: task.title,
      type: task.type,
      category: task.category,
      startTime: task.start_time,
      duration: task.duration,
      repeat: task.repeat_type,
      completed: false,
      scheduledDate: task.scheduled_date,
      createdAt: task.created_at
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

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  try {
    // Only update if the task belongs to the user
    const task = await db.getTaskById(taskId)
    if (!task || task.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const updatedTask = await db.updateTask(taskId, updateData)

    res.json({
      id: updatedTask.id,
      title: updatedTask.title,
      type: updatedTask.type,
      category: updatedTask.category,
      startTime: updatedTask.start_time,
      duration: updatedTask.duration,
      repeat: updatedTask.repeat_type,
      completed: Boolean(updatedTask.completed),
      scheduledDate: updatedTask.scheduled_date,
      createdAt: updatedTask.created_at
    })
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
    if (taskId.includes('-') && taskId.match(/^[^-]+-\d{4}-\d{2}-\d{2}$/)) {
      const [originalHabitId, date] = taskId.split('-').slice(0, 2)
      const fullDate = taskId.split('-').slice(1).join('-') // In case date has multiple dashes
      
      console.log('Backend - Completing virtual habit instance:', { originalHabitId, date: fullDate, taskId })
      
      // Create a real habit instance for this date
      const habitInstance = await db.createHabitInstance(originalHabitId, fullDate, userId)
      
      res.json({
        id: habitInstance.id,
        title: habitInstance.title,
        type: habitInstance.type,
        category: habitInstance.category,
        startTime: habitInstance.start_time,
        duration: habitInstance.duration,
        repeat: habitInstance.repeat_type,
        completed: Boolean(habitInstance.completed),
        scheduledDate: habitInstance.scheduled_date,
        createdAt: habitInstance.created_at,
        originalHabitId: habitInstance.original_habit_id
      })
    } else {
      // Handle regular task or existing habit instance completion
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
        repeat: task.repeat_type,
        completed: Boolean(task.completed),
        scheduledDate: task.scheduled_date,
        createdAt: task.created_at,
        originalHabitId: task.original_habit_id
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

  try {
    // Only delete if the task belongs to the user
    const task = await db.getTaskById(taskId)
    if (!task || task.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' })
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

// Rollover incomplete tasks from previous day
router.post('/rollover', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { fromDate, toDate } = req.body

  console.log('Backend - Rolling over tasks from', fromDate, 'to', toDate)

  try {
    // Get incomplete tasks from the previous day
    const incompleteTasks = await db.getTasksByUserId(userId, fromDate)
    const tasksToRollover = incompleteTasks.filter((task: any) => !task.completed && task.type === 'task')

    // Get all tasks for the target day to check for duplicates
    const nextDayTasks = await db.getTasksByUserId(userId, toDate)

    console.log('Rollover - FULL nextDayTasks:', JSON.stringify(nextDayTasks, null, 2))
    console.log('Rollover - Next day tasks (summary):', nextDayTasks.map((t: any) => ({ id: t.id, title: t.title, rolled_over_from_task_id: t.rolled_over_from_task_id })))

    // Improved duplicate check: prevent rollover if any next day task has rolled_over_from_task_id equal to this task's id OR to this task's rolled_over_from_task_id (if it exists)
    const rolloverPromises = tasksToRollover.map(async (task: any) => {
      console.log(`Rollover - Checking task id ${task.id} (${task.title}): task.rolled_over_from_task_id=${task.rolled_over_from_task_id}`)
      const alreadyExists = nextDayTasks.some((t: any) =>
        t.rolled_over_from_task_id === task.id ||
        (task.rolled_over_from_task_id && t.rolled_over_from_task_id === task.rolled_over_from_task_id)
      )
      console.log(`Rollover - Checking task id ${task.id} (${task.title}): alreadyExists=${alreadyExists}`)
      if (!alreadyExists) {
        console.log(`Rollover - Creating rollover for task id ${task.id} (${task.title})`)
        return db.createTask({
          user_id: userId,
          title: task.title,
          type: task.type,
          category: task.category,
          start_time: task.start_time,
          duration: task.duration,
          repeat_type: task.repeat_type,
          scheduled_date: toDate,
          completed: false,
          rolled_over_from_task_id: task.rolled_over_from_task_id || task.id
        })
      }
      return null
    })

    const rolledOverTasks = (await Promise.all(rolloverPromises)).filter(Boolean)

    console.log('Backend - Successfully rolled over', rolledOverTasks.length, 'tasks')
    if (rolledOverTasks.length > 0) {
      console.log('Rollover - New rolled over tasks:', rolledOverTasks.map((t: any) => ({ id: t.id, title: t.title, rolled_over_from_task_id: t.rolled_over_from_task_id })))
    }

    res.json({
      success: true,
      message: `Rolled over ${rolledOverTasks.length} incomplete tasks`,
      rolledOverTasks: rolledOverTasks.length
    })
  } catch (error) {
    console.error('Backend - Error rolling over tasks:', error)
    res.status(500).json({ error: 'Failed to rollover tasks' })
  }
})

export { router as taskRoutes }