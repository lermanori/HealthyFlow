/**
 * Detect a synthetic virtual-habit-instance id: `${habitUUID}-YYYY-MM-DD`.
 * Returns the parsed parts, or null for any real task id.
 *
 * Three call sites use this:
 *  1. GET /tasks formatter (sets isVirtualInstance/originalHabitId)
 *  2. POST /complete/:id (materialize completed instance)
 *  3. PUT /:id drag path (materialize non-completed instance with override)
 */
export function parseHabitInstanceId(
  id: string
): { originalHabitId: string; date: string } | null {
  const match = id.match(/^([0-9a-fA-F-]{36})-(\d{4}-\d{2}-\d{2})$/)
  if (!match) return null
  return { originalHabitId: match[1], date: match[2] }
}
