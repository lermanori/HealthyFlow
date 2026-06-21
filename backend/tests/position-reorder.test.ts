/**
 * Tests for untimed-backlog position ordering (issue #26).
 *
 * Untimed tasks (no start_time) should sort by `position` (nulls last),
 * not by created_at. Timed tasks still sort by start_time, then created_at.
 * The reorderTasks helper should produce correct position assignments.
 */

import { sortTasksForTimeline } from '../src/utils/sortTasksForTimeline'
import { positionsFromIds } from '../src/utils/positionsFromIds'

type TaskRow = {
  id: string
  title: string
  start_time: string | null
  created_at: string
  position?: number | null
}

function makeTask(overrides: Partial<TaskRow> & { id: string; title: string }): TaskRow {
  return {
    start_time: null,
    created_at: '2026-06-21T00:00:00.000Z',
    position: null,
    ...overrides,
  }
}

describe('sortTasksForTimeline — untimed position ordering', () => {
  it('untimed tasks with position sort by position ascending', () => {
    const tasks: TaskRow[] = [
      makeTask({ id: 'c', title: 'Third',  position: 2 }),
      makeTask({ id: 'a', title: 'First',  position: 0 }),
      makeTask({ id: 'b', title: 'Second', position: 1 }),
    ]
    const result = sortTasksForTimeline(tasks)
    expect(result.map(t => t.title)).toEqual(['First', 'Second', 'Third'])
  })

  it('untimed tasks with null position sort after positioned ones, then by created_at', () => {
    const tasks: TaskRow[] = [
      makeTask({ id: 'x', title: 'No pos late',  position: null, created_at: '2026-06-21T10:00:00Z' }),
      makeTask({ id: 'y', title: 'No pos early', position: null, created_at: '2026-06-21T08:00:00Z' }),
      makeTask({ id: 'a', title: 'Positioned',   position: 0 }),
    ]
    const result = sortTasksForTimeline(tasks)
    expect(result[0].title).toBe('Positioned')
    expect(result[1].title).toBe('No pos early')
    expect(result[2].title).toBe('No pos late')
  })

  it('timed tasks still sort before all untimed tasks regardless of position', () => {
    const tasks: TaskRow[] = [
      makeTask({ id: 'u', title: 'Anytime',    position: 0 }),
      makeTask({ id: 't', title: 'Timed 9am',  start_time: '09:00' }),
    ]
    const result = sortTasksForTimeline(tasks)
    expect(result[0].title).toBe('Timed 9am')
    expect(result[1].title).toBe('Anytime')
  })

  it('timed tasks still sort by start_time among themselves', () => {
    const tasks: TaskRow[] = [
      makeTask({ id: 'b', title: '3 PM', start_time: '15:00' }),
      makeTask({ id: 'a', title: '9 AM', start_time: '09:00' }),
    ]
    const result = sortTasksForTimeline(tasks)
    expect(result[0].title).toBe('9 AM')
    expect(result[1].title).toBe('3 PM')
  })
})

describe('positionsFromIds', () => {
  it('maps each id to its array index', () => {
    const result = positionsFromIds(['id-c', 'id-a', 'id-b'])
    expect(result).toEqual([
      { id: 'id-c', position: 0 },
      { id: 'id-a', position: 1 },
      { id: 'id-b', position: 2 },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(positionsFromIds([])).toEqual([])
  })
})
