import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Utensils, Plus, Trash2, Pencil, X, Check, Sparkles, Clock, Scale, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { useCalorieEntries } from '../hooks/useCalorieEntries'
import { CalorieEntry, CalorieEntryInput, CalorieItem, WeightEntry } from '../services/api'
import { useWeightTracking } from '../hooks/useWeightTracking'
import MealAnalyzer from '../components/MealAnalyzer'
import { useCalorieItems } from '../hooks/useCalorieItems'

const todayStr = () => new Date().toISOString().slice(0, 10)
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
    quantity: '',
  }
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
      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-gray-500">{label}</p>
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
  const [date, setDate] = useState(todayStr())
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

  useEffect(() => {
    if (!adding) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAdding(false)
        setAddForm(emptyForm(currentTime()))
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [adding])

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
    <div className="max-w-3xl mx-auto space-y-6 pb-28 md:pb-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center animate-float">
            <Utensils className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-ink neon-text">Calorie Log</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="input-field w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <AnimatePresence>
        {showAiAnalyzer && (
          <MealAnalyzer date={date} onClose={() => setShowAiAnalyzer(false)} />
        )}
      </AnimatePresence>

      <div className="card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/15">
              <Scale className="h-4 w-4 text-cyan-300" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-ink">Weight</h2>
              <p className="text-xs text-ink-muted">Last 30 recorded entries</p>
            </div>
          </div>
          {!isEditingWeight && (
            <button className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-sm" onClick={startWeightEdit}>
              {weightEntry ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {weightEntry ? 'Edit Day' : 'Log Day'}
            </button>
          )}
        </div>

        {isWeightLoading ? (
          <p className="text-sm text-ink-muted">Loading...</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
              <div className="rounded-lg border border-line/80 bg-sunken/20 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Latest</p>
                <p className="mt-2 text-3xl font-bold text-cyan-300">
                  {weightTrend.latest ? formatKg(weightTrend.latest.weightKg) : '--'}
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {weightTrend.latest ? formatDateLabel(weightTrend.latest.date) : 'No weight logged yet'}
                </p>
                <div className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
                  <DeltaIcon className="h-4 w-4 text-cyan-400" />
                  <span>{deltaText}</span>
                </div>
              </div>
              <WeightSparkline entries={weightTrend.entries} />
            </div>

            {isEditingWeight && (
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    className="input-field"
                    placeholder="Weight in kg"
                    value={weightDraft}
                    onChange={(event) => setWeightDraft(event.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <button onClick={submitWeight} className="text-cyan-400"><Check className="h-4 w-4" /></button>
                    <button onClick={cancelWeight} className="text-ink-muted"><X className="h-4 w-4" /></button>
                    {weightEntry && (
                      <button
                        onClick={() => {
                          deleteWeightEntry(weightEntry.id)
                          cancelWeight()
                        }}
                        className="text-ink-muted hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Entries</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"
              onClick={() => setShowAiAnalyzer(true)}
            >
              <Sparkles className="w-4 h-4" /> Add with AI
            </button>
            <button className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm" onClick={() => setAdding(true)}>
              <Plus className="w-4 h-4" /> Add Entry
            </button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-ink-muted text-sm">Loading...</p>
        ) : (
          <div className="space-y-3">
            {timeGroups.map(([time, group]) => (
              <div key={time} className="overflow-hidden rounded-lg border border-line/80 bg-sunken/20">
                <div className="flex items-center justify-between border-b border-line/70 bg-page/45 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink">
                    <Clock className="h-4 w-4 text-cyan-400" />
                    <span>{time === 'no-time' ? 'No time' : time}</span>
                  </div>
                  <span className="text-xs text-ink-muted">{group.length} entr{group.length === 1 ? 'y' : 'ies'}</span>
                </div>
                <div className="divide-y divide-card/90">
                  {group.map((e: CalorieEntry) =>
                    editingId === e.id ? (
                      <div key={e.id} className="space-y-3 p-3">
                        <div className="grid gap-3 md:grid-cols-[7rem_1.4fr_1.2fr]">
                          <label className="space-y-1">
                            <span className="text-xs text-ink-muted">Time</span>
                            <input type="time" className="input-field" aria-label="Edit calorie entry time" value={editForm.time} onChange={(ev) => setEditForm({ ...editForm, time: ev.target.value })} />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-ink-muted">Title</span>
                            <input className="input-field" aria-label="Edit calorie entry title" value={editForm.name} onChange={(ev) => setEditForm({ ...editForm, name: ev.target.value })} />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-ink-muted">Quantity</span>
                            <input className="input-field" value={editForm.quantity} onChange={(ev) => setEditForm({ ...editForm, quantity: ev.target.value })} />
                          </label>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-4">
                          <label className="space-y-1">
                            <span className="text-xs text-ink-muted">Calories</span>
                            <input type="number" className="input-field" value={editForm.calories} onChange={(ev) => setEditForm({ ...editForm, calories: ev.target.value })} />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-ink-muted">Protein</span>
                            <input type="number" className="input-field" value={editForm.protein} onChange={(ev) => setEditForm({ ...editForm, protein: ev.target.value })} />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-ink-muted">Carbs</span>
                            <input type="number" className="input-field" value={editForm.carbs} onChange={(ev) => setEditForm({ ...editForm, carbs: ev.target.value })} />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-ink-muted">Fat</span>
                            <input type="number" className="input-field" value={editForm.fat} onChange={(ev) => setEditForm({ ...editForm, fat: ev.target.value })} />
                          </label>
                        </div>
                        <div className="flex justify-end">
                          <div className="flex gap-2">
                            <button type="button" onClick={submitEdit} className="text-cyan-400" aria-label="Save calorie entry edit"><Check className="w-4 h-4" /></button>
                            <button type="button" onClick={() => setEditingId(null)} className="text-ink-muted" aria-label="Cancel calorie entry edit"><X className="w-4 h-4" /></button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={e.id} className="grid gap-3 px-3 py-3 text-sm text-ink-soft lg:grid-cols-[minmax(0,1.4fr)_minmax(24rem,1fr)_auto] lg:items-center">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{e.name}</p>
                          <p className="mt-1 truncate text-sm text-ink-muted">{e.quantity ?? 'No quantity'}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <MacroStat label="Calories" value={e.calories} accent />
                          <MacroStat label="Protein" value={e.protein} />
                          <MacroStat label="Carbs" value={e.carbs} />
                          <MacroStat label="Fat" value={e.fat} />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => startEdit(e)} className="text-ink-muted hover:text-cyan-400"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => deleteEntry(e.id)} className="text-ink-muted hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}

            {entries.length === 0 && !adding && (
              <p className="py-6 text-center text-sm text-gray-500">No entries for this day yet.</p>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-ink mb-3">Daily Totals</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-cyan-400">{totals.calories}</p>
            <p className="text-xs text-ink-muted">Calories</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-ink">{totals.protein}g</p>
            <p className="text-xs text-ink-muted">Protein</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-ink">{totals.carbs}g</p>
            <p className="text-xs text-ink-muted">Carbs</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-ink">{totals.fat}g</p>
            <p className="text-xs text-ink-muted">Fat</p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {adding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              aria-label="Close quick insert"
              onClick={closeAddPanel}
            />
            <div
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
                      <span className="text-xs text-ink-muted">Calories</span>
                      <input type="number" className="input-field" placeholder="Cal" value={addForm.calories} onChange={(ev) => setAddForm({ ...addForm, calories: ev.target.value })} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-ink-muted">Protein</span>
                      <input type="number" className="input-field" placeholder="g" value={addForm.protein} onChange={(ev) => setAddForm({ ...addForm, protein: ev.target.value })} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-ink-muted">Carbs</span>
                      <input type="number" className="input-field" placeholder="g" value={addForm.carbs} onChange={(ev) => setAddForm({ ...addForm, carbs: ev.target.value })} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-ink-muted">Fat</span>
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
        )}
      </AnimatePresence>
    </div>
  )
}
