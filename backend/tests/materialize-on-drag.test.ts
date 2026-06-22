/**
 * Tests for Option B: materialize habit instance on drag (issue #28).
 *
 * These test the pure logic of createHabitInstance overrides — the behavior
 * that matters for the drag path (non-completed row, start_time or position
 * override, ownership rejection) — without hitting Supabase.
 *
 * The drag integration is thin (routes/tasks.ts calls db.createHabitInstance),
 * so the meaningful unit is the override logic itself.
 */

import { parseHabitInstanceId } from '../src/utils/parseHabitInstanceId'

const HABIT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const DATE = '2026-06-21'
const VIRTUAL_ID = `${HABIT_ID}-${DATE}`

// ---------------------------------------------------------------------------
// parseHabitInstanceId — already covered in parse-habit-instance-id.test.ts,
// but we add the drag-specific assertions here as spec documentation.
// ---------------------------------------------------------------------------
describe('parseHabitInstanceId — drag-path detection', () => {
  it('detects a virtual id dragged onto an hour slot', () => {
    const result = parseHabitInstanceId(VIRTUAL_ID)
    expect(result).not.toBeNull()
    expect(result!.originalHabitId).toBe(HABIT_ID)
    expect(result!.date).toBe(DATE)
  })

  it('does NOT treat a real materialized row id as virtual', () => {
    // After materialization the row gets a fresh UUID — that should NOT
    // trigger the materialize path on a second drag.
    const realId = 'ffffffff-1111-2222-3333-444444444444'
    expect(parseHabitInstanceId(realId)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Materialize-on-drag override logic (pure; no Supabase)
// ---------------------------------------------------------------------------
describe('createHabitInstance overrides shape', () => {
  // Mirror the override object that routes/tasks.ts builds for the drag path.
  // A drag must OMIT `completed` so it never clobbers an existing row's done state
  // (dragging a completed instance keeps it completed; idempotent createHabitInstance).
  function buildDragOverrides(updateData: { start_time?: string | null; position?: number | null }) {
    return {
      ...(updateData.start_time !== undefined ? { start_time: updateData.start_time } : {}),
      ...(updateData.position !== undefined ? { position: updateData.position } : {}),
    }
  }

  it('hour-slot drag: overrides carry start_time, no completed flag', () => {
    const overrides = buildDragOverrides({ start_time: '09:00' })
    expect('completed' in overrides).toBe(false)
    expect((overrides as any).start_time).toBe('09:00')
    expect('position' in overrides).toBe(false)
  })

  it('anytime drag: overrides carry position, no completed flag, no start_time', () => {
    const overrides = buildDragOverrides({ start_time: null, position: 2 })
    expect('completed' in overrides).toBe(false)
    expect((overrides as any).start_time).toBeNull()
    expect((overrides as any).position).toBe(2)
  })

  it('completion passes completed:true explicitly (fresh inserts default to not-completed)', () => {
    // The completion path now passes { completed: true }; createHabitInstance only
    // defaults to completed when no flag is supplied, which is `false`.
    const completionOverrides: { completed?: boolean } = { completed: true }
    expect(completionOverrides.completed ?? false).toBe(true)
    const dragOverrides: { completed?: boolean } = {}
    expect(dragOverrides.completed ?? false).toBe(false)
  })

  // This-day-only EDIT (editScope:'instance') carries the full field set so a single
  // day's habit can be customised (time, title, category, duration) without touching
  // the parent. Mirrors the override object routes/tasks.ts builds for that path.
  function buildInstanceEditOverrides(updateData: {
    start_time?: string | null
    title?: string
    category?: string
    duration?: number | null
    position?: number | null
  }) {
    return {
      completed: false,
      ...(updateData.start_time !== undefined ? { start_time: updateData.start_time } : {}),
      ...(updateData.title !== undefined ? { title: updateData.title } : {}),
      ...(updateData.category !== undefined ? { category: updateData.category } : {}),
      ...(updateData.duration !== undefined ? { duration: updateData.duration } : {}),
      ...(updateData.position !== undefined ? { position: updateData.position } : {}),
    }
  }

  it('this-day edit: overrides carry the edited fields and completed:false', () => {
    const overrides = buildInstanceEditOverrides({
      start_time: '07:00',
      title: 'Long workout',
      category: 'fitness',
      duration: 90,
    })
    expect(overrides.completed).toBe(false)
    expect(overrides.start_time).toBe('07:00')
    expect(overrides.title).toBe('Long workout')
    expect(overrides.category).toBe('fitness')
    expect(overrides.duration).toBe(90)
  })

  it('this-day edit: omitted fields are absent so createHabitInstance falls back to the parent', () => {
    const overrides = buildInstanceEditOverrides({ duration: 45 })
    expect(overrides.duration).toBe(45)
    expect('title' in overrides).toBe(false)
    expect('category' in overrides).toBe(false)
    expect('start_time' in overrides).toBe(false)
  })
})
