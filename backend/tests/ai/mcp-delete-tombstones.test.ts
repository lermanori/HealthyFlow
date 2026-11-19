import { AiCapabilities } from '../../src/ai-capabilities'
import { db } from '../../src/supabase-client'

jest.mock('../../src/supabase-client', () => ({
  db: {
    getTaskById: jest.fn(),
    deleteTask: jest.fn(),
    softDeleteTask: jest.fn(),
    deleteHabitSeries: jest.fn(),
    softDeleteHabitSeries: jest.fn(),
    softDeleteHabitInstance: jest.fn(),
    createAiAuditLog: jest.fn(),
    getAiIdempotency: jest.fn(),
    createAiIdempotency: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db> & { softDeleteHabitSeries: jest.Mock }
const USER_ID = 'user-1'
const TASK_ID = '0b0d3f0e-6a52-4c39-9a3a-2f2a5f6f1a01'
const HABIT_ID = '0b0d3f0e-6a52-4c39-9a3a-2f2a5f6f1a02'

// Devices learn about a deletion only from a row whose `deleted_at` is set; a
// hard-deleted row simply stops existing and a synced device keeps showing it.
describe('MCP delete_item leaves tombstones that sync to devices', () => {
  beforeEach(() => jest.clearAllMocks())

  it('soft-deletes a one-shot Task instead of removing the row', async () => {
    mockDb.getTaskById.mockResolvedValue({ id: TASK_ID, user_id: USER_ID, type: 'task' } as any)

    await AiCapabilities.delete_item.execute({ userId: USER_ID, caller: 'mcp' }, { itemId: TASK_ID })

    expect(mockDb.softDeleteTask).toHaveBeenCalledWith(TASK_ID)
    expect(mockDb.deleteTask).not.toHaveBeenCalled()
  })

  it('soft-deletes a whole Habit series instead of removing its rows', async () => {
    mockDb.getTaskById.mockResolvedValue({ id: HABIT_ID, user_id: USER_ID, type: 'habit', original_habit_id: null } as any)

    await AiCapabilities.delete_item.execute(
      { userId: USER_ID, caller: 'mcp' },
      { itemId: HABIT_ID, deleteScope: 'habit' },
    )

    expect(mockDb.softDeleteHabitSeries).toHaveBeenCalledWith(HABIT_ID, USER_ID)
    expect(mockDb.deleteHabitSeries).not.toHaveBeenCalled()
  })
})
