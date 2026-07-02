/**
 * Playwright globalSetup: seed e2e test user (idempotent) then reset their tasks.
 * Runs once before the whole test suite, not per-test.
 */
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../../.env') })

export const TEST_EMAIL = 'e2e@test.healthyflow.local'
export const TEST_PASSWORD = 'e2e-test-pw-42!'
const TEST_NAME = 'E2E Test User'

export default async function globalSetup() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Idempotent upsert of the test user
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', TEST_EMAIL)
    .maybeSingle()

  if (!existing) {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    const { error } = await supabase
      .from('users')
      .insert({ email: TEST_EMAIL, name: TEST_NAME, password_hash: passwordHash })
    if (error) throw new Error(`Failed to seed test user: ${error.message}`)
  }

  // Reset the test user's tasks so each run starts clean
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', TEST_EMAIL)
    .single()

  if (user) {
    await supabase.from('workout_sessions').delete().eq('user_id', user.id)
    await supabase.from('workout_exercise_items').delete().eq('user_id', user.id)
    await supabase.from('tasks').delete().eq('user_id', user.id)
  }
}
