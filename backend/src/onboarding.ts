import { db } from './supabase-client'
import { Achievements, DuplicateAchievementEntryError } from './achievements'

const today = () => new Date().toISOString().slice(0, 10)

export const Onboarding = {
  async seedNewUser(userId: string) {
    await db.upsertUserSettings(userId, {
      calorieIntake: true,
      achievementTracker: true,
      onboardingStatus: 'active',
    })
  },

  async complete(userId: string) {
    const existingSettings = await db.getUserSettings(userId)
    if (existingSettings.onboardingStatus === 'completed') {
      return { status: 'completed' as const, achievement: null }
    }

    const achievements = await Achievements.list(userId, { includeArchived: true, entryLimit: 100 })
    let definition = achievements.find(item => item.definition.name === 'Completed onboarding')?.definition

    if (!definition) {
      definition = await Achievements.createDefinition(userId, {
        name: 'Completed onboarding',
        category: 'product',
        metricType: 'custom',
        unit: 'completion',
        betterDirection: 'higher',
        targetValue: 1,
      })
    }

    let entry = null
    try {
      entry = await Achievements.createEntry(userId, definition.id, {
        date: today(),
        value: 1,
        notes: 'Completed the HealthyFlow onboarding flow.',
      })
    } catch (error) {
      if (!(error instanceof DuplicateAchievementEntryError)) throw error
    }

    await db.upsertUserSettings(userId, { onboardingStatus: 'completed' })
    return { status: 'completed' as const, achievement: { definition, entry } }
  },

  async skip(userId: string) {
    await db.upsertUserSettings(userId, { onboardingStatus: 'skipped' })
    return { status: 'skipped' as const }
  },
}
