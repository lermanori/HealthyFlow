import { z } from 'zod'
import { db, supabase } from './supabase-client'

const ExportRowSchema = z.record(z.string(), z.unknown())
const ExportRowsSchema = z.array(ExportRowSchema)

export const DURABLE_E2E_USER_EMAIL = 'e2e@test.healthyflow.local'

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
    .select('id, email, name, role, password_hash, google_auth_subject, signup_method, disabled_at')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

const AdminUserProtectionSchema = z.enum([
  'current_admin',
  'administrator',
  'demo_account',
  'test_fixture',
])
const AdminUserActionSchema = z.enum(['mark_test', 'mark_live', 'disable', 'enable'])

export const AdminUserBatchActionInputSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(50),
  action: AdminUserActionSchema,
})
export type AdminUserBatchActionInput = z.infer<typeof AdminUserBatchActionInputSchema>

export const AdminUserDeletionInputSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(20),
  confirmation: z.string().min(1).max(300),
})
export type AdminUserDeletionInput = z.infer<typeof AdminUserDeletionInputSchema>

export const AdminUserDeletionPreviewInputSchema = AdminUserDeletionInputSchema.pick({
  userIds: true,
})

export const ManagedUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['admin', 'user']),
  signupMethod: z.enum(['password', 'google']),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  disabledAt: z.string().nullable(),
  isTest: z.boolean(),
  balance: z.number().int().nonnegative(),
  subscriptionActive: z.boolean(),
  protection: AdminUserProtectionSchema.nullable(),
})
export type ManagedUser = z.infer<typeof ManagedUserSchema>

export const AdminUserDeletionCountsSchema = z.object({
  items: z.number().int().nonnegative(),
  health: z.number().int().nonnegative(),
  calendar: z.number().int().nonnegative(),
  assistant: z.number().int().nonnegative(),
  billing: z.number().int().nonnegative(),
  account: z.number().int().nonnegative(),
  waitlist: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})
export type AdminUserDeletionCounts = z.infer<typeof AdminUserDeletionCountsSchema>

export const AdminUserDeletionTargetSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  isTest: z.boolean(),
  subscriptionActive: z.boolean(),
  protection: AdminUserProtectionSchema.nullable(),
  blockers: z.array(z.enum([
    'current_admin',
    'administrator',
    'demo_account',
    'test_fixture',
    'not_test',
    'active_subscription',
  ])),
  counts: AdminUserDeletionCountsSchema,
  releasesPublicSignupSeat: z.boolean(),
})

export const AdminUserDeletionPreviewSchema = z.object({
  canDelete: z.boolean(),
  confirmationPhrase: z.string().nullable(),
  totalRecords: z.number().int().nonnegative(),
  users: z.array(AdminUserDeletionTargetSchema),
})
export type AdminUserDeletionPreview = z.infer<typeof AdminUserDeletionPreviewSchema>

export const AdminUserAuditEntrySchema = z.object({
  id: z.string(),
  actorEmail: z.string().email(),
  targetEmail: z.string().email(),
  action: z.enum([
    'marked_test',
    'marked_live',
    'disabled',
    'enabled',
    'delete_requested',
    'delete_completed',
    'delete_auth_cleanup_failed',
  ]),
  details: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
})
export type AdminUserAuditEntry = z.infer<typeof AdminUserAuditEntrySchema>

type AdminUserRow = {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  signup_method: 'password' | 'google' | null
  google_auth_subject: string | null
  created_at: string
  last_login_at: string | null
  disabled_at: string | null
  is_test: boolean
}

export class AdminUserControlError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AdminUserControlError'
  }
}

export function adminUserProtectionFor(
  actorId: string,
  user: Pick<AdminUserRow, 'id' | 'email' | 'role'>,
) {
  if (user.id === actorId) return 'current_admin' as const
  if (user.role === 'admin') return 'administrator' as const
  const email = user.email.trim().toLowerCase()
  if (email === DURABLE_E2E_USER_EMAIL) return 'test_fixture' as const
  if (email === 'demo@healthyflow.com' || email.startsWith('demo-')) {
    return 'demo_account' as const
  }
  return null
}

export function adminDeletionBlockers(input: {
  protection: z.infer<typeof AdminUserProtectionSchema> | null
  isTest: boolean
  subscriptionActive: boolean
}) {
  const blockers: Array<
    'current_admin' | 'administrator' | 'demo_account' | 'test_fixture' | 'not_test' | 'active_subscription'
  > = []
  if (input.protection) blockers.push(input.protection)
  if (!input.isTest) blockers.push('not_test')
  if (input.subscriptionActive) blockers.push('active_subscription')
  return blockers
}

export function adminDeletionConfirmationPhrase(count: number) {
  return `DELETE ${count} TEST ${count === 1 ? 'USER' : 'USERS'}`
}

async function requireAdminActor(actorId: string): Promise<AdminUserRow> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role, signup_method, google_auth_subject, created_at, last_login_at, disabled_at, is_test')
    .eq('id', actorId)
    .single()
  if (error || !data) {
    throw new AdminUserControlError(401, 'actor_not_found', 'Administrator account was not found.')
  }
  if (data.role !== 'admin') {
    throw new AdminUserControlError(403, 'admin_required', 'Administrator access is required.')
  }
  return data as AdminUserRow
}

async function getAdminUserRows(userIds?: string[]): Promise<AdminUserRow[]> {
  let query = supabase
    .from('users')
    .select('id, email, name, role, signup_method, google_auth_subject, created_at, last_login_at, disabled_at, is_test')
    .order('created_at', { ascending: false })
  if (userIds) query = query.in('id', userIds)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as AdminUserRow[]
}

function requireAllTargets(userIds: string[], rows: AdminUserRow[]) {
  const found = new Set(rows.map(row => row.id))
  const missing = userIds.filter(id => !found.has(id))
  if (missing.length > 0) {
    throw new AdminUserControlError(404, 'users_not_found', 'One or more selected users no longer exist.')
  }
}

async function subscriptionState(userIds: string[]) {
  const { data, error } = await supabase
    .from('user_credit_subscriptions')
    .select('user_id, active')
    .in('user_id', userIds)
  if (error) throw error
  return new Map((data ?? []).map(row => [String(row.user_id), Boolean(row.active)]))
}

async function balancesByUser(userIds: string[]) {
  const { data, error } = await supabase
    .from('user_credits')
    .select('user_id, balance')
    .in('user_id', userIds)
  if (error) throw error
  return new Map((data ?? []).map(row => [String(row.user_id), Number(row.balance ?? 0)]))
}

async function insertAdminAudit(input: {
  actor: AdminUserRow
  targetUserId?: string | null
  targetEmail: string
  action: z.infer<typeof AdminUserAuditEntrySchema>['action']
  details?: Record<string, unknown>
}) {
  const { error } = await supabase.from('admin_user_audit_log').insert({
    actor_user_id: input.actor.id,
    actor_email: input.actor.email,
    target_user_id: input.targetUserId ?? null,
    target_email: input.targetEmail,
    action: input.action,
    details: input.details ?? {},
  })
  if (error) throw error
}

export async function listManagedUsers(actorId: string): Promise<ManagedUser[]> {
  const actor = await requireAdminActor(actorId)
  const users = await getAdminUserRows()
  if (users.length === 0) return []
  const ids = users.map(user => user.id)
  const [balances, subscriptions] = await Promise.all([
    balancesByUser(ids),
    subscriptionState(ids),
  ])
  return users.map(user => ManagedUserSchema.parse({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    signupMethod: user.signup_method ?? 'password',
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    disabledAt: user.disabled_at,
    isTest: Boolean(user.is_test),
    balance: balances.get(user.id) ?? 0,
    subscriptionActive: subscriptions.get(user.id) ?? false,
    protection: adminUserProtectionFor(actor.id, user),
  }))
}

const actionDetails = {
  mark_test: { field: 'is_test', value: true, audit: 'marked_test' },
  mark_live: { field: 'is_test', value: false, audit: 'marked_live' },
  disable: { field: 'disabled_at', value: 'now', audit: 'disabled' },
  enable: { field: 'disabled_at', value: null, audit: 'enabled' },
} as const

export async function applyAdminUserAction(actorId: string, input: AdminUserBatchActionInput) {
  const actor = await requireAdminActor(actorId)
  const users = await getAdminUserRows(input.userIds)
  requireAllTargets(input.userIds, users)

  const protectedUser = users.find(user => adminUserProtectionFor(actor.id, user))
  if (protectedUser) {
    throw new AdminUserControlError(
      403,
      'protected_account',
      `${protectedUser.email} is a protected account and cannot be changed.`,
    )
  }

  const definition = actionDetails[input.action]
  const changedUsers = users.filter(user => {
    if (input.action === 'mark_test') return !user.is_test
    if (input.action === 'mark_live') return user.is_test
    if (input.action === 'disable') return !user.disabled_at
    return Boolean(user.disabled_at)
  })
  if (changedUsers.length === 0) return { updatedUserIds: [] }

  const update = definition.field === 'disabled_at'
    ? { disabled_at: definition.value === 'now' ? new Date().toISOString() : null }
    : { is_test: definition.value }
  const { error } = await supabase
    .from('users')
    .update(update)
    .in('id', changedUsers.map(user => user.id))
  if (error) throw error

  await Promise.all(changedUsers.map(user => insertAdminAudit({
    actor,
    targetUserId: user.id,
    targetEmail: user.email,
    action: definition.audit,
    details: { batchSize: changedUsers.length },
  })))

  return { updatedUserIds: changedUsers.map(user => user.id) }
}

async function deletionCounts(userIds: string[]) {
  const { data, error } = await supabase.rpc('admin_user_deletion_counts', {
    p_user_ids: userIds,
  })
  if (error) throw error
  return new Map(((data ?? []) as Array<Record<string, unknown>>).map(row => {
    const counts = {
      items: Number(row.items ?? 0),
      health: Number(row.health ?? 0),
      calendar: Number(row.calendar ?? 0),
      assistant: Number(row.assistant ?? 0),
      billing: Number(row.billing ?? 0),
      account: Number(row.account ?? 0),
      waitlist: Number(row.waitlist ?? 0),
    }
    return [String(row.user_id), {
      counts: AdminUserDeletionCountsSchema.parse({
        ...counts,
        total: Object.values(counts).reduce((sum, value) => sum + value, 0),
      }),
      releasesPublicSignupSeat: Number(row.public_signup_seats ?? 0) > 0,
    }]
  }))
}

export async function previewAdminUserDeletion(
  actorId: string,
  userIds: string[],
): Promise<AdminUserDeletionPreview> {
  const actor = await requireAdminActor(actorId)
  const users = await getAdminUserRows(userIds)
  requireAllTargets(userIds, users)
  const [subscriptions, counts] = await Promise.all([
    subscriptionState(userIds),
    deletionCounts(userIds),
  ])

  const previews = users.map(user => {
    const protection = adminUserProtectionFor(actor.id, user)
    const blockers = adminDeletionBlockers({
      protection,
      isTest: Boolean(user.is_test),
      subscriptionActive: subscriptions.get(user.id) ?? false,
    })
    return AdminUserDeletionTargetSchema.parse({
      id: user.id,
      email: user.email,
      name: user.name,
      isTest: Boolean(user.is_test),
      subscriptionActive: subscriptions.get(user.id) ?? false,
      protection,
      blockers,
      counts: counts.get(user.id)?.counts ?? {
        items: 0,
        health: 0,
        calendar: 0,
        assistant: 0,
        billing: 0,
        account: 0,
        waitlist: 0,
        total: 0,
      },
      releasesPublicSignupSeat: counts.get(user.id)?.releasesPublicSignupSeat ?? false,
    })
  })
  const canDelete = previews.every(user => user.blockers.length === 0)
  const count = previews.length
  return AdminUserDeletionPreviewSchema.parse({
    canDelete,
    confirmationPhrase: canDelete
      ? adminDeletionConfirmationPhrase(count)
      : null,
    totalRecords: previews.reduce((sum, user) => sum + user.counts.total, 0),
    users: previews,
  })
}

export async function deleteManagedTestUsers(
  actorId: string,
  input: AdminUserDeletionInput,
) {
  const preview = await previewAdminUserDeletion(actorId, input.userIds)
  if (!preview.canDelete || !preview.confirmationPhrase) {
    throw new AdminUserControlError(
      409,
      'deletion_blocked',
      'Every selected account must be an unprotected test user without an active subscription.',
    )
  }
  if (input.confirmation !== preview.confirmationPhrase) {
    throw new AdminUserControlError(400, 'confirmation_mismatch', 'The deletion confirmation does not match.')
  }

  const actor = await requireAdminActor(actorId)
  const users = await getAdminUserRows(input.userIds)
  requireAllTargets(input.userIds, users)
  const previewById = new Map(preview.users.map(user => [user.id, user]))
  const deleted: Array<{
    id: string
    email: string
    warnings: string[]
    waitlistEntriesDeleted: number
    publicSignupSeatsReleased: number
  }> = []
  const failures: Array<{ id: string; email: string; error: string }> = []

  for (const user of users) {
    const targetPreview = previewById.get(user.id)
    try {
      await insertAdminAudit({
        actor,
        targetUserId: user.id,
        targetEmail: user.email,
        action: 'delete_requested',
        details: { counts: targetPreview?.counts ?? null },
      })
      const cleanup = await db.deleteUserWithSignupCleanup(user.id)

      const warnings: string[] = []
      if (user.google_auth_subject) {
        const { error: authError } = await supabase.auth.admin.deleteUser(user.google_auth_subject)
        if (authError) {
          warnings.push('supabase_auth_cleanup_failed')
          await insertAdminAudit({
            actor,
            targetEmail: user.email,
            action: 'delete_auth_cleanup_failed',
            details: { providerSubject: user.google_auth_subject },
          })
        }
      }
      await insertAdminAudit({
        actor,
        targetEmail: user.email,
        action: 'delete_completed',
        details: { counts: targetPreview?.counts ?? null, cleanup, warnings },
      })
      deleted.push({ id: user.id, email: user.email, warnings, ...cleanup })
    } catch (error) {
      failures.push({
        id: user.id,
        email: user.email,
        error: error instanceof Error ? error.message : 'Unknown deletion error',
      })
    }
  }

  return { deleted, failures }
}

export async function listAdminUserAudit(actorId: string): Promise<AdminUserAuditEntry[]> {
  await requireAdminActor(actorId)
  const { data, error } = await supabase
    .from('admin_user_audit_log')
    .select('id, actor_email, target_email, action, details, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []).map(row => AdminUserAuditEntrySchema.parse({
    id: row.id,
    actorEmail: row.actor_email,
    targetEmail: row.target_email,
    action: row.action,
    details: row.details ?? {},
    createdAt: row.created_at,
  }))
}
