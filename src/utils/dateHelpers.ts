import { addDays, differenceInCalendarDays, format, isSameYear, startOfWeek } from 'date-fns'

export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type DateRelation = 'past' | 'yesterday' | 'today' | 'tomorrow' | 'future'
export type DaySwipeDirection = 'previous' | 'next'

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const FULL_DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function getDateRelation(date: Date, referenceDate: Date = new Date()): DateRelation {
  const difference = differenceInCalendarDays(date, referenceDate)
  if (difference === 0) return 'today'
  if (difference === 1) return 'tomorrow'
  if (difference === -1) return 'yesterday'
  return difference < 0 ? 'past' : 'future'
}

export function formatRelativeDate(date: Date, referenceDate: Date = new Date()): string {
  const relation = getDateRelation(date, referenceDate)
  if (relation === 'today') return 'Today'
  if (relation === 'tomorrow') return 'Tomorrow'
  if (relation === 'yesterday') return 'Yesterday'
  return format(date, isSameYear(date, referenceDate) ? 'MMM d' : 'MMM d, yyyy')
}

export function formatScheduleHeading(date: Date, referenceDate: Date = new Date()): string {
  const relation = getDateRelation(date, referenceDate)
  if (relation === 'today') return "Today's Schedule"
  if (relation === 'tomorrow') return "Tomorrow's Schedule"
  if (relation === 'yesterday') return "Yesterday's Schedule"
  return `Schedule for ${format(date, isSameYear(date, referenceDate) ? 'MMMM d' : 'MMMM d, yyyy')}`
}

export function formatSelectedDateAnnouncement(date: Date, referenceDate: Date = new Date()): string {
  return `${formatRelativeDate(date, referenceDate)}. ${format(date, 'EEEE, MMMM d, yyyy')}.`
}

export function getWeekDates(date: Date = new Date(), weekStartsOn: WeekStartsOn = 1) {
  const start = startOfWeek(date, { weekStartsOn })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function getWeekdayLabels(weekStartsOn: WeekStartsOn = 1) {
  return Array.from({ length: 7 }, (_, i) => DAY_LABELS[(weekStartsOn + i) % 7])
}

export function getWeekdayLetters(weekStartsOn: WeekStartsOn = 1) {
  return Array.from({ length: 7 }, (_, i) => DAY_LETTERS[(weekStartsOn + i) % 7])
}

export function getFullWeekdayLabels(weekStartsOn: WeekStartsOn = 1) {
  return Array.from({ length: 7 }, (_, i) => FULL_DAY_LABELS[(weekStartsOn + i) % 7])
}

export function getWeekNavigationIndex(currentIndex: number, key: string): number | null {
  if (key === 'Home') return 0
  if (key === 'End') return 6
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (currentIndex + 6) % 7
  if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1) % 7
  return null
}

export function getDaySwipeDirection(
  deltaX: number,
  deltaY: number,
  minimumDistance = 72
): DaySwipeDirection | null {
  const horizontalDistance = Math.abs(deltaX)
  const verticalDistance = Math.abs(deltaY)
  if (horizontalDistance < minimumDistance) return null
  if (horizontalDistance < verticalDistance * 1.25) return null
  return deltaX < 0 ? 'next' : 'previous'
}

export function formatTimeRange(startTime: string, duration: number): string {
  const [hours, minutes] = startTime.split(':').map(Number)
  const start = new Date()
  start.setHours(hours, minutes, 0, 0)
  
  const end = new Date(start.getTime() + duration * 60000)
  
  return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`
}

export function getTimeSlots(startHour: number = 6, endHour: number = 23, interval: number = 30) {
  const slots = []
  for (let hour = startHour; hour <= endHour; hour++) {
    for (let minute = 0; minute < 60; minute += interval) {
      const time = new Date()
      time.setHours(hour, minute, 0, 0)
      slots.push(format(time, 'HH:mm'))
    }
  }
  return slots
}

export function isTimeSlotAvailable(
  time: string,
  duration: number,
  existingTasks: Array<{ startTime?: string; duration?: number }>
): boolean {
  const [hours, minutes] = time.split(':').map(Number)
  const slotStart = hours * 60 + minutes
  const slotEnd = slotStart + duration

  return !existingTasks.some(task => {
    if (!task.startTime || !task.duration) return false
    
    const [taskHours, taskMinutes] = task.startTime.split(':').map(Number)
    const taskStart = taskHours * 60 + taskMinutes
    const taskEnd = taskStart + task.duration

    // Check for overlap
    return (slotStart < taskEnd && slotEnd > taskStart)
  })
}

/**
 * A timed Item's clock range, in the same shape a Calendar obligation shows.
 *
 * Today put an Item's start and duration in separate places (`19:00` then
 * `30min`) while a Calendar event showed a range (`17:00 - 18:00`), so two rows
 * describing the same kind of commitment read as different kinds of thing. An
 * Item with no duration keeps showing only its start: inventing an end time
 * would assert a commitment the Item never carried.
 */
export function formatClockRange(startTime: string, durationMinutes?: number | null): string {
  if (!durationMinutes || durationMinutes <= 0) return startTime
  const [hours, minutes] = startTime.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return startTime
  const end = hours * 60 + minutes + durationMinutes
  // Past midnight the end belongs to the next day; showing a wrapped clock alone
  // would read as an earlier time on the same day.
  if (end >= 24 * 60) return startTime
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${startTime} - ${pad(Math.floor(end / 60))}:${pad(end % 60)}`
}
