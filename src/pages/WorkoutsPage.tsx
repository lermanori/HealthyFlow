import { useMemo, useRef, useState } from 'react'
import { Check, Dumbbell, Pencil, Plus, Ruler, Timer, Trash2, Weight, X } from 'lucide-react'
import { useWorkoutExerciseItems } from '../hooks/useWorkoutExerciseItems'
import { useWorkoutSessions } from '../hooks/useWorkoutSessions'
import { WorkoutExercise, WorkoutExerciseInput, WorkoutExerciseItem, WorkoutSession } from '../services/api'

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

function exerciseToForm(exercise: WorkoutExercise): ExerciseForm {
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
  return {
    ...emptyExercise(),
    name: item.name,
  }
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

function MetricChip({ icon: Icon, label, value }: { icon: any; label: string; value: string | number | null }) {
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
          <input data-testid="workout-exercise-sets" type="number" min="0" step="1" className="input-field" value={form.sets} onChange={(event) => setForm({ ...form, sets: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-ink-muted">Reps</span>
          <input data-testid="workout-exercise-reps" type="number" min="0" step="1" className="input-field" value={form.reps} onChange={(event) => setForm({ ...form, reps: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-ink-muted">Kg</span>
          <input data-testid="workout-exercise-weight" type="number" min="0" step="0.5" className="input-field" value={form.weightKg} onChange={(event) => setForm({ ...form, weightKg: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-ink-muted">Time</span>
          <input data-testid="workout-exercise-duration" type="number" min="0" step="1" className="input-field" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-ink-muted">Km</span>
          <input data-testid="workout-exercise-distance" type="number" min="0" step="0.1" className="input-field" value={form.distanceKm} onChange={(event) => setForm({ ...form, distanceKm: event.target.value })} />
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
  const [quickInsertSort, setQuickInsertSort] = useState<'recent' | 'most-used'>('recent')
  const { items: quickInsertItems, isLoading: isQuickInsertLoading } = useWorkoutExerciseItems(quickInsertSort, 8)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [exerciseForm, setExerciseForm] = useState<ExerciseForm>(() => emptyExercise())
  const [draftExercises, setDraftExercises] = useState<WorkoutExerciseInput[]>([])
  const [filter, setFilter] = useState('')
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [editingNotes, setEditingNotes] = useState('')
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null)
  const [editingExerciseForm, setEditingExerciseForm] = useState<ExerciseForm>(() => emptyExercise())
  const searchRef = useRef<HTMLInputElement | null>(null)

  const filteredItems = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return quickInsertItems
    return quickInsertItems.filter((item) => item.name.toLowerCase().includes(query))
  }, [filter, quickInsertItems])

  const addDraftExercise = () => {
    if (!exerciseForm.name.trim()) return
    setDraftExercises((current) => [...current, formToExercise(exerciseForm, current.length)])
    setExerciseForm(emptyExercise())
    searchRef.current?.focus()
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

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Log Session</h2>
          <button type="button" className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm" onClick={submitSession}>
            <Check className="h-4 w-4" />
            Save Session
          </button>
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

        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3" data-demo-id="workout-quick-insert">
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

          <div className="space-y-3 rounded-lg border border-card bg-sunken/40 p-4">
            <ExerciseFields form={exerciseForm} setForm={setExerciseForm} namePlaceholder="Squat, yoga flow, hill run..." />
            <div className="flex justify-end">
              <button type="button" className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-sm" onClick={addDraftExercise}>
                <Plus className="h-4 w-4" />
                Add Exercise
              </button>
            </div>
          </div>
        </div>

        {draftExercises.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Draft Exercises</h3>
            {draftExercises.map((exercise, index) => (
              <div key={`${exercise.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-line/80 bg-sunken/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{exercise.name}</p>
                  <p className="truncate text-xs text-ink-muted">{metricParts(exercise as WorkoutExercise).join(' · ') || 'No metrics'}</p>
                </div>
                <button type="button" className="text-ink-muted hover:text-red-400" onClick={() => setDraftExercises((current) => current.filter((_, i) => i !== index))} aria-label="Remove draft exercise">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
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
