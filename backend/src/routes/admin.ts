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
  SetCloudAccessSchema,
  setCloudAccess,
} from '../account-data'
import {
  ContactMessageListSchema,
  ContactMessageSchema,
} from '../contact-message-contracts'

const router = express.Router()

// Each route answers on its /admin/* path and on the /admin/token-manager/*
// path it had before the screen became Admin (#298): an iPhone build installed
// before that change still calls the old one. Drop the old paths once every
// supported build uses the new ones.
const paths = (path: string) => [path, `/token-manager${path}`]

const SetBalanceSchema = z.object({
  // The balance the administrator was shown. Required: a blind overwrite is
  // exactly what swallowed spends and grants that landed after the page loaded.
  expectedBalance: z.number().int().min(0),
  balance: z.number().int().min(0).max(100_000),
  note: z.string().trim().max(300).optional(),
})

const ContactMessageStatusQuerySchema = z.object({
  status: z.enum(['pending', 'handled', 'all']).default('pending'),
})

const ContactMessageUpdateSchema = z.object({
  status: z.enum(['pending', 'handled']),
})

router.get(paths('/overview'), authenticateToken, requireAdminRole, async (req, res) => {
  try {
    const overview = await Credits.getAdminOverview()
    res.json(overview)
  } catch (error) {
    console.error('Admin overview error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.get(paths('/contact-messages'), authenticateToken, requireAdminRole, async (req, res) => {
  const parsed = ContactMessageStatusQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const messages = await db.getContactMessages(parsed.data.status)
    res.json(ContactMessageListSchema.parse(messages))
  } catch (error) {
    console.error('Contact messages error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.patch(paths('/contact-messages/:messageId'), authenticateToken, requireAdminRole, async (req: AuthRequest, res) => {
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
    res.json(ContactMessageSchema.parse(message))
  } catch (error) {
    console.error('Update contact message error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.patch(paths('/users/:userId/balance'), authenticateToken, requireAdminRole, async (req: AuthRequest, res) => {
  const parsed = SetBalanceSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const result = await Credits.setBalance(req.params.userId, {
      expected: parsed.data.expectedBalance,
      balance: parsed.data.balance,
      actorId: req.user.userId,
      note: parsed.data.note || null,
    })
    if (result.status === 'conflict') {
      return res.status(409).json({
        error: 'The balance changed since it was shown. Nothing was changed.',
        reason: 'balance_changed',
        currentBalance: result.currentBalance,
      })
    }
    return res.json({ balance: result.balance, delta: result.delta })
  } catch (error) {
    console.error('Set action balance error:', error)
    return res.status(500).json({ error: 'Database error' })
  }
})

/**
 * Grant or revoke Cloud for one account.
 *
 * The entitlement is what `CloudAccess.require` checks on every sync, so this is
 * the switch that decides whether an account's day replicates to the server at
 * all. v1 sells no Cloud (ADR-0019); this exists so the legacy founder exception
 * is an operator action with an audit trail rather than a hand-edited row.
 */
router.patch(paths('/users/:userId/cloud'), authenticateToken, requireAdminRole, async (req: AuthRequest, res) => {
  const parsed = SetCloudAccessSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    return res.json(await setCloudAccess(req.user.userId, req.params.userId, parsed.data.active))
  } catch (error) {
    if (error instanceof AdminUserControlError) {
      return res.status(error.status).json({ error: error.message, reason: error.code })
    }
    console.error('Set Cloud access error:', error)
    return res.status(500).json({ error: 'Database error' })
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

export { router as adminRoutes }
