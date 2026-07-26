jest.mock('../src/daily-context', () => {
  const { z } = require('zod')
  return {
    DailyContextInputSchema: z.object({
      date: z.string().optional(),
    }),
    DailyContextSchema: z.unknown(),
    buildDailyContext: jest.fn(),
  }
})

jest.mock('../src/supabase-client', () => ({
  db: {
    createAiPendingAction: jest.fn(),
    getTaskById: jest.fn(),
  },
}))

import {
  DailySignalReviewError,
  prepareDailySignalAction,
} from '../src/ai-capabilities'
import { buildDailyContext } from '../src/daily-context'
import { db } from '../src/supabase-client'

const TASK_ID = '11111111-1111-4111-8111-111111111111'

const actionableSignal = {
  id: `2026-07-02:schedule_overload:afternoon:${TASK_ID}`,
  type: 'schedule_overload',
  kind: 'actionable',
  severity: 'medium',
  confidence: 'high',
  summary: 'Your afternoon has three scheduled Items.',
  rationale: '"Client review" is the latest-starting Task.',
  evidence: [
    { label: 'Window', value: 'afternoon' },
    { label: 'Concrete candidate', value: 'Client review · 15:00' },
  ],
  proposal: {
    capability: 'update_item',
    label: 'Move "Client review" to Anytime',
    arguments: {
      itemId: TASK_ID,
      startTime: null,
      requestId: 'daily-signal:review-client',
    },
    affectedRecords: [{
      id: TASK_ID,
      kind: 'task',
      title: 'Client review',
      date: '2026-07-02',
    }],
    changes: [{
      field: 'startTime',
      label: 'Start time',
      before: '15:00',
      after: null,
    }],
  },
} as const

describe('Daily Signal action review', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(db.getTaskById as jest.Mock).mockResolvedValue({
      id: TASK_ID,
      user_id: 'user-1',
      title: 'Client review',
      type: 'task',
      category: 'work',
      completed: false,
      scheduled_date: '2026-07-02',
      start_time: '15:00',
      location: null,
      duration: 60,
      repeat_type: 'none',
      position: null,
      original_habit_id: null,
      rolled_over_from_task_id: null,
      original_created_at: null,
      google_event_id: null,
      synced_to_google: false,
      created_at: '2026-07-02T08:00:00.000Z',
    })
    ;(db.createAiPendingAction as jest.Mock).mockImplementation(async (row) => ({
      id: '22222222-2222-4222-8222-222222222222',
      ...row,
    }))
  })

  it('rebuilds the signal, revalidates the exact Task, and prepares the existing update capability', async () => {
    ;(buildDailyContext as jest.Mock).mockResolvedValue({
      date: '2026-07-02',
      signals: [actionableSignal],
    })

    const result = await prepareDailySignalAction('user-1', {
      date: '2026-07-02',
      signalId: actionableSignal.id,
    })

    expect(buildDailyContext).toHaveBeenCalledWith('user-1', '2026-07-02')
    expect(db.getTaskById).toHaveBeenCalledWith(TASK_ID)
    expect(db.createAiPendingAction).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      capability: 'update_item',
      args: {
        itemId: TASK_ID,
        startTime: null,
        requestId: 'daily-signal:review-client',
      },
      caller: 'internal',
      preview: expect.objectContaining({
        action: 'update_item',
        item: expect.objectContaining({
          id: TASK_ID,
          title: 'Client review',
          startTime: '15:00',
        }),
      }),
    }))
    expect(result).toMatchObject({
      signal: actionableSignal,
      pendingAction: {
        id: '22222222-2222-4222-8222-222222222222',
        capability: 'update_item',
      },
    })
  })

  it('rejects a stale signal before preparing any action', async () => {
    ;(buildDailyContext as jest.Mock).mockResolvedValue({
      date: '2026-07-02',
      signals: [],
    })

    await expect(prepareDailySignalAction('user-1', {
      date: '2026-07-02',
      signalId: actionableSignal.id,
    })).rejects.toMatchObject<Partial<DailySignalReviewError>>({
      code: 'daily_signal_stale',
    })
    expect(db.createAiPendingAction).not.toHaveBeenCalled()
  })

  it('does not turn informational guidance into a write', async () => {
    ;(buildDailyContext as jest.Mock).mockResolvedValue({
      date: '2026-07-02',
      signals: [{
        ...actionableSignal,
        id: '2026-07-02:habit_risk:habit-1',
        type: 'habit_risk',
        kind: 'informational',
        proposal: null,
      }],
    })

    await expect(prepareDailySignalAction('user-1', {
      date: '2026-07-02',
      signalId: '2026-07-02:habit_risk:habit-1',
    })).rejects.toMatchObject<Partial<DailySignalReviewError>>({
      code: 'daily_signal_informational',
    })
    expect(db.createAiPendingAction).not.toHaveBeenCalled()
  })

  it('revalidates ownership before creating a pending action', async () => {
    ;(buildDailyContext as jest.Mock).mockResolvedValue({
      date: '2026-07-02',
      signals: [actionableSignal],
    })
    ;(db.getTaskById as jest.Mock).mockResolvedValue({
      id: TASK_ID,
      user_id: 'someone-else',
    })

    await expect(prepareDailySignalAction('user-1', {
      date: '2026-07-02',
      signalId: actionableSignal.id,
    })).rejects.toThrow('No Item found')
    expect(db.createAiPendingAction).not.toHaveBeenCalled()
  })
})
