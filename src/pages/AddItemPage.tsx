import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Award,
  Brain,
  CalendarDays,
  CheckSquare,
  Clock,
  Flame,
  MapPin,
  Mic,
  Plus,
  Scale,
  Sparkles,
  Target,
  Utensils,
  Zap,
} from 'lucide-react'
import {
  achievementService,
  AchievementSummary,
  caloriesService,
  taskService,
  weightService,
} from '../services/api'
import AITextAnalyzer from '../components/AITextAnalyzer'
import MealAnalyzer from '../components/MealAnalyzer'
import ProjectSelector from '../components/ProjectSelector'
import VoiceInput from '../components/VoiceInput'

const todayStr = () => format(new Date(), 'yyyy-MM-dd')

const categories = [
  { value: 'health', label: 'Health', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { value: 'work', label: 'Work', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'personal', label: 'Personal', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { value: 'fitness', label: 'Fitness', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { value: 'grocery', label: 'Grocery', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { value: 'nutrition', label: 'Nutrition', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
]

const quickDates = [
  { label: 'Today', value: todayStr() },
  { label: 'Tomorrow', value: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
  { label: 'This Weekend', value: format(addDays(new Date(), 6 - new Date().getDay()), 'yyyy-MM-dd') },
  { label: 'Next Week', value: format(addDays(new Date(), 7), 'yyyy-MM-dd') },
]

type DomainTab = 'today' | 'calories' | 'achievements'
type TodayType = 'task' | 'habit'
type CalorieMode = 'entry' | 'weight'

const tabs: Array<{ id: DomainTab; label: string; icon: any }> = [
  { id: 'today', label: 'Today', icon: CalendarDays },
  { id: 'calories', label: 'Calories', icon: Utensils },
  { id: 'achievements', label: 'Achievements', icon: Award },
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
  const [activeTab, setActiveTab] = useState<DomainTab>('today')
  const [showTaskAi, setShowTaskAi] = useState(false)
  const [showMealAi, setShowMealAi] = useState(false)

  const [todayType, setTodayType] = useState<TodayType>('task')
  const [todayInputMode, setTodayInputMode] = useState<'form' | 'voice'>('form')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('personal')
  const [startTime, setStartTime] = useState('')
  const [location, setLocation] = useState('')
  const [duration, setDuration] = useState('30')
  const [scheduledDate, setScheduledDate] = useState(todayStr())
  const [projectId, setProjectId] = useState<string | undefined>()

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
    enabled: activeTab === 'achievements',
  })

  const selectedAchievement = useMemo(
    () => achievementsQuery.data?.find((achievement) => achievement.definition.id === achievementId) ?? achievementsQuery.data?.[0] ?? null,
    [achievementId, achievementsQuery.data]
  )

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'today' || tab === 'calories' || tab === 'achievements') {
      setActiveTab(tab)
    }
  }, [searchParams])

  const addTodayMutation = useMutation({
    mutationFn: taskService.addTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success(`${todayType === 'habit' ? 'Habit' : 'Task'} added`)
      navigate('/')
    },
    onError: () => toast.error(`Failed to add ${todayType}`),
  })

  const addCalorieMutation = useMutation({
    mutationFn: caloriesService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calories'] })
      queryClient.invalidateQueries({ queryKey: ['calorie-items'] })
      toast.success('Calorie entry added')
      navigate('/calories')
    },
    onError: () => toast.error('Failed to add calorie entry'),
  })

  const addWeightMutation = useMutation({
    mutationFn: weightService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weight'] })
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
      toast.success('Achievement entry added')
      navigate('/achievements')
    },
    onError: () => toast.error('Failed to add achievement entry'),
  })

  const submitToday = (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) {
      toast.error('Please enter a title')
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
      projectId,
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
      toast.error('Please choose an achievement and enter a value')
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

  if (showTaskAi) {
    return <AITextAnalyzer onClose={() => setShowTaskAi(false)} scheduledDate={scheduledDate} />
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-28 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 text-ink-muted transition-colors hover:text-ink-soft">
          <ArrowLeft className="h-5 w-5" />
          Back to Today
        </button>
        {activeTab === 'today' && (
          <button onClick={() => setShowTaskAi(true)} className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm">
            <Brain className="h-4 w-4" />
            Talk
          </button>
        )}
        {activeTab === 'calories' && calorieMode === 'entry' && (
          <button onClick={() => setShowMealAi(true)} className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm">
            <Sparkles className="h-4 w-4" />
            Add with AI
          </button>
        )}
      </div>

      {showMealAi && <MealAnalyzer date={calorieDate} onClose={() => setShowMealAi(false)} />}

      <div className="card">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600">
            <Plus className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink neon-text">Add Item</h1>
            <p className="text-sm text-ink-muted">Today, calories, and achievements</p>
          </div>
        </div>

        <div className="mb-6 grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Add item domains">
          {tabs.map((tab) => {
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
                    ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-200'
                    : 'border-line/80 bg-sunken/20 text-ink-muted hover:border-line-strong hover:text-ink-soft'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {activeTab === 'today' && (
          <form onSubmit={submitToday} className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {(['task', 'habit'] as TodayType[]).map((type) => {
                const Icon = type === 'task' ? CheckSquare : Zap
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTodayType(type)}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                      todayType === type ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-200' : 'border-line text-ink-muted hover:border-line-strong'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {type === 'task' ? 'Task' : 'Habit'}
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
                  <input className="input-field holographic pr-10" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`Enter ${todayType} name...`} required />
                )}
                <button
                  type="button"
                  aria-label="Toggle voice input"
                  onClick={() => setTodayInputMode(todayInputMode === 'voice' ? 'form' : 'voice')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-cyan-400"
                >
                  <Mic className="h-4 w-4" />
                </button>
              </div>
            </label>

            <div>
              <label className="mb-2 block text-sm font-medium text-ink-soft">Category</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {categories.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${category === cat.value ? cat.color : 'border-line-strong text-ink-muted hover:border-gray-500'}`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <ProjectSelector selectedProjectId={projectId} onProjectSelect={setProjectId} />

            {todayType === 'task' && (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink-soft">Location</span>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <input className="input-field pl-10 holographic" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Add a place or address..." />
                </div>
              </label>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink-soft">Date</label>
                <input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className="input-field holographic" />
                <div className="mt-2 flex flex-wrap gap-2">
                  {quickDates.map((quick) => (
                    <button key={quick.label} type="button" onClick={() => setScheduledDate(quick.value)} className="rounded bg-gray-700 px-2 py-1 text-xs text-ink-soft transition hover:bg-gray-600">
                      {quick.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink-soft">Time</span>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="input-field pl-10 holographic" />
                </div>
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-ink-soft">Duration</span>
              <input type="number" min="1" value={duration} onChange={(event) => setDuration(event.target.value)} className="input-field holographic" />
            </label>

            <button type="submit" disabled={addTodayMutation.isPending} className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3">
              <Plus className="h-5 w-5" />
              Add {todayType === 'habit' ? 'Habit' : 'Task'}
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
                      calorieMode === mode ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-200' : 'border-line text-ink-muted hover:border-line-strong'
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
                    <button type="button" aria-label="Toggle calorie voice input" onClick={() => setCalorieVoice(!calorieVoice)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-cyan-400">
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
              <span className="text-sm font-medium text-ink-soft">Achievement</span>
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
              <div className="rounded-lg border border-dashed border-line/80 bg-sunken/20 p-4 text-sm text-gray-500">
                Create an achievement on the Achievements page first.
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
              Add Achievement Entry
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
