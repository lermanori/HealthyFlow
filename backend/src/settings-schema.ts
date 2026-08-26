import { z } from 'zod'
import { PlanningWindowSchema } from './day-summary-schema'
import { GoalContextSchema } from './goals-schema'
import { HabitHistoryContextSchema } from './habit-contracts'

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

export const AssistantResponseStyleSchema = z.enum(['concise', 'balanced', 'detailed'])
export const AssistantPlanningStyleSchema = z.enum(['one_step_at_a_time', 'guided', 'direct'])
export const AssistantFollowUpModeSchema = z.enum(['ask_about_outcomes', 'only_when_asked'])

/**
 * User-owned context for Talk.
 *
 * This is intentionally small and structured. It is not hidden model memory:
 * Settings control communication behavior, while Goals carry free-speech
 * direction. Items, Projects and the Daily Plan remain the source of truth for
 * what is planned or completed.
 */
const AssistantProfileFieldsSchema = z.object({
  preferredName: z.string().trim().min(1).max(80).nullable().default(null),
  responseStyle: AssistantResponseStyleSchema.default('concise'),
  planningStyle: AssistantPlanningStyleSchema.default('one_step_at_a_time'),
  followUpMode: AssistantFollowUpModeSchema.default('ask_about_outcomes'),
})

export const AssistantProfileSchema = AssistantProfileFieldsSchema.prefault({})
export const AssistantProfilePatchSchema = AssistantProfileFieldsSchema.strict()

export const DEFAULT_ASSISTANT_PROFILE = AssistantProfileSchema.parse({})

/** A bounded snapshot sent with a Talk turn so Local-first sessions work too. */
export const AssistantContextSchema = z.object({
  ownerName: z.string().trim().min(1).max(80).nullable().default(null),
  profile: AssistantProfileSchema,
  goals: GoalContextSchema,
  habitHistory: HabitHistoryContextSchema.default({ status: 'unavailable' }),
}).strict()

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
  assistantProfile: AssistantProfileSchema,
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
  assistantProfile: AssistantProfilePatchSchema,
  onboardingStatus: z.enum(['active', 'completed', 'skipped']),
  theme: z.enum(['midnight', 'white']),
}).partial().strict()

export type ModuleSettingKey = z.infer<typeof ModuleSettingKeySchema>
export type AssistantProfile = z.infer<typeof AssistantProfileSchema>
export type AssistantContext = z.infer<typeof AssistantContextSchema>
export type Settings = z.infer<typeof SettingsSchema>

const SettingsContracts = {
  ModuleSettingKeySchema,
  WeekStartsOnSchema,
  AssistantResponseStyleSchema,
  AssistantPlanningStyleSchema,
  AssistantFollowUpModeSchema,
  AssistantProfileSchema,
  AssistantProfilePatchSchema,
  AssistantContextSchema,
  SettingsSchema,
  SettingsPatchSchema,
  DEFAULT_PLANNING_WINDOW,
  DEFAULT_ASSISTANT_PROFILE,
}

export default SettingsContracts
