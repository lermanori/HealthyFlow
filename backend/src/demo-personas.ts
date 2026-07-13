import bcrypt from 'bcryptjs'
import { supabase, db } from './supabase-client'

const MAYA_EMAIL = 'demo-maya@healthyflow.com'
const MAYA_NAME = 'Maya Chen'
const DEMO_PASSWORD = 'demo-session-only'

function ymd(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function completedAt(day: string, time: string | null) {
  return `${day}T${(time ?? '12:00')}:00.000Z`
}

type SeedItem = {
  title: string
  type: 'task' | 'habit'
  category: string
  dayOffset: number
  startTime: string | null
  duration: number
  repeatType: 'none' | 'daily'
  completed?: boolean
  position?: number | null
}

const mayaSeed: SeedItem[] = [
  { title: 'Morning planning: turn notes into a real day', type: 'habit', category: 'work', dayOffset: 0, startTime: '07:45', duration: 15, repeatType: 'daily', completed: true },
  { title: 'Water bottle at desk', type: 'habit', category: 'health', dayOffset: 0, startTime: null, duration: 5, repeatType: 'daily', completed: false, position: 0 },
  { title: 'Reply to Daniel about pricing', type: 'task', category: 'work', dayOffset: 0, startTime: '09:00', duration: 25, repeatType: 'none', completed: true },
  { title: 'Review launch page copy', type: 'task', category: 'work', dayOffset: 0, startTime: '11:00', duration: 45, repeatType: 'none' },
  { title: 'Prep investor update bullets', type: 'task', category: 'work', dayOffset: 0, startTime: '14:00', duration: 60, repeatType: 'none' },
  { title: 'Book dentist appointment', type: 'task', category: 'personal', dayOffset: 0, startTime: null, duration: 10, repeatType: 'none', position: 1 },
  { title: '30 minute run after work', type: 'task', category: 'fitness', dayOffset: 0, startTime: '18:30', duration: 30, repeatType: 'none' },
  { title: 'Follow up with Lena', type: 'task', category: 'work', dayOffset: 1, startTime: '10:00', duration: 20, repeatType: 'none' },
  { title: 'Draft partnership email', type: 'task', category: 'work', dayOffset: -1, startTime: null, duration: 30, repeatType: 'none', completed: false, position: 2 },
]

const mayaHistoricalTasks: SeedItem[] = [
  { title: 'Ship onboarding copy pass', type: 'task', category: 'work', dayOffset: -3, startTime: '10:00', duration: 50, repeatType: 'none', completed: true },
  { title: 'Customer call notes', type: 'task', category: 'work', dayOffset: -2, startTime: '15:00', duration: 30, repeatType: 'none', completed: true },
  { title: 'Grocery run for the week', type: 'task', category: 'grocery', dayOffset: -1, startTime: '17:30', duration: 35, repeatType: 'none', completed: true },
]

async function ensureMayaUser() {
  const existing = await db.getUserByEmail(MAYA_EMAIL)
  if (existing) return existing

  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10)
  return db.createUser({ email: MAYA_EMAIL, name: MAYA_NAME, password_hash })
}

export async function seedMayaDemo(baseDate = new Date()) {
  const user = await ensureMayaUser()
  const userId = user.id
  const today = ymd(baseDate)
  const dates = Array.from({ length: 7 }, (_, index) => ymd(addDays(baseDate, index - 3)))

  await supabase.from('tasks').delete().eq('user_id', userId)
  await supabase.from('ai_recommendations').delete().eq('user_id', userId)
  await db.upsertUserSettings(userId, {
    calorieIntake: false,
    achievementTracker: false,
    workoutTracker: false,
    onboardingStatus: 'completed',
  })

  const rows = [...mayaHistoricalTasks, ...mayaSeed].map((item) => {
    const scheduledDate = ymd(addDays(baseDate, item.dayOffset))
    const completed = Boolean(item.completed)
    return {
      user_id: userId,
      title: item.title,
      type: item.type,
      category: item.category,
      start_time: item.startTime,
      duration: item.duration,
      repeat_type: item.repeatType,
      completed,
      completed_at: completed ? completedAt(scheduledDate, item.startTime) : null,
      scheduled_date: scheduledDate,
      position: item.position ?? null,
      synced_to_google: false,
      google_sync_status: 'skipped',
    }
  })

  const { error: insertError } = await supabase.from('tasks').insert(rows)
  if (insertError) throw insertError

  const { error: recommendationsError } = await supabase.from('ai_recommendations').insert([
    {
      user_id: userId,
      message: 'Maya has one high-focus block left today. Protect 14:00 for the investor update and keep the dentist task in Anytime.',
      type: 'suggestion',
    },
    {
      user_id: userId,
      message: 'Yesterday has one unfinished item, so Today shows how rollover keeps work visible without duplicating it.',
      type: 'tip',
    },
  ])
  if (recommendationsError) throw recommendationsError

  return { user, today, dates }
}

export async function getMayaDemoUser() {
  const { user } = await seedMayaDemo()
  return user
}
