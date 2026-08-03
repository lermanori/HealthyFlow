import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WorkProject } from '../services/api'
import {
  discussTaskContext,
  planInTalkContext,
  reviewContextContext,
  startFocusBlockContext,
  workTalkContext,
  workTalkState,
} from '../workTalk'

const project = (overrides: Partial<WorkProject> = {}): WorkProject => ({
  id: 'p1',
  name: 'InvoiceFlow',
  color: '#a9c7b6',
  isArchived: false,
  status: 'Active',
  target: 'Submit a review-ready app build this week',
  milestone: 'Production login works',
  definitionOfDone: 'A review-ready build is uploaded',
  deadline: 'Friday',
  context: {
    summary: 'Production authentication is the current submission blocker.',
    blockers: ['Production auth rejects the live environment variable.'],
    constraints: ['No new dependencies before submission.'],
    nonGoals: ['Dashboard visual polish.'],
    decisions: [],
    links: [],
    nextStep: 'Add the production environment variable.',
  },
  createdAt: '2026-08-03T08:00:00.000Z',
  ...overrides,
})

describe('Work → Talk handoff', () => {
  it('carries the target, milestone and bounded context into the planning prompt', () => {
    const { prompt, label } = planInTalkContext(project(), [
        { id: 't1', title: 'Add the env var', status: 'open', relation: 'Unblocking', scheduledDate: null, duration: null },
        { id: 't2', title: 'Old work', status: 'completed', relation: 'Optional polish', scheduledDate: null, duration: null },
      ])

    assert.match(label, /InvoiceFlow/)
    assert.match(prompt, /Target: Submit a review-ready app build this week/)
    assert.match(prompt, /Current milestone: Production login works/)
    assert.match(prompt, /No new dependencies before submission\./)
    assert.match(prompt, /- Add the env var \(Unblocking\)/)
    // Completed Tasks are history, not something to plan against.
    assert.doesNotMatch(prompt, /Old work/)
  })

  it('says a missing target is unrecorded rather than leaving it out', () => {
    const { prompt } = planInTalkContext(project({ target: null, milestone: null }))
    assert.match(prompt, /Target: Not recorded yet/)
    assert.match(prompt, /Current milestone: Not recorded yet/)
  })

  it('lists no open Tasks explicitly instead of an empty section', () => {
    const { prompt } = planInTalkContext(project())
    assert.match(prompt, /Open Tasks:\n- None recorded/)
  })

  it('tells Talk that starting a block does not complete the Task', () => {
    const context = startFocusBlockContext(project(), {
      id: '11111111-1111-4111-8111-111111111111', projectId: project().id, taskIds: [],
      standaloneTitle: null, standaloneContext: null, scheduledDate: '2026-08-03', startTime: '10:00',
      plannedMinutes: 45, intendedOutcome: 'Add the production environment variable',
      intendedEvidence: 'Login smoke test passes', transitionMinutes: null, breakMinutes: null,
      status: 'planned', reviewTrigger: null, startedAt: null, endedAt: null,
      createdAt: '2026-08-03T08:00:00.000Z', updatedAt: '2026-08-03T08:00:00.000Z',
    })

    assert.ok(context)
    assert.match(context.prompt, /Intended outcome: Add the production environment variable/)
    assert.match(context.prompt, /Intended evidence: Login smoke test passes/)
    assert.match(context.prompt, /45 focused minutes/)
    assert.match(context.prompt, /does not complete the Task/)
  })

  it('has no Focus block handoff when no block is planned', () => {
    assert.equal(startFocusBlockContext(project(), null), null)
  })

  it('asks Talk to check a Task against the target rather than assume it', () => {
    const { prompt } = discussTaskContext(project(), {
      id: 't4', title: 'Improve dashboard colors', status: 'open', relation: 'Optional polish', scheduledDate: null, duration: null,
    })
    assert.match(prompt, /Recorded relationship to the target: Optional polish/)
    assert.match(prompt, /If it does not, say so plainly/)
  })

  it('forbids Talk changing the records during a context review', () => {
    const { prompt } = reviewContextContext(project())
    assert.match(prompt, /Do not change my records without asking/)
  })
})

describe('Work → Talk router state', () => {
  it('round-trips a context through router state', () => {
    const context = planInTalkContext(project())
    assert.deepEqual(workTalkContext(workTalkState(context)), context)
  })

  it('rejects state that is not a Work handoff', () => {
    assert.equal(workTalkContext(null), null)
    assert.equal(workTalkContext({}), null)
    assert.equal(workTalkContext({ dailySignalContext: { date: '2026-08-03' } }), null)
    assert.equal(workTalkContext({ workTalkContext: { label: 'x' } }), null)
    assert.equal(workTalkContext({ workTalkContext: { label: 'x', prompt: '   ' } }), null)
  })

  it('truncates an oversized prompt rather than passing it through', () => {
    const parsed = workTalkContext({ workTalkContext: { label: 'x', prompt: 'a'.repeat(9000) } })
    assert.equal(parsed?.prompt.length, 4000)
  })
})
