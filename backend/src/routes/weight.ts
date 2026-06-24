import express from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../supabase-client'
import { authenticateToken, AuthRequest } from '../middleware/auth'

const router = express.Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const toClient = (row: any) => ({
  id: row.id,
  userId: row.user_id,
  date: row.date,
  weightKg: Number(row.weight_kg),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const Body = z.object({
  date: z.string().regex(DATE_RE),
  weightKg: z.number().positive(),
})

const PatchBody = Body.partial()

const LimitQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

router.get('/recent', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = LimitQuery.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const rows = await db.getRecentWeightEntries(req.user.userId, parsed.data.limit)
    const entries = rows.map(toClient).reverse()
    const latest = entries[entries.length - 1] ?? null
    const previous = entries[entries.length - 2] ?? null
    const deltaKg = latest && previous ? latest.weightKg - previous.weightKg : null

    res.json({ entries, latest, previous, deltaKg })
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  const date = req.query.date
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'A valid date query param (YYYY-MM-DD) is required' })
  }

  try {
    const row = await db.getWeightEntryByDay(req.user.userId, date)
    res.json(row ? toClient(row) : null)
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = Body.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const existing = await db.getWeightEntryByDay(req.user.userId, parsed.data.date)
    if (existing) return res.status(409).json({ error: 'Weight already logged for this date' })

    const row = await db.createWeightEntry({
      id: uuidv4(),
      user_id: req.user.userId,
      date: parsed.data.date,
      weight_kg: parsed.data.weightKg,
    })
    res.status(201).json(toClient(row))
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

router.patch('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = PatchBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const existing = await db.getWeightEntryById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (parsed.data.date !== undefined) updates.date = parsed.data.date
    if (parsed.data.weightKg !== undefined) updates.weight_kg = parsed.data.weightKg

    const row = await db.updateWeightEntry(req.params.id, updates)
    res.json(toClient(row))
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const existing = await db.getWeightEntryById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })

    await db.deleteWeightEntry(req.params.id)
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

export { router as weightRoutes }
