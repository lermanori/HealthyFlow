import express from 'express'
import { z } from 'zod'
import { ApiTokenAudienceSchema, ApiTokens, ApiTokenScopeSchema } from '../api-tokens'
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

const CreateApiTokenBody = z.object({
  name: z.string().trim().min(1).max(80).default('MCP token'),
  scopes: z.array(ApiTokenScopeSchema).min(1).default(['hf:read']),
  audience: ApiTokenAudienceSchema.default('mcp'),
})

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

router.get('/connections/tokens', authenticateToken, async (req: AuthRequest, res) => {
  try {
    res.json(await ApiTokens.list(req.user.userId))
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

router.post('/connections/tokens', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = CreateApiTokenBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })

  try {
    const created = await ApiTokens.create(req.user.userId, parsed.data)
    res.status(201).json(created)
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

router.delete('/connections/tokens/:tokenId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const revoked = await ApiTokens.revoke(req.user.userId, req.params.tokenId)
    if (!revoked) return res.status(404).json({ error: 'Not found' })
    res.json(revoked)
  } catch (err) {
    res.status(500).json({ error: 'Database error' })
  }
})

export { router as settingsRoutes }
