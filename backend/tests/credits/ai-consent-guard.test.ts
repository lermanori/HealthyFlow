import { db } from '../../src/supabase-client'
import { Credits } from '../../src/credits'

jest.mock('../../src/supabase-client', () => ({
  db: {
    getLatestAiConsentDecision: jest.fn(),
    recordAiRefusal: jest.fn().mockResolvedValue(undefined),
    sumAiCostUsdSince: jest.fn(),
    countUserActionsSince: jest.fn(),
    reserveCredits: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const action = { endpoint: 'ai-chat', model: 'gpt-4o-mini', userPrompt: 'Plan my day' }

beforeEach(() => {
  jest.clearAllMocks()
})

describe('AI consent authorization guard', () => {
  it('refuses before cost guards, grants, or charges when permission is absent', async () => {
    mockDb.getLatestAiConsentDecision.mockResolvedValue(null as never)

    await expect(Credits.authorizeAction('user-1', action)).resolves.toEqual({
      ok: false,
      code: 'ai_consent_required',
    })
    expect(mockDb.sumAiCostUsdSince).not.toHaveBeenCalled()
    expect(mockDb.countUserActionsSince).not.toHaveBeenCalled()
    expect(mockDb.reserveCredits).not.toHaveBeenCalled()
  })

  it('fails closed with a distinct outcome when the consent read breaks', async () => {
    mockDb.getLatestAiConsentDecision.mockRejectedValue(new Error('database unavailable'))

    await expect(Credits.authorizeAction('user-1', action)).resolves.toEqual({
      ok: false,
      code: 'ai_consent_unavailable',
    })
    expect(mockDb.sumAiCostUsdSince).not.toHaveBeenCalled()
    expect(mockDb.reserveCredits).not.toHaveBeenCalled()
  })
})
