import { format, isToday, isTomorrow, isYesterday, startOfWeek, endOfWeek, addDays } from 'date-fns'

export function formatRelativeDate(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isTomorrow(date)) return 'Tomorrow'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMM d')
}

export function getWeekDates(date: Date = new Date()) {
  const start = startOfWeek(date, { weekStartsOn: 1 }) // Monday
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
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