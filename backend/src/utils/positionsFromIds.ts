/**
 * Map an ordered array of task ids to { id, position } pairs.
 * Used by PATCH /tasks/reorder to batch-write positions.
 */
export function positionsFromIds(ids: string[]): Array<{ id: string; position: number }> {
  return ids.map((id, index) => ({ id, position: index }))
}
