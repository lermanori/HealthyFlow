import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X, Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { taskService } from '../services/api'
import api from '../services/api'
import { deriveReminders, localDateKey, type Reminder } from '../utils/reminderCandidates'

function sameReminders(a: Reminder[], b: Reminder[]) {
  if (a.length !== b.length) return false
  return a.every((item, index) => (
    item.id === b[index].id &&
    item.taskTitle === b[index].taskTitle &&
    item.time === b[index].time &&
    item.type === b[index].type
  ))
}

export default function SmartReminders() {
  const isDemo = Boolean(localStorage.getItem('demoPersona'))
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [notifiedOverdueIds, setNotifiedOverdueIds] = useState<Set<string>>(new Set())
  const notifiedRef = useRef<Set<string>>(notifiedOverdueIds)

  useEffect(() => {
    notifiedRef.current = notifiedOverdueIds
  }, [notifiedOverdueIds])

  // Only the Items that could raise a reminder, not the account's history. The
  // local day is resolved per fetch rather than per key so the minute poll
  // rolls onto the new day by itself at midnight. Keeping the key under the
  // 'tasks' prefix means existing invalidateQueries(['tasks']) calls still
  // refresh reminders after a mutation.
  const { data: items = [] } = useQuery({
    queryKey: ['tasks', 'reminders'],
    queryFn: () => taskService.getReminderItems(localDateKey(new Date())),
    refetchInterval: 60000, // Check every minute
    enabled: !isDemo,
  })

  useEffect(() => {
    const { reminders: newReminders, overdueToNotify } = deriveReminders(
      items,
      new Date(),
      notifiedRef.current
    )

    // ponytail: don't filter dismissedIds here — visibleReminders (line below) already does it.
    // Keeping dismissedIds in deps + unconditional setReminders caused the render loop.
    setReminders((current) => sameReminders(current, newReminders) ? current : newReminders)

    // Only update if there are new IDs
    if (overdueToNotify.length > 0) {
      api.patch('/tasks/overdue-notified', { taskIds: overdueToNotify })
      setNotifiedOverdueIds(prev => {
        const updated = new Set(prev)
        overdueToNotify.forEach(id => updated.add(id))
        return updated
      })
    }
  }, [items])

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => [...prev, id])
  }

  const visibleReminders = reminders.filter(r => !dismissedIds.includes(r.id))

  if (isDemo) return null
  if (visibleReminders.length === 0) return null

  return (
    <div className="fixed top-20 right-4 z-40 space-y-2">
      <AnimatePresence>
        {visibleReminders.map((reminder) => (
          <motion.div
            key={reminder.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            className={`surface-overlay max-w-sm border-l-4 p-4 ${
              reminder.type === 'upcoming' 
                ? 'border-l-state-info'
                : 'border-l-state-danger'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <div className={`p-2 rounded-full ${
                  reminder.type === 'upcoming' 
                    ? 'bg-state-info/10 text-state-info'
                    : 'bg-state-danger/10 text-state-danger'
                }`}>
                  {reminder.type === 'upcoming' ? <Bell className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">
                    {reminder.type === 'upcoming' ? 'Coming Up' : 'Overdue'}
                  </p>
                  <p className="text-sm text-ink-soft">{reminder.taskTitle}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Scheduled for {reminder.time}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDismiss(reminder.id)}
                className="rounded-full p-1 transition-colors hover:bg-raised"
              >
                <X className="w-4 h-4 text-ink-muted" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
