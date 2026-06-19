/**
 * Determines whether a task is overdue relative to a given moment.
 *
 * A task is overdue when ALL of the following hold:
 *  1. It has a startTime ("HH:MM").
 *  2. Its scheduledDate is today or in the past (not a future date).
 *  3. Its startTime is more than 30 minutes before `now`.
 *
 * A task scheduled for a FUTURE date must never be flagged overdue today,
 * even if its startTime has already passed on today's clock (issue #20).
 */

export function isTaskOverdue(
  task: { startTime: string; scheduledDate: string },
  now: Date = new Date()
): boolean {
  // Compare dates as YYYY-MM-DD strings to stay timezone-agnostic
  const todayStr = now.toISOString().slice(0, 10)

  // Future date → never overdue
  if (task.scheduledDate > todayStr) return false

  const [hours, minutes] = task.startTime.split(':').map(Number)
  const taskMinutes = hours * 60 + minutes
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  // ponytail: 30-min grace period matches the existing frontend threshold
  return nowMinutes - taskMinutes > 30
}
