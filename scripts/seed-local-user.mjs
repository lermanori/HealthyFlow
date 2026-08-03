#!/usr/bin/env node
/**
 * Create a development account on the LOCAL Supabase stack.
 *
 * A fresh `supabase db reset` leaves zero users, so there is nothing to log in
 * with. This goes through the real signup endpoint rather than inserting a row,
 * because signup also grants signup credits, seeds onboarding state and claims a
 * public signup slot — a hand-inserted user is missing all three and fails in
 * confusing ways later.
 *
 *   node scripts/seed-local-user.mjs
 *   node scripts/seed-local-user.mjs --email me@dev.test --password Secret123! --admin
 *
 * Refuses to run unless SUPABASE_URL is a local address, so it can never create
 * an account in production.
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const email = arg('email', 'local@dev.test')
const password = arg('password', 'LocalDev123!')
const name = arg('name', 'Local Dev')
const api = arg('api', 'http://localhost:3001/api')
const makeAdmin = process.argv.includes('--admin')

// --- Production guard -------------------------------------------------------
// The one thing this script must never do is create an account on the live
// database, so the check is on the configured Supabase URL rather than on the
// API URL alone (a local API can be pointed at prod).
let env = ''
try {
  env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
} catch {
  console.error('No .env found at the repo root. Nothing to verify against — aborting.')
  process.exit(1)
}
const supabaseUrl = env.match(/^SUPABASE_URL=(.*)$/m)?.[1]?.trim() ?? ''
if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/.test(supabaseUrl)) {
  console.error(`Refusing to run: SUPABASE_URL is not local.\n  SUPABASE_URL=${supabaseUrl || '<unset>'}`)
  console.error('This script only ever seeds the local Supabase stack.')
  process.exit(1)
}

const res = await fetch(`${api}/auth/signup`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, name }),
}).catch(error => {
  console.error(`Could not reach the backend at ${api}\n  ${error.message}`)
  console.error('Is it running, and restarted since you last changed .env?')
  process.exit(1)
})

const body = await res.json().catch(() => ({}))

if (res.status === 409) {
  console.log(`Account already exists — sign in with:\n  ${email} / ${password}`)
} else if (!res.ok) {
  console.error(`Signup failed (${res.status}):`, JSON.stringify(body))
  if (body.reason === 'closed') {
    console.error('No public signup slots left. Free one with:')
    console.error("  psql \"postgresql://postgres:postgres@127.0.0.1:54322/postgres\" \\\n    -c 'update signup_access set public_slots_open = public_slots_open + 1;'")
  }
  process.exit(1)
} else {
  console.log(`Created ${email} (${body.signupCredits ?? 0} signup credits)`)
}

if (makeAdmin) {
  // Role is not settable through the API by design; set it in the database.
  execFileSync('docker', [
    'exec', '-i', 'supabase_db_HealthyFlow',
    'psql', '-U', 'postgres', '-d', 'postgres', '-q',
    '-c', `update users set role='admin' where email='${email.replace(/'/g, "''")}';`,
  ], { stdio: 'inherit' })
  console.log('Promoted to admin.')
}

console.log(`\nSign in at http://localhost:5173/app with:\n  ${email}\n  ${password}`)
