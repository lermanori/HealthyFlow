import { useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Dumbbell, Pencil, Plus, Ruler, Sparkles, Timer, Trash2, Weight, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { useWorkoutExerciseItems } from '../hooks/useWorkoutExerciseItems'
import { useWorkoutPlans, useWorkoutSessions } from '../hooks/useWorkoutSessions'
import { WorkoutExercise, WorkoutExerciseInput, WorkoutExerciseItem, WorkoutPlan, WorkoutSession } from '../services/api'
import HealthDayNavigator from '../components/HealthDayNavigator'
import HealthNavigation from '../components/HealthNavigation'
import IconButton from '../components/IconButton'
import { showUndoToast } from '../components/UndoToast'

const todayStr = () => format(new Date(), 'yyyy-MM-dd')

type ExerciseForm = {
  name: string
  sets: string
  reps: string
  weightKg: string
  durationMinutes: string
  distanceKm: string
  notes: string
}

type WorkoutMode = 'plan' | 'session' | 'history'

const emptyExercise = (): ExerciseForm => ({
  name: '',
  sets: '',
  reps: '',
  weightKg: '',
  durationMinutes: '',
  distanceKm: '',
  notes: '',
})

function toNullableNumber(value: string) {
  if (value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function formToExercise(form: ExerciseForm, position = 0): WorkoutExerciseInput {
  return {
    name: form.name.trim(),
    sets: toNullableNumber(form.sets),
    reps: toNullableNumber(form.reps),
    weightKg: toNullableNumber(form.weightKg),
    durationMinutes: toNullableNumber(form.durationMinutes),
    distanceKm: toNullableNumber(form.distanceKm),
    notes: form.notes.trim() || null,
    position,
  }
}

function exerciseToForm(exercise: Pick<WorkoutExercise, 'name' | 'sets' | 'reps' | 'weightKg' | 'durationMinutes' | 'distanceKm' | 'notes'>): ExerciseForm {
  return {
    name: exercise.name,
    sets: exercise.sets != null ? String(exercise.sets) : '',
    reps: exercise.reps != null ? String(exercise.reps) : '',
    weightKg: exercise.weightKg != null ? String(exercise.weightKg) : '',
    durationMinutes: exercise.durationMinutes != null ? String(exercise.durationMinutes) : '',
    distanceKm: exercise.distanceKm != null ? String(exercise.distanceKm) : '',
    notes: exercise.notes ?? '',
  }
}

function itemToForm(item: WorkoutExerciseItem): ExerciseForm {
  return exerciseToForm(item)
}

function hasAnyMetric(form: ExerciseForm) {
  return Boolean(form.sets || form.reps || form.weightKg || form.durationMinutes || form.distanceKm || form.notes)
}

function formatDateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatLastUsedLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function metricParts(exercise: Pick<WorkoutExercise, 'sets' | 'reps' | 'weightKg' | 'durationMinutes' | 'distanceKm'>) {
  return [
    exercise.sets != null ? `${exercise.sets} sets` : null,
    exercise.reps != null ? `${exercise.reps} reps` : null,
    exercise.weightKg != null ? `${exercise.weightKg} kg` : null,
    exercise.durationMinutes != null ? `${exercise.durationMinutes} min` : null,
    exercise.distanceKm != null ? `${exercise.distanceKm} km` : null,
  ].filter(Boolean)
}

function MetricChip({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number | null }) {
  if (value == null || value === '') return null
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-line/80 bg-sunken/35 px-2 py-1 text-xs text-ink-soft">
      <Icon className="h-3.5 w-3.5 text-accent" />
      {value} {label}
    </span>
  )
}

function ExerciseFields({
  form,
  setForm,
  namePlaceholder = 'Exercise',
}: {
  form: ExerciseForm
  setForm: (form: ExerciseForm) => void
  namePlaceholder?: string
}) {
  return (
    <div className="space-y-3">
      <label className="space-y-1">
        <span className="text-xs text-ink-muted">Exercise</span>
        <input
          data-testid="workout-exercise-name"
          className="input-field"
          placeholder={namePlaceholder}
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-5">
        <label className="space-y-1">
          <span className="text-xs text-ink-muted">Sets</span>
          <input data-testid="workout-exercise-sets" type="text" inputMode="numeric" className="input-field" value={form.sets} onChange={(event) => setForm({ ...form, sets: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-ink-muted">Reps</span>
          <input data-testid="workout-exercise-reps" type="text" inputMode="numeric" className="input-field" value={form.reps} onChange={(event) => setForm({ ...form, reps: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-ink-muted">Kg</span>
          <input data-testid="workout-exercise-weight" type="text" inputMode="decimal" className="input-field" value={form.weightKg} onChange={(event) => setForm({ ...form, weightKg: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-ink-muted">Time</span>
          <input data-testid="workout-exercise-duration" type="text" inputMode="decimal" className="input-field" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-ink-muted">Km</span>
          <input data-testid="workout-exercise-distance" type="text" inputMode="decimal" className="input-field" value={form.distanceKm} onChange={(event) => setForm({ ...form, distanceKm: event.target.value })} />
        </label>
      </div>
      <label className="space-y-1">
        <span className="text-xs text-ink-muted">Notes</span>
        <input data-testid="workout-exercise-notes" className="input-field" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </label>
    </div>
  )
}

export default function WorkoutsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedDate = searchParams.get('date')
  const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : todayStr()
  const requestedMode = searchParams.get('mode')
  const mode: WorkoutMode = requestedMode === 'plan' || requestedMode === 'history' ? requestedMode : 'session'
  const setRouteState = (next: { date?: string; mode?: WorkoutMode }) => {
    const nextParams = new URLSearchParams(searchParams)
    if (next.date != null) {
      if (next.date === todayStr()) nextParams.delete('date')
      else nextParams.set('date', next.date)
    }
    if (next.mode != null) {
      if (next.mode === 'session') nextParams.delete('mode')
      else nextParams.set('mode', next.mode)
    }
    setSearchParams(nextParams)
  }
  const { sessions, isLoading, createSession, updateSession, deleteSession, addExercise, updateExercise, deleteExercise } = useWorkoutSessions(date)
  const { plans, isLoading: arePlansLoading, createPlan, updatePlan, deletePlan, generatePlan, isGeneratingPlan } = useWorkoutPlans()
  const [quickInsertSort, setQuickInsertSort] = useState<'recent' | 'most-used'>('recent')
  const { items: quickInsertItems, isLoading: isQuickInsertLoading } = useWorkoutExerciseItems(quickInsertSort, 8)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [exerciseForm, setExerciseForm] = useState<ExerciseForm>(() => emptyExercise())
  const [draftExercises, setDraftExercises] = useState<WorkoutExerciseInput[]>([])
  const [sessionDraftOpen, setSessionDraftOpen] = useState(false)
  const [editingDraftExerciseIndex, setEditingDraftExerciseIndex] = useState<number | null>(null)
  const [showExerciseComposer, setShowExerciseComposer] = useState(false)
  const [filter, setFilter] = useState('')
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [editingNotes, setEditingNotes] = useState('')
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null)
  const [editingExerciseForm, setEditingExerciseForm] = useState<ExerciseForm>(() => emptyExercise())
  const [showPlanEditor, setShowPlanEditor] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [planName, setPlanName] = useState('')
  const [planColor, setPlanColor] = useState('#22d3ee')
  const [planNote, setPlanNote] = useState('')
  const [planExerciseForm, setPlanExerciseForm] = useState<ExerciseForm>(() => emptyExercise())
  const [planExercises, setPlanExercises] = useState<WorkoutExerciseInput[]>([])
  const [editingPlanExerciseIndex, setEditingPlanExerciseIndex] = useState<number | null>(null)
  const [planFilter, setPlanFilter] = useState('')
  const [planIntent, setPlanIntent] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)
  const sessionComposerRef = useRef<HTMLDivElement | null>(null)
  const exerciseComposerRef = useRef<HTMLDivElement | null>(null)
  const planDraftRef = useRef<HTMLDivElement | null>(null)
  const hasSessionDraft = Boolean(
    title.trim() ||
    notes.trim() ||
    draftExercises.length > 0 ||
    exerciseForm.name.trim() ||
    hasAnyMetric(exerciseForm)
  )

  const clearSessionDraft = () => {
    setTitle('')
    setNotes('')
    setExerciseForm(emptyExercise())
    setDraftExercises([])
    setEditingDraftExerciseIndex(null)
    setShowExerciseComposer(false)
    setSessionDraftOpen(false)
  }

  const switchMode = (nextMode: WorkoutMode) => {
    if (nextMode === mode) return
    if (mode === 'session' && sessionDraftOpen && hasSessionDraft) {
      const discard = window.confirm('Discard this unsaved Workout session draft?')
      if (!discard) return
      clearSessionDraft()
    }
    setRouteState({ mode: nextMode })
  }

  const openBlankSession = () => {
    setSessionDraftOpen(true)
    setRouteState({ mode: 'session' })
    window.requestAnimationFrame(() => sessionComposerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const filteredItems = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return quickInsertItems
    return quickInsertItems.filter((item) => item.name.toLowerCase().includes(query))
  }, [filter, quickInsertItems])

  const filteredPlanItems = useMemo(() => {
    const query = planFilter.trim().toLowerCase()
    if (!query) return quickInsertItems
    return quickInsertItems.filter((item) => item.name.toLowerCase().includes(query))
  }, [planFilter, quickInsertItems])

  const addDraftExercise = () => {
    if (!exerciseForm.name.trim()) return
    setDraftExercises((current) => {
      if (editingDraftExerciseIndex == null) {
        return [...current, formToExercise(exerciseForm, current.length)]
      }
      return current.map((exercise, index) => index === editingDraftExerciseIndex
        ? formToExercise(exerciseForm, exercise.position ?? index)
        : exercise)
    })
    setExerciseForm(emptyExercise())
    setEditingDraftExerciseIndex(null)
    setShowExerciseComposer(false)
  }

  const editDraftExercise = (index: number) => {
    setEditingDraftExerciseIndex(index)
    setExerciseForm(exerciseToForm(draftExercises[index] as WorkoutExercise))
    setShowExerciseComposer(true)
    requestAnimationFrame(() => exerciseComposerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  const applyQuickInsert = (item: WorkoutExerciseItem) => {
    setExerciseForm(itemToForm(item))
  }

  const submitSession = () => {
    const pending = exerciseForm.name.trim() ? [...draftExercises, formToExercise(exerciseForm, draftExercises.length)] : draftExercises
    if (pending.length === 0) return

    createSession({
      date,
      title: title.trim() || null,
      notes: notes.trim() || null,
      exercises: pending,
    })
    clearSessionDraft()
    setRouteState({ mode: 'history' })
  }

  const startSessionEdit = (session: WorkoutSession) => {
    setEditingSessionId(session.id)
    setEditingTitle(session.title ?? '')
    setEditingNotes(session.notes ?? '')
  }

  const submitSessionEdit = () => {
    if (!editingSessionId) return
    updateSession({ id: editingSessionId, patch: { title: editingTitle.trim() || null, notes: editingNotes.trim() || null } })
    setEditingSessionId(null)
  }

  const startExerciseEdit = (exercise: WorkoutExercise) => {
    setEditingExerciseId(exercise.id)
    setEditingExerciseForm(exerciseToForm(exercise))
  }

  const submitExerciseEdit = () => {
    if (!editingExerciseId || !editingExerciseForm.name.trim()) return
    updateExercise({ id: editingExerciseId, patch: formToExercise(editingExerciseForm) })
    setEditingExerciseId(null)
  }

  const addExerciseToSession = (sessionId: string) => {
    if (!exerciseForm.name.trim()) return
    addExercise({ sessionId, exercise: formToExercise(exerciseForm) })
    setExerciseForm(emptyExercise())
  }

  const resetPlanEditor = () => {
    setShowPlanEditor(false)
    setEditingPlanId(null)
    setPlanName('')
    setPlanColor('#22d3ee')
    setPlanNote('')
    setPlanExerciseForm(emptyExercise())
    setPlanExercises([])
    setEditingPlanExerciseIndex(null)
    setPlanFilter('')
    setPlanIntent('')
  }

  const startPlanCreate = () => {
    resetPlanEditor()
    setShowPlanEditor(true)
    setRouteState({ mode: 'plan' })
  }

  const startPlanEdit = (plan: WorkoutPlan) => {
    setEditingPlanId(plan.id)
    setPlanName(plan.name)
    setPlanColor(plan.color ?? '#22d3ee')
    setPlanNote(plan.note ?? '')
    setPlanExercises(plan.exercises.map((exercise, index) => ({
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      weightKg: exercise.weightKg,
      durationMinutes: exercise.durationMinutes,
      distanceKm: exercise.distanceKm,
      notes: exercise.notes,
      position: index,
    })))
    setPlanExerciseForm(emptyExercise())
    setEditingPlanExerciseIndex(null)
    setPlanFilter('')
    setPlanIntent('')
    setShowPlanEditor(true)
    setRouteState({ mode: 'plan' })
  }

  const savePlanExercise = () => {
    if (!planExerciseForm.name.trim()) return
    const exercise = formToExercise(planExerciseForm, editingPlanExerciseIndex ?? planExercises.length)
    if (editingPlanExerciseIndex == null) {
      setPlanExercises((current) => [...current, exercise])
    } else {
      setPlanExercises((current) => current.map((item, index) => index === editingPlanExerciseIndex ? exercise : item))
    }
    setPlanExerciseForm(emptyExercise())
    setEditingPlanExerciseIndex(null)
  }

  const editPlanExercise = (index: number) => {
    setEditingPlanExerciseIndex(index)
    setPlanExerciseForm(exerciseToForm(planExercises[index] as WorkoutExercise))
  }

  const movePlanExercise = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= planExercises.length) return
    setPlanExercises((current) => {
      const next = [...current]
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
      return next.map((exercise, position) => ({ ...exercise, position }))
    })
  }

  const submitPlan = () => {
    const pending = planExerciseForm.name.trim()
      ? [...planExercises, formToExercise(planExerciseForm, planExercises.length)]
      : planExercises
    if (!planName.trim() || pending.length === 0) return
    const input = {
      name: planName.trim(),
      color: planColor || null,
      note: planNote.trim() || null,
      exercises: pending.map((exercise, position) => ({ ...exercise, position })),
    }
    if (editingPlanId) updatePlan({ id: editingPlanId, patch: input })
    else createPlan(input)
    resetPlanEditor()
  }

  const startSessionFromPlan = (plan: WorkoutPlan) => {
    setTitle(plan.name)
    setNotes(plan.note ?? '')
    setDraftExercises(plan.exercises.map((exercise, position) => ({
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      weightKg: exercise.weightKg,
      durationMinutes: exercise.durationMinutes,
      distanceKm: exercise.distanceKm,
      notes: exercise.notes,
      position,
    })))
    setExerciseForm(emptyExercise())
    setEditingDraftExerciseIndex(null)
    setShowExerciseComposer(false)
    setSessionDraftOpen(true)
    setRouteState({ mode: 'session' })
    requestAnimationFrame(() => sessionComposerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const generateWorkoutPlan = async () => {
    const intent = planIntent.trim()
    if (!intent) return
    try {
      const draft = await generatePlan(intent)
      setEditingPlanId(null)
      setPlanName(draft.name)
      setPlanColor(draft.color ?? '#22d3ee')
      setPlanNote(draft.note ?? '')
      setPlanExercises(draft.exercises.map((exercise, position) => ({ ...exercise, position })))
      setPlanExerciseForm(emptyExercise())
      setEditingPlanExerciseIndex(null)
      requestAnimationFrame(() => planDraftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    } catch {
      // The mutation surfaces the explicit API error via toast; keep the user's intent intact.
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-28 md:pb-0">
      <HealthNavigation date={date} />

      <header className="flex flex-col gap-4 border-b border-line/70 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-control bg-action">
            <Dumbbell className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Workouts</h1>
            <p className="mt-1 text-sm text-ink-muted">Plan training, prepare one editable Workout session, or review history.</p>
          </div>
        </div>
        <HealthDayNavigator date={date} onChange={(nextDate) => setRouteState({ date: nextDate })} label="Workout" />
      </header>

      <nav className="grid grid-cols-3 rounded-section border border-line bg-card p-1.5" aria-label="Workout mode">
        {([
          ['plan', 'Plan', 'Reusable Workout plans'],
          ['session', 'Session', sessionDraftOpen ? 'Draft in progress' : 'Start or log training'],
          ['history', 'History', `${sessions.length} on this date`],
        ] as const).map(([value, label, detail]) => (
          <button
            key={value}
            type="button"
            data-testid={`workout-mode-${value}`}
            aria-current={mode === value ? 'page' : undefined}
            onClick={() => switchMode(value)}
            className={`min-h-12 min-w-0 rounded-xl px-2 text-center transition sm:px-4 sm:text-left ${
              mode === value
                ? 'bg-action text-on-action'
                : 'text-ink-muted hover:bg-raised/60 hover:text-ink'
            }`}
          >
            <span className={`block text-sm font-semibold ${mode === value ? 'text-white' : 'text-ink'}`}>{label}</span>
            <span className={`hidden text-[11px] sm:block ${mode === value ? 'text-accent' : 'text-ink-muted'}`}>{detail}</span>
          </button>
        ))}
      </nav>

      {mode === 'plan' && (
      <div className="card space-y-4" data-testid="workout-plans">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Workout Plans</h2>
            <p className="text-xs text-ink-muted">Reusable exercise templates that pre-fill a session.</p>
          </div>
          <button type="button" className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-sm" onClick={startPlanCreate}>
            <Plus className="h-4 w-4" />
            New Plan
          </button>
        </div>

        {arePlansLoading ? (
          <p className="text-sm text-ink-muted">Loading plans...</p>
        ) : plans.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line/80 bg-sunken/20 p-4 text-sm text-ink-muted">No workout plans yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {plans.map((plan) => (
              <div key={plan.id} className="min-w-0 overflow-hidden rounded-lg border border-line/80 bg-sunken/25 p-4" data-testid="workout-plan-card">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: plan.color ?? '#22d3ee' }} />
                      <h3 className="break-words font-semibold text-ink">{plan.name}</h3>
                    </div>
                    {plan.note && <p className="mt-1 text-sm text-ink-muted">{plan.note}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary inline-flex min-h-11 items-center gap-2 px-3 py-2 text-sm" onClick={() => startPlanEdit(plan)} aria-label={`Edit ${plan.name}`}><Pencil className="h-4 w-4" /><span>Edit</span></button>
                    <button
                      type="button"
                      className="btn-secondary inline-flex min-h-11 items-center gap-2 px-3 py-2 text-sm text-state-danger"
                      onClick={() => {
                        if (window.confirm(`Delete the ${plan.name} Workout plan? Existing Workout sessions will remain.`)) deletePlan(plan.id)
                      }}
                      aria-label={`Delete ${plan.name}`}
                    >
                      <Trash2 className="h-4 w-4" /><span>Delete</span>
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  {plan.exercises.map((exercise) => (
                    <div key={exercise.id} className="flex min-w-0 flex-col gap-0.5 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <span className="min-w-0 break-words text-ink-soft">{exercise.name}</span>
                      <span className="break-words text-xs text-ink-muted sm:text-right">{metricParts(exercise).join(' · ') || 'No metrics'}</span>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn-primary mt-4 w-full px-3 py-2 text-sm" onClick={() => startSessionFromPlan(plan)}>
                  Start Session
                </button>
              </div>
            ))}
          </div>
        )}

        {showPlanEditor && (
          <div className="space-y-4 rounded-lg border border-accent/30 bg-accent/5 p-4" data-testid="workout-plan-editor">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-ink">{editingPlanId ? 'Edit Plan' : 'Create Plan'}</h3>
              <IconButton label="Close plan editor" onClick={resetPlanEditor} className="text-ink-muted hover:text-ink"><X className="h-4 w-4" /></IconButton>
            </div>

            <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <h4 className="text-sm font-semibold text-ink">Generate with AI</h4>
              </div>
              <p className="mt-1 text-xs text-ink-muted">Describe any training style. Review and edit the generated draft before saving.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <textarea
                  data-testid="workout-plan-intent"
                  className="input-field min-h-20 flex-1 resize-y"
                  maxLength={2000}
                  placeholder="3-day push/pull/legs, a 20-minute mobility flow, or an easy 5K plan..."
                  value={planIntent}
                  onChange={(event) => setPlanIntent(event.target.value)}
                />
                <button
                  type="button"
                  className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm sm:self-end"
                  disabled={isGeneratingPlan || !planIntent.trim()}
                  onClick={generateWorkoutPlan}
                >
                  <Sparkles className="h-4 w-4" />
                  {isGeneratingPlan ? 'Generating...' : 'Generate Draft'}
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr]">
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Plan name</span>
                <input data-testid="workout-plan-name" className="input-field" placeholder="Full body, easy run, mobility..." value={planName} onChange={(event) => setPlanName(event.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Color</span>
                <input data-testid="workout-plan-color" type="color" className="h-[42px] w-14 rounded-lg border border-line bg-card p-1" value={planColor} onChange={(event) => setPlanColor(event.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-ink-muted">Note</span>
                <input data-testid="workout-plan-note" className="input-field" placeholder="Optional focus or instructions" value={planNote} onChange={(event) => setPlanNote(event.target.value)} />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
              <div className="rounded-lg border border-accent/20 bg-sunken/25 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-ink">Add from history</h4>
                  <div className="inline-flex rounded-lg border border-line/80 bg-sunken/30 p-1 text-xs">
                    <button type="button" className={`rounded-md px-2 py-1.5 ${quickInsertSort === 'recent' ? 'bg-accent/20 text-accent' : 'text-ink-muted'}`} onClick={() => setQuickInsertSort('recent')}>Recent</button>
                    <button type="button" className={`rounded-md px-2 py-1.5 ${quickInsertSort === 'most-used' ? 'bg-accent/20 text-accent' : 'text-ink-muted'}`} onClick={() => setQuickInsertSort('most-used')}>Most Used</button>
                  </div>
                </div>
                <input data-testid="workout-plan-exercise-search" className="input-field mb-3" placeholder="Filter exercises" value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} />
                {isQuickInsertLoading ? (
                  <p className="text-sm text-ink-muted">Loading...</p>
                ) : filteredPlanItems.length === 0 ? (
                  <p className="text-sm text-ink-muted">No exercise history yet.</p>
                ) : (
                  <div className="space-y-2">
                    {filteredPlanItems.map((item) => (
                      <button key={item.id} type="button" className="w-full rounded-lg border border-accent/20 px-3 py-2 text-left text-sm text-accent hover:bg-accent/10" onClick={() => setPlanExerciseForm(itemToForm(item))}>
                        {item.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-lg border border-card bg-sunken/30 p-4">
                <ExerciseFields form={planExerciseForm} setForm={setPlanExerciseForm} namePlaceholder="Exercise, run, yoga flow..." />
                <div className="flex justify-end">
                  <button type="button" className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-sm" onClick={savePlanExercise}>
                    <Plus className="h-4 w-4" />
                    {editingPlanExerciseIndex == null ? 'Add to Plan' : 'Update Exercise'}
                  </button>
                </div>
              </div>
            </div>

            {planExercises.length > 0 && (
              <div ref={planDraftRef} className="space-y-2 scroll-mt-28" data-testid="workout-plan-exercises">
                {planExercises.map((exercise, index) => (
                  <div key={`${exercise.name}-${index}`} className="min-w-0 rounded-lg border border-line/80 bg-sunken/20 px-3 py-2" data-testid="workout-plan-exercise-row">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-ink">{exercise.name}</p>
                      <p className="break-words text-xs text-ink-muted">{metricParts(exercise as WorkoutExercise).join(' · ') || 'No metrics'}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap justify-end gap-1">
                      <IconButton label={`Move ${exercise.name} up`} disabled={index === 0} onClick={() => movePlanExercise(index, -1)} className="text-ink-muted"><ArrowUp className="h-4 w-4" /></IconButton>
                      <IconButton label={`Move ${exercise.name} down`} disabled={index === planExercises.length - 1} onClick={() => movePlanExercise(index, 1)} className="text-ink-muted"><ArrowDown className="h-4 w-4" /></IconButton>
                      <IconButton label={`Edit ${exercise.name}`} onClick={() => editPlanExercise(index)} className="text-ink-muted hover:text-accent"><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label={`Remove ${exercise.name}`} onClick={() => setPlanExercises((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-ink-muted hover:text-state-danger"><Trash2 className="h-4 w-4" /></IconButton>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={resetPlanEditor}>Cancel</button>
              <button type="button" className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm" onClick={submitPlan}>
                <Check className="h-4 w-4" />
                {editingPlanId ? 'Save Plan' : 'Create Plan'}
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {mode === 'session' && (sessionDraftOpen ? (
      <div ref={sessionComposerRef} className="card space-y-4" data-testid="workout-session-composer">
        <div>
          <h2 className="text-lg font-semibold text-ink">Review session</h2>
          <p className="mt-1 text-sm text-ink-muted">Check the exercises below, make any changes, then save.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
          <label className="space-y-1">
            <span className="text-xs text-ink-muted">Title</span>
            <input data-testid="workout-session-title" className="input-field" placeholder="Push day, mobility, run..." value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-ink-muted">Notes</span>
            <input data-testid="workout-session-notes" className="input-field" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>

        <section className="space-y-3 rounded-lg border border-line/80 bg-sunken/20 p-3 sm:p-4" aria-labelledby="session-exercises-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 id="session-exercises-heading" className="font-semibold text-ink">Session exercises ({draftExercises.length})</h3>
              <p className="mt-0.5 text-xs text-ink-muted">These are the exercises that will be saved in this session.</p>
            </div>
            <button
              type="button"
              className="btn-secondary inline-flex min-h-11 items-center gap-2 px-3 py-2 text-sm"
              aria-expanded={showExerciseComposer}
              onClick={() => {
                setEditingDraftExerciseIndex(null)
                setExerciseForm(emptyExercise())
                setShowExerciseComposer((current) => !current)
              }}
            >
              {showExerciseComposer ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showExerciseComposer ? 'Close' : 'Add exercise'}
            </button>
          </div>

          {draftExercises.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line/80 p-4 text-center text-sm text-ink-muted">No exercises yet. Add at least one exercise before saving.</p>
          ) : (
            <div className="space-y-2">
              {draftExercises.map((exercise, index) => (
                <div key={`${exercise.name}-${index}`} className="min-w-0 rounded-lg border border-line/80 bg-sunken/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-ink">{exercise.name}</p>
                    <p className="break-words text-xs text-ink-muted">{metricParts(exercise as WorkoutExercise).join(' · ') || 'No metrics set'}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <button type="button" className="btn-secondary inline-flex min-h-11 items-center gap-2 px-3 py-2 text-sm" onClick={() => editDraftExercise(index)} aria-label={`Edit draft ${exercise.name}`}><Pencil className="h-4 w-4" />Edit</button>
                    <button type="button" className="btn-secondary inline-flex min-h-11 items-center gap-2 px-3 py-2 text-sm text-state-danger" onClick={() => setDraftExercises((current) => current.filter((_, i) => i !== index))} aria-label={`Remove draft ${exercise.name}`}><Trash2 className="h-4 w-4" />Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {showExerciseComposer && <div ref={exerciseComposerRef} className="grid scroll-mt-28 gap-4 lg:grid-cols-[18rem_1fr]">
          <div className="order-2 rounded-lg border border-accent/20 bg-accent/5 p-3 lg:order-1" data-demo-id="workout-quick-insert">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Quick Insert</h3>
              <div className="inline-flex rounded-lg border border-line/80 bg-sunken/30 p-1 text-xs">
                <button type="button" className={`rounded-md px-2 py-1.5 ${quickInsertSort === 'recent' ? 'bg-accent/20 text-accent' : 'text-ink-muted'}`} onClick={() => setQuickInsertSort('recent')}>
                  Recent
                </button>
                <button type="button" className={`rounded-md px-2 py-1.5 ${quickInsertSort === 'most-used' ? 'bg-accent/20 text-accent' : 'text-ink-muted'}`} onClick={() => setQuickInsertSort('most-used')}>
                  Most Used
                </button>
              </div>
            </div>
            <input
              ref={searchRef}
              data-testid="workout-quick-insert-search"
              className="input-field mb-3"
              placeholder="Filter exercises"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            {isQuickInsertLoading ? (
              <p className="text-sm text-ink-muted">Loading...</p>
            ) : filteredItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line/80 bg-sunken/20 p-3 text-sm text-ink-muted">No exercise history yet.</p>
            ) : (
              <div className="space-y-2" data-testid="workout-quick-insert-list">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid="workout-quick-insert-item"
                    className="w-full rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-left transition hover:border-accent/40 hover:bg-accent/10"
                    onClick={() => applyQuickInsert(item)}
                  >
                    <span className="block truncate text-sm font-medium text-accent">{item.name}</span>
                    <span className="text-xs text-accent">
                      {quickInsertSort === 'most-used' ? `${item.usageCount} uses` : `Last used ${formatLastUsedLabel(item.lastUsedAt)}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="order-1 space-y-3 rounded-lg border border-card bg-sunken/40 p-4 lg:order-2">
            <h3 className="text-sm font-semibold text-ink">{editingDraftExerciseIndex == null ? 'Add another exercise' : 'Edit draft exercise'}</h3>
            <ExerciseFields form={exerciseForm} setForm={setExerciseForm} namePlaceholder="Squat, yoga flow, hill run..." />
            <div className="flex justify-end">
              <button type="button" className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-sm" onClick={addDraftExercise}>
                <Plus className="h-4 w-4" />
                {editingDraftExerciseIndex == null ? 'Add exercise' : 'Update Exercise'}
              </button>
            </div>
          </div>
        </div>}

        <div className="flex flex-col gap-3 border-t border-line/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-muted" role="status">
            {draftExercises.length === 0 && !exerciseForm.name.trim()
              ? 'Add at least one named exercise before saving.'
              : `${draftExercises.length + (exerciseForm.name.trim() ? 1 : 0)} exercise${draftExercises.length + (exerciseForm.name.trim() ? 1 : 0) === 1 ? '' : 's'} ready to save.`}
          </p>
          <button type="button" className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2 text-sm sm:w-auto" disabled={draftExercises.length === 0 && !exerciseForm.name.trim()} onClick={submitSession}>
            <Check className="h-4 w-4" />
            Save session
          </button>
        </div>
      </div>
      ) : (
        <div className="card" data-testid="workout-session-empty">
          <div className="flex min-h-[20rem] items-center justify-center rounded-section border border-dashed border-line bg-sunken/20 p-6 text-center">
            <div className="max-w-md">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-section border border-accent/25 bg-accent/10">
                <Dumbbell className="h-6 w-6 text-accent" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-ink">No active Workout session</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                Start from a reusable Workout plan or open a blank draft. Nothing is logged until you review and save it.
              </p>
              <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                <button type="button" className="btn-primary min-h-11 px-4 py-2 text-sm" onClick={openBlankSession}>
                  Log without plan
                </button>
                <button type="button" className="btn-secondary min-h-11 px-4 py-2 text-sm" onClick={() => switchMode('plan')}>
                  Choose a plan
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {mode === 'history' && (
      <div className="card" data-demo-id="workout-history">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">History</h2>
            <p className="text-xs text-ink-muted">{formatDateLabel(date)}</p>
          </div>
          <span className="text-sm text-ink-muted">{sessions.length} session{sessions.length === 1 ? '' : 's'}</span>
        </div>

        {isLoading ? (
          <p className="text-sm text-ink-muted">Loading...</p>
        ) : sessions.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No workout sessions for this day yet.</p>
        ) : (
          <div className="space-y-4" data-testid="workout-history">
            {sessions.map((session) => (
              <div key={session.id} className="rounded-lg border border-line/80 bg-sunken/20">
                <div className="border-b border-card px-4 py-3">
                  {editingSessionId === session.id ? (
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                      <input className="input-field" value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} />
                      <input className="input-field" value={editingNotes} onChange={(event) => setEditingNotes(event.target.value)} />
                      <div className="flex items-center gap-2">
                        <IconButton label={`Save changes to ${session.title || 'Workout session'}`} onClick={submitSessionEdit} className="text-accent"><Check className="h-4 w-4" /></IconButton>
                        <IconButton label={`Cancel editing ${session.title || 'Workout session'}`} onClick={() => setEditingSessionId(null)} className="text-ink-muted"><X className="h-4 w-4" /></IconButton>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-ink">{session.title || 'Workout session'}</h3>
                        {session.notes && <p className="mt-1 text-sm text-ink-muted">{session.notes}</p>}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <IconButton label={`Edit ${session.title || 'Workout session'}`} data-testid="edit-workout-session" className="text-ink-muted hover:text-accent" onClick={() => startSessionEdit(session)}><Pencil className="h-4 w-4" /></IconButton>
                        <IconButton
                          label={`Delete ${session.title || 'Workout session'}`}
                          data-testid="delete-workout-session"
                          className="text-ink-muted hover:text-state-danger"
                          onClick={() => {
                            deleteSession(session.id, {
                              onSuccess: () => showUndoToast(
                                `${session.title || 'Workout session'} deleted`,
                                () => createSession({
                                  date: session.date,
                                  title: session.title,
                                  notes: session.notes,
                                  exercises: session.exercises.map((exercise) => ({
                                    name: exercise.name,
                                    sets: exercise.sets,
                                    reps: exercise.reps,
                                    weightKg: exercise.weightKg,
                                    durationMinutes: exercise.durationMinutes,
                                    distanceKm: exercise.distanceKm,
                                    notes: exercise.notes,
                                    position: exercise.position,
                                  })),
                                }),
                                `Undo deletion of ${session.title || 'Workout session'}`,
                              ),
                            })
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </div>
                  )}
                </div>

                <div className="divide-y divide-card">
                  {session.exercises.map((exercise) => (
                    <div key={exercise.id} className="px-4 py-3">
                      {editingExerciseId === exercise.id ? (
                        <div className="space-y-3">
                          <ExerciseFields form={editingExerciseForm} setForm={setEditingExerciseForm} />
                          <div className="flex justify-end gap-2">
                            <IconButton label={`Save changes to ${exercise.name}`} onClick={submitExerciseEdit} className="text-accent"><Check className="h-4 w-4" /></IconButton>
                            <IconButton label={`Cancel editing ${exercise.name}`} onClick={() => setEditingExerciseId(null)} className="text-ink-muted"><X className="h-4 w-4" /></IconButton>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-ink">{exercise.name}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <MetricChip icon={Dumbbell} label="sets" value={exercise.sets} />
                              <MetricChip icon={Dumbbell} label="reps" value={exercise.reps} />
                              <MetricChip icon={Weight} label="kg" value={exercise.weightKg} />
                              <MetricChip icon={Timer} label="min" value={exercise.durationMinutes} />
                              <MetricChip icon={Ruler} label="km" value={exercise.distanceKm} />
                              {metricParts(exercise).length === 0 && <span className="text-xs text-ink-muted">No metrics</span>}
                            </div>
                            {exercise.notes && <p className="mt-2 text-sm text-ink-muted">{exercise.notes}</p>}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <IconButton label={`Edit ${exercise.name}`} data-testid="edit-workout-exercise" className="text-ink-muted hover:text-accent" onClick={() => startExerciseEdit(exercise)}><Pencil className="h-4 w-4" /></IconButton>
                            <IconButton
                              label={`Delete ${exercise.name}`}
                              data-testid="delete-workout-exercise"
                              className="text-ink-muted hover:text-state-danger"
                              onClick={() => {
                                deleteExercise(exercise.id, {
                                  onSuccess: () => showUndoToast(
                                    `${exercise.name} deleted`,
                                    () => addExercise({
                                      sessionId: session.id,
                                      exercise: {
                                        name: exercise.name,
                                        sets: exercise.sets,
                                        reps: exercise.reps,
                                        weightKg: exercise.weightKg,
                                        durationMinutes: exercise.durationMinutes,
                                        distanceKm: exercise.distanceKm,
                                        notes: exercise.notes,
                                        position: exercise.position,
                                      },
                                    }),
                                    `Undo deletion of ${exercise.name}`,
                                  ),
                                })
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {hasAnyMetric(exerciseForm) || exerciseForm.name ? (
                  <div className="border-t border-card px-4 py-3">
                    <button type="button" className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-sm" onClick={() => addExerciseToSession(session.id)}>
                      <Plus className="h-4 w-4" />
                      Add Current Exercise
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  )
}
