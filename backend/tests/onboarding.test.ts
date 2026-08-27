import { db } from '../src/supabase-client'
import { Onboarding } from '../src/onboarding'

jest.mock('../src/supabase-client', () => ({
  db: {
    upsertUserSettings: jest.fn(),
    createTask: jest.fn(),
    getUserSettings: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserSettings.mockResolvedValue({})
})

describe('Onboarding', () => {
  it('seeds new users with onboarding settings and no sample tasks', async () => {
    mockDb.upsertUserSettings.mockResolvedValue({})

    await Onboarding.seedNewUser('user-1')

    expect(mockDb.upsertUserSettings).toHaveBeenCalledWith('user-1', {
      calorieIntake: true,
      achievementTracker: true,
      onboardingStatus: 'active',
    })
    expect(mockDb.createTask).not.toHaveBeenCalled()
  })

  it.each(['completed', 'skipped'] as const)(
    'does not reopen %s onboarding when an interrupted signup retries',
    async (onboardingStatus) => {
      mockDb.getUserSettings.mockResolvedValue({ onboardingStatus })

      await Onboarding.seedNewUser('user-1')

      expect(mockDb.upsertUserSettings).not.toHaveBeenCalled()
    },
  )
})
