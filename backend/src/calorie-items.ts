import { db } from './supabase-client'
import { z } from 'zod'

/**
 * Calorie item service - tracks usage of reusable calorie items
 */

export const CalorieItemSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  name: z.string(),
  normalized_name: z.string(),
  quantity: z.string().nullable().default(null),
  normalized_quantity: z.string().default(''),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative().nullable(),
  carbs: z.number().nonnegative().nullable(),
  fat: z.number().nonnegative().nullable(),
  usage_count: z.number().nonnegative(),
  last_used_at: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type CalorieItem = z.infer<typeof CalorieItemSchema>

/**
 * Get most-used calorie items for a user
 */
export async function getMostUsedCalorieItems(userId: string, limit: number = 10): Promise<CalorieItem[]> {
  const items = await db.getMostUsedCalorieItems(userId, limit)
  return items.map(item => CalorieItemSchema.parse(item))
}

/**
 * Get recently-used calorie items for a user
 */
export async function getRecentCalorieItems(userId: string, limit: number = 10): Promise<CalorieItem[]> {
  const items = await db.getRecentCalorieItems(userId, limit)
  return items.map(item => CalorieItemSchema.parse(item))
}

/**
 * Get a calorie item by normalized name
 */
export async function getCalorieItemByName(userId: string, name: string): Promise<CalorieItem | null> {
  const normalizedName = name.trim().toLowerCase()
  const item = await db.getCalorieItemByNormalizedName(userId, normalizedName)
  if (!item) return null
  return CalorieItemSchema.parse(item)
}
