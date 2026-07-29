import express from 'express'
import { z } from 'zod'
import { db } from '../supabase-client'
import { Credits } from '../credits'
import { authenticateToken, requireAdminRole, AuthRequest } from '../middleware/auth'
import {
  AdminUserBatchActionInputSchema,
  AdminUserControlError,
  AdminUserDeletionInputSchema,
  AdminUserDeletionPreviewInputSchema,
  applyAdminUserAction,
  deleteManagedTestUsers,
  listAdminUserAudit,
  listManagedUsers,
  previewAdminUserDeletion,
} from '../account-data'

const router = express.Router()

const SetBalanceSchema = z.object({
  balance: z.number().int().min(0),
})

const BillingSettingsSchema = z.object({
  markupRate: z.number().min(0).max(10),
  minMarkupTokens: z.number().int().min(0),
})

const SubscriptionPricingSchema = z.object({
  promoActive: z.boolean(),
})

const SubscriptionUpdateSchema = z.object({
  active: z.boolean(),
  grantMonthlyCredits: z.boolean().default(true),
})

const TopUpSchema = z.object({
  dollars: z.number().positive().max(100),
})

const ContactMessageStatusQuerySchema = z.object({
  status: z.enum(['pending', 'handled', 'all']).default('pending'),
})

const ContactMessageUpdateSchema = z.object({
  status: z.enum(['pending', 'handled']),
})

router.get('/token-manager/overview', authenticateToken, requireAdminRole, async (req, res) => {
  try {
    const overview = await Credits.getTokenManagerOverview()
    res.json(overview)
  } catch (error) {
    console.error('Token manager overview error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.get('/token-manager/contact-messages', authenticateToken, requireAdminRole, async (req, res) => {
  const parsed = ContactMessageStatusQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const messages = await db.getContactMessages(parsed.data.status)
    res.json(messages)
  } catch (error) {
    console.error('Contact messages error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.patch('/token-manager/contact-messages/:messageId', authenticateToken, requireAdminRole, async (req: AuthRequest, res) => {
  const parsed = ContactMessageUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const message = await db.updateContactMessageStatus(
      req.params.messageId,
      parsed.data.status,
      parsed.data.status === 'handled' ? req.user.userId : null
    )
    res.json(message)
  } catch (error) {
    console.error('Update contact message error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.patch('/token-manager/users/:userId/balance', authenticateToken, requireAdminRole, async (req, res) => {
  const parsed = SetBalanceSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const result = await Credits.setBalance(req.params.userId, parsed.data.balance)
    res.json(result)
  } catch (error) {
    console.error('Set token balance error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.patch('/token-manager/settings', authenticateToken, requireAdminRole, async (req, res) => {
  const parsed = BillingSettingsSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const settings = await Credits.updateBillingSettings(parsed.data)
    res.json(settings)
  } catch (error) {
    console.error('Update billing settings error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.patch('/token-manager/subscription-pricing', authenticateToken, requireAdminRole, async (req, res) => {
  const parsed = SubscriptionPricingSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const settings = await Credits.updateSubscriptionPricing(parsed.data)
    res.json(settings)
  } catch (error) {
    console.error('Update subscription pricing error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.patch('/token-manager/users/:userId/subscription', authenticateToken, requireAdminRole, async (req, res) => {
  const parsed = SubscriptionUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const result = await Credits.activateSubscription(req.params.userId, parsed.data)
    res.json(result)
  } catch (error) {
    console.error('Update subscription error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.post('/token-manager/users/:userId/top-up', authenticateToken, requireAdminRole, async (req, res) => {
  const parsed = TopUpSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const result = await Credits.grantTopUp(req.params.userId, parsed.data.dollars)
    res.status(201).json(result)
  } catch (error) {
    console.error('Grant top-up error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.get('/users', authenticateToken, requireAdminRole, async (req: AuthRequest, res) => {
  try {
    return res.json(await listManagedUsers(req.user.userId))
  } catch (error) {
    console.error('List managed users error:', error)
    return res.status(500).json({ error: 'Could not load users' })
  }
})

router.get('/users/audit', authenticateToken, requireAdminRole, async (req: AuthRequest, res) => {
  try {
    return res.json(await listAdminUserAudit(req.user.userId))
  } catch (error) {
    console.error('List admin user audit error:', error)
    return res.status(500).json({ error: 'Could not load user audit log' })
  }
})

router.patch('/users', authenticateToken, requireAdminRole, async (req: AuthRequest, res) => {
  const parsed = AdminUserBatchActionInputSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    return res.json(await applyAdminUserAction(req.user.userId, parsed.data))
  } catch (error) {
    if (error instanceof AdminUserControlError) {
      return res.status(error.status).json({ error: error.message, reason: error.code })
    }
    console.error('Update managed users error:', error)
    return res.status(500).json({ error: 'Could not update users' })
  }
})

router.post('/users/deletion-preview', authenticateToken, requireAdminRole, async (req: AuthRequest, res) => {
  const parsed = AdminUserDeletionPreviewInputSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    return res.json(await previewAdminUserDeletion(req.user.userId, parsed.data.userIds))
  } catch (error) {
    if (error instanceof AdminUserControlError) {
      return res.status(error.status).json({ error: error.message, reason: error.code })
    }
    console.error('Preview managed user deletion error:', error)
    return res.status(500).json({ error: 'Could not preview user deletion' })
  }
})

router.delete('/users', authenticateToken, requireAdminRole, async (req: AuthRequest, res) => {
  const parsed = AdminUserDeletionInputSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const result = await deleteManagedTestUsers(req.user.userId, parsed.data)
    return res.status(result.failures.length > 0 ? 207 : 200).json(result)
  } catch (error) {
    if (error instanceof AdminUserControlError) {
      return res.status(error.status).json({ error: error.message, reason: error.code })
    }
    console.error('Delete managed users error:', error)
    return res.status(500).json({ error: 'Could not delete users' })
  }
})

// Get system statistics
router.get('/stats', authenticateToken, requireAdminRole, async (req, res) => {
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
