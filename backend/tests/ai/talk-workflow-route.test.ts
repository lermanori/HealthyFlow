import request from 'supertest'
import jwt from 'jsonwebtoken'

jest.mock('../../src/credits', () => ({
  Credits: {
    reserve: jest.fn().mockResolvedValue(true),
    authorizeAction: jest.fn().mockResolvedValue({ ok: true, actionClass: 'text' as const, credits: 1, charged: 1, coveredBy: 'balance' as const }),
    settleAction: jest.fn().mockResolvedValue(undefined),
  },
  UnpricedModelError: class UnpricedModelError extends Error {},
}))

jest.mock('../../src/supabase-client', () => ({ db: {} }))

jest.mock('../../src/talk-workflow', () => {
  class TalkWorkflowBillingError extends Error {
    constructor(message: string, readonly code: string) { super(message) }
  }
  class TalkWorkflowConflictError extends Error { readonly code = 'talk_workflow_conflict' }
  class TalkProposalStaleError extends Error { readonly code = 'talk_proposal_stale' }
  class TalkWorkflowUnavailableError extends Error { readonly code = 'talk_workflow_unavailable' }
  return {
    getTalkWorkflow: jest.fn(),
    runTalkWorkflowTurn: jest.fn(),
    confirmTalkWorkflowAction: jest.fn(),
    cancelTalkWorkflowAction: jest.fn(),
    TalkWorkflowBillingError,
    TalkWorkflowConflictError,
    TalkProposalStaleError,
    TalkWorkflowUnavailableError,
  }
})

import { app } from '../../src/index'
import {
  cancelTalkWorkflowAction,
  confirmTalkWorkflowAction,
  getTalkWorkflow,
  runTalkWorkflowTurn,
} from '../../src/talk-workflow'

const USER_ID = '10000000-0000-4000-8000-000000000001'
const CONVERSATION_ID = '20000000-0000-4000-8000-000000000002'
const ACTION_ID = '30000000-0000-4000-8000-000000000003'

const auth = () => `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`

describe('Phase 5 Talk workflow routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getTalkWorkflow as jest.Mock).mockResolvedValue(null)
    ;(runTalkWorkflowTurn as jest.Mock).mockResolvedValue({
      message: 'One question.',
      toolEvents: [],
      pendingActions: [],
      workflow: { id: 'workflow-1', stage: 'clarifying' },
    })
  })

  it('starts the narrow workflow on the existing Talk endpoint', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', auth())
      .set('x-client-time-zone', 'Asia/Jerusalem')
      .send({
        conversationId: CONVERSATION_ID,
        workflow: { name: 'plan_focused_work', anchorDate: '2026-08-03' },
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Plan focused work.' }],
      })

    expect(res.status).toBe(200)
    expect(runTalkWorkflowTurn).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      anchorDate: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
    }))
  })

  it('resumes a persisted workflow without resending a workflow hint', async () => {
    ;(getTalkWorkflow as jest.Mock).mockResolvedValue({
      anchorDate: '2026-08-03',
      timeZone: 'Asia/Jerusalem',
      stage: 'clarifying',
    })
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', auth())
      .send({
        conversationId: CONVERSATION_ID,
        messages: [{ role: 'user', content: 'Focused minutes.' }],
      })

    expect(res.status).toBe(200)
    expect(runTalkWorkflowTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: CONVERSATION_ID,
      anchorDate: '2026-08-03',
    }))
  })

  it('routes confirmation and decline through the app-owned workflow boundary', async () => {
    ;(confirmTalkWorkflowAction as jest.Mock).mockResolvedValue({
      result: { focusBlock: { id: 'focus-1' } },
      action: { id: ACTION_ID },
    })
    ;(cancelTalkWorkflowAction as jest.Mock).mockResolvedValue({ id: ACTION_ID })

    const confirmed = await request(app)
      .post('/api/ai/chat/confirm')
      .set('Authorization', auth())
      .send({ actionId: ACTION_ID })
    const declined = await request(app)
      .post('/api/ai/chat/cancel')
      .set('Authorization', auth())
      .send({ actionId: ACTION_ID })

    expect(confirmed.status).toBe(200)
    expect(declined.status).toBe(200)
    expect(confirmTalkWorkflowAction).toHaveBeenCalledWith(USER_ID, ACTION_ID, undefined)
    expect(cancelTalkWorkflowAction).toHaveBeenCalledWith(USER_ID, ACTION_ID)
  })
})
