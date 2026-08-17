import { z } from 'zod'
import { PlanningWindowSchema } from './day-summary-schema'

export const ModuleSettingKeySchema = z.enum([
  'calorieIntake',
  'achievementTracker',
  'workoutTracker',
])

export const WeekStartsOnSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
])

/**
 * The Planning window a new account starts with.
 *
 * Capacity is the day contract's most distinctive read and cannot be computed
 * without a window, so defaulting to `null` meant every new account saw no
 * Capacity at all until it found a Settings toggle it had no reason to look for.
 *
 * This is a declared, editable assumption rather than a guess — the rule that
 * Capacity never invents a number still holds. Today always renders the window
 * it computed against ("08:00–18:00 window · … known load"), and Settings can
 * change it or clear it back to `null`, which returns Capacity to `unavailable`
 * with `planning_window_missing`.
 *
 * The value matches what the Settings toggle has always enabled, so turning
 * Capacity off and on again yields the same window as the default.
 */
export const DEFAULT_PLANNING_WINDOW: z.infer<typeof PlanningWindowSchema> = {
  startTime: '08:00',
  endTime: '18:00',
  transitionBufferMinutes: 15,
}

export const SettingsSchema = z.object({
  notifications: z.boolean().default(true),
  dailyReminders: z.boolean().default(true),
  weeklyReports: z.boolean().default(true),
  aiSuggestions: z.boolean().default(true),
  smartReminders: z.boolean().default(true),
  completionSounds: z.boolean().default(true),
  calorieIntake: z.boolean().default(true),
  achievementTracker: z.boolean().default(true),
  workoutTracker: z.boolean().default(true),
  weekStartsOn: WeekStartsOnSchema.default(1),
  planningWindow: PlanningWindowSchema.nullable().default(DEFAULT_PLANNING_WINDOW),
  onboardingStatus: z.enum(['active', 'completed', 'skipped']).default('completed'),
  theme: z.enum(['midnight', 'white']).default('midnight'),
})

// .partial() on a schema with .default() fills omitted fields. Define PATCH
// independently so an update only persists fields the caller sent.
export const SettingsPatchSchema = z.object({
  notifications: z.boolean(),
  dailyReminders: z.boolean(),
  weeklyReports: z.boolean(),
  aiSuggestions: z.boolean(),
  smartReminders: z.boolean(),
  completionSounds: z.boolean(),
  calorieIntake: z.boolean(),
  achievementTracker: z.boolean(),
  workoutTracker: z.boolean(),
  weekStartsOn: WeekStartsOnSchema,
  planningWindow: PlanningWindowSchema.nullable(),
  onboardingStatus: z.enum(['active', 'completed', 'skipped']),
  theme: z.enum(['midnight', 'white']),
}).partial().strict()

export type ModuleSettingKey = z.infer<typeof ModuleSettingKeySchema>
export type Settings = z.infer<typeof SettingsSchema>

const SettingsContracts = {
  ModuleSettingKeySchema,
  WeekStartsOnSchema,
  SettingsSchema,
  SettingsPatchSchema,
  DEFAULT_PLANNING_WINDOW,
}

export default SettingsContracts
