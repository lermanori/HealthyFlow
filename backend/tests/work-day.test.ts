import { Work } from '../src/work'
import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    getFocusBlocksByDate: jest.fn(),
    getTasksByIds: jest.fn(),
    getProjectsByUserId: jest.fn(),
    getFocusBlockById: jest.fn(),
    deleteFocusBlock: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

const USER_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const TASK_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_TASK_ID = '55555555-5555-4555-8555-555555555555'
const BLOCK_ID = '44444444-4444-4444-8444-444444444444'
const DATE = '2026-08-04'

const projectRow = {
  id: PROJECT_ID,
  user_id: USER_ID,
  name: 'InvoiceFlow',
  color: '#22d3ee',
  is_archived: false,
  status: 'Active',
  target: 'Ship invoice reminders',
  milestone: 'Reminders send on schedule',
  definition_of_done: null,
  deadline: null,
  context: {},
  created_at: '2026-08-01T08:00:00.000Z',
}

const taskRow = {
  id: TASK_ID,
  user_id: USER_ID,
  project_id: PROJECT_ID,
  title: 'Wire the reminder cron',
  target_relation: 'Unblocking',
  completed: false,
  deferred_at: null,
  deleted_at: null,
  scheduled_date: DATE,
  duration: 45,
}

const focusBlockRow = {
  id: BLOCK_ID,
  user_id: USER_ID,
  project_id: PROJECT_ID,
  task_ids: [TASK_ID],
  standalone_title: null,
  standalone_context: null,
  scheduled_date: DATE,
  start_time: '09:30:00',
  planned_minutes: 45,
  intended_outcome: 'Reminder emails send on schedule',
  intended_evidence: 'A passing reminder smoke test',
  transition_minutes: 10,
  break_minutes: 5,
  status: 'planned',
  review_trigger: null,
  started_at: null,
  ended_at: null,
  created_at: '2026-08-03T08:00:00.000Z',
  updated_at: '2026-08-03T08:00:00.000Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getFocusBlocksByDate.mockResolvedValue([focusBlockRow])
  mockDb.getTasksByIds.mockResolvedValue([taskRow])
  mockDb.getProjectsByUserId.mockResolvedValue([projectRow])
})

describe('Work.listDayFocusBlocks', () => {
  it('asks only for the requested day', async () => {
    await Work.listDayFocusBlocks(USER_ID, DATE)
    expect(mockDb.getFocusBlocksByDate).toHaveBeenCalledWith(USER_ID, DATE)
  })

  it('buckets a half-past block into its hour slot', async () => {
    const [block] = await Work.listDayFocusBlocks(USER_ID, DATE)
    expect(block.startTime).toBe('09:30')
    expect(block.slot).toBe('09:00')
  })

  it('denormalises the Project the timeline row needs', async () => {
    const [block] = await Work.listDayFocusBlocks(USER_ID, DATE)
    expect(block.project).toEqual({
      id: PROJECT_ID,
      name: 'InvoiceFlow',
      color: '#22d3ee',
      target: 'Ship invoice reminders',
      milestone: 'Reminders send on schedule',
    })
  })

  it('denormalises referenced Tasks with their relation to the target', async () => {
    const [block] = await Work.listDayFocusBlocks(USER_ID, DATE)
    expect(block.tasks).toEqual([
      expect.objectContaining({ id: TASK_ID, title: 'Wire the reminder cron', relation: 'Unblocking', status: 'open' }),
    ])
  })

  it('returns a standalone block with no Project rather than skipping it', async () => {
    mockDb.getFocusBlocksByDate.mockResolvedValue([
      { ...focusBlockRow, project_id: null, task_ids: [], standalone_title: 'Inbox zero' },
    ])
    mockDb.getTasksByIds.mockResolvedValue([])

    const [block] = await Work.listDayFocusBlocks(USER_ID, DATE)
    expect(block.project).toBeNull()
    expect(block.tasks).toEqual([])
    expect(block.standaloneTitle).toBe('Inbox zero')
  })

  // A deleted Task must not be invented back into existence, and must not take
  // the whole block off Today with it.
  it('keeps a block whose referenced Task was deleted, without fabricating the Task', async () => {
    mockDb.getFocusBlocksByDate.mockResolvedValue([
      { ...focusBlockRow, task_ids: [TASK_ID, OTHER_TASK_ID] },
    ])
    mockDb.getTasksByIds.mockResolvedValue([taskRow])

    const [block] = await Work.listDayFocusBlocks(USER_ID, DATE)
    expect(block.taskIds).toEqual([TASK_ID, OTHER_TASK_ID])
    expect(block.tasks.map(task => task.id)).toEqual([TASK_ID])
  })

  it('does not query Tasks or Projects on an empty day', async () => {
    mockDb.getFocusBlocksByDate.mockResolvedValue([])

    await expect(Work.listDayFocusBlocks(USER_ID, DATE)).resolves.toEqual([])
    expect(mockDb.getTasksByIds).not.toHaveBeenCalled()
    expect(mockDb.getProjectsByUserId).not.toHaveBeenCalled()
  })

  it('asks for each referenced Task exactly once across blocks', async () => {
    mockDb.getFocusBlocksByDate.mockResolvedValue([
      focusBlockRow,
      { ...focusBlockRow, id: '66666666-6666-4666-8666-666666666666', task_ids: [TASK_ID] },
    ])

    await Work.listDayFocusBlocks(USER_ID, DATE)
    expect(mockDb.getTasksByIds).toHaveBeenCalledTimes(1)
    expect(mockDb.getTasksByIds).toHaveBeenCalledWith(USER_ID, [TASK_ID])
  })
})

describe('Work.deleteFocusBlock', () => {
  const asStatus = (status: string) => {
    mockDb.getFocusBlockById.mockResolvedValue({ ...focusBlockRow, status })
  }

  it('deletes a planned block that never became work', async () => {
    asStatus('planned')
    await Work.deleteFocusBlock(USER_ID, BLOCK_ID)
    expect(mockDb.deleteFocusBlock).toHaveBeenCalledWith(USER_ID, BLOCK_ID)
  })

  it('deletes a canceled block', async () => {
    asStatus('canceled')
    await Work.deleteFocusBlock(USER_ID, BLOCK_ID)
    expect(mockDb.deleteFocusBlock).toHaveBeenCalled()
  })

  // Cancel is the honest verb for abandoning work you already started.
  it.each(['active', 'reviewing'])('refuses to delete an in-flight (%s) block', async (status) => {
    asStatus(status)
    await expect(Work.deleteFocusBlock(USER_ID, BLOCK_ID)).rejects.toMatchObject({ status: 409 })
    expect(mockDb.deleteFocusBlock).not.toHaveBeenCalled()
  })

  // The Work session is the durable record, and the FK forbids this anyway.
  it('refuses to delete a completed block', async () => {
    asStatus('completed')
    await expect(Work.deleteFocusBlock(USER_ID, BLOCK_ID)).rejects.toMatchObject({ status: 409 })
    expect(mockDb.deleteFocusBlock).not.toHaveBeenCalled()
  })

  it('404s for a block the user does not own', async () => {
    mockDb.getFocusBlockById.mockResolvedValue(null)
    await expect(Work.deleteFocusBlock(USER_ID, BLOCK_ID)).rejects.toMatchObject({ status: 404 })
    expect(mockDb.deleteFocusBlock).not.toHaveBeenCalled()
  })
})
