import type {
  DaySummaryCalendarEvent,
  DaySummaryItem,
  WeekDomain,
  WeekSummary,
} from '../../backend/src/day-summary-schema'

export type WeekScope =
  | { kind: 'all' }
  | { kind: 'day'; date: string }

export type WeekDomainFilter = 'all' | WeekDomain

export type WeekAgendaEntry = {
  id: string
  source: 'item' | 'calendar'
  title: string
  domain: WeekDomain
  date: string
  completed: boolean
  addressed: boolean
  group: 'scheduled' | 'all_day' | 'anytime'
  time: string | null
  item?: DaySummaryItem
  event?: DaySummaryCalendarEvent
}

export type WeekAgenda = {
  days: Array<{ date: string; entries: WeekAgendaEntry[] }>
  totalCount: number
}

const groupOrder: Record<WeekAgendaEntry['group'], number> = {
  scheduled: 0,
  all_day: 1,
  anytime: 2,
}

function isAddressed(item: DaySummaryItem) {
  if (item.completed) return true
  return item.type === 'habit' &&
    (item.habitInfo?.outcome === 'completed' || item.habitInfo?.outcome === 'failed')
}

function compareEntries(a: WeekAgendaEntry, b: WeekAgendaEntry) {
  const group = groupOrder[a.group] - groupOrder[b.group]
  if (group !== 0) return group
  if (a.time !== b.time) return (a.time ?? '99:99').localeCompare(b.time ?? '99:99')
  const position = (a.item?.position ?? Number.MAX_SAFE_INTEGER) -
    (b.item?.position ?? Number.MAX_SAFE_INTEGER)
  return position || a.title.localeCompare(b.title)
}

function itemEntry(item: DaySummaryItem, date: string): WeekAgendaEntry {
  return {
    id: item.id,
    source: 'item',
    title: item.title,
    domain: item.type,
    date,
    completed: item.completed,
    addressed: isAddressed(item),
    group: item.startTime ? 'scheduled' : 'anytime',
    time: item.startTime,
    item,
  }
}

function eventEntry(event: DaySummaryCalendarEvent, date: string): WeekAgendaEntry {
  return {
    id: event.id,
    source: 'calendar',
    title: event.title,
    domain: 'calendar',
    date,
    completed: event.completed,
    addressed: event.completed,
    group: event.allDay || !event.localStartTime ? 'all_day' : 'scheduled',
    time: event.allDay ? null : event.localStartTime,
    event,
  }
}

export function selectWeekAgenda(
  summary: WeekSummary,
  scope: WeekScope,
  filters: {
    showCompleted: boolean
    domain: WeekDomainFilter
    mode?: 'full' | 'today_planning'
  }
): WeekAgenda {
  const selectedDays = scope.kind === 'day'
    ? summary.days.filter((day) => day.date === scope.date)
    : summary.days
  const seenItems = new Set<string>()

  const days = selectedDays.map((day) => {
    const items = day.items.filter((item) => {
      if (filters.mode === 'today_planning') {
        return item.type !== 'habit' && !isAddressed(item)
      }
      if (scope.kind === 'all') {
        if (item.type === 'habit') return false
        if (seenItems.has(item.id)) return false
        seenItems.add(item.id)
      }
      return true
    })
    const entries = [
      ...items.map((item) => itemEntry(item, day.date)),
      ...day.calendar.events.map((event) => eventEntry(event, day.date)),
    ]
      .filter((entry) => filters.mode !== 'today_planning' || !entry.completed)
      .filter((entry) => filters.showCompleted || !entry.completed)
      .filter((entry) => filters.domain === 'all' || entry.domain === filters.domain)
      .sort(compareEntries)
    return { date: day.date, entries }
  }).filter((day) => scope.kind === 'day' || day.entries.length > 0)

  return {
    days,
    totalCount: days.reduce((total, day) => total + day.entries.length, 0),
  }
}

export function findHabitItem(
  summary: WeekSummary,
  itemId: string
): { item: DaySummaryItem; date: string } | null {
  for (const day of summary.days) {
    const item = day.items.find((candidate) => candidate.id === itemId)
    if (item) return { item, date: day.date }
  }
  return null
}
