import express from 'express'
import { db } from '../db/database'
import { authenticateToken } from '../middleware/auth'

const router = express.Router()

// Get productivity analytics
router.get('/productivity', authenticateToken, (req, res) => {
  const userId = req.user.userId
  const { period = '7' } = req.query // days

  const query = `
    SELECT 
      DATE(created_at) as date,
      category,
      type,
      COUNT(*) as total_tasks,
      SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed_tasks,
      AVG(CASE WHEN completed = 1 THEN 1.0 ELSE 0.0 END) as completion_rate
    FROM tasks 
    WHERE user_id = ? 
    AND created_at >= date('now', '-' || ? || ' days')
    GROUP BY DATE(created_at), category, type
    ORDER BY date DESC
  `

  db.all(query, [userId, period], (err, rows: any[]) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' })
    }

    // Process data for charts
    const dailyStats = rows.reduce((acc, row) => {
      if (!acc[row.date]) {
        acc[row.date] = {
          date: row.date,
          total: 0,
          completed: 0,
          categories: {}
        }
      }
      
      acc[row.date].total += row.total_tasks
      acc[row.date].completed += row.completed_tasks
      acc[row.date].categories[row.category] = {
        total: row.total_tasks,
        completed: row.completed_tasks,
        rate: row.completion_rate
      }
      
      return acc
    }, {})

    res.json({
      dailyStats: Object.values(dailyStats),
      summary: {
        totalTasks: rows.reduce((sum, row) => sum + row.total_tasks, 0),
        completedTasks: rows.reduce((sum, row) => sum + row.completed_tasks, 0),
        averageCompletionRate: rows.length > 0 
          ? rows.reduce((sum, row) => sum + row.completion_rate, 0) / rows.length 
          : 0
      }
    })
  })
})

// Get habit streaks
router.get('/streaks', authenticateToken, (req, res) => {
  const userId = req.user.userId

  const query = `
    SELECT 
      title,
      category,
      COUNT(CASE WHEN completed = 1 THEN 1 END) as completed_days,
      COUNT(*) as total_days,
      MAX(CASE WHEN completed = 1 THEN DATE(completed_at) END) as last_completed
    FROM tasks 
    WHERE user_id = ? 
    AND type = 'habit'
    AND created_at >= date('now', '-30 days')
    GROUP BY title, category
    ORDER BY completed_days DESC
  `

  db.all(query, [userId], (err, habits: any[]) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' })
    }

    const streaks = habits.map(habit => ({
      ...habit,
      streak: habit.completed_days, // Simplified streak calculation
      completion_rate: habit.total_days > 0 ? habit.completed_days / habit.total_days : 0
    }))

    res.json(streaks)
  })
})

// Get time distribution
router.get('/time-distribution', authenticateToken, (req, res) => {
  const userId = req.user.userId

  const query = `
    SELECT 
      category,
      SUM(duration) as total_minutes,
      COUNT(*) as task_count,
      AVG(duration) as avg_duration
    FROM tasks 
    WHERE user_id = ? 
    AND completed = 1
    AND created_at >= date('now', '-7 days')
    GROUP BY category
    ORDER BY total_minutes DESC
  `

  db.all(query, [userId], (err, distribution: any[]) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' })
    }

    const totalMinutes = distribution.reduce((sum, cat) => sum + cat.total_minutes, 0)
    
    const result = distribution.map(cat => ({
      ...cat,
      percentage: totalMinutes > 0 ? (cat.total_minutes / totalMinutes) * 100 : 0,
      hours: Math.round(cat.total_minutes / 60 * 10) / 10
    }))

    res.json(result)
  })
})

export { router as analyticsRoutes }