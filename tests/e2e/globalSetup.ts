/**
 * Playwright globalSetup: verify the one pre-provisioned E2E user, then reset
 * their mutable data. Automated tests must never create user accounts.
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../../.env') })

export const TEST_EMAIL = 'e2e@test.healthyflow.local'
export const TEST_PASSWORD = 'e2e-test-pw-42!'
export const TEST_NAME = 'E2E Test User'

export default async function globalSetup() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, is_test, disabled_at')
    .eq('email', TEST_EMAIL)
    .maybeSingle()

  if (userError) {
    throw new Error(`Failed to verify the pre-provisioned E2E user: ${userError.message}`)
  }
  if (!user) {
    throw new Error(
      `Missing ${TEST_EMAIL}. Provision this durable test account outside the automated test suite before running Playwright.`
    )
  }
  if (user.is_test !== true) {
    throw new Error(`${TEST_EMAIL} must be explicitly marked as a test user before Playwright can use it.`)
  }
  if (user.disabled_at) {
    throw new Error(`${TEST_EMAIL} is disabled. Re-enable the durable test account before running Playwright.`)
  }

  const userScopedTables = [
    'workout_plans',
    'workout_sessions',
    'workout_exercise_items',
    'calorie_entries',
    'calorie_items',
    'weight_entries',
    'achievement_entries',
    'achievement_definitions',
    'habit_progress_entries',
    'tasks',
  ]
  for (const table of userScopedTables) {
    const { error } = await supabase.from(table).delete().eq('user_id', user.id)
    if (error) throw new Error(`Failed to reset ${TEST_EMAIL} table ${table}: ${error.message}`)
  }

  const { data: settingsRow, error: settingsError } = await supabase
    .from('user_settings')
    .select('settings')
    .eq('user_id', user.id)
    .maybeSingle()
  if (settingsError) throw new Error(`Failed to read ${TEST_EMAIL} settings: ${settingsError.message}`)

  const settings = (settingsRow?.settings as Record<string, unknown> | null) ?? {}
  const { error: resetSettingsError } = await supabase
    .from('user_settings')
    .upsert({
      user_id: user.id,
      settings: { ...settings, onboardingStatus: 'completed' },
      updated_at: new Date().toISOString(),
    })
  if (resetSettingsError) {
    throw new Error(`Failed to reset ${TEST_EMAIL} settings: ${resetSettingsError.message}`)
  }
}
