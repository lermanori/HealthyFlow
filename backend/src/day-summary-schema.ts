import { z } from 'zod'
import { DayFocusBlockSchema } from './work-contracts'

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const ClockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

export const PlanningWindowSchema = z.object({
  startTime: ClockTimeSchema,
  endTime: ClockTimeSchema,
  transitionBufferMinutes: z.number().int().min(0).max(120),
}).strict().refine(
  ({ startTime, endTime }) => startTime < endTime,
  { message: 'Planning window endTime must be after startTime', path: ['endTime'] }
)

export const HabitTargetSchema = z.object({
  value: z.number().positive(),
  unit: z.enum(['minutes', 'reps', 'count']),
}).strict()

/**
 * One recorded chunk of progress against a Habit instance. `loggedTime` is the
 * chunk's creation time resolved to the user's timezone — a partial Habit has no
 * `completed_at`, so its chunks are the only honest record of when it happened.
 */
export const HabitProgressChunkSchema = z.object({
  id: z.string(),
  amount: z.number().positive(),
  note: z.string().nullable(),
  loggedTime: ClockTimeSchema.nullable(),
}).strict()

export const HabitInfoSchema = z.object({
  target: HabitTargetSchema.nullable(),
  outcome: z.enum(['pending', 'partial', 'completed', 'failed']),
  progressTotal: z.number().nonnegative(),
  chunks: z.array(HabitProgressChunkSchema).default([]),
}).strict()

export const DaySummaryItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['task', 'habit', 'grocery', 'meal', 'workout']),
  category: z.string().nullable(),
  startTime: ClockTimeSchema.nullable(),
  location: z.string().nullable(),
  duration: z.number().finite().nullable(),
  repeat: z.enum(['none', 'daily', 'weekly']).nullable(),
  completed: z.boolean(),
  scheduledDate: IsoDateSchema.nullable(),
  createdAt: z.string(),
  overdueNotified: z.boolean(),
  isHabitInstance: z.boolean(),
  originalHabitId: z.string().nullable(),
  rolledOverFromTaskId: z.string().nullable(),
  originalCreatedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  position: z.number().int().nullable(),
  googleEventId: z.string().nullable(),
  syncedToGoogle: z.boolean(),
  googleSyncStatus: z.enum(['pending', 'synced', 'skipped', 'failed']),
  /**
   * Local wall-clock time at which this item was settled, or null while it is
   * still open. Derived from `completed_at ?? updated_at`, because `completed_at`
   * is only written for a `completed` outcome — a Habit marked Not done has none.
   * This is what lets an untimed item earn a place on the clock.
   */
  resolvedTime: ClockTimeSchema.nullable().default(null),
  habitInfo: HabitInfoSchema.optional(),
}).strict()

export const DaySummaryCalendarEventSchema = z.object({
  id: z.string(),
  provider: z.literal('google'),
  calendarId: z.string(),
  externalEventId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  localStartTime: ClockTimeSchema.nullable(),
  localEndTime: ClockTimeSchema.nullable(),
  allDay: z.boolean(),
  status: z.string().nullable(),
  htmlLink: z.string().nullable(),
  completed: z.boolean(),
  completedAt: z.string().nullable(),
}).strict()

export const DaySummaryCalorieEntrySchema = z.object({
  id: z.string(),
  date: IsoDateSchema,
  time: ClockTimeSchema.nullable(),
  name: z.string(),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative().nullable(),
  carbs: z.number().nonnegative().nullable(),
  fat: z.number().nonnegative().nullable(),
  quantity: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  /** Local time this was recorded. Falls back for entries with no explicit `time`. */
  loggedTime: ClockTimeSchema.nullable().default(null),
}).strict()

export const DaySummaryWeightEntrySchema = z.object({
  id: z.string(),
  date: IsoDateSchema,
  weightKg: z.number().positive(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  /** Weight entries carry a date only, so the clock position is always inferred. */
  loggedTime: ClockTimeSchema.nullable().default(null),
}).strict()

export const DaySummaryWorkoutExerciseSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  name: z.string(),
  sets: z.number().positive().nullable(),
  reps: z.number().positive().nullable(),
  weightKg: z.number().positive().nullable(),
  durationMinutes: z.number().positive().nullable(),
  distanceKm: z.number().positive().nullable(),
  notes: z.string().nullable(),
  position: z.number().int().nonnegative(),
}).strict()

export const DaySummaryWorkoutSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  date: IsoDateSchema,
  title: z.string().nullable(),
  notes: z.string().nullable(),
  exercises: z.array(DaySummaryWorkoutExerciseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Workout sessions carry a date only, so the clock position is always inferred. */
  loggedTime: ClockTimeSchema.nullable().default(null),
}).strict()

export const CapacityReasonCodeSchema = z.enum([
  'planning_window_missing',
  'planning_window_invalid',
  'timezone_missing',
  'timezone_invalid',
  'calendar_not_connected',
  'calendar_unavailable',
  'calendar_event_all_day',
  'calendar_event_missing_time',
  'calendar_event_invalid_time',
  'item_missing_duration',
  'item_invalid_duration',
  'item_invalid_start_time',
])

export const CapacityWindowSchema = z.object({
  startTime: ClockTimeSchema,
  endTime: ClockTimeSchema,
  transitionBufferMinutes: z.number().int().min(0).max(120),
  totalMinutes: z.number().int().nonnegative(),
  consideredStartTime: ClockTimeSchema,
  consideredEndTime: ClockTimeSchema,
  consideredMinutes: z.number().int().nonnegative(),
  bufferPolicy: z.literal('after_each_obligation'),
}).strict()

const CapacityBasisSchema = z.object({
  scope: z.enum(['remaining', 'historical', 'planned']),
  knownLoadMinutes: z.number().int().nonnegative(),
  timedItemCount: z.number().int().nonnegative(),
  calendarEventCount: z.number().int().nonnegative(),
  bufferedIntervalCount: z.number().int().nonnegative(),
}).strict()

export const CompleteCapacitySchema = z.object({
  status: z.literal('complete'),
  window: CapacityWindowSchema,
  basis: CapacityBasisSchema,
  availableMinutes: z.number().int().nonnegative(),
  reasonCodes: z.array(CapacityReasonCodeSchema).length(0),
}).strict()

export const PartialCapacitySchema = z.object({
  status: z.literal('partial'),
  window: CapacityWindowSchema,
  basis: CapacityBasisSchema,
  availableUpperBoundMinutes: z.number().int().nonnegative(),
  reasonCodes: z.array(CapacityReasonCodeSchema).min(1),
}).strict()

export const UnavailableCapacitySchema = z.object({
  status: z.literal('unavailable'),
  window: z.null(),
  basis: z.null(),
  reasonCodes: z.array(CapacityReasonCodeSchema).min(1),
}).strict()

export const DaySummaryCapacitySchema = z.discriminatedUnion('status', [
  CompleteCapacitySchema,
  PartialCapacitySchema,
  UnavailableCapacitySchema,
])

export const FocusReasonCodeSchema = z.enum([
  'active_timed_item',
  'overdue_timed_item',
  'first_anytime_item',
  'past_incomplete_item',
  'first_future_item',
])

export const FocusSchema = z.object({
  state: z.enum([
    'selected',
    'empty_day',
    'completed_day',
    'nothing_needs_attention',
    'past_incomplete',
    'future_planned',
  ]),
  itemId: z.string().nullable(),
  reasonCode: FocusReasonCodeSchema.nullable(),
}).strict()

export const PlannedItemRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  startTime: ClockTimeSchema,
}).strict()

export const CalendarObligationRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  startTime: ClockTimeSchema,
  endTime: ClockTimeSchema.nullable(),
}).strict()

export const NextObligationSchema = z.object({
  source: z.enum(['item', 'calendar']),
  id: z.string(),
  title: z.string(),
  startTime: ClockTimeSchema,
  reasonCode: z.enum([
    'only_planned_item',
    'only_calendar_obligation',
    'planned_item_precedes_calendar',
    'calendar_precedes_planned_item',
    'calendar_wins_same_time_tie',
  ]),
  conflictIds: z.array(z.string()),
}).strict()

export const CalendarSourceSchema = z.object({
  status: z.enum(['connected', 'connected_empty', 'not_connected', 'unavailable']),
  reasonCode: z.enum(['not_connected', 'status_unavailable', 'sync_failed']).nullable(),
  events: z.array(DaySummaryCalendarEventSchema),
}).strict()

export const DayCompletionSchema = z.object({
  state: z.enum(['empty', 'in_progress', 'complete']),
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  addressed: z.number().int().nonnegative().optional(),
  remaining: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100).nullable(),
}).strict()

export const WeekLoadDaySchema = z.object({
  date: IsoDateSchema,
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  addressed: z.number().int().nonnegative().optional(),
}).strict()

export const WeekLoadSchema = z.object({
  weekStartsOn: z.number().int().min(0).max(6),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  days: z.array(WeekLoadDaySchema).length(7),
}).strict()

export const ModuleAvailabilitySchema = z.enum(['enabled', 'disabled', 'unavailable'])

/**
 * Work's slice of the day. Focus blocks are primary timeline rows — peers of
 * `items` and `calendar.events` — so they sit at the top level rather than in
 * `supporting`, which carries side content.
 *
 * `unavailable` means the read failed, not that the day was empty: an empty day
 * is `not_scheduled`. One module failing must never fail the whole day.
 */
export const WorkDaySummarySchema = z.object({
  status: z.enum(['scheduled', 'not_scheduled', 'unavailable']),
  focusBlocks: z.array(DayFocusBlockSchema),
}).strict()

export const HabitSummarySchema = z.object({
  status: z.literal('available'),
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  partial: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  targeted: z.number().int().nonnegative(),
}).strict()

export const NutritionMetricSchema = z.object({
  status: z.enum(['complete', 'partial', 'unavailable']),
  value: z.number().nonnegative().nullable(),
}).strict()

export const NutritionSummarySchema = z.object({
  status: z.enum(['available', 'not_logged', 'disabled', 'unavailable']),
  entries: z.array(DaySummaryCalorieEntrySchema),
  calories: NutritionMetricSchema,
  protein: NutritionMetricSchema,
  carbs: NutritionMetricSchema,
  fat: NutritionMetricSchema,
  weight: z.object({
    status: z.enum(['recorded', 'not_recorded', 'disabled', 'unavailable']),
    entry: DaySummaryWeightEntrySchema.nullable(),
  }).strict(),
}).strict()

export const WorkoutSummarySchema = z.object({
  status: z.enum(['logged', 'not_logged', 'disabled', 'unavailable']),
  sessions: z.array(DaySummaryWorkoutSessionSchema),
}).strict()

/** An Achievement measurement recorded on this date, flattened with the bits of
 *  its definition needed to render it without a second lookup. */
export const DaySummaryAchievementEntrySchema = z.object({
  id: z.string(),
  achievementId: z.string(),
  name: z.string(),
  unit: z.string(),
  value: z.number(),
  supportingValue: z.number().nullable(),
  supportingUnit: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().nullable(),
  /** Achievement entries carry a date only, so the clock position is inferred. */
  loggedTime: ClockTimeSchema.nullable().default(null),
}).strict()

export const ProgressSummarySchema = z.object({
  status: z.enum(['recorded', 'not_recorded', 'disabled', 'unavailable']),
  entries: z.array(DaySummaryAchievementEntrySchema),
}).strict()

export const DaySummarySchema = z.object({
  version: z.literal(1),
  date: IsoDateSchema,
  generatedAt: z.string(),
  timeZone: z.string().nullable(),
  dateMode: z.enum(['past', 'today', 'future', 'unknown']),
  settings: z.object({
    sourceStatus: z.enum(['available', 'unavailable']),
    planningWindow: PlanningWindowSchema.nullable(),
  }).strict(),
  modules: z.object({
    habits: z.literal('enabled'),
    // Work has no user-facing toggle (there is no `work` key in
    // ModuleSettingKeySchema), so like habits it is always on.
    work: z.literal('enabled').default('enabled'),
    nutrition: ModuleAvailabilitySchema,
    workouts: ModuleAvailabilitySchema,
    achievements: ModuleAvailabilitySchema.default('unavailable'),
  }).strict(),
  items: z.array(DaySummaryItemSchema),
  work: WorkDaySummarySchema.default({ status: 'unavailable', focusBlocks: [] }),
  calendar: CalendarSourceSchema,
  calorieEntries: z.array(DaySummaryCalorieEntrySchema),
  completion: DayCompletionSchema,
  week: WeekLoadSchema,
  attention: z.object({
    focus: FocusSchema,
    nextPlannedItem: PlannedItemRefSchema.nullable(),
    nextCalendarObligation: CalendarObligationRefSchema.nullable(),
    nextObligation: NextObligationSchema.nullable(),
  }).strict(),
  capacity: DaySummaryCapacitySchema,
  supporting: z.object({
    habits: HabitSummarySchema,
    nutrition: NutritionSummarySchema,
    workouts: WorkoutSummarySchema,
    progress: ProgressSummarySchema.default({ status: 'unavailable', entries: [] }),
  }).strict(),
}).strict()

export type PlanningWindow = z.infer<typeof PlanningWindowSchema>
export type DaySummaryItem = z.infer<typeof DaySummaryItemSchema>
export type DaySummaryCalendarEvent = z.infer<typeof DaySummaryCalendarEventSchema>
export type DaySummaryCalorieEntry = z.infer<typeof DaySummaryCalorieEntrySchema>
export type DaySummaryWeightEntry = z.infer<typeof DaySummaryWeightEntrySchema>
export type DaySummaryAchievementEntry = z.infer<typeof DaySummaryAchievementEntrySchema>
export type HabitProgressChunk = z.infer<typeof HabitProgressChunkSchema>
export type DaySummaryCapacity = z.infer<typeof DaySummaryCapacitySchema>
export type WorkDaySummary = z.infer<typeof WorkDaySummarySchema>
export type DaySummary = z.infer<typeof DaySummarySchema>

export function isDaySummaryItemAddressed(item: DaySummaryItem) {
  if (item.completed) return true
  if (item.type !== 'habit') return false
  return item.habitInfo?.outcome === 'completed' || item.habitInfo?.outcome === 'failed'
}
