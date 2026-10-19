import type { CalendarSource } from '../../backend/src/day-summary-schema'
import type { AssistantContext } from '../../backend/src/settings-schema'

const TALK_CALENDAR_DAYS = 7
const MAX_EVENTS_PER_DAY = 20

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateAtOffset(now: Date, offset: number) {
  const date = new Date(now)
  date.setDate(date.getDate() + offset)
  return localDateKey(date)
}

export async function buildTalkCalendarContext(
  readDay: (date: string) => Promise<CalendarSource>,
  now = new Date(),
): Promise<NonNullable<AssistantContext['calendar']>> {
  const days = await Promise.all(Array.from({ length: TALK_CALENDAR_DAYS }, async (_, offset) => {
    const date = dateAtOffset(now, offset)
    try {
      const source = await readDay(date)
      return {
        date,
        status: source.status,
        reasonCode: source.reasonCode,
        events: source.events.slice(0, MAX_EVENTS_PER_DAY).map((event) => ({
          title: event.title,
          description: event.description,
          location: event.location,
          startAt: event.startAt,
          endAt: event.endAt,
          localStartTime: event.localStartTime,
          localEndTime: event.localEndTime,
          allDay: event.allDay,
          status: event.status,
        })),
        truncated: source.events.length > MAX_EVENTS_PER_DAY,
      }
    } catch {
      return {
        date,
        status: 'unavailable' as const,
        reasonCode: 'status_unavailable' as const,
        events: [],
        truncated: false,
      }
    }
  }))

  return { days }
}
