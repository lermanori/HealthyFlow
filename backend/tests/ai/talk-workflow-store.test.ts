import fs from 'node:fs'
import path from 'node:path'
import { INITIAL_PLAN_WORK_STATE, PLAN_WORK_DEFINITION } from '../../src/talk-workflow-definitions'
import {
  createInMemoryTalkWorkflowStore,
  parseTalkWorkflowState,
  rowToTalkWorkflowRecord,
  TalkWorkflowActiveConflictError,
  TalkWorkflowStateError,
  talkWorkflowRecordToRow,
  type TalkWorkflowRecord,
} from '../../src/talk-workflow-store'

// Pure: no OpenAI, no browser, no Supabase. Storage is injected in-memory and
// mirrors the migration's constraints.

const USER = '11111111-1111-4111-8111-111111111111'
const CONVO = '22222222-2222-4222-8222-222222222222'
const PROJECT = '33333333-3333-4333-8333-333333333333'
const TASK = '44444444-4444-4444-8444-444444444444'

let seq = 0
const nextId = () => `55555555-5555-4555-8555-${String(++seq).padStart(12, '0')}`

function legacyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    user_id: USER,
    conversation_id: CONVO,
    name: 'plan_focused_work',
    stage: 'interpreting',
    anchor_date: '2026-08-04',
    time_zone: 'Asia/Jerusalem',
    focus_meaning: null,
    selected_project_id: null,
    selected_task_ids: [],
    pending_action_id: null,
    pending_proposal: null,
    source_fingerprint: null,
    confirmation_state: 'none',
    runtime_version: 'agents-sdk-0.14.2/phase-5-v1',
    instruction_versions: ['base@1'],
    model: 'gpt-4o-mini',
    revision: 3,
    last_error: null,
    updated_at: '2026-08-04T09:00:00.000Z',
    ...overrides,
  }
}

function record(overrides: Partial<TalkWorkflowRecord> = {}): TalkWorkflowRecord {
  return {
    id: nextId(),
    userId: USER,
    conversationId: CONVO,
    name: 'plan_work',
    definitionVersion: 1,
    stage: 'resolve_project',
    status: 'active',
    anchorDate: '2026-08-04',
    timeZone: 'Asia/Jerusalem',
    state: { ...INITIAL_PLAN_WORK_STATE },
    pendingActionId: null,
    sourceFingerprint: null,
    confirmationState: 'none',
    runtimeVersion: 'phase-6-v1',
    instructionVersions: [],
    model: 'gpt-4o-mini',
    revision: 1,
    lastError: null,
    closedAt: null,
    updatedAt: '2026-08-04T09:00:00.000Z',
    ...overrides,
  }
}

describe('legacy Phase 5 row compatibility', () => {
  it('reads plan_focused_work as plan_work v1', () => {
    const parsed = rowToTalkWorkflowRecord(legacyRow())
    expect(parsed.name).toBe('plan_work')
    expect(parsed.definitionVersion).toBe(1)
  })

  it('splits terminal outcomes out of the stage column', () => {
    expect(rowToTalkWorkflowRecord(legacyRow({ stage: 'applied' }))).toMatchObject({
      stage: 'await_focus_confirmation',
      status: 'completed',
    })
    expect(rowToTalkWorkflowRecord(legacyRow({ stage: 'failed' }))).toMatchObject({
      stage: 'resolve_scope',
      status: 'failed',
    })
    expect(rowToTalkWorkflowRecord(legacyRow({ stage: 'declined' }))).toMatchObject({
      stage: 'await_task_confirmation',
      status: 'declined',
    })
  })

  it('stamps closedAt for a terminal legacy row and leaves it null while active', () => {
    expect(rowToTalkWorkflowRecord(legacyRow({ stage: 'applied' })).closedAt)
      .toBe('2026-08-04T09:00:00.000Z')
    expect(rowToTalkWorkflowRecord(legacyRow({ stage: 'interpreting' })).closedAt).toBeNull()
  })

  it('resolves awaiting_confirmation by which draft was pending', () => {
    expect(rowToTalkWorkflowRecord(legacyRow({ stage: 'awaiting_confirmation' })).stage)
      .toBe('await_task_confirmation')
    expect(rowToTalkWorkflowRecord(legacyRow({
      stage: 'awaiting_confirmation',
      pending_proposal: { projectId: PROJECT },
    })).stage).toBe('await_focus_confirmation')
  })

  it('maps generic clarifying back to the deterministic resolve_scope activity', () => {
    // The Phase 5 column never recorded which question was asked, so re-deriving
    // scope is correct and guessing a clarify_* stage would be fabrication.
    expect(rowToTalkWorkflowRecord(legacyRow({ stage: 'clarifying' })).stage).toBe('resolve_scope')
    expect(PLAN_WORK_DEFINITION.activity.resolve_scope).toEqual({ kind: 'application' })
  })

  it('backfills the state envelope from the Work-specific columns', () => {
    const parsed = rowToTalkWorkflowRecord(legacyRow({
      selected_project_id: PROJECT,
      selected_task_ids: [TASK],
      focus_meaning: 'focused_minutes',
    }))
    expect(parsed.state).toEqual({
      projectId: PROJECT,
      selectedTaskIds: [TASK],
      alignmentApprovedTaskIds: [],
      createdTaskId: null,
      createdFocusBlockId: null,
      focusMeaning: 'focused_minutes',
      openQuestion: null,
      blockedReasonCodes: [],
    })
    expect(() => parseTalkWorkflowState(parsed)).not.toThrow()
  })

  it('prefers a present state envelope over the deprecated columns', () => {
    const parsed = rowToTalkWorkflowRecord(legacyRow({
      selected_project_id: PROJECT,
      state: { ...INITIAL_PLAN_WORK_STATE, createdTaskId: TASK },
      status: 'active',
      stage: 'draft_focus_block',
      definition_version: 1,
    }))
    expect(parsed.state).toMatchObject({ createdTaskId: TASK, projectId: null })
  })

  it('rejects an unknown workflow name', () => {
    expect(() => rowToTalkWorkflowRecord(legacyRow({ name: 'plan_everything' })))
      .toThrow(TalkWorkflowStateError)
  })

  it('round-trips a record through the row shape', () => {
    const original = record({ state: { ...INITIAL_PLAN_WORK_STATE, projectId: PROJECT } })
    expect(rowToTalkWorkflowRecord(talkWorkflowRecordToRow(original))).toEqual(original)
  })
})

describe('durable state validation', () => {
  it('rejects state that does not satisfy the workflow schema', () => {
    const bad = record({ state: { projectId: 'not-a-uuid', selectedTaskIds: [] } })
    expect(() => parseTalkWorkflowState(bad)).toThrow(TalkWorkflowStateError)
  })

  it('accepts the definition initial state', () => {
    expect(parseTalkWorkflowState(record())).toEqual(INITIAL_PLAN_WORK_STATE)
  })
})

describe('one active workflow per conversation, with history', () => {
  const create = (store: ReturnType<typeof createInMemoryTalkWorkflowStore>, id = nextId()) =>
    store.create({
      id,
      userId: USER,
      conversationId: CONVO,
      name: 'plan_work',
      definitionVersion: PLAN_WORK_DEFINITION.version,
      stage: PLAN_WORK_DEFINITION.initialStage,
      anchorDate: '2026-08-04',
      timeZone: 'Asia/Jerusalem',
      state: { ...INITIAL_PLAN_WORK_STATE },
      runtimeVersion: 'phase-6-v1',
      instructionVersions: [],
      model: 'gpt-4o-mini',
    })

  it('refuses a second active workflow in the same conversation', async () => {
    const store = createInMemoryTalkWorkflowStore()
    await create(store)
    await expect(create(store)).rejects.toThrow(TalkWorkflowActiveConflictError)
  })

  it('lets a new workflow start once the previous one closes', async () => {
    const store = createInMemoryTalkWorkflowStore()
    const first = await create(store)
    await store.updateCas(USER, first.id, first.revision, {
      status: 'completed',
      stage: 'await_focus_confirmation',
    })

    const second = await create(store)
    expect(second.status).toBe('active')
    expect(await store.getActiveByConversation(USER, CONVO)).toMatchObject({ id: second.id })
    // History is retained, not overwritten.
    expect((await store.listByConversation(USER, CONVO)).map((row) => row.id).sort())
      .toEqual([first.id, second.id].sort())
  })

  it('scopes reads to the owning user', async () => {
    const store = createInMemoryTalkWorkflowStore()
    const created = await create(store)
    expect(await store.getById('66666666-6666-4666-8666-666666666666', created.id)).toBeNull()
    expect(await store.getById(USER, created.id)).toMatchObject({ id: created.id })
  })
})

describe('compare-and-swap claims', () => {
  const store = () => createInMemoryTalkWorkflowStore([record({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })])
  const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

  it('advances the revision on success', async () => {
    const s = store()
    const next = await s.updateCas(USER, ID, 1, { stage: 'resolve_scope' })
    expect(next).toMatchObject({ stage: 'resolve_scope', revision: 2 })
  })

  it('resolves null when another request already moved the revision', async () => {
    const s = store()
    await s.updateCas(USER, ID, 1, { stage: 'resolve_scope' })
    expect(await s.updateCas(USER, ID, 1, { stage: 'draft_task' })).toBeNull()
  })

  it('resolves null for another user', async () => {
    expect(await store().updateCas('66666666-6666-4666-8666-666666666666', ID, 1, { stage: 'resolve_scope' }))
      .toBeNull()
  })

  it('keeps closedAt consistent with status in both directions', async () => {
    const s = store()
    const closed = await s.updateCas(USER, ID, 1, { status: 'declined' })
    expect(closed?.closedAt).not.toBeNull()
    const reopened = await s.updateCas(USER, ID, closed!.revision, { status: 'active' })
    expect(reopened?.closedAt).toBeNull()
  })

  it('preserves the stage a terminal workflow stopped in', async () => {
    const s = store()
    const next = await s.updateCas(USER, ID, 1, {
      stage: 'await_focus_confirmation',
      status: 'completed',
    })
    expect(next).toMatchObject({ stage: 'await_focus_confirmation', status: 'completed' })
  })
})

describe('Phase 6 migration', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../../../supabase/migrations/20260804120000_phase_6_generic_talk_workflows.sql'),
    'utf8',
  )

  it('adds the generic envelope, definition version, and status column', () => {
    expect(migration).toContain('definition_version')
    expect(migration).toContain("status TEXT NOT NULL DEFAULT 'active'")
    expect(migration).toContain("state JSONB NOT NULL DEFAULT '{}'::jsonb")
  })

  it('expands the workflow name constraint and backfills the Phase 5 name', () => {
    expect(migration).toContain("SET name = 'plan_work', definition_version = 1")
    expect(migration).toContain("WHERE name = 'plan_focused_work'")
    for (const name of [
      'plan_day', 'plan_work', 'run_focus_block', 'review_focus_block',
      'replan_day', 'log_outcome', 'review_project', 'quick_chat',
    ]) {
      expect(migration).toContain(`'${name}'`)
    }
  })

  it('replaces the generic stage constraint rather than enumerating stages', () => {
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS talk_workflows_stage_check')
    expect(migration).toContain('talk_workflows_stage_shape_check')
    expect(migration).not.toContain("stage IN ('interpreting'")
  })

  it('keeps history and enforces one active workflow per conversation', () => {
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS talk_workflows_user_conversation_unique')
    expect(migration).toContain('idx_talk_workflows_active_conversation_unique')
    expect(migration).toContain("WHERE status = 'active'")
  })

  it('keeps generic safety columns outside the JSON envelope', () => {
    // These are still real columns after the migration: the envelope must not
    // swallow anything the database constrains.
    for (const column of ['pending_action_id', 'source_fingerprint', 'confirmation_state', 'revision', 'last_error']) {
      expect(migration).not.toContain(`DROP COLUMN ${column}`)
    }
    expect(migration).toContain('talk_workflows_closed_at_check')
  })

  it('preserves the pre-migration stage as a rollback aid', () => {
    expect(migration).toContain('legacy_stage')
    expect(migration).toContain('SET legacy_stage = stage WHERE legacy_stage IS NULL')
    // It must be captured before the rewrite, not after.
    expect(migration.indexOf('SET legacy_stage = stage'))
      .toBeLessThan(migration.indexOf("WHEN 'interpreting'       THEN 'resolve_project'"))
  })

  it('defers dropping the deprecated Work-specific columns', () => {
    expect(migration).not.toContain('DROP COLUMN IF EXISTS selected_project_id')
    expect(migration).not.toContain('DROP COLUMN IF EXISTS pending_proposal')
    expect(migration).toContain('DEPRECATED (Phase 6)')
  })

  it('runs as one transaction', () => {
    expect(migration.trimStart().startsWith('BEGIN;') || migration.includes('\nBEGIN;')).toBe(true)
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true)
  })
})
