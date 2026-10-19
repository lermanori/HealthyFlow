import type { CalendarSource } from '../../backend/src/day-summary-schema'
import type { AssistantContext } from '../../backend/src/settings-schema'

const TALK_CALENDAR_DAYS = 7
const MAX_EVENTS_PER_DAY = 20
const MONTHS: Record<string, number> = {
  january: 1, jan: 1, ינואר: 1,
  february: 2, feb: 2, פברואר: 2,
  march: 3, mar: 3, מרץ: 3,
  april: 4, apr: 4, אפריל: 4,
  may: 5, מאי: 5,
  june: 6, jun: 6, יוני: 6,
  july: 7, jul: 7, יולי: 7,
  august: 8, aug: 8, אוגוסט: 8,
  september: 9, sep: 9, sept: 9, ספטמבר: 9,
  october: 10, oct: 10, אוקטובר: 10,
  november: 11, nov: 11, נובמבר: 11,
  december: 12, dec: 12, דצמבר: 12,
}
const MONTH_PATTERN = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')

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

function validDateKey(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? localDateKey(date)
    : null
}

function namedDates(prompt: string, now: Date) {
  const dates: string[] = []
  const add = (year: number, month: number, day: number) => {
    const key = validDateKey(year, month, day)
    if (key && !dates.includes(key)) dates.push(key)
  }

  for (const match of prompt.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    add(Number(match[1]), Number(match[2]), Number(match[3]))
  }

  for (const match of prompt.matchAll(/(?:^|\D)(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?(?!\d)/g)) {
    const first = Number(match[1])
    const second = Number(match[2])
    const year = Number(match[3] ?? now.getFullYear())
    // Only unambiguous numeric dates: 26/10 and 10/26 both mean October 26.
    if (first > 12 && second <= 12) add(year, second, first)
    else if (second > 12 && first <= 12) add(year, first, second)
  }

  const dayMonth = new RegExp(`(?:^|[\\s([{])(?:[בה][-־]?)?(\\d{1,2})\\s+(?:[בל][-־]?)?(${MONTH_PATTERN})(?:,?\\s+(\\d{4}))?`, 'giu')
  for (const match of prompt.matchAll(dayMonth)) {
    add(Number(match[3] ?? now.getFullYear()), MONTHS[match[2].toLowerCase()], Number(match[1]))
  }

  const monthDay = new RegExp(`(?:^|[\\s([{])(?:ב[-־]?)?(${MONTH_PATTERN})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`, 'giu')
  for (const match of prompt.matchAll(monthDay)) {
    add(Number(match[3] ?? now.getFullYear()), MONTHS[match[1].toLowerCase()], Number(match[2]))
  }

  if (dates.length === 0) {
    // A bare day such as "ב26" refers to its next occurrence, like a bare weekday.
    const bareDay = /(?:^|[\s([{])ב[-־]?(\d{1,2})(?![\d./])|\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/giu
    for (const match of prompt.matchAll(bareDay)) {
      const day = Number(match[1] ?? match[2])
      if (day < 1 || day > 31) continue
      for (let offset = 0; offset < 12; offset += 1) {
        const candidate = new Date(now.getFullYear(), now.getMonth() + offset, day)
        if (candidate.getDate() === day && candidate >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          const key = localDateKey(candidate)
          if (!dates.includes(key)) dates.push(key)
          break
        }
      }
    }
  }

  return dates
}

function datesToRead(now: Date, prompt: string, previousPrompts: readonly string[]) {
  const nextWeek = /\bnext week\b|בשבוע הבא/iu.test(prompt)
  const currentDates = namedDates(prompt, now)
  const previousDates = currentDates.length === 0
    ? (previousPrompts.map((message) => namedDates(message, now)).find((dates) => dates.length > 0) ?? [])
    : []
  const nearby = Array.from({ length: TALK_CALENDAR_DAYS }, (_, offset) =>
    dateAtOffset(now, offset + (nextWeek ? 7 : 0)))
  return [...new Set([...currentDates, ...previousDates, ...nearby])]
    .slice(0, TALK_CALENDAR_DAYS)
    .sort()
}

export async function buildTalkCalendarContext(
  readDay: (date: string) => Promise<CalendarSource>,
  now = new Date(),
  prompt = '',
  previousPrompts: readonly string[] = [],
): Promise<NonNullable<AssistantContext['calendar']>> {
  const days = await Promise.all(datesToRead(now, prompt, previousPrompts).map(async (date) => {
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
