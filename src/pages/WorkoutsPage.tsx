import { useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Dumbbell, Pencil, Plus, Ruler, Sparkles, Timer, Trash2, Weight, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useWorkoutExerciseItems } from '../hooks/useWorkoutExerciseItems'
import { useWorkoutPlans, useWorkoutSessions } from '../hooks/useWorkoutSessions'
import { WorkoutExercise, WorkoutExerciseInput, WorkoutExerciseItem, WorkoutPlan, WorkoutSession } from '../services/api'

const todayStr = () => new Date().toISOString().slice(0, 10)

type ExerciseForm = {
  name: string
  sets: string
  reps: string
  weightKg: string
  durationMinutes: string
  distanceKm: string
  notes: string
}

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
      <Icon className="h-3.5 w-3.5 text-cyan-400" />
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
  const [date, setDate] = useState(todayStr())
  const { sessions, isLoading, createSession, updateSession, deleteSession, addExercise, updateExercise, deleteExercise } = useWorkoutSessions(date)
  const { plans, isLoading: arePlansLoading, createPlan, updatePlan, deletePlan, generatePlan, isGeneratingPlan } = useWorkoutPlans()
  const [quickInsertSort, setQuickInsertSort] = useState<'recent' | 'most-used'>('recent')
  const { items: quickInsertItems, isLoading: isQuickInsertLoading } = useWorkoutExerciseItems(quickInsertSort, 8)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [exerciseForm, setExerciseForm] = useState<ExerciseForm>(() => emptyExercise())
  const [draftExercises, setDraftExercises] = useState<WorkoutExerciseInput[]>([])
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
    setTitle('')
    setNotes('')
    setExerciseForm(emptyExercise())
    setDraftExercises([])
    setEditingDraftExerciseIndex(null)
    setShowExerciseComposer(false)
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
    <div className="mx-auto max-w-4xl space-y-6 pb-28 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-600">
            <Dumbbell className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-ink neon-text">Workout Tracker</h1>
        </div>
        <input type="date" className="input-field w-auto" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>

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
          <p className="rounded-lg border border-dashed border-line/80 bg-sunken/20 p-4 text-sm text-gray-500">No workout plans yet.</p>
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
                    <button type="button" className="btn-secondary inline-flex min-h-10 items-center gap-2 px-3 py-2 text-sm" onClick={() => startPlanEdit(plan)} aria-label={`Edit ${plan.name}`}><Pencil className="h-4 w-4" /><span>Edit</span></button>
                    <button type="button" className="btn-secondary inline-flex min-h-10 items-center gap-2 px-3 py-2 text-sm text-red-300" onClick={() => deletePlan(plan.id)} aria-label={`Delete ${plan.name}`}><Trash2 className="h-4 w-4" /><span>Delete</span></button>
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
          <div className="space-y-4 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4" data-testid="workout-plan-editor">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-ink">{editingPlanId ? 'Edit Plan' : 'Create Plan'}</h3>
              <button type="button" className="text-ink-muted hover:text-ink" onClick={resetPlanEditor} aria-label="Close plan editor"><X className="h-4 w-4" /></button>
            </div>

            <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-300" />
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
              <div className="rounded-lg border border-cyan-500/20 bg-sunken/25 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-ink">Add from history</h4>
                  <div className="inline-flex rounded-lg border border-line/80 bg-sunken/30 p-1 text-xs">
                    <button type="button" className={`rounded-md px-2 py-1.5 ${quickInsertSort === 'recent' ? 'bg-cyan-500/20 text-cyan-200' : 'text-ink-muted'}`} onClick={() => setQuickInsertSort('recent')}>Recent</button>
                    <button type="button" className={`rounded-md px-2 py-1.5 ${quickInsertSort === 'most-used' ? 'bg-cyan-500/20 text-cyan-200' : 'text-ink-muted'}`} onClick={() => setQuickInsertSort('most-used')}>Most Used</button>
                  </div>
                </div>
                <input data-testid="workout-plan-exercise-search" className="input-field mb-3" placeholder="Filter exercises" value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} />
                {isQuickInsertLoading ? (
                  <p className="text-sm text-ink-muted">Loading...</p>
                ) : filteredPlanItems.length === 0 ? (
                  <p className="text-sm text-gray-500">No exercise history yet.</p>
                ) : (
                  <div className="space-y-2">
                    {filteredPlanItems.map((item) => (
                      <button key={item.id} type="button" className="w-full rounded-lg border border-cyan-500/20 px-3 py-2 text-left text-sm text-cyan-100 hover:bg-cyan-500/10" onClick={() => setPlanExerciseForm(itemToForm(item))}>
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
                      <button type="button" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-ink-muted disabled:opacity-30" disabled={index === 0} onClick={() => movePlanExercise(index, -1)} aria-label={`Move ${exercise.name} up`}><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-ink-muted disabled:opacity-30" disabled={index === planExercises.length - 1} onClick={() => movePlanExercise(index, 1)} aria-label={`Move ${exercise.name} down`}><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-ink-muted hover:text-cyan-400" onClick={() => editPlanExercise(index)} aria-label={`Edit ${exercise.name}`}><Pencil className="h-4 w-4" /></button>
                      <button type="button" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-ink-muted hover:text-red-400" onClick={() => setPlanExercises((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${exercise.name}`}><Trash2 className="h-4 w-4" /></button>
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

      <div ref={sessionComposerRef} className="card space-y-4">
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
              className="btn-secondary inline-flex min-h-10 items-center gap-2 px-3 py-2 text-sm"
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
                    <button type="button" className="btn-secondary inline-flex min-h-10 items-center gap-2 px-3 py-2 text-sm" onClick={() => editDraftExercise(index)} aria-label={`Edit draft ${exercise.name}`}><Pencil className="h-4 w-4" />Edit</button>
                    <button type="button" className="btn-secondary inline-flex min-h-10 items-center gap-2 px-3 py-2 text-sm text-red-300" onClick={() => setDraftExercises((current) => current.filter((_, i) => i !== index))} aria-label={`Remove draft ${exercise.name}`}><Trash2 className="h-4 w-4" />Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {showExerciseComposer && <div ref={exerciseComposerRef} className="grid scroll-mt-28 gap-4 lg:grid-cols-[18rem_1fr]">
          <div className="order-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 lg:order-1" data-demo-id="workout-quick-insert">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Quick Insert</h3>
              <div className="inline-flex rounded-lg border border-line/80 bg-sunken/30 p-1 text-xs">
                <button type="button" className={`rounded-md px-2 py-1.5 ${quickInsertSort === 'recent' ? 'bg-cyan-500/20 text-cyan-200' : 'text-ink-muted'}`} onClick={() => setQuickInsertSort('recent')}>
                  Recent
                </button>
                <button type="button" className={`rounded-md px-2 py-1.5 ${quickInsertSort === 'most-used' ? 'bg-cyan-500/20 text-cyan-200' : 'text-ink-muted'}`} onClick={() => setQuickInsertSort('most-used')}>
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
              <p className="rounded-lg border border-dashed border-line/80 bg-sunken/20 p-3 text-sm text-gray-500">No exercise history yet.</p>
            ) : (
              <div className="space-y-2" data-testid="workout-quick-insert-list">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid="workout-quick-insert-item"
                    className="w-full rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-left transition hover:border-cyan-400/40 hover:bg-cyan-500/10"
                    onClick={() => applyQuickInsert(item)}
                  >
                    <span className="block truncate text-sm font-medium text-cyan-100">{item.name}</span>
                    <span className="text-xs text-cyan-200/70">
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

        <div className="flex justify-end border-t border-line/60 pt-4">
          <button type="button" className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2 text-sm sm:w-auto" disabled={draftExercises.length === 0 && !exerciseForm.name.trim()} onClick={submitSession}>
            <Check className="h-4 w-4" />
            Save session
          </button>
        </div>
      </div>

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
          <p className="py-6 text-center text-sm text-gray-500">No workout sessions for this day yet.</p>
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
                        <button type="button" className="text-cyan-400" onClick={submitSessionEdit} aria-label="Save session changes"><Check className="h-4 w-4" /></button>
                        <button type="button" className="text-ink-muted" onClick={() => setEditingSessionId(null)} aria-label="Cancel session edit"><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-ink">{session.title || 'Workout session'}</h3>
                        {session.notes && <p className="mt-1 text-sm text-ink-muted">{session.notes}</p>}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" data-testid="edit-workout-session" className="text-ink-muted hover:text-cyan-400" onClick={() => startSessionEdit(session)} aria-label="Edit session"><Pencil className="h-4 w-4" /></button>
                        <button type="button" data-testid="delete-workout-session" className="text-ink-muted hover:text-red-400" onClick={() => deleteSession(session.id)} aria-label="Delete session"><Trash2 className="h-4 w-4" /></button>
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
                            <button type="button" className="text-cyan-400" onClick={submitExerciseEdit} aria-label="Save exercise changes"><Check className="h-4 w-4" /></button>
                            <button type="button" className="text-ink-muted" onClick={() => setEditingExerciseId(null)} aria-label="Cancel exercise edit"><X className="h-4 w-4" /></button>
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
                              {metricParts(exercise).length === 0 && <span className="text-xs text-gray-500">No metrics</span>}
                            </div>
                            {exercise.notes && <p className="mt-2 text-sm text-ink-muted">{exercise.notes}</p>}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button type="button" data-testid="edit-workout-exercise" className="text-ink-muted hover:text-cyan-400" onClick={() => startExerciseEdit(exercise)} aria-label="Edit exercise"><Pencil className="h-4 w-4" /></button>
                            <button type="button" data-testid="delete-workout-exercise" className="text-ink-muted hover:text-red-400" onClick={() => deleteExercise(exercise.id)} aria-label="Delete exercise"><Trash2 className="h-4 w-4" /></button>
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
    </div>
  )
}
