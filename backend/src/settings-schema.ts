import { z } from 'zod'
import { DaySummaryCapacitySchema, DaySummaryItemSchema, PlanningWindowSchema } from './day-summary-schema'
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

const ReviewTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const ReviewLastSentSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null)
const DailyReviewFieldsSchema = z.object({
  enabled: z.boolean().default(false),
  time: ReviewTimeSchema.default('20:30'),
  lastSent: ReviewLastSentSchema,
})
export const DailyReviewScheduleSchema = DailyReviewFieldsSchema.prefault({})
const WeeklyReviewFieldsSchema = z.object({
  enabled: z.boolean().default(false),
  time: ReviewTimeSchema.default('19:00'),
  day: z.number().int().min(0).max(6).default(0),
  lastSent: ReviewLastSentSchema,
})
export const WeeklyReviewScheduleSchema = WeeklyReviewFieldsSchema.prefault({})
/** Existing user_rhythm rows may contain old planning fields; they are ignored. */
export const RhythmSchema = z.object({
  timezone: z.string().default('UTC'),
  daily: DailyReviewScheduleSchema,
  weeklyReview: WeeklyReviewScheduleSchema,
}).prefault({})
export type Rhythm = z.infer<typeof RhythmSchema>
export const RhythmPatchSchema = z.object({
  timezone: z.string(),
  daily: z.object({ enabled: z.boolean(), time: ReviewTimeSchema }).partial().strict(),
  weeklyReview: z.object({
    enabled: z.boolean(),
    time: ReviewTimeSchema,
    day: z.number().int().min(0).max(6),
  }).partial().strict(),
}).partial().strict()
export type RhythmPatch = z.infer<typeof RhythmPatchSchema>

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
  /**
   * Free-speech background about the person's day, written by them in day setup
   * and editable in Settings → Personal assistant.
   *
   * This is user-owned context, not hidden model memory: it is visible and
   * editable wherever it is used. Goals carry direction; this carries the
   * constraints and facts that do not belong to any one module. It is not a
   * progress log and nothing writes to it but the user.
   */
  dayContext: z.string().trim().max(2000).nullable().default(null),
})

export const AssistantProfileSchema = AssistantProfileFieldsSchema.prefault({})
export const AssistantProfilePatchSchema = AssistantProfileFieldsSchema.strict()

export const DEFAULT_ASSISTANT_PROFILE = AssistantProfileSchema.parse({})

const AssistantCalendarEventSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  localStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  localEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  allDay: z.boolean(),
  status: z.string().nullable(),
}).strict()

const AssistantCalendarDaySchema = z.object({
  date: z.string().date(),
  status: z.enum(['connected', 'connected_empty', 'not_connected', 'not_entitled', 'unavailable']),
  reasonCode: z.enum(['not_connected', 'cloud_not_active', 'status_unavailable', 'sync_failed']).nullable(),
  events: z.array(AssistantCalendarEventSchema).max(20),
  truncated: z.boolean(),
}).strict()

export const AssistantCalendarContextSchema = z.object({
  days: z.array(AssistantCalendarDaySchema).max(7),
}).strict()

const TalkDayItemSchema = DaySummaryItemSchema.pick({
  title: true,
  type: true,
  startTime: true,
  duration: true,
  completed: true,
  scheduledDate: true,
})

export const TalkDayContextSchema = z.object({
  days: z.array(z.discriminatedUnion('status', [
    z.object({
      date: z.string().date(),
      status: z.literal('ready'),
      items: z.array(TalkDayItemSchema).max(50),
      truncated: z.boolean(),
      capacity: DaySummaryCapacitySchema.nullable(),
    }).strict(),
    z.object({
      date: z.string().date(),
      status: z.literal('unavailable'),
      reasonCode: z.literal('day_read_failed'),
    }).strict(),
  ])).max(7),
}).strict()

const TalkReviewReadyDaySchema = z.object({
  date: z.string().date(),
  status: z.literal('ready'),
  addressedItems: z.array(z.object({
    title: z.string(),
    type: DaySummaryItemSchema.shape.type,
    completed: z.boolean(),
  }).strict()).max(12),
  addressedItemCount: z.number().int().nonnegative(),
  habitsWithProgress: z.number().int().nonnegative(),
  openItems: z.array(z.string()).max(12),
  calorieEntryCount: z.number().int().nonnegative(),
  workoutSessionCount: z.number().int().nonnegative(),
  weightRecorded: z.boolean(),
  progressEntryCount: z.number().int().nonnegative(),
  unavailable: z.array(z.enum(['nutrition', 'workouts', 'progress'])),
}).strict()
export const TalkReviewContextSchema = z.object({
  kind: z.enum(['daily', 'weekly']),
  days: z.array(z.discriminatedUnion('status', [
    TalkReviewReadyDaySchema,
    z.object({
      date: z.string().date(),
      status: z.literal('unavailable'),
      reasonCode: z.literal('day_read_failed'),
    }).strict(),
  ])).min(1).max(7),
}).strict().refine((review) => review.kind !== 'daily' || review.days.length === 1, {
  message: 'A daily review must read exactly one date',
})
export type TalkReviewContext = z.infer<typeof TalkReviewContextSchema>

/** The read plan is about where to look, never an answer or a write decision. */
export const TalkContextSourceSchema = z.enum([
  'calendar', 'day', 'goals', 'habit_history', 'nutrition', 'workout', 'weight', 'achievements',
])

export const TalkContextPlanSchema = z.object({
  kind: z.enum(['ready', 'clarify']),
  intent: z.enum(['conversation', 'calendar_events', 'schedule_conflicts', 'day_capacity', 'other_app_data']),
  dates: z.array(z.string().date()).max(7),
  sources: z.array(TalkContextSourceSchema).max(8),
  clarification: z.string().trim().min(1).max(240).nullable(),
  // Optional on the wire so already-installed clients can still send their plan.
  continuesPreviousTopic: z.boolean().optional(),
}).strict()

/** A bounded snapshot sent with a Talk turn so Local-first sessions work too. */
export const AssistantContextSchema = z.object({
  ownerName: z.string().trim().min(1).max(80).nullable().default(null),
  profile: AssistantProfileSchema,
  goals: GoalContextSchema,
  habitHistory: HabitHistoryContextSchema.default({ status: 'unavailable' }),
  calendar: AssistantCalendarContextSchema.optional(),
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
export type TalkContextPlan = z.infer<typeof TalkContextPlanSchema>
export type TalkDayContext = z.infer<typeof TalkDayContextSchema>
export type Settings = z.infer<typeof SettingsSchema>

const SettingsContracts = {
  ModuleSettingKeySchema,
  WeekStartsOnSchema,
  AssistantResponseStyleSchema,
  AssistantPlanningStyleSchema,
  AssistantFollowUpModeSchema,
  AssistantProfileSchema,
  AssistantProfilePatchSchema,
  AssistantCalendarContextSchema,
  AssistantContextSchema,
  SettingsSchema,
  SettingsPatchSchema,
  DEFAULT_PLANNING_WINDOW,
  DEFAULT_ASSISTANT_PROFILE,
}

export default SettingsContracts
