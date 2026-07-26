import { addDays, differenceInCalendarDays, format, isSameYear, startOfWeek } from 'date-fns'

export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type DateRelation = 'past' | 'yesterday' | 'today' | 'tomorrow' | 'future'

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
