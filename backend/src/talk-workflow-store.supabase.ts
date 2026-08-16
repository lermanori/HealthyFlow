import { db } from './supabase-client'
import {
  rowToTalkWorkflowRecord,
  TalkWorkflowActiveConflictError,
  type TalkWorkflowStore,
} from './talk-workflow-store'

// The production TalkWorkflowStore. Kept in its own file so the store contract,
// its row mapping, and the in-memory test implementation stay importable without
// pulling in the Supabase client.

function isUniqueViolation(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && String((error as { code?: unknown }).code) === '23505'
}

export function createSupabaseTalkWorkflowStore(): TalkWorkflowStore {
  return {
    async getActiveByConversation(userId, conversationId) {
      const row = await db.getActiveTalkWorkflowByConversation(userId, conversationId)
      return row ? rowToTalkWorkflowRecord(row) : null
    },

    async getById(userId, workflowId) {
      const row = await db.getTalkWorkflowById(userId, workflowId)
      return row ? rowToTalkWorkflowRecord(row) : null
    },

    async listByConversation(userId, conversationId) {
      const rows = await db.listTalkWorkflowsByConversation(userId, conversationId)
      return rows.map(rowToTalkWorkflowRecord)
    },

    async create(input) {
      try {
        const row = await db.createTalkWorkflow({
          id: input.id,
          user_id: input.userId,
          conversation_id: input.conversationId,
          name: input.name,
          definition_version: input.definitionVersion,
          stage: input.stage,
          status: 'active',
          anchor_date: input.anchorDate,
          time_zone: input.timeZone,
          state: input.state,
          pending_action_id: null,
          source_fingerprint: null,
          confirmation_state: 'none',
          runtime_version: input.runtimeVersion,
          instruction_versions: input.instructionVersions,
          model: input.model,
          revision: 1,
          closed_at: null,
        })
        return rowToTalkWorkflowRecord(row)
      } catch (error) {
        // The partial unique index is the authority on "one active workflow per
        // conversation"; a lost race surfaces as a typed conflict, not a 500.
        if (isUniqueViolation(error)) {
          throw new TalkWorkflowActiveConflictError(
            'This Talk conversation already has an active workflow.',
          )
        }
        throw error
      }
    },

    async updateCas(userId, workflowId, expectedRevision, updates) {
      const row = await db.updateTalkWorkflowCas(userId, workflowId, expectedRevision, {
        ...(updates.stage !== undefined ? { stage: updates.stage } : {}),
        ...(updates.status !== undefined
          ? {
              status: updates.status,
              closed_at: updates.status === 'active' ? null : new Date().toISOString(),
            }
          : {}),
        ...(updates.state !== undefined ? { state: updates.state } : {}),
        ...(updates.pendingActionId !== undefined ? { pending_action_id: updates.pendingActionId } : {}),
        ...(updates.sourceFingerprint !== undefined ? { source_fingerprint: updates.sourceFingerprint } : {}),
        ...(updates.confirmationState !== undefined ? { confirmation_state: updates.confirmationState } : {}),
        ...(updates.runtimeVersion !== undefined ? { runtime_version: updates.runtimeVersion } : {}),
        ...(updates.instructionVersions !== undefined ? { instruction_versions: updates.instructionVersions } : {}),
        ...(updates.model !== undefined ? { model: updates.model } : {}),
        ...(updates.lastError !== undefined ? { last_error: updates.lastError } : {}),
      })
      return row ? rowToTalkWorkflowRecord(row) : null
    },
  }
}
