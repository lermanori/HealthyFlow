import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, addDays, subDays, startOfWeek, isSameDay, isBefore } from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight, Brain, Sparkles, Trash2, RotateCcw, Clock, Plus } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import {
  calendarService,
  caloriesService,
  onboardingService,
  rhythmService,
  taskService,
  ExternalCalendarEvent,
  Task,
  HabitItem,
  TouchpointType,
  UserRhythm,
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
import HabitOutcomeSheet from '../components/HabitOutcomeSheet'

const touchpointCtas: Record<TouchpointType, { title: string; body: string; button: string }> = {
  morning: {
    title: 'Morning planning is ready',
    body: 'Set the shape of the day before the timeline fills up.',
    button: 'Start morning planning',
  },
  midday: {
    title: 'Mid-day check-in is ready',
    body: 'Rebalance what is left and move anything that changed.',
    button: 'Start mid-day check-in',
  },
  weekly: {
    title: 'Weekly planning is ready',
    body: 'Zoom out, reset priorities, and make the week easier to trust.',
    button: 'Start weekly planning',
  },
}

type TouchpointCta = (typeof touchpointCtas)[TouchpointType]

type DueKickoff = {
  type: TouchpointType
  startMinutes: number
} & TouchpointCta

const weekdayIndexes: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

const touchpointWindowMinutes: Record<TouchpointType, number> = {
  morning: 4 * 60,
  midday: 4 * 60,
  weekly: 12 * 60,
}

const daytimeCutoffs = {
  morningEnds: 12 * 60,
  middayEnds: 18 * 60,
}

function parseTimeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return (hours || 0) * 60 + (minutes || 0)
}

function getRhythmLocalParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value
  const weekday = weekdayIndexes[value('weekday') ?? ''] ?? now.getDay()
  const hour = Number(value('hour') ?? now.getHours())
  const minute = Number(value('minute') ?? now.getMinutes())
  return { weekday, minutes: hour * 60 + minute }
}

function getDueKickoff(rhythm: UserRhythm | undefined, now: Date): DueKickoff | null {
  if (!rhythm) return null

  const { weekday, minutes } = getRhythmLocalParts(now, rhythm.timezone)
  const candidates: DueKickoff[] = []

  const addCandidate = (type: TouchpointType, startMinutes: number) => {
    const windowMinutes = touchpointWindowMinutes[type]
    if (minutes >= startMinutes && minutes < startMinutes + windowMinutes) {
      candidates.push({ type, startMinutes, ...touchpointCtas[type] })
    }
  }

  if (rhythm.morning.enabled && rhythm.morning.days.includes(weekday)) {
    addCandidate('morning', parseTimeToMinutes(rhythm.morning.time))
  }

  if (rhythm.midday.enabled && rhythm.midday.days.includes(weekday)) {
    addCandidate('midday', parseTimeToMinutes(rhythm.midday.time))
  }

  if (rhythm.weekly.enabled && rhythm.weekly.day === weekday) {
    addCandidate('weekly', parseTimeToMinutes(rhythm.weekly.time))
  }

  const scheduledDue = candidates.sort((a, b) => b.startMinutes - a.startMinutes)[0]
  if (scheduledDue) return scheduledDue

  if (rhythm.weekly.enabled && rhythm.weekly.day === weekday) {
    return {
      type: 'weekly',
      startMinutes: parseTimeToMinutes(rhythm.weekly.time),
      ...touchpointCtas.weekly,
    }
  }

  if (minutes < daytimeCutoffs.morningEnds && rhythm.morning.days.includes(weekday)) {
    return {
      type: 'morning',
      startMinutes: parseTimeToMinutes(rhythm.morning.time),
      ...touchpointCtas.morning,
    }
  }

  if (minutes < daytimeCutoffs.middayEnds && rhythm.midday.days.includes(weekday)) {
    return {
      type: 'midday',
      startMinutes: parseTimeToMinutes(rhythm.midday.time),
      ...touchpointCtas.midday,
    }
  }

  return {
    type: 'midday',
    startMinutes: parseTimeToMinutes(rhythm.midday.time),
    ...touchpointCtas.midday,
  }
}

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
    <div className="mt-2.5 grid grid-cols-7 gap-1.5 lg:mt-4 lg:gap-2">
      {days.map((day) => {
        const key = format(day, 'yyyy-MM-dd')
        const load = loadByDay[key] ?? { total: 0, completed: 0 }
        const isSelected = isSameDay(day, selectedDate)
        const isFuture = isBefore(today, day) && !isSameDay(day, today)
        const allDone = load.total > 0 && load.completed >= load.total
        const pct = load.total > 0 ? Math.round((load.completed / load.total) * 100) : 0
        const barColor = allDone ? '#4ade80' : '#22d3ee'

        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(day)}
            data-demo-id={isSelected ? 'week-tab' : undefined}
            className={`flex flex-col overflow-hidden rounded-xl border transition-all ${
              isSelected
                ? 'border-cyan-400/50 bg-cyan-500/[.12] shadow-lg shadow-cyan-500/10'
                : 'border-line/50 bg-card/[.35] hover:border-cyan-500/30'
            }`}
          >
            {/* content: stacked on mobile, row on desktop */}
            <div className="flex flex-1 flex-col items-center gap-1 pt-2 lg:flex-row lg:justify-between lg:gap-2 lg:px-3 lg:pb-2 lg:pt-2.5">
              <span className="flex flex-col items-center gap-1 lg:flex-row lg:items-baseline lg:gap-1.5">
                <span
                  className={`text-[10px] tracking-wide lg:uppercase lg:tracking-widest ${
                    isSelected ? 'font-semibold text-cyan-300' : 'text-ink-muted'
                  }`}
                >
                  <span className="lg:hidden">{format(day, 'EEEEE')}</span>
                  <span className="hidden lg:inline">{format(day, 'EEE')}</span>
                </span>
                <span
                  className={`text-[15px] leading-none lg:text-lg ${
                    isSelected
                      ? 'font-bold text-cyan-100'
                      : isFuture
                        ? 'font-semibold text-ink-muted'
                        : 'font-semibold text-ink-soft'
                  }`}
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {format(day, 'd')}
                </span>
              </span>
              <span
                className={`text-[10px] font-semibold lg:text-[11px] ${
                  allDone && !isSelected
                    ? 'text-green-400'
                    : isSelected
                      ? 'text-cyan-200'
                      : 'text-ink-muted'
                }`}
              >
                {isFuture ? (
                  <>
                    <span className="lg:hidden">{load.total || '·'}</span>
                    <span className="hidden lg:inline">
                      {load.total ? `${load.total} tasks` : '—'}
                    </span>
                  </>
                ) : (
                  `${load.completed}/${load.total}`
                )}
              </span>
            </div>
            {/* fill bar */}
            <span
              className={`mt-1 block h-[3px] w-full lg:mt-0 ${
                isSelected ? 'bg-cyan-400/15' : 'bg-[#1c2739]'
              }`}
            >
              {!isFuture && load.total > 0 && (
                <span
                  className="block h-full"
                  style={{ width: `${pct}%`, background: barColor }}
                />
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
      <div data-demo-id="now-next-card" className="rounded-xl border border-line/60 bg-page/40 p-4 text-sm text-ink-muted">
        Nothing timed right now. Add a time to something below, or enjoy the open space.
      </div>
    )
  }

  const Row = ({ label, task, accent }: { label: string; task: Task; accent: string }) => (
    <div className="flex min-w-0 items-center gap-3">
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${accent}`}>{label}</span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-ink-muted">
        <Clock className="h-3 w-3" />
        {task.startTime}
      </span>
      <span className="truncate text-sm font-medium text-ink">{task.title}</span>
    </div>
  )

  return (
    <div data-demo-id="now-next-card" className="flex flex-col gap-3 rounded-xl border border-cyan-500/30 bg-page/50 p-4">
      {current && <Row label="Now" task={current} accent="bg-cyan-500/20 text-cyan-300" />}
      {next && (
        <div className={current ? 'border-t border-card pt-3' : ''}>
          <Row label="Next" task={next} accent="bg-purple-500/20 text-purple-300" />
        </div>
      )}
    </div>
  )
}

function RhythmKickoffCard({ kickoff }: { kickoff: DueKickoff }) {
  return (
    <div data-demo-id="morning-planning-card" className="flex flex-col gap-3 rounded-xl border border-cyan-500/35 bg-cyan-500/[.08] p-4 shadow-lg shadow-cyan-500/10 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-cyan-300" />
          <h2 className="text-sm font-semibold text-cyan-100">{kickoff.title}</h2>
        </div>
        <p className="mt-1 text-sm text-ink-muted">{kickoff.body}</p>
      </div>
      <Link
        to={`/talk?kickoff=${kickoff.type}`}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-cyan-950 shadow-lg shadow-cyan-400/20 transition-colors hover:bg-cyan-300"
      >
        <Sparkles className="h-4 w-4" />
        <span>{kickoff.button}</span>
      </Link>
    </div>
  )
}

export default function TodayPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [now, setNow] = useState(new Date())
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showAIAnalyzer, setShowAIAnalyzer] = useState(false)
  const [habitDeleteCandidate, setHabitDeleteCandidate] = useState<Task | null>(null)
  const [habitCheckIn, setHabitCheckIn] = useState<HabitItem | null>(null)
  const queryClient = useQueryClient()
  const { showNotification } = useNotifications()
  const location = useLocation()
  const { settings } = useSettings()
  const selectedDateKey = format(selectedDate, 'yyyy-MM-dd')
  const calorieModuleEnabled = settings?.calorieIntake ?? true

  // Check for AI parameter in URL
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('ai') === 'true') {
      setShowAIAnalyzer(true)
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [location])

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(intervalId)
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

  const { data: rhythm } = useQuery({
    queryKey: ['user-rhythm'],
    queryFn: rhythmService.getRhythm,
    retry: false,
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

  const doneCount = tasksData.filter((t) => t.completed).length
  const timedLeft = tasksData.filter((t) => t.startTime && !t.completed).length
  const untimedLeft = tasksData.filter((t) => !t.startTime && !t.completed).length
  const headerSubline =
    tasksData.length === 0
      ? 'Nothing scheduled yet'
      : [
          `${doneCount} of ${tasksData.length} done`,
          timedLeft ? `${timedLeft} timed left` : null,
          untimedLeft ? `${untimedLeft} untimed` : null,
        ]
          .filter(Boolean)
          .join(' · ')
  const isViewingToday = isSameDay(selectedDate, now)
  const dueKickoff = useMemo(
    () => (isViewingToday ? getDueKickoff(rhythm, now) : null),
    [isViewingToday, now, rhythm]
  )

  useEffect(() => {
    const syncTimedTasks = async () => {
      if (isLoading || tasksData.length === 0) return
      const date = format(selectedDate, 'yyyy-MM-dd')
      const hasTimedTasks = tasksData.some((task: Task) =>
        task.type === 'task' &&
        task.scheduledDate === date &&
        task.startTime &&
        task.googleSyncStatus !== 'skipped' &&
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
    onSuccess: (updatedTask, variables) => {
      // Render the successful PUT response immediately instead of keeping the old
      // card visible until a second GET finishes. A virtual Habit can materialize
      // during the edit, so match both its submitted id and its parent Habit id.
      queryClient.setQueryData<Task[]>(['tasks', selectedDateKey], (current = []) =>
        current.map(task => {
          const sameSubmittedRow = task.id === variables.id
          const sameHabitDay = updatedTask.type === 'habit' && task.type === 'habit' && updatedTask.originalHabitId &&
            (task.originalHabitId === updatedTask.originalHabitId || task.id.startsWith(`${updatedTask.originalHabitId}-`))
          return sameSubmittedRow || sameHabitDay ? updatedTask : task
        })
      )
      queryClient.invalidateQueries({
        predicate: query => query.queryKey[0] === 'tasks' && query.queryKey[1] !== selectedDateKey,
      })
      toast.success('Task updated successfully!')
    },
    onError: () => toast.error('Failed to update task'),
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
    <div className="space-y-4 pb-4 md:space-y-6 md:pb-0">
      {/* Smart Reminders */}
      <SmartReminders />

      {settings?.onboardingStatus === 'active' && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-cyan-500/30 bg-page/80 p-4 shadow-xl shadow-cyan-500/10"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-ink">Tell me about your day</h2>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            One brain-dump — work, food, gym, anything — and I'll turn it into your schedule.
          </p>

          <button
            type="button"
            onClick={() => setShowAIAnalyzer(true)}
            className="btn-primary mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm"
          >
            <Brain className="h-4 w-4" />
            Tell HealthyFlow about your day
          </button>

          <button
            type="button"
            onClick={() => skipOnboardingMutation.mutate()}
            disabled={skipOnboardingMutation.isPending}
            className="mt-3 block text-xs text-gray-500 transition-colors hover:text-ink-soft"
          >
            I'll do it later
          </button>
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
        {/* Title + actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1
              className="text-[23px] font-bold leading-tight text-ink lg:text-[26px]"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {formatRelativeDate(selectedDate)}
            </h1>
            <p className="text-xs text-ink-muted lg:text-[13px]">
              <span>{format(selectedDate, 'EEEE, d MMMM')} ·{' '}</span>
              {headerSubline}
              {!isSameDay(selectedDate, new Date()) && (
                <button
                  onClick={handleToday}
                  className="ml-2 text-xs font-medium text-cyan-400 transition-colors hover:text-cyan-300"
                >
                  Today
                </button>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Day nav — desktop only (mobile version lives in the week-nav row) */}
            <div className="hidden items-stretch overflow-hidden rounded-xl border border-line/60 bg-card/40 lg:flex">
              <button
                type="button"
                onClick={handlePreviousDay}
                aria-label="Previous day"
                className="flex h-[38px] w-9 items-center justify-center border-r border-line/60 text-ink-muted transition-colors hover:text-cyan-400"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleNextDay}
                aria-label="Next day"
                className="flex h-[38px] w-9 items-center justify-center text-ink-muted transition-colors hover:text-cyan-400"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <Link
              to="/talk"
              data-demo-id="talk-button"
              className="flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-950 shadow-lg shadow-cyan-400/20 transition-colors hover:bg-cyan-300"
            >
              <Sparkles className="h-4 w-4" />
              <span>Talk</span>
            </Link>
            <Link
              to="/add"
              aria-label="Add"
              data-demo-id="add-task-button"
              className="flex h-[38px] w-[38px] items-center justify-center gap-1.5 rounded-xl border border-line bg-card/50 text-ink-soft transition-colors hover:border-line-strong hover:text-ink lg:w-auto lg:px-3.5"
            >
              <Plus className="h-[17px] w-[17px]" />
              <span className="hidden text-sm font-medium lg:inline">Add</span>
            </Link>
          </div>
        </div>

        {/* Week-nav row — mobile only */}
        <div className="mt-1 flex items-center justify-between lg:hidden">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            This week
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePreviousDay}
              aria-label="Previous day"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-line/60 bg-card/40 text-ink-muted transition-colors hover:text-cyan-400"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleNextDay}
              aria-label="Next day"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-line/60 bg-card/40 text-ink-muted transition-colors hover:text-cyan-400"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <WeekRibbon selectedDate={selectedDate} onSelect={setSelectedDate} loadByDay={loadByDay} />
      </motion.div>

      {/* Now/next — only when viewing today */}
      {isViewingToday && dueKickoff && <RhythmKickoffCard kickoff={dueKickoff} />}
      {isViewingToday && <NowNextCard tasks={tasksData} />}

      {/* AI Text Analyzer Modal */}
      {createPortal(
        <AnimatePresence>
          {showAIAnalyzer && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed left-0 top-0 z-[9999] flex h-dvh w-dvw items-start justify-center overflow-y-auto bg-sunken/80 px-2 py-3 backdrop-blur-sm sm:items-center sm:p-4"
              onClick={() => setShowAIAnalyzer(false)}
            >
              <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-4xl items-stretch sm:block">
                <AITextAnalyzer
                  onClose={() => setShowAIAnalyzer(false)}
                  onConfirmed={() => {
                    if (settings?.onboardingStatus === 'active') completeOnboardingMutation.mutate()
                  }}
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
              className="w-full max-w-md rounded-xl border border-line bg-page p-5 shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/15 text-red-300">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-ink">Delete habit</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    Choose what to remove for "{habitDeleteCandidate.title}".
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => confirmHabitDelete('instance')}
                  className="flex items-center justify-center gap-2 rounded-lg border border-line bg-card px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-gray-700"
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
                className="mt-3 w-full rounded-lg px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-card hover:text-ink-soft"
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
            onHabitCheckIn={setHabitCheckIn}
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
      {habitCheckIn && <HabitOutcomeSheet habit={habitCheckIn} date={selectedDateKey} onClose={() => setHabitCheckIn(null)} />}
      
    </div>
  )
}
