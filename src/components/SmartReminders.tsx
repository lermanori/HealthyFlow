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

export default function SmartReminders() {
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
  })

  useEffect(() => {
    const now = new Date()
    const currentTime = now.getHours() * 60 + now.getMinutes()

    const newReminders: Reminder[] = []
    const overdueToNotify: string[] = []

    tasks.forEach(task => {
      if (task.startTime && !task.completed) {
        const [hours, minutes] = task.startTime.split(':').map(Number)
        const taskTime = hours * 60 + minutes
        const timeDiff = taskTime - currentTime

        // Upcoming task (15 minutes before)
        if (timeDiff > 0 && timeDiff <= 15) {
          newReminders.push({
            id: `upcoming-${task.id}`,
            taskTitle: task.title,
            time: task.startTime,
            type: 'upcoming'
          })
        }

        // Overdue task (30 minutes after start time) and not notified
        if (timeDiff < -30 && !task.overdueNotified && !notifiedRef.current.has(task.id)) {
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

    setReminders(newReminders.filter(r => !dismissedIds.includes(r.id)))

    // Only update if there are new IDs
    if (overdueToNotify.length > 0) {
      api.patch('/tasks/overdue-notified', { taskIds: overdueToNotify })
      setNotifiedOverdueIds(prev => {
        const updated = new Set(prev)
        overdueToNotify.forEach(id => updated.add(id))
        return updated
      })
    }
    // DO NOT include notifiedOverdueIds in the dependency array!
    // eslint-disable-next-line
  }, [tasks, dismissedIds])

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => [...prev, id])
  }

  const visibleReminders = reminders.filter(r => !dismissedIds.includes(r.id))

  if (visibleReminders.length === 0) return null

  return (
    <div className="fixed top-20 right-4 z-40 space-y-2">
      <AnimatePresence>
        {visibleReminders.map((reminder) => (
          <motion.div
            key={reminder.id}
            initial={{ opacity: 0, x: 300, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 300, scale: 0.8 }}
            className={`p-4 rounded-lg shadow-lg border-l-4 bg-white max-w-sm ${
              reminder.type === 'upcoming' 
                ? 'border-l-blue-500' 
                : 'border-l-red-500'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <div className={`p-2 rounded-full ${
                  reminder.type === 'upcoming' 
                    ? 'bg-blue-100 text-blue-600' 
                    : 'bg-red-100 text-red-600'
                }`}>
                  {reminder.type === 'upcoming' ? <Bell className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">
                    {reminder.type === 'upcoming' ? 'Coming Up' : 'Overdue'}
                  </p>
                  <p className="text-gray-700 text-sm">{reminder.taskTitle}</p>
                  <p className="text-gray-500 text-xs mt-1">
                    Scheduled for {reminder.time}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDismiss(reminder.id)}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}