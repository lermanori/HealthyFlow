import { GOAL_MODULES, type GoalModule } from '../../../backend/src/goals-schema'
import { TALK_STYLE_PRESETS, type DaySetupAnswers, type TalkStyleId } from '../../interview'
import { WORK_ENABLED } from '../../featureFlags'

type StepProps<K extends keyof DaySetupAnswers> = {
  value: DaySetupAnswers[K]
  onChange: (value: DaySetupAnswers[K]) => void
}

export function NameStep({ value, onChange }: StepProps<'preferredName'>) {
  return (
    <input
      type="text"
      autoFocus
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
      placeholder="Your name"
      className="input-field min-h-11 w-full"
    />
  )
}

export function WindowStep({
  startTime, endTime, onChange,
}: {
  startTime: string
  endTime: string
  onChange: (patch: { startTime?: string; endTime?: string }) => void
}) {
  const invalid = startTime >= endTime
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1.5 text-sm text-ink-muted">
        Day starts
        <input
          type="time"
          value={startTime}
          onChange={(event) => onChange({ startTime: event.target.value })}
          className="input-field min-h-11"
        />
      </label>
      <label className="grid gap-1.5 text-sm text-ink-muted">
        Day ends
        <input
          type="time"
          value={endTime}
          onChange={(event) => onChange({ endTime: event.target.value })}
          className="input-field min-h-11"
        />
      </label>
      <p className="text-xs text-ink-muted sm:col-span-2">
        {invalid
          ? 'End time must be after start time.'
          : 'This is the window Capacity measures against. It never guesses one for you.'}
      </p>
    </div>
  )
}

const MODULE_CHOICES = [
  { key: 'calorieIntake', label: 'Food', hint: 'Calorie entries and macros' },
  { key: 'workoutTracker', label: 'Training', hint: 'Workout sessions and plans' },
  { key: 'achievementTracker', label: 'Weight & progress', hint: 'Measurements over time' },
] as const

export function ModulesStep({ value, onChange }: StepProps<'modules'>) {
  return (
    <div className="grid gap-2">
      {MODULE_CHOICES.map(({ key, label, hint }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange({ ...value, [key]: !value[key] })}
          aria-pressed={value[key]}
          className={`flex min-h-11 items-center justify-between rounded-lg border p-3 text-left ${
            value[key] ? 'border-accent bg-accent/[.08]' : 'border-line/70 bg-sunken/25'
          }`}
        >
          <span>
            <span className="block text-sm font-semibold text-ink">{label}</span>
            <span className="block text-xs text-ink-muted">{hint}</span>
          </span>
        </button>
      ))}
      <p className="text-xs text-ink-muted">
        You can turn any of these on later in Settings — nothing is removed.
      </p>
    </div>
  )
}

export function TalkStyleStep({ value, onChange }: StepProps<'talkStyle'>) {
  return (
    <div className="grid gap-2">
      {TALK_STYLE_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onChange(preset.id as TalkStyleId)}
          aria-pressed={value === preset.id}
          className={`min-h-11 rounded-lg border p-3 text-left text-sm font-semibold ${
            value === preset.id ? 'border-accent bg-accent/[.08] text-ink' : 'border-line/70 bg-sunken/25 text-ink-soft'
          }`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
}

const HABIT_CHIPS = ['Walk', 'Stretch', 'Read', 'Drink water', 'Journal']

export function HabitsStep({ value, onChange }: StepProps<'habits'>) {
  const setRow = (index: number, patch: Partial<DaySetupAnswers['habits'][number]>) =>
    onChange(value.map((row, position) => (position === index ? { ...row, ...patch } : row)))

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {HABIT_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onChange([...value, { title: chip, startTime: null }])}
            className="min-h-11 rounded-full border border-line/70 px-3 text-sm text-ink-soft hover:bg-card"
          >
            + {chip}
          </button>
        ))}
      </div>

      {value.map((row, index) => (
        <div key={index} className="flex gap-2">
          <input
            type="text"
            value={row.title}
            onChange={(event) => setRow(index, { title: event.target.value })}
            placeholder="Habit"
            className="input-field min-h-11 flex-1"
          />
          <input
            type="time"
            value={row.startTime ?? ''}
            onChange={(event) => setRow(index, { startTime: event.target.value || null })}
            className="input-field min-h-11 w-32"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, position) => position !== index))}
            className="min-h-11 px-3 text-sm text-ink-muted hover:text-ink"
            aria-label={`Remove ${row.title || 'habit'}`}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, { title: '', startTime: null }])}
        className="min-h-11 rounded-lg border border-line/70 text-sm text-ink-soft hover:bg-card"
      >
        Add another
      </button>

      <p className="text-xs text-ink-muted">
        These become daily Habits. A Habit appears on every day until you complete or
        move it — it is not a task sitting on tomorrow.
      </p>
    </div>
  )
}

export function GoalsStep({ value, onChange }: StepProps<'goals'>) {
  const modules = GOAL_MODULES.filter((module) => WORK_ENABLED || module.id !== 'work')
  const setRow = (index: number, patch: Partial<DaySetupAnswers['goals'][number]>) =>
    onChange(value.map((row, position) => (position === index ? { ...row, ...patch } : row)))

  return (
    <div className="grid gap-3">
      {value.map((row, index) => (
        <div key={index} className="grid gap-2 rounded-lg border border-line/70 p-3">
          <select
            value={row.module}
            onChange={(event) => setRow(index, { module: event.target.value as GoalModule })}
            className="input-field min-h-11"
          >
            {modules.map((module) => (
              <option key={module.id} value={module.id}>{module.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={row.statement}
            onChange={(event) => setRow(index, { statement: event.target.value })}
            placeholder="What are you trying to get to?"
            maxLength={500}
            className="input-field min-h-11"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, position) => position !== index))}
            className="justify-self-start text-sm text-ink-muted hover:text-ink"
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, { module: 'whole_day', statement: '' }])}
        className="min-h-11 rounded-lg border border-line/70 text-sm text-ink-soft hover:bg-card"
      >
        Add a Goal
      </button>
    </div>
  )
}

export function DayContextStep({ value, onChange }: StepProps<'dayContext'>) {
  return (
    <div className="grid gap-2">
      <textarea
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        maxLength={2000}
        rows={6}
        placeholder="Constraints, background, anything that shapes a normal day for you."
        className="input-field w-full"
      />
      <p className="text-xs text-ink-muted">
        HealthyFlow reads this when it helps you plan. You can edit or delete it any
        time in Settings → Personal assistant.
      </p>
    </div>
  )
}
