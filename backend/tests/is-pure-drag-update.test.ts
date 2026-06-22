/**
 * Tests for isPureDragUpdate — the predicate that decides whether a
 * PUT /tasks/:id on a recurring-habit PARENT row should materialize a per-day
 * instance (drag) or mutate the parent's default time (explicit edit).
 *
 * Regression guard for the bug where dragging a habit on its parent-row day
 * leaked the per-day time into every future virtual instance (issue #28).
 */

import { isPureDragUpdate } from '../src/utils/isPureDragUpdate'

describe('isPureDragUpdate', () => {
  it('hour-slot drag (start_time + position) is a drag', () => {
    expect(isPureDragUpdate({ start_time: '09:00', position: null })).toBe(true)
  })

  it('anytime drag (start_time:null + position) is a drag', () => {
    expect(isPureDragUpdate({ start_time: null, position: 2 })).toBe(true)
  })

  it('start_time only is a drag', () => {
    expect(isPureDragUpdate({ start_time: '14:00' })).toBe(true)
  })

  it('explicit edit (title/category/duration/start_time) is NOT a drag', () => {
    expect(
      isPureDragUpdate({
        title: 'Workout',
        category: 'fitness',
        duration: 45,
        start_time: '07:00',
        scheduled_date: '2026-06-21',
      })
    ).toBe(false)
  })

  it('completion toggle is NOT a drag', () => {
    expect(isPureDragUpdate({ completed: true, completed_at: 'now' })).toBe(false)
  })

  it('empty update is NOT a drag', () => {
    expect(isPureDragUpdate({})).toBe(false)
  })
})
