/**
 * Tests for timeline task ordering (issue #8).
 *
 * Root cause: the in-memory sort in getTasksWithRecurringHabits falls through
 * to created_at comparison whenever either task lacks a start_time. This causes
 * timed afternoon tasks (e.g. "13:00") to sort before morning tasks ("09:00")
 * when the afternoon task happens to have an earlier created_at.
 *
 * Correct behaviour: tasks with start_time always sort before tasks without;
 * among timed tasks, sort ascending by start_time (24-h "HH:MM").
 */

import { sortTasksForTimeline } from '../src/utils/sortTasksForTimeline'

type TaskRow = {
  id: string
  title: string
  start_time: string | null
  created_at: string
}

function makeTask(overrides: Partial<TaskRow> & { id: string; title: string }): TaskRow {
  return {
    start_time: null,
    created_at: '2026-06-19T00:00:00.000Z',
    ...overrides,
  }
}

describe('sortTasksForTimeline', () => {
  it('orders 9 AM, 11 AM, 1 PM, 3 PM chronologically', () => {
    const tasks: TaskRow[] = [
      makeTask({ id: '3', title: '1 PM task',   start_time: '13:00' }),
      makeTask({ id: '1', title: '9 AM task',   start_time: '09:00' }),
      makeTask({ id: '4', title: '3 PM task',   start_time: '15:00' }),
      makeTask({ id: '2', title: '11 AM task',  start_time: '11:00' }),
    ]

    const result = sortTasksForTimeline(tasks)
    expect(result.map(t => t.title)).toEqual([
      '9 AM task',
      '11 AM task',
      '1 PM task',
      '3 PM task',
    ])
  })

  it('tasks with start_time sort before tasks without start_time', () => {
    const tasks: TaskRow[] = [
      makeTask({ id: 'u', title: 'No time task', start_time: null,    created_at: '2026-06-19T06:00:00Z' }),
      makeTask({ id: 'a', title: 'Noon task',    start_time: '12:00', created_at: '2026-06-19T08:00:00Z' }),
      makeTask({ id: 'b', title: 'PM task',      start_time: '14:00', created_at: '2026-06-19T09:00:00Z' }),
    ]

    const result = sortTasksForTimeline(tasks)
    expect(result[0].title).toBe('Noon task')
    expect(result[1].title).toBe('PM task')
    expect(result[2].title).toBe('No time task')
  })

  it('a PM task does NOT sort before an AM task when PM task has earlier created_at', () => {
    // This is the exact bug: "13:00" task created before "09:00" task
    const tasks: TaskRow[] = [
      makeTask({ id: 'pm', title: '1 PM task', start_time: '13:00', created_at: '2026-06-18T10:00:00Z' }),
      makeTask({ id: 'am', title: '9 AM task', start_time: '09:00', created_at: '2026-06-19T10:00:00Z' }),
    ]

    const result = sortTasksForTimeline(tasks)
    expect(result[0].title).toBe('9 AM task')
    expect(result[1].title).toBe('1 PM task')
  })

  it('tasks without start_time sort by created_at among themselves', () => {
    const tasks: TaskRow[] = [
      makeTask({ id: 'c', title: 'Later unscheduled',  start_time: null, created_at: '2026-06-19T10:00:00Z' }),
      makeTask({ id: 'd', title: 'Earlier unscheduled', start_time: null, created_at: '2026-06-19T08:00:00Z' }),
    ]

    const result = sortTasksForTimeline(tasks)
    expect(result[0].title).toBe('Earlier unscheduled')
    expect(result[1].title).toBe('Later unscheduled')
  })
})
