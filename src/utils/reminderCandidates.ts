import type { ReminderItem } from '../../backend/src/task-contracts'

export interface Reminder {
  id: string
  taskTitle: string
  time: string
  type: 'upcoming' | 'overdue'
}

/** Minutes before a start time that raises an "upcoming" reminder. */
const UPCOMING_LEAD_MINUTES = 15
/** Grace period after a start time before an item counts as overdue (issue #20). */
const OVERDUE_GRACE_MINUTES = 30

/**
 * The caller's local calendar day. Built from local components on purpose:
 * toISOString() returns UTC and can be a day ahead in UTC-N zones, which would
 * make tomorrow's items match "today" and fire false overdue reminders.
 */
export function localDateKey(now: Date): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Decide which items deserve a reminder right now.
 *
 * This is the authoritative predicate. `GET /api/tasks/reminders` narrows the
 * rows it returns to the same conditions so the payload stays bounded, but the
 * server filter is only ever allowed to drop rows this function would ignore.
 */
export function deriveReminders(
  items: ReminderItem[],
  now: Date,
  alreadyNotified: ReadonlySet<string>
): { reminders: Reminder[]; overdueToNotify: string[] } {
  const todayStr = localDateKey(now)
  const currentTime = now.getHours() * 60 + now.getMinutes()

  const reminders: Reminder[] = []
  const overdueToNotify: string[] = []

  for (const item of items) {
    // An item with no date sits in the Anytime backlog and is never due.
    if (!item.startTime || item.completed || !item.scheduledDate) continue

    const [hours, minutes] = item.startTime.split(':').map(Number)
    const timeDiff = hours * 60 + minutes - currentTime

    if (timeDiff > 0 && timeDiff <= UPCOMING_LEAD_MINUTES && item.scheduledDate === todayStr) {
      reminders.push({
        id: `upcoming-${item.id}`,
        taskTitle: item.title,
        time: item.startTime,
        type: 'upcoming',
      })
    }

    // Overdue matches earlier days too, so an item left behind on a previous
    // day still surfaces. It fires once: the server records the notification.
    if (
      item.scheduledDate <= todayStr &&
      timeDiff < -OVERDUE_GRACE_MINUTES &&
      !item.overdueNotified &&
      !alreadyNotified.has(item.id)
    ) {
      reminders.push({
        id: `overdue-${item.id}`,
        taskTitle: item.title,
        time: item.startTime,
        type: 'overdue',
      })
      overdueToNotify.push(item.id)
    }
  }

  return { reminders, overdueToNotify }
}
