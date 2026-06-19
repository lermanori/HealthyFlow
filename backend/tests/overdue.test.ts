/**
 * Tests for isTaskOverdue (issue #20).
 *
 * Root cause: SmartReminders compared time-of-day only, ignoring scheduledDate.
 * A task scheduled for tomorrow whose startTime had already passed today was
 * incorrectly flagged as overdue.
 *
 * Correct contract:
 *  - Future-dated task → never overdue, regardless of startTime.
 *  - Today's task with startTime > 30 min ago → overdue.
 *  - Today's task with startTime within 30 min → not overdue yet.
 *  - Past-dated task with passed startTime → overdue.
 */

import { isTaskOverdue } from '../src/utils/isOverdue'

// Fixed reference: 2026-06-19 at 14:00 local
const NOW = new Date('2026-06-19T14:00:00')

describe('isTaskOverdue', () => {
  it('future-dated task is NOT overdue even when startTime has passed on clock', () => {
    // "Go for a run" @08:00 scheduled for tomorrow — the exact bug in issue #20
    expect(isTaskOverdue({ startTime: '08:00', scheduledDate: '2026-06-20' }, NOW)).toBe(false)
  })

  it('future-dated task at a future time is NOT overdue', () => {
    expect(isTaskOverdue({ startTime: '18:00', scheduledDate: '2026-06-20' }, NOW)).toBe(false)
  })

  it("today's task started more than 30 min ago IS overdue", () => {
    // 13:00 → 60 min before 14:00
    expect(isTaskOverdue({ startTime: '13:00', scheduledDate: '2026-06-19' }, NOW)).toBe(true)
  })

  it("today's task started exactly 31 min ago IS overdue", () => {
    expect(isTaskOverdue({ startTime: '13:29', scheduledDate: '2026-06-19' }, NOW)).toBe(true)
  })

  it("today's task started 30 min ago is NOT yet overdue (boundary)", () => {
    expect(isTaskOverdue({ startTime: '13:30', scheduledDate: '2026-06-19' }, NOW)).toBe(false)
  })

  it("today's task starting in the future is NOT overdue", () => {
    expect(isTaskOverdue({ startTime: '16:00', scheduledDate: '2026-06-19' }, NOW)).toBe(false)
  })

  it('past-dated task with passed startTime IS overdue', () => {
    expect(isTaskOverdue({ startTime: '09:00', scheduledDate: '2026-06-18' }, NOW)).toBe(true)
  })
})
