import { db } from './supabase-client'

export const Onboarding = {
  async seedNewUser(userId: string) {
    const existing = await db.getUserSettings(userId)
    if (existing.onboardingStatus === 'completed' || existing.onboardingStatus === 'skipped') {
      return existing
    }
    await db.upsertUserSettings(userId, {
      calorieIntake: true,
      achievementTracker: true,
      onboardingStatus: 'active',
    })
  },
}
