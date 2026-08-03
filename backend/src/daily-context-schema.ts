import { z } from 'zod'
import {
  DaySummaryCalendarEventSchema,
  DaySummaryCalorieEntrySchema,
  DaySummaryItemSchema,
  DaySummaryWeightEntrySchema,
} from './day-summary-schema'
import { AchievementSummarySchema } from './achievements'
import { WorkoutSessionSchema } from './workouts'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const HABIT_LOOKBACK_DAYS = 3
export const CALORIE_LOOKBACK_DAYS = 7
export const WORKOUT_LOOKBACK_DAYS = 14

export const DailyContextInputSchema = z.object({
  date: z.string().regex(DATE_RE).optional(),
})

export const DailySignalReviewInputSchema = z.object({
  date: z.string().regex(DATE_RE),
  signalId: z.string().trim().min(1).max(500),
}).strict()

export const DailySignalTypeSchema = z.enum([
  'schedule_overload',
  'habit_risk',
  'missing_calorie_log',
])

export const DailySignalEvidenceSchema = z.object({
  label: z.string().trim().min(1),
  value: z.string().trim().min(1),
}).strict()

export const DailySignalAffectedRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'task',
    'habit_instance',
    'calorie_entry',
    'weight_entry',
    'achievement',
    'workout_session',
  ]),
  title: z.string().trim().min(1),
  date: z.string().regex(DATE_RE).nullable(),
}).strict()

export const DailySignalChangeSchema = z.object({
  field: z.string().trim().min(1),
  label: z.string().trim().min(1),
  before: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  after: z.union([z.string(), z.number(), z.boolean(), z.null()]),
}).strict()

export const DailySignalProposalSchema = z.object({
  capability: z.literal('update_item'),
  label: z.string().trim().min(1),
  arguments: z.object({
    itemId: z.string().min(1),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    requestId: z.string().trim().min(1).max(120),
  }).strict(),
  affectedRecords: z.array(DailySignalAffectedRecordSchema).min(1),
  changes: z.array(DailySignalChangeSchema).min(1),
}).strict()

const DailySignalBaseSchema = z.object({
  id: z.string(),
  type: DailySignalTypeSchema,
  severity: z.enum(['info', 'low', 'medium', 'high']),
  confidence: z.enum(['low', 'medium', 'high']),
  summary: z.string(),
  rationale: z.string().trim().min(1),
  evidence: z.array(DailySignalEvidenceSchema),
})

export const DailySignalSchema = z.discriminatedUnion('kind', [
  DailySignalBaseSchema.extend({
    kind: z.literal('informational'),
    proposal: z.null(),
  }).strict(),
  DailySignalBaseSchema.extend({
    kind: z.literal('actionable'),
    proposal: DailySignalProposalSchema,
  }).strict(),
])

const HabitHistoryDaySchema = z.object({
  date: z.string(),
  habits: z.array(DaySummaryItemSchema),
})

const CalorieHistoryDaySchema = z.object({
  date: z.string(),
  entries: z.array(DaySummaryCalorieEntrySchema),
})

const WorkoutHistoryDaySchema = z.object({
  date: z.string(),
  sessions: z.array(WorkoutSessionSchema),
})

export const DailyContextSchema = z.object({
  date: z.string().regex(DATE_RE),
  generatedAt: z.string(),
  day: z.object({
    tasks: z.array(DaySummaryItemSchema),
    calorieEntries: z.array(DaySummaryCalorieEntrySchema),
    weight: DaySummaryWeightEntrySchema.nullable(),
    achievements: z.array(AchievementSummarySchema),
    workoutSessions: z.array(WorkoutSessionSchema),
    calendarEvents: z.array(DaySummaryCalendarEventSchema),
  }),
  lookback: z.object({
    habitHistory: z.object({
      windowDays: z.literal(HABIT_LOOKBACK_DAYS),
      days: z.array(HabitHistoryDaySchema),
    }),
    calorieHistory: z.object({
      windowDays: z.literal(CALORIE_LOOKBACK_DAYS),
      days: z.array(CalorieHistoryDaySchema),
    }),
    workoutHistory: z.object({
      windowDays: z.literal(WORKOUT_LOOKBACK_DAYS),
      days: z.array(WorkoutHistoryDaySchema),
    }),
  }),
  signals: z.array(DailySignalSchema),
})

export type DailySignalType = z.infer<typeof DailySignalTypeSchema>
export type DailySignal = z.infer<typeof DailySignalSchema>
export type DailyContext = z.infer<typeof DailyContextSchema>
