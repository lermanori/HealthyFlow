import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    getAchievementDefinitionById: jest.fn(),
    getAchievementEntryByDay: jest.fn(),
    createAchievementEntry: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

import {
  Achievements,
  DuplicateAchievementEntryError,
  summarizeAchievement,
} from '../src/achievements'

const definition = {
  id: 'achievement-1',
  user_id: 'user-1',
  name: 'Pushups',
  category: 'fitness',
  metric_type: 'reps',
  unit: 'reps',
  better_direction: 'higher',
  target_value: 60,
  archived_at: null,
  created_at: '2026-06-20T00:00:00.000Z',
  updated_at: '2026-06-20T00:00:00.000Z',
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    achievement_id: 'achievement-1',
    user_id: 'user-1',
    date: '2026-06-20',
    value: 40,
    supporting_value: null,
    supporting_unit: null,
    notes: null,
    created_at: '2026-06-20T00:00:00.000Z',
    updated_at: '2026-06-20T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('summarizeAchievement', () => {
  it('computes latest, personal best, trend, and target progress for higher-is-better achievements', () => {
    const summary = summarizeAchievement(definition, [
      entry({ id: 'e1', date: '2026-06-20', value: 40 }),
      entry({ id: 'e2', date: '2026-06-22', value: 44 }),
      entry({ id: 'e3', date: '2026-06-24', value: 42 }),
    ])

    expect(summary.latest?.id).toBe('e3')
    expect(summary.previous?.id).toBe('e2')
    expect(summary.personalBest?.id).toBe('e2')
    expect(summary.trend).toEqual({ delta: -2, direction: 'down', isImprovement: false })
    expect(summary.targetProgress).toBe(70)
  })

  it('treats lower values as personal bests for lower-is-better achievements', () => {
    const summary = summarizeAchievement(
      { ...definition, name: '5K', metric_type: 'duration', unit: 'minutes', better_direction: 'lower', target_value: 24 },
      [
        entry({ id: 'e1', date: '2026-06-20', value: 29 }),
        entry({ id: 'e2', date: '2026-06-22', value: 27 }),
      ]
    )

    expect(summary.personalBest?.id).toBe('e2')
    expect(summary.trend).toEqual({ delta: -2, direction: 'down', isImprovement: true })
  })
})

describe('Achievements.createEntry', () => {
  it('rejects a second entry for the same achievement date', async () => {
    mockDb.getAchievementDefinitionById.mockResolvedValue(definition)
    mockDb.getAchievementEntryByDay.mockResolvedValue(entry())

    await expect(Achievements.createEntry('user-1', 'achievement-1', {
      date: '2026-06-20',
      value: 41,
    })).rejects.toBeInstanceOf(DuplicateAchievementEntryError)

    expect(mockDb.createAchievementEntry).not.toHaveBeenCalled()
  })

  it('persists optional supporting measurement for weighted achievements', async () => {
    mockDb.getAchievementDefinitionById.mockResolvedValue(definition)
    mockDb.getAchievementEntryByDay.mockResolvedValue(null)
    mockDb.createAchievementEntry.mockResolvedValue(entry({
      value: 80,
      supporting_value: 5,
      supporting_unit: 'reps',
    }))

    const created = await Achievements.createEntry('user-1', 'achievement-1', {
      date: '2026-06-20',
      value: 80,
      supportingValue: 5,
      supportingUnit: 'reps',
    })

    expect(mockDb.createAchievementEntry).toHaveBeenCalledWith(expect.objectContaining({
      value: 80,
      supporting_value: 5,
      supporting_unit: 'reps',
    }))
    expect(created.supportingValue).toBe(5)
    expect(created.supportingUnit).toBe('reps')
  })
})
