import path from 'path'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'

// Load the same .env the server uses (repo root)
dotenv.config({ path: path.join(__dirname, '../../.env') })

import { db } from '../src/supabase-client'

const DEMO_EMAIL = 'demo@healthyflow.com'
const DEMO_PASSWORD = 'demo123'
const DEMO_NAME = 'Demo User'

async function main() {
  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const existing = await db.getUserByEmail(DEMO_EMAIL)

  if (existing) {
    await db.updateUserPassword(existing.id, password_hash)
    console.log(`Demo user existed — password reset to "${DEMO_PASSWORD}". id=${existing.id}`)
  } else {
    const user = await db.createUser({ email: DEMO_EMAIL, name: DEMO_NAME, password_hash })
    console.log(`Demo user created with password "${DEMO_PASSWORD}". id=${user?.id}`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
