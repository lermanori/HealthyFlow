import express from 'express'
import { db } from '../supabase-client'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()

// Middleware to check if user is admin
const requireAdmin = (req: AuthRequest, res: any, next: any) => {
  const adminToken = req.headers['x-admin-token'] || req.query.adminToken
  
  if (adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Admin access required' })
  }
  
  next()
}

// Get all users with their task counts
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsers()
    
    // Only return user info, not tasks
    res.json(users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      created_at: user.created_at
    })))
  } catch (error) {
    console.error('Get users with stats error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

// Get user details with all their data
router.get('/users/:userId', requireAdmin, async (req, res) => {
  const { userId } = req.params
  
  try {
    const user = await db.getUserById(userId)
    const tasks = await db.getTasksByUserId(userId)
    const recommendations = await db.getRecommendationsByUserId(userId)
    
    res.json({
      user,
      tasks,
      recommendations,
      stats: {
        totalTasks: tasks.length,
        completedTasks: tasks.filter((task: any) => task.completed).length,
        totalRecommendations: recommendations.length
      }
    })
  } catch (error) {
    console.error('Get user details error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

// Delete user and all their data
router.delete('/users/:userId', requireAdmin, async (req, res) => {
  const { userId } = req.params
  
  try {
    // Delete user's tasks
    await db.deleteTasksByUserId(userId)
    
    // Delete user's recommendations
    await db.deleteRecommendationsByUserId(userId)
    
    // Delete user
    await db.deleteUser(userId)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

// Get system statistics
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsers()
    const allTasks = await Promise.all(
      users.map(user => db.getTasksByUserId(user.id))
    )
    
    const totalUsers = users.length
    const totalTasks = allTasks.flat().length
    const completedTasks = allTasks.flat().filter((task: any) => task.completed).length
    
    res.json({
      totalUsers,
      totalTasks,
      completedTasks,
      completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
      averageTasksPerUser: totalUsers > 0 ? totalTasks / totalUsers : 0
    })
  } catch (error) {
    console.error('Get stats error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

export { router as adminRoutes } 