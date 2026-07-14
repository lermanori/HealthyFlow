import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load .env from the repo root (two levels up from backend/src/db).
dotenv.config({ path: path.join(__dirname, '../../../.env') })

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
