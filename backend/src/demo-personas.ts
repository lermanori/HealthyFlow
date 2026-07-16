import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { Achievements } from './achievements'
import { supabase, db } from './supabase-client'
import { Workouts } from './workouts'

export const DEMO_PERSONAS = ['maya', 'noam', 'lina', 'amir'] as const
export type DemoPersona = typeof DEMO_PERSONAS[number]

const DEMO_PASSWORD = 'demo-session-only'

const personaUsers: Record<DemoPersona, { email: string; name: string }> = {
  maya: { email: 'demo-maya@healthyflow.com', name: 'Maya Chen' },
  noam: { email: 'demo-noam@healthyflow.com', name: 'Noam Levi' },
  lina: { email: 'demo-lina@healthyflow.com', name: 'Lina Haddad' },
  amir: { email: 'demo-amir@healthyflow.com', name: 'Amir Cohen' },
}

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

const taskSeeds: Record<DemoPersona, SeedItem[]> = {
  maya: [...mayaHistoricalTasks, ...mayaSeed],
  noam: [
    { title: 'Take medication with breakfast', type: 'habit', category: 'health', dayOffset: 0, startTime: '08:00', duration: 5, repeatType: 'daily', completed: true },
    { title: 'Open the electricity bill and just read it', type: 'task', category: 'personal', dayOffset: 0, startTime: null, duration: 10, repeatType: 'none', position: 0 },
    { title: 'Text Dana that I need a slower reply window', type: 'task', category: 'personal', dayOffset: 0, startTime: null, duration: 5, repeatType: 'none', position: 1 },
    { title: 'Put laundry in the machine', type: 'task', category: 'personal', dayOffset: 0, startTime: '11:00', duration: 15, repeatType: 'none' },
    { title: 'Five minute reset walk', type: 'habit', category: 'health', dayOffset: 0, startTime: null, duration: 5, repeatType: 'daily', position: 2 },
    { title: 'Call the clinic back', type: 'task', category: 'health', dayOffset: -1, startTime: null, duration: 10, repeatType: 'none', position: 3 },
    { title: 'Clear one cup from the desk', type: 'task', category: 'personal', dayOffset: 1, startTime: null, duration: 3, repeatType: 'none', position: 0 },
  ],
  lina: [
    { title: 'Drink water before coffee', type: 'habit', category: 'health', dayOffset: 0, startTime: '07:30', duration: 5, repeatType: 'daily', completed: true },
    { title: 'Walk after lunch', type: 'habit', category: 'fitness', dayOffset: 0, startTime: '13:15', duration: 20, repeatType: 'daily' },
    { title: 'Evening stretch', type: 'habit', category: 'fitness', dayOffset: 0, startTime: null, duration: 10, repeatType: 'daily', position: 0 },
    { title: 'Prep overnight oats', type: 'task', category: 'nutrition', dayOffset: 0, startTime: null, duration: 10, repeatType: 'none', position: 1 },
    { title: 'Upper body workout', type: 'task', category: 'fitness', dayOffset: 0, startTime: '18:00', duration: 45, repeatType: 'none' },
    { title: 'Review weekly progress', type: 'task', category: 'health', dayOffset: 1, startTime: '19:30', duration: 20, repeatType: 'none' },
  ],
  amir: [
    { title: 'Standup with product team', type: 'task', category: 'work', dayOffset: 0, startTime: '09:00', duration: 30, repeatType: 'none', completed: true },
    { title: 'Deep work: API cleanup', type: 'task', category: 'work', dayOffset: 0, startTime: '10:00', duration: 90, repeatType: 'none' },
    { title: 'School pickup', type: 'task', category: 'personal', dayOffset: 0, startTime: '15:00', duration: 35, repeatType: 'none' },
    { title: 'Buy milk, bananas, and pasta', type: 'task', category: 'grocery', dayOffset: 0, startTime: null, duration: 20, repeatType: 'none', position: 0 },
    { title: 'Call plumber about leak', type: 'task', category: 'personal', dayOffset: 0, startTime: null, duration: 10, repeatType: 'none', position: 1 },
    { title: 'Workout habit: 20 minute strength', type: 'habit', category: 'fitness', dayOffset: 0, startTime: null, duration: 20, repeatType: 'daily', position: 2 },
    { title: 'Pack school forms', type: 'task', category: 'personal', dayOffset: -1, startTime: null, duration: 15, repeatType: 'none', position: 3 },
    { title: 'Plan tomorrow lunches', type: 'task', category: 'personal', dayOffset: 1, startTime: null, duration: 15, repeatType: 'none', position: 0 },
  ],
}

async function ensureDemoUser(persona: DemoPersona) {
  const identity = personaUsers[persona]
  const existing = await db.getUserByEmail(identity.email)
  if (existing) return existing

  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10)
  return db.createUser({ email: identity.email, name: identity.name, password_hash })
}

async function resetDemoData(userId: string) {
  const tables = [
    'assistant_messages',
    'assistant_conversations',
    'workout_plans',
    'workout_sessions',
    'workout_exercise_items',
    'achievement_entries',
    'achievement_definitions',
    'weight_entries',
    'calorie_entries',
    'calorie_items',
    'tasks',
    'ai_recommendations',
  ]

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    if (error) throw error
  }
}

async function seedTasks(userId: string, baseDate: Date, items: SeedItem[]) {
  const rows = items.map((item) => {
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

  const { error } = await supabase.from('tasks').insert(rows)
  if (error) throw error
}

async function seedRecommendation(userId: string, message: string, type: 'suggestion' | 'tip' = 'suggestion') {
  const { error } = await supabase.from('ai_recommendations').insert({ user_id: userId, message, type })
  if (error) throw error
}

async function seedLinaExtras(userId: string, baseDate: Date) {
  const today = ymd(baseDate)
  const yesterday = ymd(addDays(baseDate, -1))
  const twoDaysAgo = ymd(addDays(baseDate, -2))

  for (const entry of [
    { date: twoDaysAgo, time: '08:10', name: 'Greek yogurt bowl', quantity: '1 bowl', calories: 360, protein: 28, carbs: 42, fat: 9 },
    { date: yesterday, time: '08:05', name: 'Greek yogurt bowl', quantity: '1 bowl', calories: 360, protein: 28, carbs: 42, fat: 9 },
    { date: today, time: '08:20', name: 'Greek yogurt bowl', quantity: '1 bowl', calories: 360, protein: 28, carbs: 42, fat: 9 },
    { date: today, time: '12:45', name: 'Chicken salad', quantity: '1 plate', calories: 510, protein: 38, carbs: 32, fat: 22 },
  ]) {
    await db.createCalorieEntry({ id: uuidv4(), user_id: userId, ...entry })
  }

  await db.createWeightEntry({ id: uuidv4(), user_id: userId, date: ymd(addDays(baseDate, -14)), weight_kg: 71.8 })
  await db.createWeightEntry({ id: uuidv4(), user_id: userId, date: ymd(addDays(baseDate, -7)), weight_kg: 71.2 })
  await db.createWeightEntry({ id: uuidv4(), user_id: userId, date: today, weight_kg: 70.9 })

  await Workouts.createSession(userId, {
    date: today,
    title: 'Upper body strength',
    notes: 'Quick logged session from the tracker.',
    exercises: [
      { name: 'Squat', sets: 3, reps: 5, weightKg: 62.5, position: 0 },
      { name: 'Incline walk', durationMinutes: 20, distanceKm: 2.1, position: 1 },
    ],
  })
  await Workouts.createSession(userId, {
    date: yesterday,
    title: 'Easy run',
    notes: null,
    exercises: [{ name: '5K run', durationMinutes: 29, distanceKm: 5, position: 0 }],
  })

  const fiveK = await Achievements.createDefinition(userId, {
    name: '5K time',
    category: 'running',
    metricType: 'duration',
    unit: 'min',
    betterDirection: 'lower',
    targetValue: 27,
  })
  await Achievements.createEntry(userId, fiveK.id, { date: ymd(addDays(baseDate, -21)), value: 31.4, notes: 'Baseline park run' })
  await Achievements.createEntry(userId, fiveK.id, { date: ymd(addDays(baseDate, -7)), value: 29.6, notes: 'Felt smoother' })
  await Achievements.createEntry(userId, fiveK.id, { date: today, value: 28.9, notes: 'Demo progress entry' })
}

export async function seedDemoPersona(persona: DemoPersona, baseDate = new Date()) {
  const user = await ensureDemoUser(persona)
  const userId = user.id
  const today = ymd(baseDate)
  const dates = Array.from({ length: 7 }, (_, index) => ymd(addDays(baseDate, index - 3)))

  await resetDemoData(userId)
  await db.upsertUserSettings(userId, {
    calorieIntake: persona === 'lina',
    achievementTracker: persona === 'lina',
    workoutTracker: persona === 'lina',
    onboardingStatus: 'completed',
  })
  await seedTasks(userId, baseDate, taskSeeds[persona])

  if (persona === 'maya') {
    await seedRecommendation(userId, 'Maya has one high-focus block left today. Protect 14:00 for the investor update and keep the dentist task in Anytime.')
    await seedRecommendation(userId, 'Yesterday has one unfinished item, so Today shows how rollover keeps work visible without duplicating it.', 'tip')
  }
  if (persona === 'noam') {
    await seedRecommendation(userId, 'Noam has a low-energy day. Choose one tiny next step, keep the rest in Anytime, and let rollover carry unfinished work.')
  }
  if (persona === 'lina') {
    await seedLinaExtras(userId, baseDate)
  }
  if (persona === 'amir') {
    await seedRecommendation(userId, 'Amir has a disrupted afternoon. Move flexible work to Anytime and protect school pickup.')
  }

  return { user, today, dates }
}

export async function getDemoPersonaUser(persona: DemoPersona) {
  const { user } = await seedDemoPersona(persona)
  return user
}

export function isDemoPersonaEmail(email: string) {
  return Object.values(personaUsers).some((user) => user.email === email) || email === 'demo@healthyflow.com'
}
