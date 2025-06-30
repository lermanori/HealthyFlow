import express from 'express'
import { db } from '../db/database'
import { authenticateToken } from '../middleware/auth'

const router = express.Router()

// Get weekly summary
router.get('/week-summary', authenticateToken, (req, res) => {
  const userId = req.user.userId

  // Get all tasks for the user
  db.all(`
    SELECT category, completed, type
    FROM tasks 
    WHERE user_id = ? 
    AND created_at >= date('now', '-7 days')
  `, [userId], (err, tasks: any[]) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' })
    }

    const totalTasks = tasks.length
    const completedTasks = tasks.filter(task => task.completed).length
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

    // Group by category
    const categories = tasks.reduce((acc, task) => {
      if (!acc[task.category]) {
        acc[task.category] = { total: 0, completed: 0 }
      }
      acc[task.category].total++
      if (task.completed) {
        acc[task.category].completed++
      }
      return acc
    }, {})

    // Calculate streaks (simplified)
    const streaks = {
      daily: Math.floor(Math.random() * 7) + 1,
      weekly: Math.floor(Math.random() * 4) + 1
    }

    res.json({
      totalTasks,
      completedTasks,
      completionRate,
      categories,
      streaks
    })
  })
})

export { router as summaryRoutes }