import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { Activity, Utensils, Plus, Trash2, Pencil, X, Check, Sparkles, Clock, Scale, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { format } from 'date-fns'
import { useCalorieEntries } from '../hooks/useCalorieEntries'
import { CalorieEntry, CalorieEntryInput, CalorieItem, WeightEntry } from '../services/api'
import { useWeightTracking } from '../hooks/useWeightTracking'
import MealAnalyzer from '../components/MealAnalyzer'
import { useCalorieItems } from '../hooks/useCalorieItems'
import { useModalFocus } from '../hooks/useModalFocus'
import IconButton from '../components/IconButton'
import HealthDayNavigator from '../components/HealthDayNavigator'
import HealthNavigation from '../components/HealthNavigation'
import { showUndoToast } from '../components/UndoToast'

const todayStr = () => format(new Date(), 'yyyy-MM-dd')
const currentTime = () => new Date().toTimeString().slice(0, 5)

type FormState = {
  name: string
  time: string
  calories: string
  protein: string
  carbs: string
  fat: string
  quantity: string
}

const emptyForm = (time = ''): FormState => ({ name: '', time, calories: '', protein: '', carbs: '', fat: '', quantity: '' })

function formToInput(date: string, form: FormState): CalorieEntryInput {
  return {
    date,
    time: form.time === '' ? null : form.time,
    name: form.name.trim(),
    calories: Number(form.calories),
    protein: form.protein === '' ? null : Number(form.protein),
    carbs: form.carbs === '' ? null : Number(form.carbs),
    fat: form.fat === '' ? null : Number(form.fat),
    quantity: form.quantity.trim() === '' ? null : form.quantity.trim(),
  }
}

function entryToForm(e: CalorieEntry): FormState {
  return {
    name: e.name,
    time: e.time ?? '',
    calories: String(e.calories),
    protein: e.protein != null ? String(e.protein) : '',
    carbs: e.carbs != null ? String(e.carbs) : '',
    fat: e.fat != null ? String(e.fat) : '',
    quantity: e.quantity ?? '',
  }
}

function itemToForm(item: CalorieItem, time = currentTime()): FormState {
  return {
    name: item.name,
    time,
    calories: String(item.calories),
    protein: item.protein != null ? String(item.protein) : '',
    carbs: item.carbs != null ? String(item.carbs) : '',
    fat: item.fat != null ? String(item.fat) : '',
    quantity: item.quantity ?? '',
  }
}

function hasNutritionValues(form: FormState) {
  return [form.calories, form.protein, form.carbs, form.fat].some((value) => value !== '')
}

function formatKg(value: number) {
  return `${Math.round(value * 10) / 10} kg`
}

function formatDateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatLastUsedLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function MacroStat({ label, value, accent = false }: { label: string; value: number | null; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${accent ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-line/70 bg-sunken/25'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${accent ? 'text-cyan-200' : 'text-ink'}`}>
        {value ?? '-'}
        {label !== 'Calories' && value != null ? 'g' : ''}
      </p>
    </div>
  )
}

function WeightSparkline({ entries }: { entries: WeightEntry[] }) {
  if (entries.length < 2) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-line/70 bg-sunken/20 text-sm text-gray-500">
        Add another entry to see a trend.
      </div>
    )
  }

  const weights = entries.map((entry) => entry.weightKg)
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const range = max - min || 1
  const points = entries.map((entry, index) => {
    const x = (index / (entries.length - 1)) * 100
    const y = 90 - ((entry.weightKg - min) / range) * 80
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="rounded-lg border border-line/70 bg-sunken/20 p-3">
      <svg viewBox="0 0 100 100" className="h-28 w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={points} fill="none" stroke="rgb(34, 211, 238)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {entries.map((entry, index) => {
          const x = (index / (entries.length - 1)) * 100
          const y = 90 - ((entry.weightKg - min) / range) * 80
          return <circle key={entry.id} cx={x} cy={y} r="2" fill="rgb(34, 211, 238)" vectorEffect="non-scaling-stroke" />
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
        <span>{formatDateLabel(entries[0].date)}</span>
        <span>{formatDateLabel(entries[entries.length - 1].date)}</span>
      </div>
    </div>
  )
}

export default function CaloriesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedDate = searchParams.get('date')
  const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : todayStr()
  const setDate = (nextDate: string) => {
    const nextParams = new URLSearchParams(searchParams)
    if (nextDate === todayStr()) nextParams.delete('date')
    else nextParams.set('date', nextDate)
    setSearchParams(nextParams)
  }
  const { entries, isLoading, totals, createEntry, updateEntry, deleteEntry } = useCalorieEntries(date)
  const [quickInsertSort, setQuickInsertSort] = useState<'recent' | 'most-used'>('recent')
  const { items: quickInsertItems, isLoading: isQuickInsertLoading } = useCalorieItems(quickInsertSort, 8)
  const {
    entry: weightEntry,
    trend: weightTrend,
    isLoading: isWeightLoading,
    createEntry: createWeightEntry,
    updateEntry: updateWeightEntry,
    deleteEntry: deleteWeightEntry,
  } = useWeightTracking(date)
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState<FormState>(() => emptyForm(currentTime()))
  const [quickInsertQuery, setQuickInsertQuery] = useState('')
  const [highlightedQuickInsertIndex, setHighlightedQuickInsertIndex] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(() => emptyForm())
  const [showAiAnalyzer, setShowAiAnalyzer] = useState(false)
  const [weightDraft, setWeightDraft] = useState('')
  const [isEditingWeight, setIsEditingWeight] = useState(false)
  const quickInsertSearchRef = useRef<HTMLInputElement | null>(null)
  const quickInsertDialogRef = useRef<HTMLDivElement | null>(null)
  const quickInsertItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const groupedEntries = entries.reduce<Record<string, CalorieEntry[]>>((groups, entry) => {
    const key = entry.time ?? 'no-time'
    groups[key] = groups[key] ?? []
    groups[key].push(entry)
    return groups
  }, {})
  const timeGroups = Object.entries(groupedEntries)
  const filteredQuickInsertItems = useMemo(() => {
    const query = quickInsertQuery.trim().toLowerCase()
    if (query === '') return quickInsertItems

    return quickInsertItems.filter((item) => item.name.toLowerCase().includes(query))
  }, [quickInsertItems, quickInsertQuery])

  useEffect(() => {
    if (!adding) return

    setQuickInsertQuery('')
    setHighlightedQuickInsertIndex(0)
    const frame = window.requestAnimationFrame(() => quickInsertSearchRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [adding])

  useEffect(() => {
    if (!adding) return

    const lastIndex = Math.max(filteredQuickInsertItems.length - 1, 0)
    setHighlightedQuickInsertIndex((current) => Math.min(current, lastIndex))
  }, [adding, filteredQuickInsertItems])

  const submitAdd = () => {
    if (!addForm.name.trim() || addForm.calories === '') return
    createEntry(formToInput(date, addForm))
    setAddForm(emptyForm(currentTime()))
    setAdding(false)
  }

  const applyQuickInsert = (item: CalorieItem) => {
    setAddForm(itemToForm(item, addForm.time || currentTime()))
    setAdding(true)
  }

  const closeAddPanel = () => {
    setAdding(false)
    setAddForm(emptyForm(currentTime()))
  }
  useModalFocus({
    open: adding,
    onClose: closeAddPanel,
    containerRef: quickInsertDialogRef,
    initialFocusRef: quickInsertSearchRef,
  })

  const moveQuickInsertHighlight = (direction: 1 | -1) => {
    if (filteredQuickInsertItems.length === 0) return

    setHighlightedQuickInsertIndex((current) => {
      const next = (current + direction + filteredQuickInsertItems.length) % filteredQuickInsertItems.length
      window.requestAnimationFrame(() => quickInsertItemRefs.current[next]?.focus())
      return next
    })
  }

  const handleQuickInsertSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveQuickInsertHighlight(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveQuickInsertHighlight(-1)
      return
    }

    if (event.key === 'Enter' && filteredQuickInsertItems[highlightedQuickInsertIndex]) {
      event.preventDefault()
      applyQuickInsert(filteredQuickInsertItems[highlightedQuickInsertIndex])
    }
  }

  const handleQuickInsertItemKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveQuickInsertHighlight(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveQuickInsertHighlight(-1)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      setHighlightedQuickInsertIndex(0)
      window.requestAnimationFrame(() => quickInsertItemRefs.current[0]?.focus())
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      const lastIndex = filteredQuickInsertItems.length - 1
      setHighlightedQuickInsertIndex(lastIndex)
      window.requestAnimationFrame(() => quickInsertItemRefs.current[lastIndex]?.focus())
      return
    }

    if (event.key === 'Tab' && event.shiftKey && index === 0) {
      setHighlightedQuickInsertIndex(0)
    }
  }

  const startEdit = (e: CalorieEntry) => {
    setEditingId(e.id)
    setEditForm(entryToForm(e))
  }

  const submitEdit = () => {
    if (!editingId) return
    updateEntry({ id: editingId, patch: formToInput(date, editForm) })
    setEditingId(null)
  }

  const startWeightEdit = () => {
    setWeightDraft(weightEntry ? String(weightEntry.weightKg) : '')
    setIsEditingWeight(true)
  }

  const submitWeight = () => {
    const weightKg = Number(weightDraft)
    if (!Number.isFinite(weightKg) || weightKg <= 0) return

    if (weightEntry) {
      updateWeightEntry({ id: weightEntry.id, patch: { weightKg } })
    } else {
      createWeightEntry({ date, weightKg })
    }
    setWeightDraft('')
    setIsEditingWeight(false)
  }

  const cancelWeight = () => {
    setWeightDraft('')
    setIsEditingWeight(false)
  }

  const DeltaIcon = weightTrend.deltaKg == null
    ? Minus
    : weightTrend.deltaKg < 0
      ? TrendingDown
      : weightTrend.deltaKg > 0
        ? TrendingUp
        : Minus
  const deltaText = weightTrend.deltaKg == null
    ? 'No previous entry yet'
    : `${weightTrend.deltaKg > 0 ? '+' : ''}${Math.round(weightTrend.deltaKg * 10) / 10} kg since last entry`

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-28 md:pb-0">
      <HealthNavigation date={date} />

      <header className="flex flex-col gap-4 border-b border-line/70 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Nutrition</h1>
            <p className="mt-1 max-w-xl text-sm text-ink-muted">
              Understand the selected day first, then log or correct the details.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm"
            onClick={() => setShowAiAnalyzer(true)}
          >
            <Sparkles className="h-4 w-4" /> Add with AI
          </button>
          <button
            className="btn-primary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm"
            data-demo-id="calorie-quick-insert-trigger"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" /> Add Entry
          </button>
        </div>
      </header>

      <AnimatePresence>
        {showAiAnalyzer && (
          <MealAnalyzer date={date} onClose={() => setShowAiAnalyzer(false)} />
        )}
      </AnimatePresence>

      <section className="overflow-hidden rounded-3xl border border-line/80 bg-card/60 shadow-xl shadow-black/10" data-demo-id="nutrition-daily-overview">
        <div className="flex flex-col gap-4 border-b border-line/70 p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
          <HealthDayNavigator date={date} onChange={setDate} label="Calorie log" />
          <p className="max-w-sm text-sm leading-6 text-ink-muted">
            Totals are neutral until you configure targets. Missing data is never treated as failure.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3">
          <div className="border-b border-line/70 p-4 sm:border-r xl:border-b-0">
            <div className="flex items-center gap-2">
              <Utensils className="h-4 w-4 text-orange-300" />
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Nutrition</p>
            </div>
            <p className="mt-3 text-xl font-semibold text-ink">{totals.calories.toLocaleString()} kcal</p>
            <p className="mt-1 text-xs text-ink-muted">{entries.length} Calorie entr{entries.length === 1 ? 'y' : 'ies'} · no target configured</p>
          </div>
          <div className="border-b border-line/70 p-4 sm:border-r-0 xl:border-b-0 xl:border-r">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-cyan-300" />
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Macros</p>
            </div>
            <p className="mt-3 text-xl font-semibold text-ink">{totals.protein}g protein</p>
            <p className="mt-1 text-xs text-ink-muted">{totals.carbs}g carbs · {totals.fat}g fat</p>
          </div>
          <div className="border-b border-line/70 p-4 sm:border-r xl:border-b-0">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-emerald-300" />
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Weight</p>
            </div>
            <p className="mt-3 text-xl font-semibold text-ink">{weightEntry ? formatKg(weightEntry.weightKg) : 'Not recorded'}</p>
            <p className="mt-1 text-xs text-ink-muted">{weightEntry ? 'Recorded for this date' : 'Optional daily measurement · kg'}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,.55fr)]">
        <section className="rounded-3xl border border-line/80 bg-card/60 p-4 md:p-5" aria-labelledby="calorie-entries-heading">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="calorie-entries-heading" className="text-lg font-semibold text-ink">Detailed log</h2>
              <p className="mt-1 text-xs text-ink-muted">Repeat, edit, or correct a Calorie entry without leaving this date.</p>
            </div>
            <span className="rounded-full border border-line bg-sunken/30 px-3 py-1 text-xs text-ink-muted">
              {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
            </span>
          </div>

          {isLoading ? (
            <p className="text-sm text-ink-muted">Loading...</p>
          ) : entries.length === 0 ? (
            <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-line bg-sunken/20 p-6 text-center">
              <div>
                <Utensils className="mx-auto h-7 w-7 text-ink-muted" />
                <p className="mt-3 text-sm font-medium text-ink">No Calorie entries for this day</p>
                <p className="mt-1 text-xs text-ink-muted">Log something manually, repeat a saved item, or use AI.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3" data-demo-id="calorie-entries">
              {timeGroups.map(([time, group]) => (
                <div key={time} className="overflow-hidden rounded-xl border border-line/80 bg-sunken/20">
                  <div className="flex items-center justify-between border-b border-line/70 bg-page/45 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-ink">
                      <Clock className="h-4 w-4 text-cyan-400" />
                      <span>{time === 'no-time' ? 'No time recorded' : time}</span>
                    </div>
                    <span className="text-xs text-ink-muted">{group.length} entr{group.length === 1 ? 'y' : 'ies'}</span>
                  </div>
                  <div className="divide-y divide-line/70">
                    {group.map((entry: CalorieEntry) =>
                      editingId === entry.id ? (
                        <div key={entry.id} className="space-y-3 p-3">
                          <div className="grid gap-3 md:grid-cols-[7rem_1.4fr_1.2fr]">
                            <label className="space-y-1">
                              <span className="text-xs text-ink-muted">Time</span>
                              <input type="time" className="input-field" aria-label="Edit calorie entry time" value={editForm.time} onChange={(event) => setEditForm({ ...editForm, time: event.target.value })} />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs text-ink-muted">Title</span>
                              <input className="input-field" aria-label="Edit calorie entry title" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs text-ink-muted">Quantity</span>
                              <input className="input-field" value={editForm.quantity} onChange={(event) => setEditForm({ ...editForm, quantity: event.target.value })} />
                            </label>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-4">
                            {([
                              ['Calories for quantity', 'calories'],
                              ['Protein for quantity', 'protein'],
                              ['Carbs for quantity', 'carbs'],
                              ['Fat for quantity', 'fat'],
                            ] as const).map(([label, field]) => (
                              <label key={field} className="space-y-1">
                                <span className="text-xs text-ink-muted">{label}</span>
                                <input type="number" className="input-field" value={editForm[field]} onChange={(event) => setEditForm({ ...editForm, [field]: event.target.value })} />
                              </label>
                            ))}
                          </div>
                          {editForm.quantity && hasNutritionValues(editForm) && (
                            <p className="text-xs text-amber-300">Nutrition numbers are totals for this quantity. Review them if the quantity changes.</p>
                          )}
                          <div className="flex justify-end gap-2">
                            <IconButton label="Save calorie entry edit" onClick={submitEdit} className="text-cyan-400"><Check className="h-4 w-4" /></IconButton>
                            <IconButton label="Cancel calorie entry edit" onClick={() => setEditingId(null)} className="text-ink-muted"><X className="h-4 w-4" /></IconButton>
                          </div>
                        </div>
                      ) : (
                        <div key={entry.id} className="grid gap-3 px-3 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(17rem,1fr)_auto] lg:items-center">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{entry.name}</p>
                            <p className="mt-1 truncate text-sm text-ink-muted">{entry.quantity ?? 'Quantity not recorded'}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <MacroStat label="Calories" value={entry.calories} accent />
                            <MacroStat label="Protein" value={entry.protein} />
                            <MacroStat label="Carbs" value={entry.carbs} />
                            <MacroStat label="Fat" value={entry.fat} />
                          </div>
                          <div className="flex justify-end gap-1">
                            <IconButton label={`Edit ${entry.name} calorie entry`} onClick={() => startEdit(entry)} className="text-ink-muted hover:text-cyan-400"><Pencil className="h-4 w-4" /></IconButton>
                            <IconButton
                              label={`Delete ${entry.name} calorie entry`}
                              onClick={() => {
                                deleteEntry(entry.id, {
                                  onSuccess: () => showUndoToast(
                                    `${entry.name} deleted`,
                                    () => createEntry({
                                      date: entry.date,
                                      time: entry.time,
                                      name: entry.name,
                                      calories: entry.calories,
                                      protein: entry.protein,
                                      carbs: entry.carbs,
                                      fat: entry.fat,
                                      quantity: entry.quantity,
                                    }),
                                    `Undo deletion of ${entry.name}`,
                                  ),
                                })
                              }}
                              className="text-ink-muted hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-line/80 bg-card/60 p-4 md:p-5" data-demo-id="weight-card" aria-labelledby="weight-heading">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10">
                  <Scale className="h-4 w-4 text-emerald-300" />
                </div>
                <div>
                  <h2 id="weight-heading" className="font-semibold text-ink">Weight</h2>
                  <p className="text-xs text-ink-muted">Recorded and displayed in kg</p>
                </div>
              </div>
              {!isEditingWeight && (
                <button className="btn-secondary inline-flex min-h-11 items-center gap-2 px-3 py-2 text-sm" onClick={startWeightEdit}>
                  {weightEntry ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {weightEntry ? 'Edit' : 'Log'}
                </button>
              )}
            </div>

            {isWeightLoading ? (
              <p className="text-sm text-ink-muted">Loading...</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Latest recorded</p>
                  <p className="mt-2 text-3xl font-semibold text-ink">{weightTrend.latest ? formatKg(weightTrend.latest.weightKg) : 'Not recorded'}</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {weightTrend.latest ? formatDateLabel(weightTrend.latest.date) : 'Add a first Weight entry when useful.'}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
                    <DeltaIcon className="h-4 w-4 text-emerald-300" />
                    <span>{deltaText}</span>
                  </div>
                </div>
                <WeightSparkline entries={weightTrend.entries} />

                {isEditingWeight && (
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
                    <label className="space-y-1">
                      <span className="text-xs text-ink-muted">Weight for {formatDateLabel(date)} (kg)</span>
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input
                          type="number"
                          step="0.1"
                          min="1"
                          inputMode="decimal"
                          aria-label="Weight in kilograms"
                          className="input-field"
                          placeholder="68.4"
                          value={weightDraft}
                          onChange={(event) => setWeightDraft(event.target.value)}
                        />
                        <div className="flex items-center gap-1">
                          <IconButton label="Save Weight entry" onClick={submitWeight} className="text-cyan-400"><Check className="h-4 w-4" /></IconButton>
                          <IconButton label="Cancel Weight entry" onClick={cancelWeight} className="text-ink-muted"><X className="h-4 w-4" /></IconButton>
                          {weightEntry && (
                            <IconButton
                              label={`Delete Weight entry for ${date}`}
                              onClick={() => {
                                deleteWeightEntry(weightEntry.id, {
                                  onSuccess: () => showUndoToast(
                                    `Weight entry for ${formatDateLabel(weightEntry.date)} deleted`,
                                    () => createWeightEntry({ date: weightEntry.date, weightKg: weightEntry.weightKg }),
                                    `Undo deletion of Weight entry for ${formatDateLabel(weightEntry.date)}`,
                                  ),
                                })
                                cancelWeight()
                              }}
                              className="text-ink-muted hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          )}
                        </div>
                      </div>
                    </label>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-line/80 bg-card/60 p-4 md:p-5" aria-labelledby="quick-repeat-heading">
            <div>
              <h2 id="quick-repeat-heading" className="font-semibold text-ink">Quick repeat</h2>
              <p className="mt-1 text-xs text-ink-muted">Reuse recent Calorie entries without scanning history.</p>
            </div>
            {isQuickInsertLoading ? (
              <p className="mt-4 text-sm text-ink-muted">Loading...</p>
            ) : quickInsertItems.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-sm text-ink-muted">Saved items appear after you log them.</p>
            ) : (
              <div className="mt-4 grid gap-2">
                {quickInsertItems.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyQuickInsert(item)}
                    className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line bg-sunken/25 px-3 text-left transition hover:border-cyan-400/40 hover:bg-cyan-400/5"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-ink">{item.name}</span>
                    <span className="shrink-0 text-xs text-ink-muted">{item.calories} kcal</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      {adding && createPortal((
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              aria-label="Close quick insert"
              onClick={closeAddPanel}
            />
            <div
              ref={quickInsertDialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="calorie-quick-insert-title"
              data-testid="calorie-quick-insert-dialog"
              className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-cyan-500/20 bg-page shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-card px-5 py-4">
                <div>
                  <h2 id="calorie-quick-insert-title" className="text-lg font-semibold text-ink">Add Calorie Intake</h2>
                  <p className="text-xs text-ink-muted">Pick a recent item or fill the form manually.</p>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-2 text-ink-muted transition hover:bg-card hover:text-ink-soft"
                  onClick={closeAddPanel}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">Quick Insert</h3>
                      <p className="text-xs text-ink-muted">Search within the current tab and use arrow keys plus Enter to pick an item.</p>
                    </div>
                    <div className="inline-flex rounded-lg border border-line/80 bg-sunken/30 p-1 text-xs">
                      <button
                        type="button"
                        className={`rounded-md px-3 py-1.5 ${quickInsertSort === 'recent' ? 'bg-cyan-500/20 text-cyan-200' : 'text-ink-muted'}`}
                        onClick={() => setQuickInsertSort('recent')}
                      >
                        Recent
                      </button>
                      <button
                        type="button"
                        className={`rounded-md px-3 py-1.5 ${quickInsertSort === 'most-used' ? 'bg-cyan-500/20 text-cyan-200' : 'text-ink-muted'}`}
                        onClick={() => setQuickInsertSort('most-used')}
                      >
                        Most Used
                      </button>
                    </div>
                  </div>

                  <label className="mb-3 block space-y-1">
                    <span className="text-xs text-ink-muted">Search</span>
                    <input
                      ref={quickInsertSearchRef}
                      data-testid="calorie-quick-insert-search"
                      className="input-field"
                      placeholder={`Filter ${quickInsertSort === 'recent' ? 'recent' : 'most-used'} items`}
                      value={quickInsertQuery}
                      onChange={(event) => {
                        setQuickInsertQuery(event.target.value)
                        setHighlightedQuickInsertIndex(0)
                      }}
                      onKeyDown={handleQuickInsertSearchKeyDown}
                    />
                  </label>

                  {isQuickInsertLoading ? (
                    <p className="text-sm text-ink-muted">Loading...</p>
                  ) : quickInsertItems.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-line/80 bg-sunken/20 px-4 py-5 text-sm text-gray-500">
                      No saved item history yet. Use the form below and your recent items will appear here.
                    </p>
                  ) : filteredQuickInsertItems.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-line/80 bg-sunken/20 px-4 py-5 text-sm text-gray-500">
                      No items match this filter in the current tab.
                    </p>
                  ) : (
                    <div className="grid gap-2" data-testid="calorie-quick-insert-list">
                      {filteredQuickInsertItems.map((item, index) => (
                        <button
                          key={item.id}
                          ref={(node) => {
                            quickInsertItemRefs.current[index] = node
                          }}
                          type="button"
                          data-testid="calorie-quick-insert-item"
                          className={`rounded-xl border px-3 py-3 text-left transition ${
                            index === highlightedQuickInsertIndex
                              ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-50'
                              : 'border-cyan-500/20 bg-cyan-500/5 text-cyan-100 hover:border-cyan-400/40 hover:bg-cyan-500/10'
                          }`}
                          onClick={() => applyQuickInsert(item)}
                          onFocus={() => setHighlightedQuickInsertIndex(index)}
                          onKeyDown={(event) => handleQuickInsertItemKeyDown(event, index)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-cyan-200/70">
                                {quickInsertSort === 'most-used' ? `${item.usageCount} uses` : `Last used ${formatLastUsedLabel(item.lastUsedAt)}`}
                              </p>
                              {item.quantity && <p className="text-xs text-cyan-100/75">{item.quantity}</p>}
                            </div>
                            <span className="text-sm text-cyan-200/80">{item.calories} cal</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-xl border border-card bg-sunken/40 p-4">
                  <div className="grid gap-3 md:grid-cols-[7rem_1.4fr_1.2fr]">
                    <label className="space-y-1">
                      <span className="text-xs text-ink-muted">Time</span>
                      <input type="time" className="input-field" value={addForm.time} onChange={(ev) => setAddForm({ ...addForm, time: ev.target.value })} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-ink-muted">Name</span>
                      <input className="input-field" placeholder="Yogurt" value={addForm.name} onChange={(ev) => setAddForm({ ...addForm, name: ev.target.value })} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-ink-muted">Quantity</span>
                      <input className="input-field" placeholder="e.g. 2 eggs" value={addForm.quantity} onChange={(ev) => setAddForm({ ...addForm, quantity: ev.target.value })} />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <label className="space-y-1">
                      <span className="text-xs text-ink-muted">Calories for quantity</span>
                      <input type="number" className="input-field" placeholder="Cal" value={addForm.calories} onChange={(ev) => setAddForm({ ...addForm, calories: ev.target.value })} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-ink-muted">Protein for quantity</span>
                      <input type="number" className="input-field" placeholder="g" value={addForm.protein} onChange={(ev) => setAddForm({ ...addForm, protein: ev.target.value })} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-ink-muted">Carbs for quantity</span>
                      <input type="number" className="input-field" placeholder="g" value={addForm.carbs} onChange={(ev) => setAddForm({ ...addForm, carbs: ev.target.value })} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-ink-muted">Fat for quantity</span>
                      <input type="number" className="input-field" placeholder="g" value={addForm.fat} onChange={(ev) => setAddForm({ ...addForm, fat: ev.target.value })} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-card px-5 py-4">
                <button type="button" onClick={closeAddPanel} className="btn-secondary px-4 py-2 text-sm">
                  Cancel
                </button>
                <button type="button" onClick={submitAdd} className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
                  <Check className="h-4 w-4" />
                  Save Entry
                </button>
              </div>
            </div>
          </div>
        ), document.body)}
    </div>
  )
}
