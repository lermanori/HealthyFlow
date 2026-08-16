import { z } from 'zod'
import {
  canonicalTalkWorkflowName,
  getTalkWorkflowDefinition,
  isTerminalTalkWorkflowStatus,
  TalkWorkflowNameSchema,
  TalkWorkflowStatusSchema,
  type TalkWorkflowName,
  type TalkWorkflowStatus,
} from './talk-workflow-definitions'

// Persistence contract for durable Talk workflows (ADR-0009, Slice 3).
//
// This module owns the row <-> record boundary and nothing else: no OpenAI, no
// capability execution, no transition decisions. The store is an injectable
// interface so the workflow service can be exercised against in-memory storage
// without touching Supabase.

/**
 * The generic persisted record. Safety fields stay top-level so the database can
 * constrain them; everything workflow-specific lives in `state`, validated by
 * the workflow definition's own schema.
 */
export const TalkWorkflowRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  conversationId: z.string().uuid(),
  name: TalkWorkflowNameSchema,
  definitionVersion: z.number().int().positive(),
  stage: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
  status: TalkWorkflowStatusSchema,
  anchorDate: z.string().date(),
  timeZone: z.string(),
  state: z.record(z.string(), z.unknown()),
  pendingActionId: z.string().uuid().nullable(),
  sourceFingerprint: z.string().nullable(),
  confirmationState: z.enum(['none', 'presented', 'confirmed', 'declined', 'stale']),
  runtimeVersion: z.string(),
  instructionVersions: z.array(z.string()),
  model: z.string(),
  revision: z.number().int().positive(),
  lastError: z.string().nullable(),
  closedAt: z.string().nullable(),
  updatedAt: z.string(),
})
export type TalkWorkflowRecord = z.infer<typeof TalkWorkflowRecordSchema>

export class TalkWorkflowStateError extends Error {
  readonly code = 'talk_workflow_state_invalid'
}

/**
 * Parses `state` against the registered workflow's own schema. Kept separate
 * from row mapping so a legacy row can be read even while its envelope is being
 * backfilled.
 */
export function parseTalkWorkflowState(record: TalkWorkflowRecord) {
  const definition = getTalkWorkflowDefinition(record.name)
  const parsed = definition.stateSchema.safeParse(record.state)
  if (!parsed.success) {
    throw new TalkWorkflowStateError(
      `Durable state for ${record.name} v${record.definitionVersion} does not satisfy its schema.`,
    )
  }
  return parsed.data
}

// ---------------------------------------------------------------------------
// Legacy (Phase 5) row compatibility
// ---------------------------------------------------------------------------

/**
 * Phase 5 encoded terminal outcomes as stage values. Reading a row written
 * before the migration must split them back apart identically to the SQL
 * backfill, so a row read mid-rollout resumes at the same place either way.
 */
const LEGACY_STAGE_STATUS: Readonly<Record<string, TalkWorkflowStatus>> = {
  applied: 'completed',
  declined: 'declined',
  failed: 'failed',
}

const LEGACY_STAGE_MAP: Readonly<Record<string, string>> = {
  interpreting: 'resolve_project',
  gathering_context: 'resolve_scope',
  // Phase 5 recorded that a question was asked but never which one. resolve_scope
  // is a deterministic application activity that re-derives the branch, so this
  // resumes correctly instead of guessing a clarify_* stage.
  clarifying: 'resolve_scope',
  stale: 'draft_focus_block',
  failed: 'resolve_scope',
  applied: 'await_focus_confirmation',
}

function isLegacyStage(stage: string) {
  return stage in LEGACY_STAGE_MAP
    || stage === 'awaiting_confirmation'
    || stage === 'declined'
}

function legacyStage(row: any): string {
  const stage = String(row.stage)
  if (stage === 'awaiting_confirmation' || stage === 'declined') {
    return row.pending_proposal ? 'await_focus_confirmation' : 'await_task_confirmation'
  }
  return LEGACY_STAGE_MAP[stage] ?? stage
}

function legacyState(row: any) {
  return {
    projectId: row.selected_project_id ?? null,
    selectedTaskIds: row.selected_task_ids ?? [],
    alignmentApprovedTaskIds: [],
    createdTaskId: null,
    createdFocusBlockId: null,
    focusMeaning: row.focus_meaning ?? null,
    openQuestion: null,
    blockedReasonCodes: [],
  }
}

export function rowToTalkWorkflowRecord(row: any): TalkWorkflowRecord {
  const name = canonicalTalkWorkflowName(String(row.name))
  if (!name) throw new TalkWorkflowStateError(`Unknown Talk workflow name: ${String(row.name)}`)

  const legacy = isLegacyStage(String(row.stage))
  const status: TalkWorkflowStatus = row.status
    ? TalkWorkflowStatusSchema.parse(row.status)
    : (LEGACY_STAGE_STATUS[String(row.stage)] ?? 'active')
  const hasEnvelope = row.state && Object.keys(row.state).length > 0

  return TalkWorkflowRecordSchema.parse({
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    name,
    definitionVersion: row.definition_version ?? 1,
    stage: legacy ? legacyStage(row) : String(row.stage),
    status,
    anchorDate: row.anchor_date,
    timeZone: row.time_zone,
    state: hasEnvelope ? row.state : legacyState(row),
    pendingActionId: row.pending_action_id ?? null,
    sourceFingerprint: row.source_fingerprint ?? null,
    confirmationState: row.confirmation_state ?? 'none',
    runtimeVersion: row.runtime_version,
    instructionVersions: row.instruction_versions ?? [],
    model: row.model,
    revision: row.revision,
    lastError: row.last_error ?? null,
    closedAt: row.closed_at ?? (isTerminalTalkWorkflowStatus(status) ? row.updated_at : null),
    updatedAt: row.updated_at,
  })
}

export function talkWorkflowRecordToRow(record: TalkWorkflowRecord): Record<string, unknown> {
  return {
    id: record.id,
    user_id: record.userId,
    conversation_id: record.conversationId,
    name: record.name,
    definition_version: record.definitionVersion,
    stage: record.stage,
    status: record.status,
    anchor_date: record.anchorDate,
    time_zone: record.timeZone,
    state: record.state,
    pending_action_id: record.pendingActionId,
    source_fingerprint: record.sourceFingerprint,
    confirmation_state: record.confirmationState,
    runtime_version: record.runtimeVersion,
    instruction_versions: record.instructionVersions,
    model: record.model,
    revision: record.revision,
    last_error: record.lastError,
    closed_at: record.closedAt,
    updated_at: record.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export type TalkWorkflowCreateInput = {
  id: string
  userId: string
  conversationId: string
  name: TalkWorkflowName
  definitionVersion: number
  stage: string
  anchorDate: string
  timeZone: string
  state: Record<string, unknown>
  runtimeVersion: string
  instructionVersions: string[]
  model: string
}

export type TalkWorkflowUpdate = Partial<{
  stage: string
  status: TalkWorkflowStatus
  state: Record<string, unknown>
  pendingActionId: string | null
  sourceFingerprint: string | null
  confirmationState: TalkWorkflowRecord['confirmationState']
  runtimeVersion: string
  instructionVersions: string[]
  model: string
  lastError: string | null
}>

export interface TalkWorkflowStore {
  /** The at-most-one workflow still running in this conversation. */
  getActiveByConversation(userId: string, conversationId: string): Promise<TalkWorkflowRecord | null>
  getById(userId: string, workflowId: string): Promise<TalkWorkflowRecord | null>
  /** Newest first. Terminal workflows are retained as history. */
  listByConversation(userId: string, conversationId: string): Promise<TalkWorkflowRecord[]>
  create(input: TalkWorkflowCreateInput): Promise<TalkWorkflowRecord>
  /** Compare-and-swap on revision. Resolves null when the revision moved. */
  updateCas(
    userId: string,
    workflowId: string,
    expectedRevision: number,
    updates: TalkWorkflowUpdate,
  ): Promise<TalkWorkflowRecord | null>
}

export class TalkWorkflowActiveConflictError extends Error {
  readonly code = 'talk_workflow_active_conflict'
}

// ---------------------------------------------------------------------------
// In-memory store for deterministic tests
// ---------------------------------------------------------------------------

/**
 * Mirrors the migration's constraints — the partial unique index on active
 * workflows, revision compare-and-swap, and the closed_at/status invariant — so
 * repository tests exercise the same rules without hosted Supabase.
 */
export function createInMemoryTalkWorkflowStore(
  seed: TalkWorkflowRecord[] = [],
  clock: () => string = () => new Date().toISOString(),
): TalkWorkflowStore & { all(): TalkWorkflowRecord[] } {
  const rows = new Map<string, TalkWorkflowRecord>()
  for (const record of seed) rows.set(record.id, TalkWorkflowRecordSchema.parse(record))

  const byConversation = (userId: string, conversationId: string) =>
    [...rows.values()]
      .filter((row) => row.userId === userId && row.conversationId === conversationId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))

  return {
    all: () => [...rows.values()],

    async getActiveByConversation(userId, conversationId) {
      return byConversation(userId, conversationId).find((row) => row.status === 'active') ?? null
    },

    async getById(userId, workflowId) {
      const row = rows.get(workflowId)
      return row && row.userId === userId ? row : null
    },

    async listByConversation(userId, conversationId) {
      return byConversation(userId, conversationId)
    },

    async create(input) {
      const active = await this.getActiveByConversation(input.userId, input.conversationId)
      if (active) {
        throw new TalkWorkflowActiveConflictError(
          'This Talk conversation already has an active workflow.',
        )
      }
      const record = TalkWorkflowRecordSchema.parse({
        ...input,
        status: 'active',
        pendingActionId: null,
        sourceFingerprint: null,
        confirmationState: 'none',
        revision: 1,
        lastError: null,
        closedAt: null,
        updatedAt: clock(),
      })
      rows.set(record.id, record)
      return record
    },

    async updateCas(userId, workflowId, expectedRevision, updates) {
      const current = rows.get(workflowId)
      if (!current || current.userId !== userId) return null
      if (current.revision !== expectedRevision) return null

      const status = updates.status ?? current.status
      const next = TalkWorkflowRecordSchema.parse({
        ...current,
        ...updates,
        status,
        // Enforces talk_workflows_closed_at_check in application code too.
        closedAt: isTerminalTalkWorkflowStatus(status) ? (current.closedAt ?? clock()) : null,
        revision: current.revision + 1,
        updatedAt: clock(),
      })
      rows.set(workflowId, next)
      return next
    },
  }
}
