/**
 * A "pure drag" PUT /tasks/:id update touches only positional fields
 * (start_time and/or position). An explicit edit via TaskEditModal also sends
 * title/category/duration/scheduled_date.
 *
 * Used to decide whether a drag on a recurring-habit PARENT row should
 * materialize a per-day instance (drag) or mutate the parent default (edit).
 * See ADR-0001 / issue #28.
 */
export function isPureDragUpdate(updateData: Record<string, unknown>): boolean {
  const keys = Object.keys(updateData)
  return keys.length > 0 && keys.every(k => k === 'start_time' || k === 'position')
}
