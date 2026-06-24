import express from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../supabase-client'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ponytail: snake_case ↔ camelCase in one place, exactly what the frontend expects
const toClient = (row: any) => ({
  id: row.id,
  userId: row.user_id,
  date: row.date,
  name: row.name,
  calories: row.calories,
  protein: row.protein ?? null,
  carbs: row.carbs ?? null,
  fat: row.fat ?? null,
  quantity: row.quantity ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const CreateBody = z.object({
  date: z.string().regex(DATE_RE),
  name: z.string().min(1),
  calories: z.number().int().nonnegative(),
  protein: z.number().nonnegative().nullable().optional(),
  carbs: z.number().nonnegative().nullable().optional(),
  fat: z.number().nonnegative().nullable().optional(),
  quantity: z.string().nullable().optional(),
})

const UpdateBody = z.object({
  date: z.string().regex(DATE_RE).optional(),
  name: z.string().min(1).optional(),
  calories: z.number().int().nonnegative().optional(),
  protein: z.number().nonnegative().nullable().optional(),
  carbs: z.number().nonnegative().nullable().optional(),
  fat: z.number().nonnegative().nullable().optional(),
  quantity: z.string().nullable().optional(),
})

// GET /api/calories?date=YYYY-MM-DD
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  const date = req.query.date
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'A valid date query param (YYYY-MM-DD) is required' })
  }

  try {
    const rows = await db.getCalorieEntriesByDay(req.user.userId, date)
    res.json(rows.map(toClient))
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

// POST /api/calories
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = CreateBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const row = await db.createCalorieEntry({
      id: uuidv4(),
      user_id: req.user.userId,
      date: parsed.data.date,
      name: parsed.data.name,
      calories: parsed.data.calories,
      protein: parsed.data.protein ?? null,
      carbs: parsed.data.carbs ?? null,
      fat: parsed.data.fat ?? null,
      quantity: parsed.data.quantity ?? null,
    })
    res.status(201).json(toClient(row))
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

// PATCH /api/calories/:id
router.patch('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = UpdateBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const existing = await db.getCalorieEntryById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })

    const updates: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() }

    const row = await db.updateCalorieEntry(req.params.id, updates)
    res.json(toClient(row))
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

// DELETE /api/calories/:id
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const existing = await db.getCalorieEntryById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })

    await db.deleteCalorieEntry(req.params.id)
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

export { router as caloriesRoutes }
