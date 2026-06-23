/**
 * One-off cleanup to restore the habit data model invariant:
 *   - a habit TEMPLATE (type=habit, repeat_type set, original_habit_id NULL) is a pure
 *     template → scheduled_date must be NULL (never a concrete dated row).
 *   - at most ONE materialized instance per (user, habit, day).
 *
 * Keeps, per (user_id, original_habit_id, scheduled_date) group, the OLDEST instance
 * (the row both getTasksWithRecurringHabits dedup and createHabitInstance target), and
 * deletes the rest. Idempotent: safe to run repeatedly.
 *
 * Usage: node scripts/cleanup-habit-model.js [--apply]
 *   (dry-run by default; pass --apply to actually write)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
const { createClient } = require('@supabase/supabase-js')

const apply = process.argv.includes('--apply')
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

;(async () => {
  // 1. Templates with a stray scheduled_date → NULL.
  const { data: templates, error: tErr } = await s
    .from('tasks')
    .select('id, title, scheduled_date')
    .eq('type', 'habit')
    .is('original_habit_id', null)
    .not('repeat_type', 'is', null)
    .not('scheduled_date', 'is', null)
  if (tErr) throw tErr
  console.log(`Templates to clear scheduled_date: ${templates.length}`)
  templates.forEach(t => console.log(`  ${t.id.slice(0, 8)} "${t.title}" had ${t.scheduled_date}`))
  if (apply && templates.length) {
    for (const t of templates) {
      const { error } = await s.from('tasks').update({ scheduled_date: null }).eq('id', t.id)
      if (error) throw error
    }
  }

  // 2. Duplicate instances per (user, habit, day) → keep oldest, delete rest.
  const { data: instances, error: iErr } = await s
    .from('tasks')
    .select('id, user_id, original_habit_id, scheduled_date, start_time, completed, created_at')
    .not('original_habit_id', 'is', null)
    .order('created_at', { ascending: true })
  if (iErr) throw iErr

  const groups = new Map()
  for (const r of instances) {
    const key = `${r.user_id}|${r.original_habit_id}|${r.scheduled_date}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }

  const toDelete = []
  for (const [key, rows] of groups) {
    if (rows.length <= 1) continue
    const [keep, ...rest] = rows // already created_at asc → first is oldest
    console.log(`\nGroup ${key} has ${rows.length} rows:`)
    console.log(`  KEEP   ${keep.id.slice(0, 8)} st=${JSON.stringify(keep.start_time)} compl=${keep.completed} (${keep.created_at})`)
    rest.forEach(r => {
      console.log(`  DELETE ${r.id.slice(0, 8)} st=${JSON.stringify(r.start_time)} compl=${r.completed} (${r.created_at})`)
      toDelete.push(r.id)
    })
  }
  console.log(`\nTotal duplicate instances to delete: ${toDelete.length}`)
  if (apply && toDelete.length) {
    const { error } = await s.from('tasks').delete().in('id', toDelete)
    if (error) throw error
  }

  console.log(apply ? '\n✅ APPLIED' : '\n(dry-run — pass --apply to write)')
})().catch(e => {
  console.error(e)
  process.exit(1)
})
