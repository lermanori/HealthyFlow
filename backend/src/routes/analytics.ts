import express from 'express'
import { db } from '../supabase-client'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()

// Get productivity analytics
router.get('/productivity', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId
  const { days } = req.query

  try {
    const analytics = await db.getProductivityAnalytics(userId, Number(days) || 7)
    res.json(analytics)
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

// Get habit streaks
router.get('/streaks', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId

  try {
    const habits = await db.getHabitStreaks(userId)

    // Group by title and category to calculate streaks
    const habitGroups = habits.reduce((acc: any, habit: any) => {
      const key = `${habit.title}-${habit.category}`
      if (!acc[key]) {
        acc[key] = {
          title: habit.title,
          category: habit.category,
          completed_days: 0,
          total_days: 0,
          last_completed: null
        }
      }
      
      acc[key].total_days += 1
      if (habit.completed) {
        acc[key].completed_days += 1
        if (!acc[key].last_completed || habit.completed_at > acc[key].last_completed) {
          acc[key].last_completed = habit.completed_at
        }
      }
      
      return acc
    }, {})

    const streaks = Object.values(habitGroups).map((habit: any) => ({
      ...habit,
      streak: habit.completed_days, // Simplified streak calculation
      completion_rate: habit.total_days > 0 ? habit.completed_days / habit.total_days : 0
    }))

    res.json(streaks)
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

// Get time distribution
router.get('/time-distribution', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user.userId

  try {
    const distribution = await db.getTimeDistribution(userId)
    res.json(distribution)
  } catch (error) {
    res.status(500).json({ error: 'Database error' })
  }
})

export { router as analyticsRoutes }