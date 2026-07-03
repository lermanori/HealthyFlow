import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, addDays, subDays } from 'date-fns'
import { Plus, Calendar, ChevronLeft, ChevronRight, Brain, Sparkles, Trash2, RotateCcw, CheckCircle2, Award, Utensils, Dumbbell } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import api, {
  achievementService,
  calendarService,
  caloriesService,
  onboardingService,
  taskService,
  workoutsService,
  ExternalCalendarEvent,
  Task,
  type AchievementSummary,
  type CalorieEntry,
  type WorkoutSession,
} from '../services/api'
import DayTimeline from '../components/DayTimeline'
import HabitTrackerBar from '../components/HabitTrackerBar'
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
import AskAIModal from '../components/AskAIModal'
import { createPortal } from 'react-dom'
import { useSettings } from '../hooks/useSettings'

type TodayModuleCard = {
  title: string
  href: string
  icon: typeof Calendar
  status: string
  detail: string
  accent: 'cyan' | 'green' | 'purple' | 'amber'
}

function ModuleStatusCards({ modules }: { modules: TodayModuleCard[] }) {
  if (modules.length === 0) return null

  const accentClasses: Record<TodayModuleCard['accent'], string> = {
    cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    purple: 'border-purple-500/30 bg-purple-500/10 text-purple-200',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  }

  return (
    <section className="md:hidden">
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-lg font-semibold text-gray-100">Your modules</h2>
        <span className="text-xs font-medium text-cyan-300">Live status</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {modules.map((module) => {
          const Icon = module.icon
          return (
            <Link
              key={module.href}
              to={module.href}
              className={`min-h-[112px] rounded-xl border p-3 transition hover:scale-[1.01] hover:shadow-lg ${accentClasses[module.accent]}`}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-950/35">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-gray-950/35 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
                  {module.status}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-gray-100">{module.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs leading-snug text-gray-300">{module.detail}</p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

export default function TodayPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showAIAnalyzer, setShowAIAnalyzer] = useState(false)
  const [showAskAIModal, setShowAskAIModal] = useState(false)
  const [habitDeleteCandidate, setHabitDeleteCandidate] = useState<Task | null>(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const queryClient = useQueryClient()
  const { showNotification } = useNotifications()
  const location = useLocation()
  const { settings } = useSettings()
  const selectedDateKey = format(selectedDate, 'yyyy-MM-dd')
  const calorieModuleEnabled = settings?.calorieIntake ?? false
  const achievementModuleEnabled = settings?.achievementTracker ?? false
  const workoutModuleEnabled = settings?.workoutTracker ?? true

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

  const { data: workoutSessions = [] } = useQuery<WorkoutSession[]>({
    queryKey: ['workouts', selectedDateKey],
    queryFn: () => workoutsService.list(selectedDateKey),
    enabled: workoutModuleEnabled,
  })

  const { data: achievementSummaries = [] } = useQuery<AchievementSummary[]>({
    queryKey: ['achievements', 'module-card'],
    queryFn: () => achievementService.list({ includeArchived: false, entryLimit: 5 }),
    enabled: achievementModuleEnabled,
  })

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

  // Calculate habit statistics
  const habits = tasksData.filter((task: Task) => task.type === 'habit')
  const completedHabits = habits.filter((habit: Task) => habit.completed)
  
  const categories = tasksData.reduce((acc: Record<string, { total: number; completed: number }>, task: Task) => {
    if (!acc[task.category]) {
      acc[task.category] = { total: 0, completed: 0 }
    }
    acc[task.category].total++
    if (task.completed) {
      acc[task.category].completed++
    }
    return acc
  }, {} as Record<string, { total: number; completed: number }>)

  const moduleCards: TodayModuleCard[] = [
    ...(calorieModuleEnabled ? [{
      title: 'Calories',
      href: '/calories',
      icon: Utensils,
      status: calorieEntries.length > 0 ? `${calorieEntries.length} logged` : 'needs log',
      detail: calorieEntries.length > 0
        ? `${calorieEntries.reduce((sum, entry) => sum + entry.calories, 0)} calories logged today.`
        : 'No calorie entries for this day yet.',
      accent: calorieEntries.length > 0 ? 'green' as const : 'cyan' as const,
    }] : []),
    ...(workoutModuleEnabled ? [{
      title: 'Workout',
      href: '/workouts',
      icon: Dumbbell,
      status: workoutSessions.length > 0 ? `${workoutSessions.length} done` : 'ready',
      detail: workoutSessions.length > 0
        ? workoutSessions.map((session) => session.title || 'Workout session').slice(0, 2).join(', ')
        : 'No workout logged today.',
      accent: workoutSessions.length > 0 ? 'green' as const : 'purple' as const,
    }] : []),
    ...(achievementModuleEnabled ? [{
      title: 'Achievements',
      href: '/achievements',
      icon: Award,
      status: `${achievementSummaries.length} active`,
      detail: achievementSummaries.length > 0
        ? achievementSummaries.slice(0, 2).map((summary) => summary.definition.name).join(', ')
        : 'Track measurable wins and personal bests.',
      accent: 'amber' as const,
    }] : []),
    {
      title: 'Week View',
      href: '/week',
      icon: Calendar,
      status: 'week',
      detail: 'Scan the week and move work across days.',
      accent: 'cyan' as const,
    },
  ]

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
            <button
              type="button"
              onClick={() => setShowAskAIModal(true)}
              className="rounded-lg border border-gray-700 bg-gray-950/30 p-3 text-left transition hover:border-cyan-500/40 hover:bg-cyan-500/10"
            >
              <Brain className="mb-2 h-4 w-4 text-cyan-300" />
              <p className="text-sm font-medium text-gray-100">Ask AI</p>
              <p className="mt-1 text-xs text-gray-500">Use the sample tasks.</p>
            </button>
          </div>
        </motion.div>
      )}

      {/* Confetti Animation */}
      <ConfettiAnimation 
        show={showConfetti} 
        onComplete={() => setShowConfetti(false)} 
      />

      {/* Header with Date Navigation */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0"
      >
        <div className="flex items-center space-x-4">
          <div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handlePreviousDay}
                className="p-2 md:p-3 rounded-xl hover:bg-gray-800/50 transition-all duration-300 text-gray-400 hover:text-cyan-400 hover:shadow-lg hover:shadow-cyan-500/20"
                aria-label="Previous day"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              <h1 className="text-2xl md:text-3xl font-bold text-gray-100 neon-text">
                {formatRelativeDate(selectedDate)}
              </h1>
              
              <button
                onClick={handleNextDay}
                className="p-2 md:p-3 rounded-xl hover:bg-gray-800/50 transition-all duration-300 text-gray-400 hover:text-cyan-400 hover:shadow-lg hover:shadow-cyan-500/20"
                aria-label="Next day"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex items-center space-x-4 mt-2">
              <p className="text-sm md:text-base text-gray-400">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </p>
              
              {!format(selectedDate, 'yyyy-MM-dd').includes(format(new Date(), 'yyyy-MM-dd')) && (
                <button
                  onClick={handleToday}
                  className="text-xs md:text-sm text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
                >
                  Go to Today
                </button>
              )}
            </div>
            
            <div className="flex items-center space-x-4 mt-2">
              <span className="text-xs md:text-sm text-gray-500">
                {tasksData.length} tasks • {tasksData.filter((t: Task) => t.completed).length} completed
              </span>
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
        
        {/* Action Buttons - Responsive Layout */}
        <div className={`flex ${isMobile ? 'flex-wrap gap-2' : 'items-center space-x-3'}`}>
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

          {/* Ask AI Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowAskAIModal(true)}
            className={`btn-secondary flex items-center space-x-2 ${isMobile ? 'text-sm py-2 px-3' : ''}`}
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>{isMobile ? 'Ask' : 'Ask AI'}</span>
          </motion.button>

          {/* Clear Current Date's Tasks Button - Hide on mobile to save space */}
          {!isMobile && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleClearCurrentDate}
              className="btn-secondary flex items-center space-x-2 text-red-400 border-red-400 hover:bg-red-500/10"
            >
              <span>🗑️</span>
              <span>Clear {formatRelativeDate(selectedDate)}</span>
            </motion.button>
          )}

          <Link
            to="/add"
            className={`btn-primary flex items-center space-x-2 ${isMobile ? 'text-sm py-2 px-3' : ''}`}
          >
            <Plus className="w-4 h-4" />
            <span>{isMobile ? 'Add' : 'Add Task'}</span>
          </Link>
          
          {!isMobile && (
            <Link
              to="/week"
              className="btn-secondary flex items-center space-x-2"
            >
              <Calendar className="w-4 h-4" />
              <span>Week View</span>
            </Link>
          )}
        </div>
      </motion.div>

      <ModuleStatusCards modules={moduleCards} />

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

      {/* Ask AI Modal */}
      <AskAIModal isOpen={showAskAIModal} onClose={() => setShowAskAIModal(false)} />

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
            onTasksReorder={handleTasksReorder}
            onCompleteTask={handleCompleteTask}
            onUncompleteTask={handleUncompleteTask}
            onCalendarEventComplete={handleCalendarEventComplete}
            onCalendarEventSchedule={handleCalendarEventSchedule}
            onEditTask={handleEditTask}
            onDeleteTask={handleDeleteTask}
          />
        </motion.div>

        {/* Futuristic Sidebar - Responsive Layout */}
        <div
          className="space-y-4 md:space-y-6"
        >
          {/* Habit Tracker */}
          <div className="card holographic">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100">
                {formatRelativeDate(selectedDate)} Progress
              </h3>
            </div>
            <div className="space-y-4">
              <HabitTrackerBar
                title="Overall Progress"
                completed={completedHabits.length}
                total={habits.length}
                color="bg-gradient-to-r from-cyan-500 to-blue-600"
              />
              
              {Object.entries(categories).map(([category, stats]) => (
                <HabitTrackerBar
                  key={category}
                  title={category.charAt(0).toUpperCase() + category.slice(1)}
                  completed={stats.completed}
                  total={stats.total}
                  color={
                    category === 'health' ? 'bg-gradient-to-r from-green-500 to-emerald-600' :
                    category === 'work' ? 'bg-gradient-to-r from-blue-500 to-indigo-600' :
                    category === 'fitness' ? 'bg-gradient-to-r from-orange-500 to-red-600' :
                    'bg-gradient-to-r from-purple-500 to-pink-600'
                  }
                />
              ))}
            </div>
          </div>

          {/* AI Recommendations */}
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
