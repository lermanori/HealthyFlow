/**
 * Regression tests for the habit data model invariant (see docs/adr/0001 & 0002):
 *
 *   A daily habit is ONE template row (type=habit, repeat_type=daily,
 *   original_habit_id=NULL, scheduled_date=NULL) that is never shown directly.
 *   For any day D the habit appears as EXACTLY ONE row:
 *     - a materialized instance (real row, original_habit_id=template, scheduled_date=D), or
 *     - a virtual instance (synthesized id `${template}-${D}`) when no real row exists.
 *
 * These lock the two bugs that put us in a loop:
 *   (a) a dragged/edited per-day time must survive refresh (the materialized instance is
 *       returned, not dropped);
 *   (b) an instance dated another day must NOT leak into the viewed day (the dailyHabits
 *       query must select templates only — instances also match type=habit/daily).
 *
 * Driven against the REAL db.getTasksWithRecurringHabits via an in-memory fake of the
 * supabase query builder.
 */

let mockRows: any[] = []

jest.mock('@supabase/supabase-js', () => {
  function makeBuilder() {
    let rows = [...mockRows]
    const builder: any = {
      select: () => builder,
      eq: (col: string, val: any) => { rows = rows.filter(r => r[col] === val); return builder },
      is: (col: string, val: any) => { rows = rows.filter(r => (r[col] ?? null) === val); return builder },
      not: (col: string, _op: string, _val: any) => { rows = rows.filter(r => (r[col] ?? null) !== null); return builder },
      order: (col: string, opts: { ascending?: boolean } = {}) => {
        const asc = opts.ascending !== false
        rows = [...rows].sort((a, b) => {
          const av = a[col] ?? '', bv = b[col] ?? ''
          if (av < bv) return asc ? -1 : 1
          if (av > bv) return asc ? 1 : -1
          return 0
        })
        return builder
      },
      then: (resolve: any) => resolve({ data: rows, error: null }),
    }
    return builder
  }
  return { createClient: () => ({ from: () => makeBuilder() }) }
})

// Habits do not carry forward, so Rollover never contributes habit rows here.
jest.mock('../src/rollover', () => ({
  Rollover: { listForDay: jest.fn().mockResolvedValue([]) },
}))

import { db } from '../src/supabase-client'

const USER = 'user-1'
const DATE = '2026-06-21'
const HABIT_ID = '2c0290a6-2a1c-4c9d-8f9d-2da608fde13e'

// A pure template: no scheduled_date, no original_habit_id.
function template(over: any = {}) {
  return {
    id: HABIT_ID, user_id: USER, title: 'workout', type: 'habit', category: 'fitness',
    start_time: '', duration: 60, repeat_type: 'daily', completed: false,
    scheduled_date: null, original_habit_id: null, rolled_over_from_task_id: null,
    position: null, created_at: '2026-06-21T11:57:57.000Z', ...over,
  }
}
function instanceRow(id: string, over: any = {}) {
  return {
    id, user_id: USER, title: 'workout', type: 'habit', category: 'fitness',
    start_time: '13:00', duration: 60, repeat_type: 'daily', completed: true,
    scheduled_date: DATE, original_habit_id: HABIT_ID, rolled_over_from_task_id: null,
    position: null, created_at: '2026-06-21T13:38:19.000Z', ...over,
  }
}
const workoutRows = (tasks: any[]) =>
  tasks.filter(t => (t.original_habit_id || t.id) === HABIT_ID || String(t.id).startsWith(HABIT_ID))

describe('getTasksWithRecurringHabits — habit model invariant', () => {
  it('returns the materialized timed instance for the day (dragged time persists)', async () => {
    mockRows = [template(), instanceRow('da693cdb', { start_time: '13:00' })]
    const workout = workoutRows(await db.getTasksWithRecurringHabits(USER, DATE))
    expect(workout).toHaveLength(1)
    expect(workout[0].id).toBe('da693cdb')
    expect(workout[0].start_time).toBe('13:00')
  })

  it('falls back to a virtual instance when no real row exists for the day', async () => {
    mockRows = [template({ start_time: '08:00' })]
    const workout = workoutRows(await db.getTasksWithRecurringHabits(USER, DATE))
    expect(workout).toHaveLength(1)
    expect(workout[0].id).toBe(`${HABIT_ID}-${DATE}`) // synthetic virtual id
    expect(workout[0].start_time).toBe('08:00')       // inherits the template's time
  })

  it('does NOT leak an instance dated another day into the viewed day', async () => {
    // 28b5194a belongs to 2026-06-22; viewing 2026-06-21 must show a virtual, not it.
    mockRows = [template(), instanceRow('28b5194a', { scheduled_date: '2026-06-22', start_time: '16:00', completed: false })]
    const workout = workoutRows(await db.getTasksWithRecurringHabits(USER, DATE))
    expect(workout).toHaveLength(1)
    expect(workout[0].id).toBe(`${HABIT_ID}-${DATE}`)
    expect(workout.some(w => w.id === '28b5194a')).toBe(false)
  })

  it('collapses stale duplicate instances for the same day to the oldest', async () => {
    mockRows = [
      template(),
      instanceRow('older', { start_time: '21:00', created_at: '2026-06-21T13:38:19.000Z' }),
      instanceRow('newer', { start_time: '09:00', created_at: '2026-06-22T06:26:40.000Z' }),
    ]
    const workout = workoutRows(await db.getTasksWithRecurringHabits(USER, DATE))
    expect(workout).toHaveLength(1)
    expect(workout[0].id).toBe('older')
    expect(workout[0].start_time).toBe('21:00')
  })
})
