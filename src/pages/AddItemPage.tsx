import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Award,
  CalendarDays,
  CheckSquare,
  Clock,
  Dumbbell,
  Flame,
  MapPin,
  MessageSquare,
  Mic,
  Plus,
  Scale,
  Target,
  Utensils,
  Zap,
} from 'lucide-react'
import {
  achievementService,
  AchievementSummary,
  caloriesService,
  DAILY_SIGNALS_QUERY_KEY,
  DAY_SUMMARY_QUERY_KEY,
  taskService,
  weightService,
  workoutsService,
  type Category,
  type WorkoutPlan,
} from '../services/api'
import ProjectSelector from '../components/ProjectSelector'
import { WORK_ENABLED } from '../featureFlags'
import VoiceInput from '../components/VoiceInput'
import { useSettings } from '../hooks/useSettings'
import type { ModuleNoticeState } from '../App'
import {
  MODULE_PRESENTATIONS,
  getModulePresentation,
  type ModulePresentation,
} from '../modulePresentation'
import { CATEGORY_PRESENTATIONS } from '../categoryPresentation'
import { talkHandoffState } from '../talkHandoff'

const todayStr = () => format(new Date(), 'yyyy-MM-dd')

const quickDates = [
  { label: 'Today', value: todayStr() },
  { label: 'Tomorrow', value: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
  { label: 'This Weekend', value: format(addDays(new Date(), 6 - new Date().getDay()), 'yyyy-MM-dd') },
  { label: 'Next Week', value: format(addDays(new Date(), 7), 'yyyy-MM-dd') },
]

type ModuleAddTarget = Exclude<ModulePresentation['addTarget'], null>
type DomainTab = 'today' | ModuleAddTarget
type TodayType = 'task' | 'habit' | 'meal' | 'workout'
type CalorieMode = 'entry' | 'weight'

const addIcon = {
  calories: Utensils,
  achievements: Award,
}

const tabs: Array<{ id: DomainTab; label: string; icon: typeof CalendarDays }> = [
  { id: 'today', label: 'Today', icon: CalendarDays },
  ...MODULE_PRESENTATIONS.flatMap((presentation) => presentation.addTarget
    ? [{
        id: presentation.addTarget,
        label: presentation.label,
        icon: addIcon[presentation.addTarget],
      }]
    : []
  ),
]

function numericOrNull(value: string) {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export default function AddItemPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { modules, resolution, retry } = useSettings()
  const calorieAvailability = modules.calories
  const workoutAvailability = modules.workouts
  const achievementAvailability = modules.achievements
  const [activeTab, setActiveTab] = useState<DomainTab>('today')
  const [todayType, setTodayType] = useState<TodayType>('task')
  const [todayInputMode, setTodayInputMode] = useState<'form' | 'voice'>('form')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('personal')
  const [startTime, setStartTime] = useState('')
  const [location, setLocation] = useState('')
  const [duration, setDuration] = useState('30')
  const [habitTracking, setHabitTracking] = useState<'binary' | 'target'>('binary')
  const [habitTargetValue, setHabitTargetValue] = useState('45')
  const [habitTargetUnit, setHabitTargetUnit] = useState<'minutes' | 'reps' | 'count'>('minutes')
  const [scheduledDate, setScheduledDate] = useState(todayStr())
  const [projectId, setProjectId] = useState<string | undefined>()
  const [workoutPlanId, setWorkoutPlanId] = useState('')

  const [calorieMode, setCalorieMode] = useState<CalorieMode>('entry')
  const [calorieDate, setCalorieDate] = useState(todayStr())
  const [calorieName, setCalorieName] = useState('')
  const [calorieVoice, setCalorieVoice] = useState(false)
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [quantity, setQuantity] = useState('')
  const [weightKg, setWeightKg] = useState('')

  const [achievementId, setAchievementId] = useState('')
  const [achievementDate, setAchievementDate] = useState(todayStr())
  const [achievementValue, setAchievementValue] = useState('')
  const [supportingValue, setSupportingValue] = useState('')
  const [supportingUnit, setSupportingUnit] = useState('')
  const [achievementNotes, setAchievementNotes] = useState('')

  const achievementsQuery = useQuery({
    queryKey: ['achievements'],
    queryFn: () => achievementService.list({ entryLimit: 5 }),
    enabled: activeTab === 'achievements' && achievementAvailability === 'enabled',
  })
  const workoutPlansQuery = useQuery({
    queryKey: ['workout-plans'],
    queryFn: workoutsService.plans,
    enabled: activeTab === 'today' && todayType === 'workout' && workoutAvailability === 'enabled',
  })

  const selectedAchievement = useMemo(
    () => achievementsQuery.data?.find((achievement) => achievement.definition.id === achievementId) ?? achievementsQuery.data?.[0] ?? null,
    [achievementId, achievementsQuery.data]
  )

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'today') {
      setActiveTab(tab)
      return
    }
    if (tab === 'calories' || tab === 'achievements') {
      const availability = tab === 'calories' ? calorieAvailability : achievementAvailability
      if (availability === 'enabled') {
        setActiveTab(tab)
      } else if (availability === 'disabled') {
        const label = getModulePresentation(tab).label
        setActiveTab('today')
        navigate('/add?tab=today', {
          replace: true,
          state: { moduleNotice: { module: tab, label, message: `${label} is hidden for this account.` } } satisfies ModuleNoticeState,
        })
      }
    }
  }, [achievementAvailability, calorieAvailability, navigate, searchParams])

  const availableTabs = tabs.filter((tab) => (
    tab.id === 'today' || modules[tab.id] === 'enabled'
  ))

  const addTodayMutation = useMutation({
    mutationFn: taskService.addTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: DAILY_SIGNALS_QUERY_KEY })
      const label = todayType === 'habit'
        ? 'Habit'
        : todayType === 'meal'
          ? 'Meal plan'
          : todayType === 'workout'
            ? 'Workout plan'
            : 'Task'
      toast.success(`${label} added`)
      navigate('/')
    },
    onError: () => toast.error(`Failed to add ${todayType}`),
  })

  const addCalorieMutation = useMutation({
    mutationFn: caloriesService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calories'] })
      queryClient.invalidateQueries({ queryKey: ['calorie-items'] })
      queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: DAILY_SIGNALS_QUERY_KEY })
      toast.success('Calorie entry added')
      navigate('/calories')
    },
    onError: () => toast.error('Failed to add calorie entry'),
  })

  const addWeightMutation = useMutation({
    mutationFn: weightService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weight'] })
      queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: DAILY_SIGNALS_QUERY_KEY })
      toast.success('Weight entry added')
      navigate('/calories')
    },
    onError: () => toast.error('Failed to add weight entry'),
  })

  const addAchievementEntryMutation = useMutation({
    mutationFn: ({ id, entry }: { id: string; entry: Parameters<typeof achievementService.addEntry>[1] }) =>
      achievementService.addEntry(id, entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['achievements'] })
      toast.success('Progress entry added')
      navigate('/achievements')
    },
    onError: () => toast.error('Failed to add Progress entry'),
  })

  const submitToday = (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) {
      toast.error('Please enter a title')
      return
    }
    const targetValue = Number(habitTargetValue)
    if (todayType === 'habit' && habitTracking === 'target' && (!Number.isFinite(targetValue) || targetValue <= 0)) {
      toast.error('Please enter a valid Habit target')
      return
    }
    if (todayType === 'workout' && !workoutPlanId) {
      toast.error('Choose a Workout plan')
      return
    }

    addTodayMutation.mutate({
      title: title.trim(),
      type: todayType,
      category,
      startTime: startTime || undefined,
      location: todayType === 'task' ? location.trim() || null : null,
      duration: Number(duration) || 30,
      repeat: todayType === 'habit' ? 'daily' : 'none',
      scheduledDate,
      projectId: todayType === 'task' ? projectId : undefined,
      ...(todayType === 'habit' ? { habitTarget: habitTracking === 'target' ? { value: targetValue, unit: habitTargetUnit } : null } : {}),
      ...(todayType === 'workout' ? { workoutInfo: { workoutPlanId } } : {}),
    })
  }

  const submitCalories = (event: React.FormEvent) => {
    event.preventDefault()

    if (calorieMode === 'weight') {
      const parsedWeight = numericOrNull(weightKg)
      if (!parsedWeight || parsedWeight <= 0) {
        toast.error('Please enter a valid weight')
        return
      }
      addWeightMutation.mutate({ date: calorieDate, weightKg: parsedWeight })
      return
    }

    const parsedCalories = numericOrNull(calories)
    if (!calorieName.trim() || parsedCalories == null || parsedCalories < 0) {
      toast.error('Please enter a food name and calories')
      return
    }

    addCalorieMutation.mutate({
      date: calorieDate,
      name: calorieName.trim(),
      calories: parsedCalories,
      protein: numericOrNull(protein),
      carbs: numericOrNull(carbs),
      fat: numericOrNull(fat),
      quantity: quantity.trim() || null,
    })
  }

  const submitAchievement = (event: React.FormEvent) => {
    event.preventDefault()
    const achievement = selectedAchievement as AchievementSummary | null
    const value = numericOrNull(achievementValue)
    const extraValue = numericOrNull(supportingValue)
    const extraUnit = supportingUnit.trim()

    if (!achievement || !value || value <= 0) {
      toast.error('Please choose a Progress measure and enter a value')
      return
    }
    if ((extraValue == null) !== (extraUnit === '')) {
      toast.error('Supporting value and unit go together')
      return
    }

    addAchievementEntryMutation.mutate({
      id: achievement.definition.id,
      entry: {
        date: achievementDate,
        value,
        supportingValue: extraValue,
        supportingUnit: extraUnit || null,
        notes: achievementNotes.trim() || null,
      },
    })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-28 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 text-ink-muted transition-colors hover:text-ink-soft">
          <ArrowLeft className="h-5 w-5" />
          Back to Today
        </button>
        {activeTab === 'today' && (
          <button
            onClick={() => navigate('/talk', {
              state: talkHandoffState({
                source: 'add',
                intent: 'add_items',
                date: scheduledDate,
                itemType: todayType,
              }),
            })}
            className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"
          >
            <MessageSquare className="h-4 w-4" />
            Open Talk
          </button>
        )}
        {activeTab === 'calories' && calorieMode === 'entry' && (
          <button
            onClick={() => navigate('/talk', {
              state: talkHandoffState({
                source: 'nutrition',
                intent: 'log_nutrition',
                date: calorieDate,
              }),
            })}
            className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"
          >
            <MessageSquare className="h-4 w-4" />
            Open Talk
          </button>
        )}
      </div>

      <div className="card">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-control bg-action">
            <Plus className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink">Add Item</h1>
            <p className="text-sm text-ink-muted">{tabs.map((tab) => tab.label).join(', ')}</p>
          </div>
        </div>

        <div className="mb-6 grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Add item domains">
          {availableTabs.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                  active
                    ? 'border-accent/50 bg-accent/20 text-accent'
                    : 'border-line/80 bg-sunken/20 text-ink-muted hover:border-line-strong hover:text-ink-soft'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {resolution === 'loading' && (
          <p className="mb-6 text-sm text-ink-muted" role="status">Checking optional Add destinations…</p>
        )}
        {resolution === 'error' && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-state-warning/40 bg-state-warning/10 p-3 text-sm" role="status">
            <span className="text-ink">Optional Add destinations are temporarily unavailable.</span>
            <button type="button" className="font-medium text-accent underline underline-offset-2" onClick={() => void retry()}>Retry</button>
          </div>
        )}

        {activeTab === 'today' && (
          <form onSubmit={submitToday} className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([
                { id: 'task', label: 'Task', icon: CheckSquare },
                { id: 'habit', label: 'Habit', icon: Zap },
                ...(calorieAvailability === 'enabled' ? [{ id: 'meal' as const, label: 'Meal plan', icon: Utensils }] : []),
                ...(workoutAvailability === 'enabled' ? [{ id: 'workout' as const, label: 'Workout plan', icon: Dumbbell }] : []),
              ] as Array<{ id: TodayType; label: string; icon: typeof CheckSquare }>).map((option) => {
                const Icon = option.icon
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setTodayType(option.id)
                      if (option.id === 'meal') setCategory('nutrition')
                      if (option.id === 'workout') setCategory('fitness')
                    }}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                      todayType === option.id ? 'border-accent/50 bg-accent/20 text-accent' : 'border-line text-ink-muted hover:border-line-strong'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                )
              })}
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-ink-soft">Title</span>
              <div className="relative">
                {todayInputMode === 'voice' ? (
                  <VoiceInput onTranscriptChange={setTitle} placeholder={`Speak to add ${todayType}...`} />
                ) : (
                  <input className="input-field pr-10" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`Enter ${todayType} name...`} required />
                )}
                <button
                  type="button"
                  aria-label="Toggle voice input"
                  onClick={() => setTodayInputMode(todayInputMode === 'voice' ? 'form' : 'voice')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-accent"
                >
                  <Mic className="h-4 w-4" />
                </button>
              </div>
            </label>

            <div>
              <label className="mb-2 block text-sm font-medium text-ink-soft">Category</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CATEGORY_PRESENTATIONS.map((categoryOption) => (
                  <button
                    key={categoryOption.id}
                    type="button"
                    onClick={() => setCategory(categoryOption.id)}
                    aria-pressed={category === categoryOption.id}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      category === categoryOption.id
                        ? categoryOption.className
                        : 'border-line text-ink-muted hover:border-line-strong hover:bg-raised'
                    }`}
                  >
                    {categoryOption.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assigning a Project is only offered when Work is reachable —
                otherwise the Task lands in a context the user cannot open. */}
            {todayType === 'task' && WORK_ENABLED && (
              <ProjectSelector selectedProjectId={projectId} onProjectSelect={setProjectId} />
            )}

            {todayType === 'task' && (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink-soft">Location</span>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <input className="input-field pl-10" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Add a place or address..." />
                </div>
              </label>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink-soft">Date</label>
                <input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className="input-field" />
                <div className="mt-2 flex flex-wrap gap-2">
                  {quickDates.map((quick) => (
                    <button key={quick.label} type="button" onClick={() => setScheduledDate(quick.value)} className="rounded bg-raised px-2 py-1 text-xs text-ink-soft transition hover:bg-raised">
                      {quick.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink-soft">Time</span>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="input-field pl-10" />
                </div>
              </label>
            </div>

            {todayType === 'habit' && <div className="space-y-3 rounded-xl border border-accent/25 bg-accent/5 p-4">
              <div><p className="text-sm font-medium text-ink-soft">How will you track it?</p><p className="mt-1 text-xs text-ink-muted">Binary Habits are Done or Not done. Target Habits accumulate progress.</p></div>
              <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setHabitTracking('binary')} className={`rounded-lg border px-3 py-2 text-sm ${habitTracking === 'binary' ? 'border-accent/50 bg-accent/15 text-accent' : 'border-line text-ink-muted'}`}>Binary</button><button type="button" onClick={() => setHabitTracking('target')} className={`rounded-lg border px-3 py-2 text-sm ${habitTracking === 'target' ? 'border-accent/50 bg-accent/15 text-accent' : 'border-line text-ink-muted'}`}>Target</button></div>
              {habitTracking === 'target' && <div className="grid grid-cols-[1fr_1.2fr] gap-2"><input type="text" inputMode="decimal" value={habitTargetValue} onChange={event => setHabitTargetValue(event.target.value)} className="input-field" aria-label="Habit target value" /><select value={habitTargetUnit} onChange={event => setHabitTargetUnit(event.target.value as typeof habitTargetUnit)} className="input-field" aria-label="Habit target unit"><option value="minutes">Minutes</option><option value="reps">Repetitions</option><option value="count">Count</option></select></div>}
            </div>}

            {todayType === 'workout' && (
              <div className="space-y-3 rounded-xl border border-state-warning/25 bg-state-warning/5 p-4">
                <div>
                  <p className="text-sm font-medium text-ink-soft">Selected Workout plan</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    The Item schedules the plan. Logging a Workout session remains a separate action in Workouts.
                  </p>
                </div>
                {workoutPlansQuery.isLoading ? (
                  <p className="text-sm text-ink-muted">Loading Workout plans…</p>
                ) : (workoutPlansQuery.data ?? []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-line p-3 text-sm text-ink-muted">
                    <p>Create a reusable plan in Workouts before scheduling it.</p>
                    <Link
                      to="/workouts"
                      className="mt-2 inline-flex min-h-11 items-center font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      Open Workouts
                    </Link>
                  </div>
                ) : (
                  <select
                    className="input-field"
                    value={workoutPlanId}
                    onChange={(event) => {
                      const selectedId = event.target.value
                      setWorkoutPlanId(selectedId)
                      const selected = (workoutPlansQuery.data as WorkoutPlan[] | undefined)?.find(
                        plan => plan.id === selectedId
                      )
                      if (selected) setTitle(selected.name)
                    }}
                    required
                    aria-label="Workout plan"
                  >
                    <option value="">Choose a plan</option>
                    {(workoutPlansQuery.data ?? []).map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} · {plan.exercises.length} {plan.exercises.length === 1 ? 'exercise' : 'exercises'}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <label className="block space-y-2">
              <span className="text-sm font-medium text-ink-soft">Scheduled duration</span>
              <input type="number" min="1" value={duration} onChange={(event) => setDuration(event.target.value)} className="input-field" />
            </label>

            <button
              type="submit"
              disabled={addTodayMutation.isPending || (todayType === 'workout' && !workoutPlanId)}
              className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-5 w-5" />
              Add {todayType === 'habit'
                ? 'Habit'
                : todayType === 'meal'
                  ? 'Meal plan'
                  : todayType === 'workout'
                    ? 'Workout plan'
                    : 'Task'}
            </button>
          </form>
        )}

        {activeTab === 'calories' && (
          <form onSubmit={submitCalories} className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {(['entry', 'weight'] as CalorieMode[]).map((mode) => {
                const Icon = mode === 'entry' ? Flame : Scale
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCalorieMode(mode)}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                      calorieMode === mode ? 'border-accent/50 bg-accent/20 text-accent' : 'border-line text-ink-muted hover:border-line-strong'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {mode === 'entry' ? 'Entry' : 'Weight'}
                  </button>
                )
              })}
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-ink-soft">Date</span>
              <input type="date" className="input-field" value={calorieDate} onChange={(event) => setCalorieDate(event.target.value)} />
            </label>

            {calorieMode === 'entry' ? (
              <>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-ink-soft">Name</span>
                  <div className="relative">
                    {calorieVoice ? (
                      <VoiceInput onTranscriptChange={setCalorieName} placeholder="Speak the food or meal..." />
                    ) : (
                      <input className="input-field pr-10" value={calorieName} onChange={(event) => setCalorieName(event.target.value)} placeholder="Greek yogurt" />
                    )}
                    <button type="button" aria-label="Toggle calorie voice input" onClick={() => setCalorieVoice(!calorieVoice)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-accent">
                      <Mic className="h-4 w-4" />
                    </button>
                  </div>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-ink-soft">Quantity</span>
                  <input className="input-field" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="2 eggs, one bowl..." />
                </label>
                <div className="grid gap-3 sm:grid-cols-4">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-ink-soft">Calories for quantity</span>
                    <input type="number" min="0" className="input-field" value={calories} onChange={(event) => setCalories(event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-ink-soft">Protein for quantity</span>
                    <input type="number" min="0" className="input-field" value={protein} onChange={(event) => setProtein(event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-ink-soft">Carbs for quantity</span>
                    <input type="number" min="0" className="input-field" value={carbs} onChange={(event) => setCarbs(event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-ink-soft">Fat for quantity</span>
                    <input type="number" min="0" className="input-field" value={fat} onChange={(event) => setFat(event.target.value)} />
                  </label>
                </div>
              </>
            ) : (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink-soft">Weight in kg</span>
                <input type="number" min="1" step="0.1" className="input-field" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="72.5" />
              </label>
            )}

            <button type="submit" disabled={addCalorieMutation.isPending || addWeightMutation.isPending} className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3">
              <Plus className="h-5 w-5" />
              Add {calorieMode === 'entry' ? 'Entry' : 'Weight'}
            </button>
          </form>
        )}

        {activeTab === 'achievements' && (
          <form onSubmit={submitAchievement} className="space-y-6">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-ink-soft">Progress measure</span>
              <select className="input-field" value={achievementId || selectedAchievement?.definition.id || ''} onChange={(event) => setAchievementId(event.target.value)}>
                {(achievementsQuery.data ?? []).map((achievement) => (
                  <option key={achievement.definition.id} value={achievement.definition.id}>
                    {achievement.definition.name}
                  </option>
                ))}
              </select>
            </label>

            {achievementsQuery.isLoading ? (
              <p className="text-sm text-ink-muted">Loading...</p>
            ) : !selectedAchievement ? (
              <div className="rounded-lg border border-dashed border-line/80 bg-sunken/20 p-4 text-sm text-ink-muted">
                Create a measure on the Progress page first.
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-ink-soft">Date</span>
                    <input type="date" className="input-field" value={achievementDate} onChange={(event) => setAchievementDate(event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-ink-soft">Value ({selectedAchievement.definition.unit})</span>
                    <input type="number" min="0" step="0.01" className="input-field" value={achievementValue} onChange={(event) => setAchievementValue(event.target.value)} />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-ink-soft">Supporting Value</span>
                    <input type="number" min="0" step="0.01" className="input-field" value={supportingValue} onChange={(event) => setSupportingValue(event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-ink-soft">Supporting Unit</span>
                    <input className="input-field" value={supportingUnit} onChange={(event) => setSupportingUnit(event.target.value)} placeholder="kg, min..." />
                  </label>
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-ink-soft">Notes</span>
                  <input className="input-field" value={achievementNotes} onChange={(event) => setAchievementNotes(event.target.value)} />
                </label>
              </>
            )}

            <button type="submit" disabled={!selectedAchievement || addAchievementEntryMutation.isPending} className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3">
              <Target className="h-5 w-5" />
              Add Progress Entry
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
