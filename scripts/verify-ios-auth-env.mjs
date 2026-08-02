import { loadEnv } from 'vite'

const env = loadEnv('production', process.cwd(), '')
const hasSupabaseKey = Boolean(
  env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY,
)
const missing = [
  !env.VITE_SUPABASE_URL && 'VITE_SUPABASE_URL',
  !hasSupabaseKey && 'VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY',
].filter(Boolean)

if (missing.length > 0) {
  console.error(
    `Cannot build iOS authentication: missing ${missing.join(', ')}.`,
  )
  process.exit(1)
}

console.log('iOS Supabase Auth build configuration is present.')
