/** Lay out real clock intervals. Touching endpoints never share an overlap group. */
export function positionDayTimelineEntries<T extends { key: string; start: number; end: number }>(entries: T[]) {
  const sorted = entries.map(entry => ({ ...entry, column: 0, columns: 1, columnSpan: 1 }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.key.localeCompare(b.key))
  let group: typeof sorted = []
  let columnEnds: number[] = []
  let groupEnd = -Infinity

  const finishGroup = () => {
    for (const entry of group) {
      entry.columns = columnEnds.length
      // Reclaim adjacent columns only when they remain free for this entire interval.
      for (let column = entry.column + 1; column < entry.columns; column++) {
        if (group.some(other => other.column === column && other.start < entry.end && entry.start < other.end)) break
        entry.columnSpan++
      }
    }
    group = []
    columnEnds = []
    groupEnd = -Infinity
  }

  for (const entry of sorted) {
    if (entry.start >= groupEnd) finishGroup()
    let column = columnEnds.findIndex(end => end <= entry.start)
    if (column < 0) column = columnEnds.length
    entry.column = column
    columnEnds[column] = entry.end
    group.push(entry)
    groupEnd = Math.max(groupEnd, entry.end)
  }
  finishGroup()
  return sorted
}

/** Hours with nothing in them shrink so a sparse day needs little scrolling. */
export function compactEmptyHours(slots: string[], hasContent: (slot: string) => boolean): Set<string> {
  return new Set(slots.filter(slot => !hasContent(slot)))
}
