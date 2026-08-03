import type {
  DaySummary,
  DaySummaryCalendarEvent,
  DaySummaryItem,
} from '../../../backend/src/day-summary-schema'

type ItemInput = Pick<DaySummaryItem, 'id' | 'title'> & Partial<DaySummaryItem>
type CalendarEventInput = Pick<DaySummaryCalendarEvent, 'id' | 'title'> & Partial<DaySummaryCalendarEvent>

function isAddressed(item: DaySummaryItem) {
  return item.completed || (
    item.type === 'habit' &&
    (item.habitInfo?.outcome === 'completed' || item.habitInfo?.outcome === 'failed')
  )
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function weekFor(date: string): DaySummary['week'] {
  const selected = new Date(`${date}T12:00:00.000Z`)
  const mondayOffset = (selected.getUTCDay() + 6) % 7
  const monday = new Date(selected)
  monday.setUTCDate(selected.getUTCDate() - mondayOffset)
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday)
    day.setUTCDate(monday.getUTCDate() + index)
    return { date: formatDate(day), total: 0, completed: 0 }
  })

  return {
    weekStartsOn: 1,
    startDate: days[0].date,
    endDate: days[6].date,
    days,
  }
}

export function daySummaryItem(input: ItemInput): DaySummaryItem {
  return {
    type: 'task',
    category: null,
    startTime: null,
    location: null,
    duration: null,
    repeat: 'none',
    completed: false,
    scheduledDate: null,
    createdAt: new Date().toISOString(),
    overdueNotified: false,
    isHabitInstance: false,
    originalHabitId: null,
    rolledOverFromTaskId: null,
    originalCreatedAt: null,
    completedAt: null,
    position: null,
    googleEventId: null,
    syncedToGoogle: false,
    googleSyncStatus: 'skipped',
    ...input,
  }
}

export function daySummaryCalendarEvent(input: CalendarEventInput): DaySummaryCalendarEvent {
  return {
    provider: 'google',
    calendarId: 'primary',
    externalEventId: input.id,
    description: null,
    location: null,
    startAt: null,
    endAt: null,
    localStartTime: null,
    localEndTime: null,
    allDay: false,
    status: 'confirmed',
    htmlLink: null,
    completed: false,
    completedAt: null,
    ...input,
  }
}

/** A Focus block as Today receives it. `slot` is resolved by the server. */
export function daySummaryFocusBlock(input: Record<string, unknown> & { id: string; startTime: string }) {
  return {
    projectId: null,
    taskIds: [],
    standaloneTitle: null,
    standaloneContext: null,
    scheduledDate: new Date().toISOString().slice(0, 10),
    plannedMinutes: 45,
    intendedOutcome: 'Reminder emails send on schedule',
    intendedEvidence: 'A passing reminder smoke test',
    transitionMinutes: null,
    breakMinutes: null,
    status: 'planned',
    reviewTrigger: null,
    startedAt: null,
    endedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    project: null,
    tasks: [],
    ...input,
    slot: `${input.startTime.slice(0, 2)}:00`,
  }
}

export function daySummaryFixture({
  date,
  items = [],
  calendarEvents = [],
  focusBlocks = [],
}: {
  date: string
  items?: ItemInput[]
  calendarEvents?: CalendarEventInput[]
  focusBlocks?: Array<Record<string, unknown> & { id: string; startTime: string }>
}): DaySummary {
  const normalizedItems = items.map(daySummaryItem)
  const normalizedEvents = calendarEvents.map(daySummaryCalendarEvent)
  const completed = normalizedItems.filter((item) => item.completed).length
  const addressed = normalizedItems.filter(isAddressed).length
  const incomplete = normalizedItems.filter((item) => !isAddressed(item))
  const firstAnytime = incomplete.find((item) => item.startTime === null)
  const firstTimed = incomplete.find((item) => item.startTime !== null)
  const focus = firstTimed ?? firstAnytime ?? null
  const week = weekFor(date)
  const selectedWeekDay = week.days.find((day) => day.date === date)
  if (selectedWeekDay) {
    selectedWeekDay.total = normalizedItems.length
    selectedWeekDay.completed = completed
    selectedWeekDay.addressed = addressed
  }

  return {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    timeZone: 'UTC',
    dateMode: 'today',
    settings: {
      sourceStatus: 'available',
      planningWindow: null,
    },
    modules: {
      habits: 'enabled',
      nutrition: 'disabled',
      workouts: 'disabled',
    },
    items: normalizedItems,
    work: {
      status: focusBlocks.length > 0 ? 'scheduled' : 'not_scheduled',
      focusBlocks: focusBlocks.map(daySummaryFocusBlock),
    },
    calendar: {
      status: normalizedEvents.length > 0 ? 'connected' : 'connected_empty',
      reasonCode: null,
      events: normalizedEvents,
    },
    calorieEntries: [],
    completion: {
      state: normalizedItems.length === 0 ? 'empty' : addressed === normalizedItems.length ? 'complete' : 'in_progress',
      total: normalizedItems.length,
      completed,
      addressed,
      remaining: normalizedItems.length - addressed,
      percent: normalizedItems.length === 0 ? null : (addressed / normalizedItems.length) * 100,
    },
    week,
    attention: {
      focus: focus
        ? {
            state: 'selected',
            itemId: focus.id,
            reasonCode: focus.startTime === null ? 'first_anytime_item' : 'active_timed_item',
          }
        : {
            state: normalizedItems.length === 0 ? 'empty_day' : 'completed_day',
            itemId: null,
            reasonCode: null,
          },
      nextPlannedItem: null,
      nextCalendarObligation: null,
      nextObligation: null,
    },
    capacity: {
      status: 'unavailable',
      window: null,
      basis: null,
      reasonCodes: ['planning_window_missing'],
    },
    supporting: {
      habits: {
        status: 'available',
        total: normalizedItems.filter((item) => item.type === 'habit').length,
        pending: normalizedItems.filter((item) => item.habitInfo?.outcome === 'pending').length,
        partial: normalizedItems.filter((item) => item.habitInfo?.outcome === 'partial').length,
        completed: normalizedItems.filter((item) => item.habitInfo?.outcome === 'completed').length,
        failed: normalizedItems.filter((item) => item.habitInfo?.outcome === 'failed').length,
        targeted: normalizedItems.filter((item) => item.habitInfo?.target != null).length,
      },
      nutrition: {
        status: 'disabled',
        entries: [],
        calories: { status: 'unavailable', value: null },
        protein: { status: 'unavailable', value: null },
        carbs: { status: 'unavailable', value: null },
        fat: { status: 'unavailable', value: null },
        weight: { status: 'disabled', entry: null },
      },
      workouts: {
        status: 'disabled',
        sessions: [],
      },
    },
  }
}
