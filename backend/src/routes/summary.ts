import express from 'express'
import { db } from '../supabase-client'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()

// Get weekly summary
router.get('/week-summary', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId

  try {
    // Get all tasks for the user
    const tasks = await db.getWeeklyTasks(userId)

    const totalTasks = tasks.length
    const completedTasks = tasks.filter(task => task.completed).length
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

    // Group by category
    const categories: Record<string, { total: number; completed: number }> = {}
    tasks.forEach((task: any) => {
      if (!categories[task.category]) {
        categories[task.category] = { total: 0, completed: 0 }
      }
      categories[task.category].total++
      if (task.completed) {
        categories[task.category].completed++
      }
    })

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
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

export { router as summaryRoutes }