/**
 * Maps a drag destination droppableId to the task update payload.
 *
 * zone === 'anytime'  → clear startTime, assign position from drop index
 * zone === 'HH:00'   → set startTime to that slot, clear position (timed tasks don't use position)
 */
export function zoneToUpdate(
  zone: string,
  dropIndex: number,
): { startTime: string | null; position: number | null } {
  if (zone === 'anytime') {
    return { startTime: null, position: dropIndex }
  }
  return { startTime: zone, position: null }
}
