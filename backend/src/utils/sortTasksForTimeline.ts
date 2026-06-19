/**
 * Sort task rows for timeline display.
 *
 * Rules:
 *  1. Tasks with start_time come before tasks without.
 *  2. Among timed tasks, sort ascending by start_time ("HH:MM" 24-h).
 *  3. Among untimed tasks, sort ascending by created_at.
 *
 * Previously the inline sort fell through to created_at comparison whenever
 * either side lacked a start_time, so a PM task created earlier would sort
 * before an AM task created later (issue #8).
 */

type SortableTask = {
  start_time?: string | null
  created_at: string
}

export function sortTasksForTimeline<T extends SortableTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const aTime = a.start_time ?? null
    const bTime = b.start_time ?? null

    // Timed before untimed
    if (aTime && !bTime) return -1
    if (!aTime && bTime) return 1

    // Both timed: lexicographic on "HH:MM" is correct for zero-padded 24-h
    if (aTime && bTime) return aTime.localeCompare(bTime)

    // Both untimed: sort by creation time
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}
