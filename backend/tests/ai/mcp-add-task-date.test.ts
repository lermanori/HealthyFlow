import { AiCapabilities } from '../../src/ai-capabilities'
import { db } from '../../src/supabase-client'

jest.mock('../../src/supabase-client', () => ({
  db: {
    createTask: jest.fn(async (row: any) => ({ ...row, completed: false, created_at: new Date().toISOString() })),
    getNextPosition: jest.fn(async () => 0),
    createAiAuditLog: jest.fn(),
    getAiIdempotency: jest.fn(),
    createAiIdempotency: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const USER_ID = 'user-1'
const isoDaysFromToday = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

// A model that guesses "today" can send a date weeks in the past; the Item then
// lands in Anytime as weeks-old carried work. Refuse it and say what today is.
describe('MCP add_task refuses a scheduledDate in the past', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects a date weeks ago and tells the model today\'s date', async () => {
    await expect(AiCapabilities.add_task.execute(
      { userId: USER_ID, caller: 'mcp' },
      { title: 'Laundry', scheduledDate: isoDaysFromToday(-28) },
    )).rejects.toThrow(new RegExp(`Today is ${isoDaysFromToday(0)}`))
    expect(mockDb.createTask).not.toHaveBeenCalled()
  })

  it('accepts yesterday, because the user\'s day can lag the server\'s UTC date', async () => {
    await AiCapabilities.add_task.execute(
      { userId: USER_ID, caller: 'mcp' },
      { title: 'Laundry', scheduledDate: isoDaysFromToday(-1) },
    )
    expect(mockDb.createTask).toHaveBeenCalledWith(expect.objectContaining({ scheduled_date: isoDaysFromToday(-1) }))
  })

  it('uses today when no date is given', async () => {
    await AiCapabilities.add_task.execute({ userId: USER_ID, caller: 'mcp' }, { title: 'Laundry' })
    expect(mockDb.createTask).toHaveBeenCalledWith(expect.objectContaining({ scheduled_date: isoDaysFromToday(0) }))
  })
})
