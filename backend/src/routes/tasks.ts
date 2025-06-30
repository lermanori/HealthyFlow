import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/database'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()

// Get tasks
router.get('/', authenticateToken, (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { date } = req.query

  let query = 'SELECT * FROM tasks WHERE user_id = ?'
  const params = [userId]

  if (date) {
    // Filter by scheduled date
    query += ' AND (scheduled_date = ? OR scheduled_date IS NULL)'
    params.push(date)
  }

  query += ' ORDER BY start_time ASC, created_at ASC'

  db.all(query, params, (err, tasks) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' })
    }

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
      overdueNotified: Boolean(task.overdue_notified)
    }))

    res.json(formattedTasks)
  })
})

// Add task
router.post('/', authenticateToken, (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { title, type, category, startTime, duration, repeat, scheduledDate } = req.body

  const taskId = uuidv4()

  db.run(`
    INSERT INTO tasks (id, user_id, title, type, category, start_time, duration, repeat_type, scheduled_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [taskId, userId, title, type, category, startTime, duration, repeat, scheduledDate], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' })
    }

    res.json({
      id: taskId,
      title,
      type,
      category,
      startTime,
      duration,
      repeat,
      completed: false,
      scheduledDate,
      createdAt: new Date().toISOString()
    })
  })
})

// Update task
router.put('/:id', authenticateToken, (req: AuthRequest, res) => {
  const userId = req.user.userId
  const taskId = req.params.id
  const updates = req.body

  const fields = []
  const values = []

  if (updates.title !== undefined) {
    fields.push('title = ?')
    values.push(updates.title)
  }
  if (updates.startTime !== undefined) {
    fields.push('start_time = ?')
    values.push(updates.startTime)
  }
  if (updates.duration !== undefined) {
    fields.push('duration = ?')
    values.push(updates.duration)
  }
  if (updates.category !== undefined) {
    fields.push('category = ?')
    values.push(updates.category)
  }
  if (updates.scheduledDate !== undefined) {
    fields.push('scheduled_date = ?')
    values.push(updates.scheduledDate)
  }
  if (updates.completed !== undefined) {
    fields.push('completed = ?')
    values.push(updates.completed ? 1 : 0)
    
    // Update completed_at timestamp
    if (updates.completed) {
      fields.push('completed_at = ?')
      values.push(new Date().toISOString())
    } else {
      fields.push('completed_at = ?')
      values.push(null)
    }
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  values.push(userId, taskId)

  db.run(`
    UPDATE tasks SET ${fields.join(', ')} WHERE user_id = ? AND id = ?
  `, values, function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' })
    }

    // Return updated task
    db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task: any) => {
      if (err || !task) {
        return res.status(404).json({ error: 'Task not found' })
      }

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
        createdAt: task.created_at
      })
    })
  })
})

// Complete task
router.post('/complete/:id', authenticateToken, (req: AuthRequest, res) => {
  const userId = req.user.userId
  const taskId = req.params.id

  db.run(`
    UPDATE tasks SET completed = TRUE, completed_at = CURRENT_TIMESTAMP 
    WHERE user_id = ? AND id = ?
  `, [userId, taskId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' })
    }

    // Return updated task
    db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task: any) => {
      if (err || !task) {
        return res.status(404).json({ error: 'Task not found' })
      }

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
        createdAt: task.created_at
      })
    })
  })
})

// Delete task
router.delete('/:id', authenticateToken, (req: AuthRequest, res) => {
  const userId = req.user.userId
  const taskId = req.params.id

  db.run('DELETE FROM tasks WHERE user_id = ? AND id = ?', [userId, taskId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' })
    }

    res.json({ success: true })
  })
})

// Delete all tasks for a specific day or all tasks
router.delete('/', authenticateToken, (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { date } = req.query

  let query = 'DELETE FROM tasks WHERE user_id = ?'
  const params = [userId]

  if (date) {
    query += ' AND scheduled_date = ?'
    params.push(date)
  }

  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' })
    }
    res.json({ success: true })
  })
})

// Mark tasks as overdue notified
router.patch('/overdue-notified', authenticateToken, (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { taskIds } = req.body
  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return res.status(400).json({ error: 'taskIds must be a non-empty array' })
  }
  const placeholders = taskIds.map(() => '?').join(',')
  db.run(
    `UPDATE tasks SET overdue_notified = TRUE WHERE user_id = ? AND id IN (${placeholders})`,
    [userId, ...taskIds],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' })
      }
      res.json({ success: true, updated: this.changes })
    }
  )
})

export { router as taskRoutes }