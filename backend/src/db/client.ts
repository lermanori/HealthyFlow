import { createClient } from '@supabase/supabase-js'
import { envFiles, loadEnv } from '../load-env'

// The client is constructed at module scope, so configuration has to be present
// by the time this module is imported. Scripts and tests import it without going
// through the server entrypoint, hence the call here as well — `loadEnv` is
// idempotent, and resolving through it keeps this file and the entrypoint from
// ever disagreeing about which .env is authoritative.
loadEnv()

const REQUIRED_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const
const missing = REQUIRED_VARS.filter((name) => !process.env[name])

// Fail here rather than at the first query. Building the client from undefined
// credentials succeeds, then every request dies inside undici with
// `TypeError: fetch failed` and no indication that configuration is the cause.
if (missing.length > 0) {
  const searched = envFiles()
  throw new Error(
    [
      `Missing required environment variable(s): ${missing.join(', ')}.`,
      searched.length > 0
        ? `Loaded configuration from: ${searched.join(', ')}`
        : 'No .env file was found.',
      'Set them in the main checkout\'s .env — worktrees inherit it automatically.',
      'Set HEALTHYFLOW_ENV_FILE to override the location.',
    ].join('\n'),
  )
}

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Single shared Supabase client. Domain DB modules (db/*.ts) and the
// supabase-client facade all import this so there is exactly one client and no
// import cycle between the facade and the domain modules.
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
