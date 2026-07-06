import { useState, useEffect } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, addDays, subDays, startOfWeek, isSameDay, isBefore } from 'date-fns'
import { Plus, Calendar, ChevronLeft, ChevronRight, Brain, Sparkles, Trash2, RotateCcw, CheckCircle2, Award, Utensils, Clock } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import api, {
  calendarService,
  caloriesService,
  onboardingService,
  taskService,
  ExternalCalendarEvent,
  Task,
  type CalorieEntry,
} from '../services/api'
import DayTimeline from '../components/DayTimeline'
import AIRecommendationsBox from '../components/AIRecommendationsBox'
import TaskEditModal from '../components/TaskEditModal'
import ConfettiAnimation from '../components/ConfettiAnimation'
import SmartReminders from '../components/SmartReminders'
import AITextAnalyzer from '../components/AITextAnalyzer'
import LoadingSpinner from '../components/LoadingSpinner'
import { useNotifications } from '../hooks/useNotifications'
import { formatRelativeDate } from '../utils/dateHelpers'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useSettings } from '../hooks/useSettings'

function WeekRibbon({
  selectedDate,
  onSelect,
  loadByDay,
}: {
  selectedDate: Date
  onSelect: (d: Date) => void
  loadByDay: Record<string, { total: number; completed: number }>
}) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 }) // Monday
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {days.map((day) => {
        const key = format(day, 'yyyy-MM-dd')
        const load = loadByDay[key] ?? { total: 0, completed: 0 }
        const isSelected = isSameDay(day, selectedDate)
        const isPast = isBefore(day, today) && !isSameDay(day, today)
        const allDone = isPast && load.total > 0 && load.completed >= load.total
        const dots = Math.min(load.total, 4)
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(day)}
            className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 transition-all ${
              isSelected
                ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200 shadow-lg shadow-cyan-500/10'
                : 'border-gray-700/60 bg-gray-900/40 text-gray-400 hover:border-cyan-500/30 hover:text-gray-200'
            }`}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide">{format(day, 'EEEEE')}</span>
            <span className={`text-sm font-semibold ${isSelected ? 'text-cyan-100' : 'text-gray-200'}`}>{format(day, 'd')}</span>
            <span className="flex h-2 items-center gap-0.5">
              {allDone ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              ) : (
                Array.from({ length: dots }).map((_, i) => (
                  <span key={i} className="h-1 w-1 rounded-full bg-cyan-400/70" />
                ))
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function NowNextCard({ tasks }: { tasks: Task[] }) {
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + (m || 0)
  }
  const timed = tasks
    .filter((t) => t.startTime && !t.completed)
    .sort((a, b) => toMin(a.startTime!) - toMin(b.startTime!))

  const current = [...timed].reverse().find((t) => toMin(t.startTime!) <= nowMinutes)
  const next = timed.find((t) => toMin(t.startTime!) > nowMinutes)

  if (!current && !next) {
    return (
      <div className="rounded-xl border border-gray-700/60 bg-gray-900/40 p-4 text-sm text-gray-400">
        Nothing timed right now. Add a time to something below, or enjoy the open space.
      </div>
    )
  }

  const Row = ({ label, task, accent }: { label: string; task: Task; accent: string }) => (
    <div className="flex min-w-0 items-center gap-3">
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${accent}`}>{label}</span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
        <Clock className="h-3 w-3" />
        {task.startTime}
      </span>
      <span className="truncate text-sm font-medium text-gray-100">{task.title}</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-cyan-500/30 bg-gray-900/50 p-4">
      {current && <Row label="Now" task={current} accent="bg-cyan-500/20 text-cyan-300" />}
      {next && (
        <div className={current ? 'border-t border-gray-800 pt-3' : ''}>
          <Row label="Next" task={next} accent="bg-purple-500/20 text-purple-300" />
        </div>
      )}
    </div>
  )
}

export default function TodayPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showAIAnalyzer, setShowAIAnalyzer] = useState(false)
  const [habitDeleteCandidate, setHabitDeleteCandidate] = useState<Task | null>(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const queryClient = useQueryClient()
  const { showNotification } = useNotifications()
  const location = useLocation()
  const { settings } = useSettings()
  const selectedDateKey = format(selectedDate, 'yyyy-MM-dd')
  const calorieModuleEnabled = settings?.calorieIntake ?? false

  // Check for AI parameter in URL
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('ai') === 'true') {
      setShowAIAnalyzer(true)
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [location])

  // Update isMobile state on window resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Register for vibration feedback if available
  const hasVibration = 'navigator' in window && 'vibrate' in navigator

  const { data: tasksData = [], isLoading } = useQuery({
    queryKey: ['tasks', selectedDateKey],
    queryFn: () => taskService.getTasks(selectedDateKey),
  })

  const { data: calendarEvents = [] } = useQuery({
    queryKey: ['google-calendar-events', selectedDateKey],
    queryFn: () => calendarService.getGoogleEvents(selectedDateKey),
    retry: false,
  })

  const { data: calorieEntries = [] } = useQuery<CalorieEntry[]>({
    queryKey: ['calories', selectedDateKey],
    queryFn: () => caloriesService.list(selectedDateKey),
    enabled: calorieModuleEnabled,
  })

  // Week ribbon load dots: one cheap per-day query per weekday. The selected day is
  // already cached above, so this adds at most 6 small requests and reuses the cache.
  const weekDayKeys = Array.from({ length: 7 }, (_, i) =>
    format(addDays(startOfWeek(selectedDate, { weekStartsOn: 1 }), i), 'yyyy-MM-dd')
  )
  const weekQueries = useQueries({
    queries: weekDayKeys.map((dateKey) => ({
      queryKey: ['tasks', dateKey],
      queryFn: () => taskService.getTasks(dateKey),
    })),
  })
  const loadByDay = weekDayKeys.reduce((acc, key, i) => {
    const items = (weekQueries[i]?.data ?? []) as Task[]
    acc[key] = {
      total: items.length,
      completed: items.filter((t) => t.completed).length,
    }
    return acc
  }, {} as Record<string, { total: number; completed: number }>)

  useEffect(() => {
    const syncTimedTasks = async () => {
      if (isLoading || tasksData.length === 0) return
      const date = format(selectedDate, 'yyyy-MM-dd')
      const hasTimedTasks = tasksData.some((task: Task) =>
        task.type === 'task' &&
        task.scheduledDate === date &&
        task.startTime &&
        (!task.syncedToGoogle || task.googleSyncStatus === 'failed')
      )
      if (!hasTimedTasks) return

      try {
        await calendarService.syncTimedTasks(date)
        queryClient.invalidateQueries({ queryKey: ['google-calendar-events', date] })
        queryClient.invalidateQueries({ queryKey: ['tasks', date] })
      } catch (error) {
        console.error('Today - Error syncing timed tasks to Google Calendar:', error)
      }
    }

    syncTimedTasks()
  }, [isLoading, tasksData, selectedDate, queryClient])
  
  const completeTaskMutation = useMutation({
    mutationFn: taskService.completeTask,
    onSuccess: (completedTask) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setShowConfetti(true)
      
      // Vibrate on task completion if supported
      if (hasVibration) {
        navigator.vibrate([100, 50, 100])
      }
      
      showNotification('Task Completed! 🚀', {
        body: `Excellent work completing "${completedTask.title}"!`,
        tag: 'task-completion'
      })
      toast.success('Task completed! 🚀')
    },
  })

  const uncompleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      // Update task to mark as incomplete
      return taskService.updateTask(id, { completed: false })
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success(`"${task.title}" marked as incomplete`)
    },
    onError: () => {
      toast.error('Failed to update task')
    }
  })

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, updates, editScope }: { id: string; updates: Partial<Task>; editScope?: 'instance' | 'habit' }) =>
      taskService.updateTask(id, updates, editScope),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task updated successfully!')
    },
  })

  const updateCalendarEventCompletionMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      calendarService.updateGoogleEventCompletion(id, completed),
    onSuccess: (updatedEvent) => {
      const date = format(selectedDate, 'yyyy-MM-dd')
      queryClient.setQueryData(
        ['google-calendar-events', date],
        (events: ExternalCalendarEvent[] = []) =>
          events.map(event => event.id === updatedEvent.id ? updatedEvent : event)
      )
    },
    onError: () => {
      toast.error('Failed to update calendar event')
    },
  })

  const updateCalendarEventScheduleMutation = useMutation({
    mutationFn: ({ id, startTime }: { id: string; startTime: string }) =>
      calendarService.updateGoogleEventSchedule(id, {
        date: format(selectedDate, 'yyyy-MM-dd'),
        startTime,
      }),
    onSuccess: (updatedEvent) => {
      const date = format(selectedDate, 'yyyy-MM-dd')
      queryClient.setQueryData(
        ['google-calendar-events', date],
        (events: ExternalCalendarEvent[] = []) =>
          events.map(event => event.id === updatedEvent.id ? updatedEvent : event)
      )
      toast.success('Calendar event moved')
    },
    onError: () => {
      toast.error('Failed to move calendar event')
    },
  })

  // ponytail: reorder mutation is now a no-op; DayTimeline calls taskService.reorderTasks directly
  // and passes back the reordered array for the optimistic cache update below.

  const deleteTaskMutation = useMutation({
    mutationFn: ({ id, deleteScope }: { id: string; deleteScope?: 'instance' | 'habit' }) =>
      taskService.deleteTask(id, deleteScope),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setHabitDeleteCandidate(null)
      toast.success('Task deleted')
      
      // Vibrate on delete if supported
      if (hasVibration) {
        navigator.vibrate(200)
      }
    },
  })

  const completeOnboardingMutation = useMutation({
    mutationFn: onboardingService.complete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['achievements'] })
      toast.success('Onboarding complete. Achievement unlocked!')
    },
    onError: () => toast.error('Failed to complete onboarding'),
  })

  const skipOnboardingMutation = useMutation({
    mutationFn: onboardingService.skip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Onboarding skipped')
    },
    onError: () => toast.error('Failed to skip onboarding'),
  })

  const handleCompleteTask = (id: string) => {
    completeTaskMutation.mutate(id)
  }

  const handleUncompleteTask = (id: string) => {
    uncompleteTaskMutation.mutate(id)
  }

  const handleCalendarEventComplete = (id: string, completed: boolean) => {
    updateCalendarEventCompletionMutation.mutate({ id, completed })
  }

  const handleCalendarEventSchedule = async (id: string, startTime: string) => {
    await updateCalendarEventScheduleMutation.mutateAsync({ id, startTime })
  }

  // Optimistic local update only — persistence happens inside DayTimeline via reorderTasks
  const handleTasksReorder = (reorderedTasks: Task[]) => {
    queryClient.setQueryData(['tasks', format(selectedDate, 'yyyy-MM-dd')], reorderedTasks)
  }

  const handleEditTask = (task: Task) => {
    setEditingTask(task)
  }

  const handleSaveTask = (taskId: string, updates: Partial<Task>, editScope?: 'instance' | 'habit') => {
    updateTaskMutation.mutate({ id: taskId, updates, editScope })
    setEditingTask(null)
  }

  const handleDeleteTask = (task: Task) => {
    if (task.type === 'habit') {
      setHabitDeleteCandidate(task)
      return
    }

    if (confirm('Are you sure you want to delete this task?')) {
      deleteTaskMutation.mutate({ id: task.id })
    }
  }

  const confirmHabitDelete = (deleteScope: 'instance' | 'habit') => {
    if (!habitDeleteCandidate) return
    deleteTaskMutation.mutate({
      id: habitDeleteCandidate.id,
      deleteScope,
    })
  }

  const handlePreviousDay = () => {
    setSelectedDate(prev => subDays(prev, 1))
  }

  const handleNextDay = () => {
    setSelectedDate(prev => addDays(prev, 1))
  }

  const handleToday = () => {
    setSelectedDate(new Date())
  }

  // Clear current date's tasks
  const handleClearCurrentDate = async () => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    const isToday = dateStr === format(new Date(), 'yyyy-MM-dd')
    const dateLabel = isToday ? 'today' : formatRelativeDate(selectedDate).toLowerCase()
    
    if (confirm(`Are you sure you want to delete all tasks for ${dateLabel}? This cannot be undone.`)) {
      try {
        await api.delete('/tasks', { params: { date: dateStr } })
        queryClient.invalidateQueries({ queryKey: ['tasks'] })
        toast.success(`All tasks for ${dateLabel} deleted`)
        
        // Vibrate on clear if supported
        if (hasVibration) {
          navigator.vibrate([100, 50, 100, 50, 100])
        }
      } catch (e) {
        toast.error(`Failed to delete ${dateLabel}'s tasks`)
      }
    }
  }

  // Carry-forward is now query-time (ADR-0002): incomplete untimed tasks with
  // scheduled_date NULL or < the viewed day surface automatically on GET. No
  // client-side rollover trigger needed.

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-28 md:pb-0">
      {/* Smart Reminders */}
      <SmartReminders />

      {settings?.onboardingStatus === 'active' && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-cyan-500/30 bg-gray-900/80 p-4 shadow-xl shadow-cyan-500/10"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-cyan-400" />
                <h2 className="text-lg font-semibold text-gray-100">Start with HealthyFlow</h2>
              </div>
              <p className="mt-1 text-sm text-gray-400">
                Try the core loop once: add something, log a meal, record a win, then ask AI about your day.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => completeOnboardingMutation.mutate()}
                disabled={completeOnboardingMutation.isPending}
                className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
              >
                <CheckCircle2 className="h-4 w-4" />
                Finish
              </button>
              <button
                type="button"
                onClick={() => skipOnboardingMutation.mutate()}
                disabled={skipOnboardingMutation.isPending}
                className="btn-secondary px-4 py-2 text-sm"
              >
                Skip
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Link to="/add?tab=today" className="rounded-lg border border-gray-700 bg-gray-950/30 p-3 transition hover:border-cyan-500/40 hover:bg-cyan-500/10">
              <Plus className="mb-2 h-4 w-4 text-cyan-300" />
              <p className="text-sm font-medium text-gray-100">Add a task</p>
              <p className="mt-1 text-xs text-gray-500">Use the Today tab.</p>
            </Link>
            <Link to="/add?tab=calories" className="rounded-lg border border-gray-700 bg-gray-950/30 p-3 transition hover:border-cyan-500/40 hover:bg-cyan-500/10">
              <Utensils className="mb-2 h-4 w-4 text-cyan-300" />
              <p className="text-sm font-medium text-gray-100">Log calories</p>
              <p className="mt-1 text-xs text-gray-500">Add one quick entry.</p>
            </Link>
            <Link to="/add?tab=achievements" className="rounded-lg border border-gray-700 bg-gray-950/30 p-3 transition hover:border-cyan-500/40 hover:bg-cyan-500/10">
              <Award className="mb-2 h-4 w-4 text-cyan-300" />
              <p className="text-sm font-medium text-gray-100">Record a win</p>
              <p className="mt-1 text-xs text-gray-500">Save a measurable result.</p>
            </Link>
            <Link
              to="/talk"
              className="rounded-lg border border-gray-700 bg-gray-950/30 p-3 text-left transition hover:border-cyan-500/40 hover:bg-cyan-500/10"
            >
              <Brain className="mb-2 h-4 w-4 text-cyan-300" />
              <p className="text-sm font-medium text-gray-100">Talk to your day</p>
              <p className="mt-1 text-xs text-gray-500">Add or ask, one place.</p>
            </Link>
          </div>
        </motion.div>
      )}

      {/* Confetti Animation */}
      <ConfettiAnimation 
        show={showConfetti} 
        onComplete={() => setShowConfetti(false)} 
      />

      {/* Day-first header: title row + week ribbon */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreviousDay}
              className="p-2 rounded-xl hover:bg-gray-800/50 transition-all text-gray-400 hover:text-cyan-400"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-100 neon-text">
              {formatRelativeDate(selectedDate)}
            </h1>
            <button
              onClick={handleNextDay}
              className="p-2 rounded-xl hover:bg-gray-800/50 transition-all text-gray-400 hover:text-cyan-400"
              aria-label="Next day"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            {!isSameDay(selectedDate, new Date()) && (
              <button
                onClick={handleToday}
                className="text-xs md:text-sm text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
              >
                Today
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowAIAnalyzer(true)}
              className={`btn-primary flex items-center space-x-2 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 ${isMobile ? 'text-sm py-2 px-3' : ''}`}
            >
              <Brain className="w-4 h-4" />
              <span>{isMobile ? 'AI' : 'AI Analyzer'}</span>
              <Sparkles className="w-4 h-4 animate-neon-flicker" />
            </motion.button>
            <Link
              to="/talk"
              className={`btn-primary flex items-center space-x-2 ${isMobile ? 'text-sm py-2 px-3' : ''}`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Talk</span>
            </Link>
          </div>
        </div>

        <WeekRibbon selectedDate={selectedDate} onSelect={setSelectedDate} loadByDay={loadByDay} />
      </motion.div>

      {/* Now/next — only when viewing today */}
      {isSameDay(selectedDate, new Date()) && <NowNextCard tasks={tasksData} />}

      {/* AI Text Analyzer Modal */}
      {createPortal(
        <AnimatePresence>
          {showAIAnalyzer && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed left-0 top-0 z-[9999] flex h-dvh w-dvw items-start justify-center overflow-y-auto bg-gray-950/80 px-2 py-3 backdrop-blur-sm sm:items-center sm:p-4"
              onClick={() => setShowAIAnalyzer(false)}
            >
              <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-4xl items-stretch sm:block">
                <AITextAnalyzer
                  onClose={() => setShowAIAnalyzer(false)}
                  scheduledDate={format(selectedDate, 'yyyy-MM-dd')}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <AnimatePresence>
        {habitDeleteCandidate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setHabitDeleteCandidate(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 16 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/15 text-red-300">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-100">Delete habit</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Choose what to remove for "{habitDeleteCandidate.title}".
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => confirmHabitDelete('instance')}
                  className="flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm font-medium text-gray-100 transition-colors hover:bg-gray-700"
                >
                  <Calendar className="h-4 w-4" />
                  This day
                </button>
                <button
                  type="button"
                  onClick={() => confirmHabitDelete('habit')}
                  className="flex items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-3 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/25"
                >
                  <RotateCcw className="h-4 w-4" />
                  Whole habit
                </button>
              </div>

              <button
                type="button"
                onClick={() => setHabitDeleteCandidate(null)}
                className="mt-3 w-full rounded-lg px-4 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Main Timeline */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-2"
        >
          <DayTimeline
            tasks={tasksData}
            calendarEvents={calendarEvents}
            calorieEntries={calorieEntries}
            onTasksReorder={handleTasksReorder}
            onCompleteTask={handleCompleteTask}
            onUncompleteTask={handleUncompleteTask}
            onCalendarEventComplete={handleCalendarEventComplete}
            onCalendarEventSchedule={handleCalendarEventSchedule}
            onEditTask={handleEditTask}
            onDeleteTask={handleDeleteTask}
          />
        </motion.div>

        {/* Sidebar */}
        <div className="space-y-4 md:space-y-6">
          <AIRecommendationsBox date={format(selectedDate, 'yyyy-MM-dd')} />
        </div>
      </div>

      {/* Task Edit Modal */}
      <TaskEditModal
        task={editingTask}
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleSaveTask}
      />
      
      {/* Mobile Clear Button - Fixed at bottom with increased bottom margin */}
      {isMobile && (
        <div className="fixed bottom-28 right-4 z-20">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleClearCurrentDate}
            className="btn-secondary flex items-center space-x-2 text-red-400 border-red-400 hover:bg-red-500/10 shadow-lg"
          >
            <span>🗑️</span>
            <span>Clear {formatRelativeDate(selectedDate)}</span>
          </motion.button>
        </div>
      )}
    </div>
  )
}
