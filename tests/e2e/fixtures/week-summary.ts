import type {
  DaySummaryCalendarEvent,
  DaySummaryCapacity,
  DaySummaryItem,
  WeekDomain,
  WeekPlanningDecision,
  WeekPlanningSummary,
} from '../../../backend/src/day-summary-schema'

const addressed = (item: DaySummaryItem) => item.completed || (
  item.type === 'habit' &&
  (item.habitInfo?.outcome === 'completed' || item.habitInfo?.outcome === 'failed')
)

const addDate = (date: string, offset: number) => {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + offset)
  return value.toISOString().slice(0, 10)
}

export function weekSummaryFixture({
  startDate,
  itemsByDate = {},
  eventsByDate = {},
  capacityByDate = {},
  planningDecisions,
}: {
  startDate: string
  itemsByDate?: Record<string, DaySummaryItem[]>
  eventsByDate?: Record<string, DaySummaryCalendarEvent[]>
  capacityByDate?: Record<string, DaySummaryCapacity>
  planningDecisions?: WeekPlanningDecision[]
}): WeekPlanningSummary {
  const dates = Array.from({ length: 7 }, (_, index) => addDate(startDate, index))
  const days = dates.map((date) => {
    const items = itemsByDate[date] ?? []
    const completed = items.filter((item) => item.completed).length
    const addressedCount = items.filter(addressed).length
    const events = eventsByDate[date] ?? []
    return {
      date,
      dateMode: 'future' as const,
      items,
      calendar: {
        status: events.length ? 'connected' as const : 'connected_empty' as const,
        reasonCode: null,
        events,
      },
      completion: {
        state: items.length === 0 ? 'empty' as const : addressedCount === items.length ? 'complete' as const : 'in_progress' as const,
        total: items.length,
        completed,
        addressed: addressedCount,
        remaining: items.length - addressedCount,
        percent: items.length ? Math.round(addressedCount / items.length * 100) : null,
      },
      capacity: capacityByDate[date] ?? {
        status: 'unavailable' as const,
        window: null,
        basis: null,
        reasonCodes: ['planning_window_missing' as const],
      },
    }
  })
  const uniqueItems = days.flatMap((day) => day.items).filter((item, index, all) =>
    item.type === 'habit' || all.findIndex((candidate) => candidate.id === item.id) === index
  )
  const contributionMap = new Map<WeekDomain, { total: number; completed: number; addressed: number }>()
  const addContribution = (domain: WeekDomain, complete: boolean, isAddressed: boolean) => {
    const value = contributionMap.get(domain) ?? { total: 0, completed: 0, addressed: 0 }
    value.total += 1
    if (complete) value.completed += 1
    if (isAddressed) value.addressed += 1
    contributionMap.set(domain, value)
  }
  uniqueItems.forEach((item) => addContribution(item.type, item.completed, addressed(item)))
  days.flatMap((day) => day.calendar.events)
    .forEach((event) => addContribution('calendar', event.completed, event.completed))
  const cadence = new Map<string, WeekPlanningSummary['habitCadence'][number]>()
  days.forEach((day, index) => day.items.filter((item) => item.type === 'habit').forEach((item) => {
    const id = item.originalHabitId ?? item.id
    if (!cadence.has(id)) {
      cadence.set(id, {
        originalHabitId: id,
        title: item.title,
        target: item.habitInfo?.target ?? null,
        days: Array(7).fill(null),
      })
    }
    const outcome = item.habitInfo?.outcome ?? (item.completed ? 'completed' : 'pending')
    cadence.get(id)!.days[index] = {
      date: day.date,
      itemId: item.id,
      outcome,
      progressTotal: item.habitInfo?.progressTotal ?? 0,
      completed: item.completed,
      addressed: addressed(item),
    }
  }))
  const completed = uniqueItems.filter((item) => item.completed).length
  const addressedCount = uniqueItems.filter(addressed).length
  const obligations = days.flatMap((day) => day.calendar.events)
  const planningDays: WeekPlanningSummary['planning']['days'] = days.map((day) => {
    const flexible = day.items.filter((item) => item.type !== 'habit' && !addressed(item) && !item.startTime)
    const knownDemandMinutes = flexible.reduce((total, item) => total + (item.duration && item.duration > 0 ? item.duration : 0), 0)
    const unknownDurationItemCount = flexible.filter((item) => item.duration == null || item.duration <= 0).length
    const availableMinutes = day.capacity.status === 'complete'
      ? day.capacity.availableMinutes
      : day.capacity.status === 'partial'
        ? day.capacity.availableUpperBoundMinutes
        : null
    const remainingMinutes = availableMinutes == null ? null : availableMinutes - knownDemandMinutes
    return {
      date: day.date,
      state: day.capacity.status === 'unavailable'
        ? 'unavailable'
        : day.capacity.status === 'partial' || unknownDurationItemCount > 0
          ? 'partial'
          : remainingMinutes != null && remainingMinutes < 0
            ? 'overloaded'
            : remainingMinutes != null && remainingMinutes <= 30
              ? 'tight'
              : 'open',
      knownDemandMinutes,
      unknownDurationItemCount,
      availableMinutes,
      remainingMinutes,
    }
  })
  const unavailableDays = days.filter((day) => day.capacity.status === 'unavailable')
  const decisions = planningDecisions ?? (unavailableDays.length > 0
    ? [{
        id: `capacity-unavailable:${startDate}`,
        type: 'capacity_unavailable' as const,
        severity: 'high' as const,
        score: 110,
        title: 'Finish capacity setup for an honest weekly plan',
        rationale: 'HealthyFlow cannot compare workload with available time until the planning window and timezone are usable.',
        date: null,
        itemIds: [],
        evidence: [
          { label: 'Affected days', value: `${unavailableDays.length} of 7` },
          { label: 'Missing input', value: 'planning window missing' },
        ],
        actions: [{ id: 'open-planning-settings', kind: 'open_settings' as const, label: 'Open planning settings' }],
      }]
    : [])

  return {
    version: 1,
    generatedAt: '2026-07-15T10:00:00.000Z',
    timeZone: 'UTC',
    week: { weekStartsOn: 1, startDate, endDate: dates[6] },
    settings: { sourceStatus: 'available', planningWindow: null },
    modules: { habits: 'enabled', nutrition: 'enabled', workouts: 'enabled' },
    days,
    completion: {
      state: uniqueItems.length === 0 ? 'empty' : addressedCount === uniqueItems.length ? 'complete' : 'in_progress',
      total: uniqueItems.length,
      completed,
      addressed: addressedCount,
      remaining: uniqueItems.length - addressedCount,
      percent: uniqueItems.length ? Math.round(addressedCount / uniqueItems.length * 100) : null,
    },
    obligations: {
      total: obligations.length,
      completed: obligations.filter((event) => event.completed).length,
    },
    contributions: Array.from(contributionMap, ([domain, value]) => ({ domain, ...value })),
    habitCadence: Array.from(cadence.values()),
    planning: {
      days: planningDays,
      decisions,
    },
  }
}
