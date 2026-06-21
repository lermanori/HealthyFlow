/**
 * Tests for parseHabitInstanceId helper (issue #28).
 *
 * The synthetic id format is `${habitId}-${date}` e.g.
 * "550e8400-e29b-41d4-a716-446655440000-2026-06-21".
 * Three call sites use this detection (GET formatter, POST /complete/:id,
 * PUT /:id drag path) — all must use this single helper.
 */

import { parseHabitInstanceId } from '../src/utils/parseHabitInstanceId'

describe('parseHabitInstanceId', () => {
  const HABIT_ID = '550e8400-e29b-41d4-a716-446655440000'
  const DATE = '2026-06-21'
  const VIRTUAL_ID = `${HABIT_ID}-${DATE}`

  it('returns originalHabitId and date for a valid virtual id', () => {
    const result = parseHabitInstanceId(VIRTUAL_ID)
    expect(result).toEqual({ originalHabitId: HABIT_ID, date: DATE })
  })

  it('returns null for a plain UUID (real task id)', () => {
    expect(parseHabitInstanceId(HABIT_ID)).toBeNull()
  })

  it('returns null for a random string', () => {
    expect(parseHabitInstanceId('not-a-uuid-at-all')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseHabitInstanceId('')).toBeNull()
  })

  it('returns null for a UUID with wrong date suffix', () => {
    expect(parseHabitInstanceId(`${HABIT_ID}-not-a-date`)).toBeNull()
  })

  it('works with all valid date formats (other dates)', () => {
    const id = `${HABIT_ID}-2024-01-01`
    const result = parseHabitInstanceId(id)
    expect(result).toEqual({ originalHabitId: HABIT_ID, date: '2024-01-01' })
  })
})
