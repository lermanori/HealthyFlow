import express from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../supabase-client'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()

// ponytail: snake_case ↔ camelCase in one place, exactly what the frontend expects
const toClient = (row: any) => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  description: row.description ?? null,
  color: row.color,
  isArchived: row.is_archived,
  createdAt: row.created_at,
})

const CreateBody = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  description: z.string().optional(),
  isArchived: z.boolean().optional(),
})

const UpdateBody = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  description: z.string().nullable().optional(),
  isArchived: z.boolean().optional(),
})

// GET /api/projects
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const rows = await db.getProjectsByUserId(req.user.userId)
    res.json(rows.map(toClient))
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

// POST /api/projects
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = CreateBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const row = await db.createProject({
      id: uuidv4(),
      user_id: req.user.userId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      color: parsed.data.color,
      is_archived: parsed.data.isArchived ?? false,
    })
    res.status(201).json(toClient(row))
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

// PUT /api/projects/:id
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = UpdateBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const existing = await db.getProjectById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })

    const updates: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.color !== undefined) updates.color = parsed.data.color
    if (parsed.data.description !== undefined) updates.description = parsed.data.description
    if (parsed.data.isArchived !== undefined) updates.is_archived = parsed.data.isArchived

    const row = await db.updateProject(req.params.id, updates)
    res.json(toClient(row))
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

// DELETE /api/projects/:id
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const existing = await db.getProjectById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })

    await db.deleteProject(req.params.id)
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

// PATCH /api/projects/:id/archive
router.patch('/:id/archive', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const existing = await db.getProjectById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })

    const row = await db.updateProject(req.params.id, { is_archived: true })
    res.json(toClient(row))
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

export { router as projectRoutes }
