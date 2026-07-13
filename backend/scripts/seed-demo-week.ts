/**
 * Reseed the demo account (demo@healthyflow.com) so the CURRENT week reads as a
 * "winning week": habits completed across the week, realistic completed tasks each
 * day, and a believable, on-track Today (a couple of items still upcoming this
 * evening). Idempotent — safe to re-run; it clears the rows it previously seeded
 * for the current week before re-inserting.
 *
 * Run from the backend dir:  npx tsx scripts/seed-demo-week.ts
 */
import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.join(__dirname, '../../.env') })
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}
const supabase = createClient(url, serviceKey)

const DEMO_EMAIL = 'demo@healthyflow.com'

// Anchor the "current week" on the real today so the seed always lands on the
// week the app renders. Monday-first week (matches Week View "Jul 6 – 12").
const TODAY = new Date()
function ymd(d: Date) { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number) { const c = new Date(d); c.setUTCDate(c.getUTCDate() + n); return c }
// JS getUTCDay: 0=Sun..6=Sat. Monday-first offset.
const dow = TODAY.getUTCDay()
const mondayOffset = dow === 0 ? -6 : 1 - dow
const MONDAY = addDays(TODAY, mondayOffset)
const WEEK = Array.from({ length: 7 }, (_, i) => ymd(addDays(MONDAY, i)))
const TODAY_KEY = ymd(TODAY)
const pastDays = WEEK.filter(d => d < TODAY_KEY)

function completedAt(day: string, time: string | null) {
  // Keep completed_at on the instance's own day so untimed rollover ("completed
  // today") never drags past-day items onto Today.
  return `${day}T${(time ?? '12:00')}:00.000Z`
}

async function main() {
  const { data: user } = await supabase.from('users').select('id').eq('email', DEMO_EMAIL).single()
  if (!user) { console.error('No demo user found'); process.exit(1) }
  const userId = user.id
  console.log(`Demo user ${userId} — week ${WEEK[0]} … ${WEEK[6]} (today ${TODAY_KEY})`)

  // Habit templates (pure recurring definitions: original_habit_id IS NULL).
  const { data: templates } = await supabase
    .from('tasks').select('*')
    .eq('user_id', userId).eq('type', 'habit').eq('repeat_type', 'daily')
    .is('original_habit_id', null).is('deleted_at', null)
  const habits = (templates || [])
  console.log('Habit templates:', habits.map(h => h.title).join(', '))

  // ---- Idempotent cleanup: remove rows THIS script owns for the current week ----
  // (a) habit instance rows in-week, (b) seeded one-off tasks in-week.
  const { data: toDelete } = await supabase
    .from('tasks').select('id, type, original_habit_id, scheduled_date')
    .eq('user_id', userId).is('deleted_at', null).in('scheduled_date', WEEK)
  const deleteIds = (toDelete || [])
    .filter(r => (r.type === 'habit' && r.original_habit_id) || r.type === 'task')
    .map(r => r.id)
  if (deleteIds.length) {
    await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).in('id', deleteIds)
    console.log(`Cleared ${deleteIds.length} previously-seeded in-week rows`)
  }

  // ---- Resolve the two stale untimed guilt tasks so they stop rolling forward ----
  // "Book dentist appointment" / "Order groceries for the week" are untimed + open
  // and roll onto every day. Mark them done on Monday so no day shows them as missed.
  const { data: guilt } = await supabase
    .from('tasks').select('id, title')
    .eq('user_id', userId).eq('type', 'task')
    .is('start_time', null).eq('completed', false).is('deleted_at', null)
  for (const g of (guilt || [])) {
    await supabase.from('tasks')
      .update({ completed: true, completed_at: completedAt(WEEK[0], '09:00') })
      .eq('id', g.id)
    console.log(`Resolved rolling task: ${g.title}`)
  }

  // ---- Completed habit instances across the week ----
  const rows: any[] = []
  const isTimed = (h: any) => Boolean(h.start_time)
  for (const h of habits) {
    for (const day of pastDays) {
      rows.push({
        user_id: userId, title: h.title, type: 'habit', category: h.category,
        start_time: h.start_time, duration: h.duration, repeat_type: 'daily',
        completed: true, completed_at: completedAt(day, h.start_time),
        scheduled_date: day, original_habit_id: h.id,
      })
    }
  }
  // Today: complete all habits so habit-consistency streaks read cleanly (the app's
  // current-streak counts today, so a habit left open today would show streak 0 next
  // to the others). Today still looks in-progress via an upcoming evening task below.
  for (const h of habits) {
    rows.push({
      user_id: userId, title: h.title, type: 'habit', category: h.category,
      start_time: h.start_time, duration: h.duration, repeat_type: 'daily',
      completed: true, completed_at: completedAt(TODAY_KEY, isTimed(h) ? h.start_time : '11:00'),
      scheduled_date: TODAY_KEY, original_habit_id: h.id,
    })
  }

  // ---- Realistic completed tasks per day (2 per past day → ~5/5 with 3 habits) ----
  type T = { title: string; category: string; start: string | null; dur: number; done?: boolean }
  const byDay: Record<number, T[]> = {
    0: [ // Mon
      { title: 'Deep work: finish launch deck', category: 'work', start: '09:00', dur: 90 },
      { title: 'Upper body workout', category: 'fitness', start: '18:00', dur: 60 },
    ],
    1: [ // Tue
      { title: 'Team sync with design', category: 'work', start: '10:30', dur: 30 },
      { title: '5k run', category: 'fitness', start: '18:00', dur: 30 },
    ],
    2: [ // Wed
      { title: 'Inbox zero + weekly review', category: 'work', start: '09:30', dur: 45 },
      { title: 'Meal prep — salmon & quinoa', category: 'nutrition', start: '19:00', dur: 45 },
    ],
    3: [ // Thu
      { title: '1:1 with manager', category: 'work', start: '11:00', dur: 30 },
      { title: 'Morning yoga flow', category: 'fitness', start: '07:00', dur: 30 },
    ],
    4: [ // Fri
      { title: 'Ship v2 to staging', category: 'work', start: '14:00', dur: 60 },
      { title: 'Grocery run', category: 'grocery', start: '17:30', dur: 30 },
    ],
    5: [ // Sat
      { title: 'Long run — 10k', category: 'fitness', start: '08:00', dur: 60 },
      { title: 'Call parents', category: 'personal', start: '16:00', dur: 20 },
    ],
    6: [ // Sun (today) — mostly done, one upcoming evening item
      { title: 'Weekly planning', category: 'personal', start: '10:00', dur: 30, done: true },
      { title: 'Evening walk with Maya', category: 'health', start: '20:00', dur: 30, done: false },
    ],
  }
  for (let i = 0; i < 7; i++) {
    const day = WEEK[i]
    if (day > TODAY_KEY) continue
    for (const t of byDay[i] || []) {
      const done = t.done ?? true
      rows.push({
        user_id: userId, title: t.title, type: 'task', category: t.category,
        start_time: t.start, duration: t.dur, repeat_type: 'none',
        completed: done, completed_at: done ? completedAt(day, t.start) : null,
        scheduled_date: day,
      })
    }
  }

  const { error, data: inserted } = await supabase.from('tasks').insert(rows).select('id')
  if (error) { console.error('Insert failed:', error); process.exit(1) }
  console.log(`Inserted ${inserted?.length ?? 0} rows (habit instances + tasks).`)

  await seedWeight(userId)
  await seedCalories(userId)
  await seedWorkouts(userId)
  await seedAchievements(userId)

  console.log('Done. Demo now shows a winning current week across all trackers.')
}

// ---------------------------------------------------------------------------
// Weight: a gentle downward trend across the week (upsert — unique per date).
// ---------------------------------------------------------------------------
async function seedWeight(userId: string) {
  const weights = [77.6, 77.5, 77.3, 77.2, 77.0, 76.9, 76.8]
  const rows = WEEK.map((date, i) => ({ user_id: userId, date, weight_kg: weights[i] }))
  const { error } = await supabase.from('weight_entries').upsert(rows, { onConflict: 'user_id,date' })
  if (error) { console.error('weight upsert failed:', error); process.exit(1) }
  console.log(`Weight: ${rows.length} daily entries (${weights[0]} → ${weights[6]} kg)`)
}

// ---------------------------------------------------------------------------
// Calories: 3–4 logged meals per past day (~2000 kcal); today logged through
// lunch (in-progress). Idempotent — clears this week's entries first.
// ---------------------------------------------------------------------------
async function seedCalories(userId: string) {
  await supabase.from('calorie_entries').delete().eq('user_id', userId).in('date', WEEK)
  type Meal = { name: string; cal: number; p: number; c: number; f: number; time: string }
  const breakfasts: Meal[] = [
    { name: 'Greek yogurt with berries', cal: 320, p: 22, c: 38, f: 9, time: '07:45' },
    { name: 'Oats with banana & peanut butter', cal: 410, p: 15, c: 58, f: 14, time: '07:30' },
    { name: 'Veggie omelette & toast', cal: 380, p: 26, c: 24, f: 18, time: '08:00' },
  ]
  const lunches: Meal[] = [
    { name: 'Salmon & quinoa bowl', cal: 540, p: 38, c: 52, f: 18, time: '12:30' },
    { name: 'Chicken burrito bowl', cal: 620, p: 44, c: 60, f: 20, time: '13:00' },
    { name: 'Turkey & avocado wrap', cal: 480, p: 34, c: 40, f: 18, time: '12:45' },
  ]
  const snacks: Meal[] = [
    { name: 'Apple & almond butter', cal: 210, p: 5, c: 24, f: 11, time: '16:00' },
    { name: 'Protein shake', cal: 180, p: 30, c: 6, f: 3, time: '16:30' },
  ]
  const dinners: Meal[] = [
    { name: 'Grilled chicken, rice & broccoli', cal: 650, p: 48, c: 62, f: 16, time: '19:30' },
    { name: 'Beef stir-fry with noodles', cal: 700, p: 40, c: 66, f: 24, time: '19:45' },
    { name: 'Lentil curry with rice', cal: 590, p: 24, c: 82, f: 14, time: '19:15' },
  ]
  const rows: any[] = []
  const push = (date: string, m: Meal) => rows.push({
    user_id: userId, date, name: m.name, calories: m.cal, protein: m.p, carbs: m.c, fat: m.f, time: `${m.time}:00`,
  })
  WEEK.forEach((date, i) => {
    if (date > TODAY_KEY) return
    push(date, breakfasts[i % breakfasts.length])
    push(date, lunches[i % lunches.length])
    if (date < TODAY_KEY) { // past days: full day logged
      push(date, snacks[i % snacks.length])
      push(date, dinners[i % dinners.length])
    }
  })
  const { error } = await supabase.from('calorie_entries').insert(rows)
  if (error) { console.error('calorie insert failed:', error); process.exit(1) }
  // Keep the reusable quick-insert history in sync with the foods just logged.
  const seen = new Map<string, Meal>()
  ;[...breakfasts, ...lunches, ...snacks, ...dinners].forEach(m => seen.set(m.name.toLowerCase(), m))
  const items = [...seen.values()].map(m => ({
    user_id: userId, name: m.name, normalized_name: m.name.toLowerCase(), normalized_quantity: '',
    calories: m.cal, protein: m.p, carbs: m.c, fat: m.f, usage_count: 3, last_used_at: new Date().toISOString(),
  }))
  await supabase.from('calorie_items').upsert(items, { onConflict: 'user_id,normalized_name,normalized_quantity' })
  console.log(`Calories: ${rows.length} meal entries across the week`)
}

// ---------------------------------------------------------------------------
// Workouts: a session on each training day, matching the completed workout tasks.
// Idempotent — clears this week's sessions (exercises cascade) first.
// ---------------------------------------------------------------------------
async function seedWorkouts(userId: string) {
  const { data: existing } = await supabase.from('workout_sessions').select('id').eq('user_id', userId).in('date', WEEK)
  const ids = (existing || []).map(r => r.id)
  if (ids.length) await supabase.from('workout_sessions').delete().in('id', ids)

  type Ex = { name: string; sets?: number; reps?: number; weight_kg?: number; duration_minutes?: number; distance_km?: number }
  const sessions: { date: string; title: string; notes?: string; exercises: Ex[] }[] = [
    { date: WEEK[0], title: 'Upper body', notes: 'Felt strong', exercises: [
      { name: 'Bench press', sets: 4, reps: 8, weight_kg: 80 },
      { name: 'Overhead press', sets: 3, reps: 10, weight_kg: 45 },
      { name: 'Incline dumbbell press', sets: 3, reps: 12, weight_kg: 24 },
      { name: 'Tricep dips', sets: 3, reps: 12 },
    ] },
    { date: WEEK[1], title: '5k run', exercises: [ { name: 'Run', duration_minutes: 26, distance_km: 5 } ] },
    { date: WEEK[3], title: 'Morning yoga', exercises: [ { name: 'Yoga flow', duration_minutes: 30 } ] },
    { date: WEEK[5], title: 'Long run — 10k', notes: 'Negative split', exercises: [ { name: 'Run', duration_minutes: 58, distance_km: 10 } ] },
  ]
  for (const s of sessions) {
    const { data: sess, error } = await supabase.from('workout_sessions')
      .insert({ user_id: userId, date: s.date, title: s.title, notes: s.notes ?? null }).select('id').single()
    if (error) { console.error('workout session insert failed:', error); process.exit(1) }
    const exRows = s.exercises.map((e, idx) => ({
      session_id: sess!.id, name: e.name, sets: e.sets ?? null, reps: e.reps ?? null,
      weight_kg: e.weight_kg ?? null, duration_minutes: e.duration_minutes ?? null,
      distance_km: e.distance_km ?? null, position: idx,
    }))
    await supabase.from('workout_session_exercises').insert(exRows)
    // keep exercise-item history populated for the quick-insert list
    const items = s.exercises.map(e => ({
      user_id: userId, name: e.name, normalized_name: e.name.toLowerCase(),
      usage_count: 3, last_used_at: new Date().toISOString(),
    }))
    await supabase.from('workout_exercise_items').upsert(items, { onConflict: 'user_id,normalized_name' })
  }
  console.log(`Workouts: ${sessions.length} sessions logged this week`)
}

// ---------------------------------------------------------------------------
// Achievements: a few tracked personal-record metrics with progress across the
// week (including new bests). Idempotent — deletes defs by name (entries cascade).
// ---------------------------------------------------------------------------
async function seedAchievements(userId: string) {
  const defs = [
    { name: 'Push-ups (max reps)', category: 'fitness', metric_type: 'reps', unit: 'reps', better_direction: 'higher', target_value: 60,
      entries: [ [WEEK[0], 42], [WEEK[2], 45], [WEEK[4], 49], [WEEK[6], 52] ] as [string, number][] },
    { name: 'Bench press (1RM)', category: 'fitness', metric_type: 'weight', unit: 'kg', better_direction: 'higher', target_value: 100,
      entries: [ [WEEK[0], 80], [WEEK[5], 85] ] as [string, number][] },
    { name: '5K run time', category: 'fitness', metric_type: 'duration', unit: 'min', better_direction: 'lower', target_value: 22,
      entries: [ [WEEK[1], 26.4], [WEEK[5], 25.1] ] as [string, number][] },
  ]
  const names = defs.map(d => d.name)
  const { data: old } = await supabase.from('achievement_definitions').select('id').eq('user_id', userId).in('name', names)
  const oldIds = (old || []).map(r => r.id)
  if (oldIds.length) await supabase.from('achievement_definitions').delete().in('id', oldIds)

  for (const d of defs) {
    const { data: def, error } = await supabase.from('achievement_definitions').insert({
      user_id: userId, name: d.name, category: d.category, metric_type: d.metric_type,
      unit: d.unit, better_direction: d.better_direction, target_value: d.target_value,
    }).select('id').single()
    if (error) { console.error('achievement def insert failed:', error); process.exit(1) }
    const entryRows = d.entries.map(([date, value]) => ({ achievement_id: def!.id, user_id: userId, date, value }))
    await supabase.from('achievement_entries').insert(entryRows)
  }
  console.log(`Achievements: ${defs.length} tracked metrics with progress`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
