import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X, Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { taskService } from '../services/api'
import api from '../services/api'

interface Reminder {
  id: string
  taskTitle: string
  time: string
  type: 'upcoming' | 'overdue'
}

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

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => taskService.getTasks(),
    refetchInterval: 60000, // Check every minute
    enabled: !isDemo,
  })

  useEffect(() => {
    const now = new Date()
    // Use local date components — toISOString() returns UTC and can be a day ahead in UTC-N zones,
    // which would make tomorrow's tasks match "today" and trigger false overdue notifications.
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const currentTime = now.getHours() * 60 + now.getMinutes()

    const newReminders: Reminder[] = []
    const overdueToNotify: string[] = []

    tasks.forEach(task => {
      if (task.startTime && !task.completed) {
        const [hours, minutes] = task.startTime.split(':').map(Number)
        const taskTime = hours * 60 + minutes
        const timeDiff = taskTime - currentTime

        // Upcoming task (15 minutes before) — only for today's tasks
        if (timeDiff > 0 && timeDiff <= 15 && task.scheduledDate === todayStr) {
          newReminders.push({
            id: `upcoming-${task.id}`,
            taskTitle: task.title,
            time: task.startTime,
            type: 'upcoming'
          })
        }

        // Overdue: scheduledDate must be today or past AND startTime > 30 min ago (issue #20)
        if (task.scheduledDate <= todayStr && timeDiff < -30 && !task.overdueNotified && !notifiedRef.current.has(task.id)) {
          newReminders.push({
            id: `overdue-${task.id}`,
            taskTitle: task.title,
            time: task.startTime,
            type: 'overdue'
          })
          overdueToNotify.push(task.id)
        }
      }
    })

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
  }, [tasks])

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
