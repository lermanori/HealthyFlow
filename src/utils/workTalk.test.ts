import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WorkProject } from '../services/api'
import {
  discussProjectContext,
  planInTalkContext,
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
    const { prompt, label, workflow } = planInTalkContext(project(), [
        { id: 't1', title: 'Add the env var', status: 'open', relation: 'Unblocking', scheduledDate: null, duration: null },
        { id: 't2', title: 'Old work', status: 'completed', relation: 'Optional polish', scheduledDate: null, duration: null },
      ])

    assert.match(label, /InvoiceFlow/)
    assert.deepEqual(workflow, { name: 'plan_focused_work' })
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

  it('keeps the discussion handoff out of the planning workflow', () => {
    const { label, prompt, workflow } = discussProjectContext(project())
    assert.equal(workflow, undefined)
    assert.match(label, /InvoiceFlow/)
    assert.match(prompt, /InvoiceFlow/)
    assert.match(prompt, /Submit a review-ready app build this week/)
    assert.match(prompt, /Production login works/)
    assert.match(prompt, /Do not change records without asking/)
  })

  it('says a missing target is unrecorded in the discussion handoff too', () => {
    const { prompt } = discussProjectContext(project({ target: null, milestone: null }))
    assert.match(prompt, /Target: Not recorded yet/)
    assert.match(prompt, /Current milestone: Not recorded yet/)
  })
})

describe('Work → Talk workflow routing', () => {
  // The workflow field is the only thing that routes Talk into the durable
  // plan_focused_work runtime, so it must survive the router-state round trip.
  it('carries plan_focused_work through router state for the planning handoff', () => {
    const parsed = workTalkContext(workTalkState(planInTalkContext(project(), [])))
    assert.equal(parsed?.workflow?.name, 'plan_focused_work')
  })

  it('carries no workflow through router state for the discussion handoff', () => {
    const parsed = workTalkContext(workTalkState(discussProjectContext(project())))
    assert.equal(parsed?.workflow, undefined)
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
