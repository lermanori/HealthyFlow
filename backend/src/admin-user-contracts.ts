import { z } from 'zod'
import { FreeCreditGrantSchema } from './credit-contracts'

// What the admin user-management API returns. One copy, read by the server and
// the client alike: the client once kept its own, which drifted to require an
// email on every deleted account and turned a Guest's successful deletion into
// a reported failure (#293).

export const AdminUserProtectionSchema = z.enum([
  'current_admin',
  'administrator',
  'demo_account',
  'test_fixture',
])
export const ManagedUserSchema = z.object({
  id: z.string(),
  // Null for a Guest: an account with no email, not a missing value.
  email: z.string().email().nullable(),
  name: z.string(),
  role: z.enum(['admin', 'user']),
  signupMethod: z.enum(['password', 'google', 'apple', 'guest']),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  disabledAt: z.string().nullable(),
  isTest: z.boolean(),
  // Proven reachable (ADR-0025). Always false for a Guest, who has no address.
  emailVerified: z.boolean(),
  // The device this account was last used on (#308, ADR-0027). Null until it
  // next signs in or opens the app on a build that sends it.
  deviceId: z.string().nullable(),
  balance: z.number().int().nonnegative(),
  // The free grant this account can draw, by the rule the server enforces.
  freeAllowance: FreeCreditGrantSchema,
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
  email: z.string().email().nullable(),
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
  // Null for a Guest, who has no email; the id is what names them.
  targetEmail: z.string().email().nullable(),
  targetUserId: z.string().nullable(),
  action: z.enum([
    'marked_test',
    'marked_live',
    'disabled',
    'enabled',
    'delete_requested',
    'delete_completed',
    'delete_auth_cleanup_failed',
    'balance_set',
    'cloud_granted',
    'cloud_revoked',
  ]),
  details: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
})
export type AdminUserAuditEntry = z.infer<typeof AdminUserAuditEntrySchema>

export const AdminUserDeletionResultSchema = z.object({
  deleted: z.array(z.object({
    id: z.string(),
    // Null for a Guest.
    email: z.string().email().nullable(),
    warnings: z.array(z.string()),
  })),
  failures: z.array(z.object({
    id: z.string(),
    email: z.string().email().nullable(),
    error: z.string(),
  })),
})
export type AdminUserDeletionResult = z.infer<typeof AdminUserDeletionResultSchema>

const AdminUserContracts = {
  AdminUserProtectionSchema,
  ManagedUserSchema,
  AdminUserDeletionCountsSchema,
  AdminUserDeletionTargetSchema,
  AdminUserDeletionPreviewSchema,
  AdminUserAuditEntrySchema,
  AdminUserDeletionResultSchema,
}

export default AdminUserContracts
