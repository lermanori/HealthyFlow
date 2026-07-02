import { db } from '../src/supabase-client'
import { Achievements } from '../src/achievements'
import { Onboarding } from '../src/onboarding'

jest.mock('../src/supabase-client', () => ({
  db: {
    upsertUserSettings: jest.fn(),
    createTask: jest.fn(),
    getUserSettings: jest.fn(),
  },
}))

jest.mock('../src/achievements', () => ({
  Achievements: {
    list: jest.fn(),
    createDefinition: jest.fn(),
    createEntry: jest.fn(),
  },
  DuplicateAchievementEntryError: class DuplicateAchievementEntryError extends Error {},
}))

const mockDb = db as jest.Mocked<typeof db>
const mockAchievements = Achievements as jest.Mocked<typeof Achievements>

beforeEach(() => {
  jest.clearAllMocks()
})

describe('Onboarding', () => {
  it('seeds new users with onboarding settings and sample tasks', async () => {
    mockDb.upsertUserSettings.mockResolvedValue({})
    mockDb.createTask.mockResolvedValue({})

    await Onboarding.seedNewUser('user-1')

    expect(mockDb.upsertUserSettings).toHaveBeenCalledWith('user-1', {
      calorieIntake: true,
      achievementTracker: true,
      onboardingStatus: 'active',
    })
    expect(mockDb.createTask).toHaveBeenCalledTimes(3)
    expect(mockDb.createTask).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      title: 'Ask AI what to focus on today',
      type: 'task',
      category: 'work',
      position: 0,
    }))
  })

  it('completes onboarding by awarding an achievement and hiding the flow', async () => {
    mockDb.getUserSettings.mockResolvedValue({ onboardingStatus: 'active' })
    mockAchievements.list.mockResolvedValue([])
    mockAchievements.createDefinition.mockResolvedValue({
      id: 'achievement-1',
      userId: 'user-1',
      name: 'Completed onboarding',
      category: 'product',
      metricType: 'custom',
      unit: 'completion',
      betterDirection: 'higher',
      targetValue: 1,
      archivedAt: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })
    mockAchievements.createEntry.mockResolvedValue({
      id: 'entry-1',
      achievementId: 'achievement-1',
      userId: 'user-1',
      date: '2026-07-01',
      value: 1,
      supportingValue: null,
      supportingUnit: null,
      notes: 'Completed the HealthyFlow onboarding flow.',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })
    mockDb.upsertUserSettings.mockResolvedValue({ onboardingStatus: 'completed' })

    const result = await Onboarding.complete('user-1')

    expect(result.status).toBe('completed')
    expect(mockAchievements.createDefinition).toHaveBeenCalledWith('user-1', expect.objectContaining({
      name: 'Completed onboarding',
    }))
    expect(mockAchievements.createEntry).toHaveBeenCalledWith('user-1', 'achievement-1', expect.objectContaining({
      value: 1,
    }))
    expect(mockDb.upsertUserSettings).toHaveBeenCalledWith('user-1', { onboardingStatus: 'completed' })
  })
})
