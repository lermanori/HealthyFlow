import { z } from 'zod'
import { supabase } from './supabase-client'

const ExportRowSchema = z.record(z.string(), z.unknown())
const ExportRowsSchema = z.array(ExportRowSchema)

export const AccountExportV1Schema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  account: ExportRowSchema,
  settings: ExportRowsSchema,
  planningRhythm: ExportRowsSchema,
  projects: ExportRowsSchema,
  items: ExportRowsSchema,
  habitProgress: ExportRowsSchema,
  health: z.object({
    calorieEntries: ExportRowsSchema,
    calorieHistory: ExportRowsSchema,
    weightEntries: ExportRowsSchema,
    achievementDefinitions: ExportRowsSchema,
    achievementEntries: ExportRowsSchema,
    workoutPlans: ExportRowsSchema,
    workoutPlanItems: ExportRowsSchema,
    workoutSessions: ExportRowsSchema,
    workoutSessionExercises: ExportRowsSchema,
    workoutExerciseHistory: ExportRowsSchema,
  }),
  calendar: z.object({ connections: ExportRowsSchema, events: ExportRowsSchema }),
  assistant: z.object({
    conversations: ExportRowsSchema,
    messages: ExportRowsSchema,
    recommendations: ExportRowsSchema,
    proposals: ExportRowsSchema,
    auditMetadata: ExportRowsSchema,
  }),
  billing: z.object({ credits: ExportRowsSchema, subscriptions: ExportRowsSchema, usage: ExportRowsSchema }),
  contactMessages: ExportRowsSchema,
  apiTokens: ExportRowsSchema,
})

export type AccountExportV1 = z.infer<typeof AccountExportV1Schema>

const PAGE_SIZE = 500

async function paginatedUserRows(table: string, userId: string, columns = '*'): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await (supabase.from(table) as any)
      .select(columns)
      .eq('user_id', userId)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as Record<string, unknown>[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function rowsByParentIds(table: string, column: string, ids: string[]): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return []
  const rows: Record<string, unknown>[] = []
  for (let batchStart = 0; batchStart < ids.length; batchStart += 100) {
    const batch = ids.slice(batchStart, batchStart + 100)
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await (supabase.from(table) as any)
        .select('*')
        .in(column, batch)
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      const page = (data ?? []) as Record<string, unknown>[]
      rows.push(...page)
      if (page.length < PAGE_SIZE) break
    }
  }
  return rows
}

export async function buildAccountExport(userId: string): Promise<AccountExportV1> {
  const { data: account, error: accountError } = await supabase
    .from('users')
    .select('id, email, name, role, created_at')
    .eq('id', userId)
    .single()
  if (accountError) throw accountError

  const [
    settings, planningRhythm, projects, items, habitProgress,
    calorieEntries, calorieHistory, weightEntries,
    achievementDefinitions, achievementEntries,
    workoutPlans, workoutSessions, workoutExerciseHistory,
    calendarConnections, calendarEvents,
    conversations, messages, recommendations, proposals, auditMetadata,
    credits, subscriptions, usage, contactMessages, apiTokens,
  ] = await Promise.all([
    paginatedUserRows('user_settings', userId),
    paginatedUserRows('user_rhythm', userId),
    paginatedUserRows('projects', userId),
    paginatedUserRows('tasks', userId),
    paginatedUserRows('habit_progress_entries', userId),
    paginatedUserRows('calorie_entries', userId),
    paginatedUserRows('calorie_items', userId),
    paginatedUserRows('weight_entries', userId),
    paginatedUserRows('achievement_definitions', userId),
    paginatedUserRows('achievement_entries', userId),
    paginatedUserRows('workout_plans', userId),
    paginatedUserRows('workout_sessions', userId),
    paginatedUserRows('workout_exercise_items', userId),
    paginatedUserRows('calendar_connections', userId, 'id, user_id, provider, provider_account_email, token_expiry, scopes, connected_at, updated_at, disconnected_at'),
    paginatedUserRows('external_calendar_events', userId, 'id, user_id, provider, provider_calendar_id, provider_event_id, etag, title, description, location, start_at, end_at, all_day, status, html_link, updated_at, deleted_at'),
    paginatedUserRows('assistant_conversations', userId),
    paginatedUserRows('assistant_messages', userId),
    paginatedUserRows('ai_recommendations', userId),
    paginatedUserRows('ai_pending_actions', userId),
    paginatedUserRows('ai_audit_log', userId, 'id, user_id, caller, tool, args_summary, target_ids, model, request_id, created_at'),
    paginatedUserRows('user_credits', userId),
    paginatedUserRows('user_credit_subscriptions', userId),
    paginatedUserRows('ai_usage_log', userId),
    paginatedUserRows('contact_messages', userId, 'id, user_id, kind, message, status, created_at, handled_at'),
    paginatedUserRows('api_tokens', userId, 'id, user_id, name, scopes, audience, created_at, last_used_at, revoked_at'),
  ])

  const workoutPlanItems = await rowsByParentIds('workout_plan_items', 'plan_id', workoutPlans.map((row) => String(row.id)))
  const workoutSessionExercises = await rowsByParentIds('workout_session_exercises', 'session_id', workoutSessions.map((row) => String(row.id)))

  return AccountExportV1Schema.parse({
    version: 1,
    exportedAt: new Date().toISOString(),
    account,
    settings,
    planningRhythm,
    projects,
    items,
    habitProgress,
    health: {
      calorieEntries,
      calorieHistory,
      weightEntries,
      achievementDefinitions,
      achievementEntries,
      workoutPlans,
      workoutPlanItems,
      workoutSessions,
      workoutSessionExercises,
      workoutExerciseHistory,
    },
    calendar: { connections: calendarConnections, events: calendarEvents },
    assistant: { conversations, messages, recommendations, proposals, auditMetadata },
    billing: { credits, subscriptions, usage },
    contactMessages,
    apiTokens,
  })
}

export async function getAccountCredentials(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role, password_hash')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}
