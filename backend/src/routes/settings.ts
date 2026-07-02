import express from 'express'
import { z } from 'zod'
import { db } from '../supabase-client'
import { authenticateToken, AuthRequest } from '../middleware/auth'

// Zod as single source of truth: schema defines shape + defaults for settings
export const SettingsSchema = z.object({
  notifications: z.boolean().default(true),
  dailyReminders: z.boolean().default(true),
  weeklyReports: z.boolean().default(true),
  aiSuggestions: z.boolean().default(true),
  smartReminders: z.boolean().default(true),
  completionSounds: z.boolean().default(true),
  calorieIntake: z.boolean().default(false),
  achievementTracker: z.boolean().default(false),
  weekStartsOn: z.number().int().min(0).max(6).default(1),
  onboardingStatus: z.enum(['active', 'completed', 'skipped']).default('completed'),
})
export type Settings = z.infer<typeof SettingsSchema>

// .partial() on a schema with .default() still fills in defaults for omitted keys,
// so the PATCH contract is defined separately on plain booleans (no defaults).
const PatchBody = z.object({
  notifications: z.boolean(),
  dailyReminders: z.boolean(),
  weeklyReports: z.boolean(),
  aiSuggestions: z.boolean(),
  smartReminders: z.boolean(),
  completionSounds: z.boolean(),
  calorieIntake: z.boolean(),
  achievementTracker: z.boolean(),
  weekStartsOn: z.number().int().min(0).max(6),
  onboardingStatus: z.enum(['active', 'completed', 'skipped']),
}).partial().strict()

const router = express.Router()

// GET /api/settings
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const stored = await db.getUserSettings(req.user.userId)
    res.json(SettingsSchema.parse(stored))
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

// PATCH /api/settings
router.patch('/', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = PatchBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const stored = await db.upsertUserSettings(req.user.userId, parsed.data)
    res.json(SettingsSchema.parse(stored))
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

export { router as settingsRoutes }
