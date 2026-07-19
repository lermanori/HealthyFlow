import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  Award,
  Check,
  ChevronDown,
  Flag,
  LineChart,
  Pencil,
  Plus,
  Target,
  Trash2,
  Trophy,
  X,
} from 'lucide-react'
import Progress from '../components/Progress'
import { useAchievements } from '../hooks/useAchievements'
import {
  AchievementBetterDirection,
  AchievementEntry,
  AchievementMetricType,
  AchievementSummary,
} from '../services/api'

const todayStr = () => new Date().toISOString().slice(0, 10)

type DefinitionForm = {
  name: string
  category: string
  metricType: AchievementMetricType
  unit: string
  betterDirection: AchievementBetterDirection
  targetValue: string
}

type EntryForm = {
  date: string
  value: string
  supportingValue: string
  supportingUnit: string
  notes: string
}

const emptyDefinition: DefinitionForm = {
  name: '',
  category: '',
  metricType: 'reps',
  unit: 'reps',
  betterDirection: 'higher',
  targetValue: '',
}

const emptyEntry = (): EntryForm => ({
  date: todayStr(),
  value: '',
  supportingValue: '',
  supportingUnit: '',
  notes: '',
})

const metricDefaults: Record<AchievementMetricType, string> = {
  reps: 'reps',
  weight: 'kg',
  duration: 'seconds',
  distance: 'km',
  custom: '',
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

function formatValue(value: number | null | undefined, unit: string) {
  if (value == null) return '--'
  return `${formatNumber(value)} ${unit}`.trim()
}

function formatDateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function entryToForm(entry: AchievementEntry): EntryForm {
  return {
    date: entry.date,
    value: String(entry.value),
    supportingValue: entry.supportingValue != null ? String(entry.supportingValue) : '',
    supportingUnit: entry.supportingUnit ?? '',
    notes: entry.notes ?? '',
  }
}

function summaryToDefinitionForm(summary: AchievementSummary): DefinitionForm {
  return {
    name: summary.definition.name,
    category: summary.definition.category ?? '',
    metricType: summary.definition.metricType,
    unit: summary.definition.unit,
    betterDirection: summary.definition.betterDirection,
    targetValue: summary.definition.targetValue != null ? String(summary.definition.targetValue) : '',
  }
}

function formatEntryValue(entry: AchievementEntry, unit: string) {
  const primary = formatValue(entry.value, unit)
  if (entry.supportingValue == null || !entry.supportingUnit) return primary
  return `${primary} x ${formatValue(entry.supportingValue, entry.supportingUnit)}`
}

function isValidEntryForm(form: EntryForm) {
  const value = Number(form.value)
  const hasExtraValue = form.supportingValue.trim() !== ''
  const hasExtraUnit = form.supportingUnit.trim() !== ''
  const extraValue = Number(form.supportingValue)

  return (
    Number.isFinite(value) &&
    value > 0 &&
    hasExtraValue === hasExtraUnit &&
    (!hasExtraValue || (Number.isFinite(extraValue) && extraValue > 0))
  )
}

function AchievementSparkline({ summary }: { summary: AchievementSummary }) {
  const entries = summary.entries
  if (entries.length < 2) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-line/70 bg-sunken/20 px-4 text-center text-sm text-gray-500">
        Add another entry to see your trend.
      </div>
    )
  }

  const values = entries.map((entry) => entry.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = entries.map((entry, index) => {
    const x = (index / (entries.length - 1)) * 100
    const y = 88 - ((entry.value - min) / range) * 76
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="rounded-lg border border-line/70 bg-sunken/20 p-3">
      <svg viewBox="0 0 100 100" className="h-32 w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={points} fill="none" stroke="rgb(34, 211, 238)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {entries.map((entry, index) => {
          const x = (index / (entries.length - 1)) * 100
          const y = 88 - ((entry.value - min) / range) * 76
          return <circle key={entry.id} cx={x} cy={y} r="2.2" fill="rgb(34, 211, 238)" vectorEffect="non-scaling-stroke" />
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
        <span>{formatDateLabel(entries[0].date)}</span>
        <span>{formatDateLabel(entries[entries.length - 1].date)}</span>
      </div>
    </div>
  )
}

function StatTile({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line/80 bg-sunken/20 p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase text-gray-500">
        <Icon className="h-4 w-4 shrink-0 text-cyan-400" />
        <span>{label}</span>
      </div>
      <p className="truncate text-xl font-bold text-ink sm:text-2xl">{value}</p>
      {sub && <p className="mt-1 truncate text-xs text-ink-muted sm:text-sm">{sub}</p>}
    </div>
  )
}

function AchievementPill({
  achievement,
  active,
  onClick,
}: {
  achievement: AchievementSummary
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`min-w-[11rem] max-w-[14rem] shrink-0 rounded-lg border p-3 text-left transition-all ${
        active
          ? 'border-cyan-500/50 bg-cyan-500/12 shadow-lg shadow-cyan-500/10'
          : 'border-line/70 bg-sunken/20 hover:border-line-strong'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-ink">{achievement.definition.name}</span>
        {active && <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-400" />}
      </div>
      <p className="mt-1 text-lg font-bold text-cyan-200">
        {formatValue(achievement.latest?.value, achievement.definition.unit)}
      </p>
      <p className="mt-1 truncate text-xs text-gray-500">
        {achievement.definition.category || achievement.definition.metricType}
      </p>
    </button>
  )
}

export default function AchievementsPage() {
  const {
    achievements,
    isLoading,
    createAchievement,
    updateAchievement,
    deleteAchievement,
    addEntry,
    updateEntry,
    deleteEntry,
  } = useAchievements()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showAdvancedLog, setShowAdvancedLog] = useState(false)
  const [editingDefinition, setEditingDefinition] = useState(false)
  const [definitionForm, setDefinitionForm] = useState<DefinitionForm>(emptyDefinition)
  const [editDefinitionForm, setEditDefinitionForm] = useState<DefinitionForm>(emptyDefinition)
  const [entryForm, setEntryForm] = useState<EntryForm>(() => emptyEntry())
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editEntryForm, setEditEntryForm] = useState<EntryForm>(() => emptyEntry())

  const selected = useMemo(
    () => achievements.find((achievement) => achievement.definition.id === selectedId) ?? achievements[0] ?? null,
    [achievements, selectedId]
  )

  useEffect(() => {
    if (!selectedId && achievements[0]) {
      setSelectedId(achievements[0].definition.id)
    }
  }, [achievements, selectedId])

  useEffect(() => {
    if (selected) {
      setEditDefinitionForm(summaryToDefinitionForm(selected))
      setEditingDefinition(false)
    }
  }, [selected?.definition.id])

  const submitDefinition = () => {
    const targetValue = definitionForm.targetValue === '' ? null : Number(definitionForm.targetValue)
    if (!definitionForm.name.trim() || !definitionForm.unit.trim()) return
    if (targetValue != null && (!Number.isFinite(targetValue) || targetValue <= 0)) return

    createAchievement({
      name: definitionForm.name.trim(),
      category: definitionForm.category.trim() || null,
      metricType: definitionForm.metricType,
      unit: definitionForm.unit.trim(),
      betterDirection: definitionForm.betterDirection,
      targetValue,
    })
    setDefinitionForm(emptyDefinition)
    setShowCreate(false)
  }

  const submitDefinitionEdit = () => {
    if (!selected) return
    const targetValue = editDefinitionForm.targetValue === '' ? null : Number(editDefinitionForm.targetValue)
    if (!editDefinitionForm.name.trim() || !editDefinitionForm.unit.trim()) return
    if (targetValue != null && (!Number.isFinite(targetValue) || targetValue <= 0)) return

    updateAchievement({
      id: selected.definition.id,
      patch: {
        name: editDefinitionForm.name.trim(),
        category: editDefinitionForm.category.trim() || null,
        metricType: editDefinitionForm.metricType,
        unit: editDefinitionForm.unit.trim(),
        betterDirection: editDefinitionForm.betterDirection,
        targetValue,
      },
    })
    setEditingDefinition(false)
  }

  const submitEntry = () => {
    if (!selected || !isValidEntryForm(entryForm)) return
    addEntry({
      achievementId: selected.definition.id,
      entry: {
        date: entryForm.date,
        value: Number(entryForm.value),
        supportingValue: entryForm.supportingValue === '' ? null : Number(entryForm.supportingValue),
        supportingUnit: entryForm.supportingUnit.trim() || null,
        notes: entryForm.notes.trim() || null,
      },
    })
    setEntryForm(emptyEntry())
    setShowAdvancedLog(false)
  }

  const submitEntryEdit = () => {
    if (!editingEntryId || !isValidEntryForm(editEntryForm)) return
    updateEntry({
      entryId: editingEntryId,
      patch: {
        date: editEntryForm.date,
        value: Number(editEntryForm.value),
        supportingValue: editEntryForm.supportingValue === '' ? null : Number(editEntryForm.supportingValue),
        supportingUnit: editEntryForm.supportingUnit.trim() || null,
        notes: editEntryForm.notes.trim() || null,
      },
    })
    setEditingEntryId(null)
  }

  const trendText = selected?.trend.delta == null
    ? 'No previous entry'
    : `${selected.trend.delta > 0 ? '+' : ''}${formatNumber(selected.trend.delta)} ${selected.definition.unit}`

  const createPanel = (
    <div className="card">
      <button
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setShowCreate((value) => !value)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/15">
            <Plus className="h-4 w-4 text-cyan-300" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink">New Achievement</h2>
            <p className="text-xs text-ink-muted">Create a metric once, then log results over time.</p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-ink-muted transition-transform ${showCreate ? 'rotate-180' : ''}`} />
      </button>

      {(showCreate || achievements.length === 0) && (
        <div className="mt-4 space-y-3">
          <label className="space-y-1">
            <span className="text-xs text-ink-muted">Name</span>
            <input
              className="input-field"
              placeholder="Pushups max reps"
              value={definitionForm.name}
              onChange={(event) => setDefinitionForm({ ...definitionForm, name: event.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-ink-muted">Category</span>
            <input
              className="input-field"
              placeholder="Optional"
              value={definitionForm.category}
              onChange={(event) => setDefinitionForm({ ...definitionForm, category: event.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-ink-muted">Metric</span>
              <select
                className="input-field"
                value={definitionForm.metricType}
                onChange={(event) => {
                  const metricType = event.target.value as AchievementMetricType
                  setDefinitionForm({ ...definitionForm, metricType, unit: metricDefaults[metricType] })
                }}
              >
                <option value="reps">Reps</option>
                <option value="weight">Weight</option>
                <option value="duration">Duration</option>
                <option value="distance">Distance</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-ink-muted">Unit</span>
              <input
                className="input-field"
                placeholder="kg"
                value={definitionForm.unit}
                onChange={(event) => setDefinitionForm({ ...definitionForm, unit: event.target.value })}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-ink-muted">Best</span>
              <select
                className="input-field"
                value={definitionForm.betterDirection}
                onChange={(event) => setDefinitionForm({ ...definitionForm, betterDirection: event.target.value as AchievementBetterDirection })}
              >
                <option value="higher">Higher</option>
                <option value="lower">Lower</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-ink-muted">Target</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input-field"
                placeholder="Optional"
                value={definitionForm.targetValue}
                onChange={(event) => setDefinitionForm({ ...definitionForm, targetValue: event.target.value })}
              />
            </label>
          </div>
          <button className="btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm" onClick={submitDefinition}>
            <Check className="h-4 w-4" />
            Create
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-28 md:space-y-6 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600">
            <Award className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink neon-text">Achievements</h1>
            <p className="text-sm text-ink-muted">Personal bests and progress over recorded dates.</p>
          </div>
        </div>
        <button
          className="btn-secondary inline-flex items-center gap-2 px-3 py-3 text-sm"
          onClick={() => setShowCreate((value) => !value)}
        >
          <Plus className="h-4 w-4" />
          New
        </button>
      </div>

      {achievements.length > 0 && (
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <div className="flex gap-3">
            {achievements.map((achievement) => (
              <AchievementPill
                key={achievement.definition.id}
                achievement={achievement}
                active={achievement.definition.id === selected?.definition.id}
                onClick={() => setSelectedId(achievement.definition.id)}
              />
            ))}
          </div>
        </div>
      )}

      {(showCreate || achievements.length === 0) && createPanel}

      {isLoading ? (
        <div className="card">
          <p className="text-sm text-ink-muted">Loading...</p>
        </div>
      ) : !selected ? (
        <div className="card">
          <div className="flex min-h-[12rem] items-center justify-center rounded-lg border border-line/80 bg-sunken/20 p-6 text-center text-sm text-ink-muted">
            Create your first achievement to start tracking progress.
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-4">
              <div className="card" data-demo-id="achievement-detail">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-semibold text-ink">{selected.definition.name}</h2>
                      {selected.definition.category && (
                        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-200">
                          {selected.definition.category}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">
                      {selected.definition.metricType} · {selected.definition.unit} · {selected.definition.betterDirection} is better
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-card/70 hover:text-cyan-300"
                      onClick={() => {
                        setEditDefinitionForm(summaryToDefinitionForm(selected))
                        setEditingDefinition((value) => !value)
                      }}
                      title="Edit"
                      aria-label={`Edit ${selected.definition.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-card/70 hover:text-cyan-300"
                      onClick={() => updateAchievement({ id: selected.definition.id, patch: { archived: true } })}
                      title="Archive"
                      aria-label={`Archive ${selected.definition.name}`}
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                    <button
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-red-500/10 hover:text-red-400"
                      onClick={() => deleteAchievement(selected.definition.id)}
                      title="Delete"
                      aria-label={`Delete ${selected.definition.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {editingDefinition && (
                  <div className="mb-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-xs text-ink-muted">Name</span>
                        <input
                          className="input-field"
                          value={editDefinitionForm.name}
                          onChange={(event) => setEditDefinitionForm({ ...editDefinitionForm, name: event.target.value })}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-ink-muted">Category</span>
                        <input
                          className="input-field"
                          placeholder="Optional"
                          value={editDefinitionForm.category}
                          onChange={(event) => setEditDefinitionForm({ ...editDefinitionForm, category: event.target.value })}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-ink-muted">Metric</span>
                        <select
                          className="input-field"
                          value={editDefinitionForm.metricType}
                          onChange={(event) => {
                            const metricType = event.target.value as AchievementMetricType
                            setEditDefinitionForm({
                              ...editDefinitionForm,
                              metricType,
                              unit: editDefinitionForm.unit || metricDefaults[metricType],
                            })
                          }}
                        >
                          <option value="reps">Reps</option>
                          <option value="weight">Weight</option>
                          <option value="duration">Duration</option>
                          <option value="distance">Distance</option>
                          <option value="custom">Custom</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-ink-muted">Unit</span>
                        <input
                          className="input-field"
                          value={editDefinitionForm.unit}
                          onChange={(event) => setEditDefinitionForm({ ...editDefinitionForm, unit: event.target.value })}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-ink-muted">Best</span>
                        <select
                          className="input-field"
                          value={editDefinitionForm.betterDirection}
                          onChange={(event) => setEditDefinitionForm({ ...editDefinitionForm, betterDirection: event.target.value as AchievementBetterDirection })}
                        >
                          <option value="higher">Higher</option>
                          <option value="lower">Lower</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-ink-muted">Target</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          className="input-field"
                          placeholder="Optional"
                          value={editDefinitionForm.targetValue}
                          onChange={(event) => setEditDefinitionForm({ ...editDefinitionForm, targetValue: event.target.value })}
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        aria-label={`Save changes to ${selected.definition.name}`}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-cyan-400 hover:bg-cyan-500/10"
                        onClick={submitDefinitionEdit}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        aria-label={`Cancel editing ${selected.definition.name}`}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-card/70"
                        onClick={() => setEditingDefinition(false)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatTile
                    icon={LineChart}
                    label="Latest"
                    value={formatValue(selected.latest?.value, selected.definition.unit)}
                    sub={selected.latest ? formatDateLabel(selected.latest.date) : 'No entries'}
                  />
                  <StatTile
                    icon={Trophy}
                    label="Best"
                    value={formatValue(selected.personalBest?.value, selected.definition.unit)}
                    sub={selected.personalBest ? formatDateLabel(selected.personalBest.date) : 'Waiting'}
                  />
                  <StatTile
                    icon={Flag}
                    label="Change"
                    value={trendText}
                    sub={selected.trend.isImprovement == null ? 'Need 2 entries' : selected.trend.isImprovement ? 'Improving' : 'Not improved'}
                  />
                  <StatTile
                    icon={Target}
                    label="Target"
                    value={selected.definition.targetValue ? formatValue(selected.definition.targetValue, selected.definition.unit) : '--'}
                    sub={selected.targetProgress == null ? 'No target' : `${Math.round(selected.targetProgress)}% reached`}
                  />
                </div>

                {selected.definition.targetValue && (
                  <div className="mt-4">
                    <Progress className="h-2" label={`${selected.definition.name} target progress`} value={selected.targetProgress == null ? 0 : Math.round(selected.targetProgress)} />
                  </div>
                )}
              </div>

              <div className="card">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-ink">Trend</h2>
                  <span className="text-xs text-ink-muted">{selected.entries.length} entr{selected.entries.length === 1 ? 'y' : 'ies'}</span>
                </div>
                <AchievementSparkline summary={selected} />
              </div>
            </div>

            <div className="card lg:sticky lg:top-4 lg:self-start">
              <h2 className="mb-4 text-lg font-semibold text-ink">Log Result</h2>
              <div className="space-y-3">
                <label className="space-y-1">
                  <span className="text-xs text-ink-muted">Value</span>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      className="input-field text-2xl font-semibold"
                      placeholder={selected.definition.unit}
                      value={entryForm.value}
                      onChange={(event) => setEntryForm({ ...entryForm, value: event.target.value })}
                    />
                    <div className="flex min-w-[4rem] items-center justify-center rounded-lg border border-line/80 bg-sunken/20 px-3 text-sm font-medium text-cyan-200">
                      {selected.definition.unit}
                    </div>
                  </div>
                </label>

                <label className="space-y-1">
                  <span className="text-xs text-ink-muted">Date</span>
                  <input
                    type="date"
                    className="input-field"
                    value={entryForm.date}
                    onChange={(event) => setEntryForm({ ...entryForm, date: event.target.value })}
                  />
                </label>

                <button
                  className="flex w-full items-center justify-between rounded-lg border border-line/80 bg-sunken/20 px-3 py-3 text-sm text-ink-soft"
                  onClick={() => setShowAdvancedLog((value) => !value)}
                >
                  <span>Extra measurement and notes</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showAdvancedLog ? 'rotate-180' : ''}`} />
                </button>

                {showAdvancedLog && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <span className="text-xs text-ink-muted">Extra</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          className="input-field"
                          placeholder="5"
                          value={entryForm.supportingValue}
                          onChange={(event) => setEntryForm({ ...entryForm, supportingValue: event.target.value })}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-ink-muted">Unit</span>
                        <input
                          className="input-field"
                          placeholder="reps"
                          value={entryForm.supportingUnit}
                          onChange={(event) => setEntryForm({ ...entryForm, supportingUnit: event.target.value })}
                        />
                      </label>
                    </div>
                    <label className="space-y-1">
                      <span className="text-xs text-ink-muted">Notes</span>
                      <input
                        className="input-field"
                        placeholder="Optional"
                        value={entryForm.notes}
                        onChange={(event) => setEntryForm({ ...entryForm, notes: event.target.value })}
                      />
                    </label>
                  </div>
                )}

                <button
                  className="btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!isValidEntryForm(entryForm)}
                  onClick={submitEntry}
                >
                  <Plus className="h-4 w-4" />
                  Add Result
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">History</h2>
              <span className="text-xs text-ink-muted">Latest first</span>
            </div>
            {selected.entries.length === 0 ? (
              <div className="rounded-lg border border-line/80 bg-sunken/20 p-4 text-sm text-ink-muted">
                No entries yet.
              </div>
            ) : (
              <div className="divide-y divide-card/90 overflow-hidden rounded-lg border border-line/80 bg-sunken/20">
                {[...selected.entries].reverse().map((entry) => (
                  <div key={entry.id} className="p-3">
                    {editingEntryId === entry.id ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[9rem_1fr_1fr_1fr_1.3fr]">
                          <input
                            type="date"
                            aria-label="Edit achievement entry date"
                            className="input-field"
                            value={editEntryForm.date}
                            onChange={(event) => setEditEntryForm({ ...editEntryForm, date: event.target.value })}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            className="input-field"
                            value={editEntryForm.value}
                            onChange={(event) => setEditEntryForm({ ...editEntryForm, value: event.target.value })}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            className="input-field"
                            placeholder="Extra"
                            value={editEntryForm.supportingValue}
                            onChange={(event) => setEditEntryForm({ ...editEntryForm, supportingValue: event.target.value })}
                          />
                          <input
                            className="input-field"
                            placeholder="Unit"
                            value={editEntryForm.supportingUnit}
                            onChange={(event) => setEditEntryForm({ ...editEntryForm, supportingUnit: event.target.value })}
                          />
                          <input
                            className="input-field"
                            placeholder="Notes"
                            value={editEntryForm.notes}
                            onChange={(event) => setEditEntryForm({ ...editEntryForm, notes: event.target.value })}
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            aria-label={`Save ${selected.definition.name} result from ${formatDateLabel(entry.date)}`}
                            onClick={submitEntryEdit}
                            disabled={!isValidEntryForm(editEntryForm)}
                            className="flex h-10 w-10 items-center justify-center rounded-lg text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-40"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            aria-label={`Cancel editing ${selected.definition.name} result from ${formatDateLabel(entry.date)}`}
                            onClick={() => setEditingEntryId(null)}
                            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-card/70"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-lg font-semibold text-ink">{formatEntryValue(entry, selected.definition.unit)}</p>
                          <p className="truncate text-sm text-ink-muted">
                            {formatDateLabel(entry.date)}{entry.notes ? ` · ${entry.notes}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            aria-label={`Edit ${selected.definition.name} result from ${formatDateLabel(entry.date)}`}
                            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-card/70 hover:text-cyan-300"
                            onClick={() => {
                              setEditingEntryId(entry.id)
                              setEditEntryForm(entryToForm(entry))
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            aria-label={`Delete ${selected.definition.name} result from ${formatDateLabel(entry.date)}`}
                            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-red-500/10 hover:text-red-400"
                            onClick={() => deleteEntry(entry.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
