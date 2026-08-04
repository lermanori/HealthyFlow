import { useEffect, useRef, useState } from 'react'
import { addDays, format } from 'date-fns'
import { Dumbbell, Flame, Pencil, Scale, Target, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { AssistantPendingAction } from '../services/api'
import CalorieEntryDraftCard, { type CalorieEntryDraftValue } from './CalorieEntryDraftCard'
import TaskDraftCard, { type TaskDraftCardValue } from './TaskDraftCard'
import { CATEGORY_IDS } from '../categoryPresentation'

export type PendingActionView = AssistantPendingAction & {
  status?: 'pending' | 'confirmed' | 'canceled'
  result?: unknown
  error?: string
  completedAt?: string
  retry?: 'confirm' | 'prepare' | 'cancel'
}

type PendingActionCardProps = {
  action: PendingActionView
  onConfirm: (actionId: string, args?: Record<string, unknown>) => void
  onCancel: (actionId: string) => void
  onRetry?: () => void
  confirmLabel?: string
  cancelLabel?: string
  pendingStatusLabel?: string
  isBusy?: boolean
}

const categories = CATEGORY_IDS

function compactToolName(name: string) {
  return name.replace(/_/g, ' ')
}

function shortValue(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function summarizeResult(result: unknown) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return shortValue(result)
  const value = result as Record<string, unknown>
  const entry = value.entry && typeof value.entry === 'object' ? value.entry as Record<string, unknown> : null
  const item = value.item && typeof value.item === 'object' ? value.item as Record<string, unknown> : null
  const session = value.session && typeof value.session === 'object' ? value.session as Record<string, unknown> : null
  if (Array.isArray(value.entries)) return `${value.entries.length} Calorie entries created`
  if (entry?.name) return `Entry: ${entry.name}`
  if (item?.title) return `Item: ${item.title}`
  if (session?.title) return `Workout session: ${session.title}`
  if (value.deleted) return 'Item deleted'
  return 'Action completed'
}

function fieldValue(value: unknown) {
  return value == null ? '' : String(value)
}

function numberOrUndefined(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return undefined
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

function nullableNumber(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function nullableText(value: unknown) {
  const text = String(value ?? '').trim()
  return text ? text : null
}

function optionalText(value: unknown) {
  const text = String(value ?? '').trim()
  return text ? text : undefined
}

function arrayValue(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : []
}

function hasField(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function labelForCapability(capability: string) {
  return compactToolName(capability).replace(/\b\w/g, (char) => char.toUpperCase())
}

function iconForCapability(capability: string) {
  if (capability.includes('calorie')) return <Flame className="h-4 w-4" />
  if (capability.includes('weight')) return <Scale className="h-4 w-4" />
  if (capability.includes('achievement')) return <Target className="h-4 w-4" />
  if (capability.includes('workout')) return <Dumbbell className="h-4 w-4" />
  if (capability.includes('delete')) return <Trash2 className="h-4 w-4" />
  return <Pencil className="h-4 w-4" />
}

function inputClass() {
  return 'h-11 rounded-md border border-line bg-sunken px-3 text-sm text-ink outline-none transition-colors focus:border-accent'
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: unknown
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-ink-muted">
      <span>{label}</span>
      <input className={inputClass()} type={type} value={fieldValue(value)} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: unknown
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-ink-muted">
      <span>{label}</span>
      <select className={inputClass()} value={fieldValue(value)} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function buildEditedArgs(action: AssistantPendingAction, draft: Record<string, unknown>) {
  const base = { ...(action.args ?? {}) }
  switch (action.capability) {
    case 'add_task':
      return {
        ...base,
        title: String(draft.title ?? '').trim(),
        category: draft.category,
        duration: numberOrUndefined(draft.duration),
        startTime: optionalText(draft.startTime) ?? null,
        scheduledDate: optionalText(draft.scheduledDate),
      }
    case 'add_habit':
      return {
        ...base,
        title: String(draft.title ?? '').trim(),
        category: draft.category,
        duration: numberOrUndefined(draft.duration),
        startTime: optionalText(draft.startTime) ?? null,
        repeat: draft.repeat,
      }
    case 'add_calorie_entry':
      return {
        ...base,
        date: optionalText(draft.date),
        time: optionalText(draft.time) ?? null,
        name: String(draft.name ?? '').trim(),
        calories: numberOrUndefined(draft.calories),
        protein: nullableNumber(draft.protein),
        carbs: nullableNumber(draft.carbs),
        fat: nullableNumber(draft.fat),
        quantity: nullableText(draft.quantity),
      }
    case 'add_calorie_entries':
      return {
        ...base,
        entries: arrayValue(draft.entries).map((entry) => ({
          date: optionalText(entry.date),
          time: optionalText(entry.time) ?? null,
          name: String(entry.name ?? '').trim(),
          calories: numberOrUndefined(entry.calories),
          protein: nullableNumber(entry.protein),
          carbs: nullableNumber(entry.carbs),
          fat: nullableNumber(entry.fat),
          quantity: nullableText(entry.quantity),
        })),
      }
    case 'add_weight_entry':
      return {
        ...base,
        date: optionalText(draft.date),
        weightKg: numberOrUndefined(draft.weightKg),
      }
    case 'add_achievement_entry':
      return {
        ...base,
        date: optionalText(draft.date),
        value: numberOrUndefined(draft.value),
        supportingValue: nullableNumber(draft.supportingValue),
        supportingUnit: nullableText(draft.supportingUnit),
        notes: nullableText(draft.notes),
      }
    case 'add_workout_session':
      return {
        ...base,
        date: optionalText(draft.date),
        title: nullableText(draft.title),
        notes: nullableText(draft.notes),
        exercises: typeof draft.exercises === 'string' ? JSON.parse(draft.exercises) : base.exercises,
      }
    case 'create_focus_block':
      return {
        ...base,
        scheduledDate: optionalText(draft.scheduledDate),
        startTime: optionalText(draft.startTime),
        plannedMinutes: numberOrUndefined(draft.plannedMinutes),
        intendedOutcome: String(draft.intendedOutcome ?? '').trim(),
        intendedEvidence: String(draft.intendedEvidence ?? '').trim(),
        transitionMinutes: nullableNumber(draft.transitionMinutes),
        breakMinutes: nullableNumber(draft.breakMinutes),
      }
    case 'update_item': {
      const edited = { ...base }
      if (hasField(draft, 'title')) edited.title = optionalText(draft.title)
      if (hasField(draft, 'category')) edited.category = optionalText(draft.category)
      if (hasField(draft, 'duration')) edited.duration = numberOrUndefined(draft.duration)
      if (hasField(draft, 'startTime')) edited.startTime = optionalText(draft.startTime) ?? null
      if (hasField(draft, 'scheduledDate')) edited.scheduledDate = optionalText(draft.scheduledDate)
      if (hasField(draft, 'position')) edited.position = nullableNumber(draft.position)
      return edited
    }
    case 'delete_item':
      return { ...base, deleteScope: draft.deleteScope }
    default:
      return base
  }
}

function taskDraftValueFromPendingAction(action: AssistantPendingAction, draft: Record<string, unknown>): TaskDraftCardValue {
  const isHabit = action.capability === 'add_habit'
  return {
    title: fieldValue(draft.title),
    category: fieldValue(draft.category || 'personal'),
    duration: fieldValue(draft.duration),
    priority: typeof draft.priority === 'string' ? draft.priority : undefined,
    type: isHabit ? 'habit' : 'task',
    startTime: fieldValue(draft.startTime),
    scheduledDate: fieldValue(draft.scheduledDate || format(new Date(), 'yyyy-MM-dd')),
    repeat: isHabit ? fieldValue(draft.repeat || 'daily') : undefined,
  }
}

function taskDraftValueFromRecord(value: Record<string, unknown>): TaskDraftCardValue {
  return {
    title: String(value.title ?? ''),
    category: fieldValue(value.category || 'personal'),
    duration: fieldValue(value.duration ?? ''),
    type: value.type === 'habit' ? 'habit' : 'task',
    startTime: optionalText(value.startTime) ?? null,
    scheduledDate: optionalText(value.scheduledDate),
    repeat: value.repeat ? fieldValue(value.repeat) : undefined,
  }
}

type ActionItemPayload = { item?: Record<string, unknown> & { title?: string } }
type ActionEntriesPayload = { entries?: unknown; entry?: unknown }

function taskItemFromAction(action: PendingActionView): Record<string, unknown> | null {
  const result = action.result as ActionItemPayload | undefined
  if ((action.status === 'confirmed' || action.status === 'canceled') && result?.item) return result.item
  const preview = action.preview as ActionItemPayload | undefined
  if (preview?.item) return preview.item
  return null
}

function updateItemDraftValue(action: PendingActionView, draft: Record<string, unknown>) {
  const item = taskItemFromAction(action)
  return item ? taskDraftValueFromRecord({ ...item, ...draft }) : null
}

function deleteItemTitle(action: PendingActionView): string | null {
  const preview = action.preview as ActionItemPayload | undefined
  return preview?.item?.title ?? null
}

function taskDraftPatchToPendingDraft(patch: Partial<TaskDraftCardValue>) {
  const next: Record<string, unknown> = {}
  if (patch.title !== undefined) next.title = patch.title
  if (patch.category !== undefined) next.category = patch.category
  if (patch.duration !== undefined) next.duration = patch.duration
  if (patch.startTime !== undefined) next.startTime = patch.startTime
  if (patch.scheduledDate !== undefined) next.scheduledDate = patch.scheduledDate
  if (patch.repeat !== undefined) next.repeat = patch.repeat
  return next
}

function assistantQuickDates() {
  return [
    { label: 'Today', value: format(new Date(), 'yyyy-MM-dd') },
    { label: 'Tomorrow', value: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
    { label: 'Next Week', value: format(addDays(new Date(), 7), 'yyyy-MM-dd') },
  ]
}

function pendingStatusTone(action: PendingActionView): 'pending' | 'confirmed' | 'canceled' | 'error' {
  if (action.error) return 'error'
  return action.status ?? 'pending'
}

function statusToneClasses(tone: 'pending' | 'confirmed' | 'canceled' | 'error') {
  switch (tone) {
    case 'confirmed': return 'border-state-success/30 bg-state-success/10 text-state-success'
    case 'canceled': return 'border-line bg-page/70 text-ink-soft'
    case 'error': return 'border-state-danger/35 bg-state-danger/10 text-state-danger'
    default: return 'border-state-warning/30 bg-state-warning/10 text-state-warning'
  }
}

function calorieEntryFromRecord(value: Record<string, unknown>): CalorieEntryDraftValue {
  return {
    date: optionalText(value.date) ?? null,
    time: optionalText(value.time) ?? null,
    name: String(value.name ?? '').trim(),
    calories: fieldValue(value.calories),
    protein: value.protein == null ? null : fieldValue(value.protein),
    carbs: value.carbs == null ? null : fieldValue(value.carbs),
    fat: value.fat == null ? null : fieldValue(value.fat),
    quantity: nullableText(value.quantity),
  }
}

function calorieDraftsFromPendingAction(action: PendingActionView, draft: Record<string, unknown>): CalorieEntryDraftValue[] {
  const result = action.result as ActionEntriesPayload | undefined
  if ((action.status === 'confirmed' || action.status === 'canceled') && result) {
    if (Array.isArray(result.entries)) return result.entries.map((entry: Record<string, unknown>) => calorieEntryFromRecord(entry))
    if (result.entry && typeof result.entry === 'object') return [calorieEntryFromRecord(result.entry as Record<string, unknown>)]
  }

  if (action.capability === 'add_calorie_entries') {
    return arrayValue(draft.entries).map(calorieEntryFromRecord)
  }

  return [calorieEntryFromRecord(draft)]
}

export default function PendingActionCard({
  action,
  onConfirm,
  onCancel,
  onRetry,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  pendingStatusLabel = 'Waiting for confirmation',
  isBusy = false,
}: PendingActionCardProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({
    ...(action.args ?? {}),
    exercises: action.capability === 'add_workout_session'
      ? JSON.stringify(action.args?.exercises ?? [], null, 2)
      : action.args?.exercises,
  }))
  const [isEditing, setIsEditing] = useState(true)
  const statusRef = useRef<HTMLDivElement>(null)
  const previousStateRef = useRef(`${action.status ?? 'pending'}:${action.error ?? ''}`)

  useEffect(() => {
    const nextState = `${action.status ?? 'pending'}:${action.error ?? ''}`
    if (previousStateRef.current !== nextState) {
      previousStateRef.current = nextState
      requestAnimationFrame(() => statusRef.current?.focus())
    }
  }, [action.error, action.status])

  const setField = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }))
  const setEntryField = (index: number, key: string, value: unknown) => {
    setDraft((current) => {
      const entries = arrayValue(current.entries).map((entry) => ({ ...entry }))
      entries[index] = { ...(entries[index] ?? {}), [key]: value }
      return { ...current, entries }
    })
  }
  const confirm = () => {
    if (action.retry === 'cancel') {
      onCancel(action.id)
      return
    }
    if (action.retry === 'prepare' && onRetry) {
      onRetry()
      return
    }
    try {
      onConfirm(action.id, buildEditedArgs(action, draft))
    } catch {
      toast.error('Could not read edited preview fields')
    }
  }

  const status = action.status ?? 'pending'
  const isPending = status === 'pending'
  const statusLabel = action.error
    ? action.error
    : status === 'confirmed'
      ? `Completed: ${summarizeResult(action.result)}`
      : status === 'canceled'
        ? 'Canceled'
        : pendingStatusLabel
  const updateDraftValue = updateItemDraftValue(action, draft)

  return (
    <div
      ref={statusRef}
      tabIndex={-1}
      aria-live="polite"
      className={`mt-3 box-border w-full max-w-full overflow-hidden rounded-lg border bg-sunken p-3 shadow-lg shadow-black/20 outline-none sm:p-4 ${
        action.error
          ? 'border-state-danger/50'
          : status === 'confirmed'
            ? 'border-state-success/50'
            : status === 'canceled'
              ? 'border-line'
              : 'border-state-warning/40'
      }`}
    >
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <div className={`flex min-w-0 items-center gap-2 text-sm font-semibold ${
          action.error
            ? 'text-state-danger'
            : status === 'confirmed'
              ? 'text-state-success'
              : status === 'canceled'
                ? 'text-ink-soft'
                : 'text-state-warning'
        }`}>
          <span className={`flex h-8 w-8 items-center justify-center rounded-md ${
            action.error
              ? 'bg-state-danger/15 text-state-danger'
              : status === 'confirmed'
                ? 'bg-state-success/15 text-state-success'
                : status === 'canceled'
                  ? 'bg-card text-ink-soft'
                  : 'bg-state-warning/15 text-state-warning'
          }`}>
            {iconForCapability(action.capability)}
          </span>
          <span className="min-w-0 truncate">{labelForCapability(action.capability)}</span>
        </div>
        {isPending && (
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-xs text-ink-soft hover:border-accent hover:text-accent"
            onClick={() => setIsEditing((value) => !value)}
          >
            {isEditing ? 'Preview' : 'Edit'}
          </button>
        )}
      </div>

      {(
        !['add_task', 'add_habit', 'add_calorie_entry', 'add_calorie_entries', 'complete_task', 'update_item', 'delete_item'].includes(action.capability)
        || (isEditing && ['update_item', 'delete_item'].includes(action.capability))
      ) && (
        <div className={`mb-3 rounded-md border px-3 py-2 text-xs ${statusToneClasses(pendingStatusTone(action))}`}>
          {statusLabel}
        </div>
      )}

      {isEditing && isPending ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {action.capability === 'add_task' && (
            <div className="min-w-0 sm:col-span-2">
              <TaskDraftCard
                value={taskDraftValueFromPendingAction(action, draft)}
                editable
                statusLabel={statusLabel}
                statusTone={pendingStatusTone(action)}
                quickDates={assistantQuickDates()}
                onChange={(patch) => setDraft((current) => ({ ...current, ...taskDraftPatchToPendingDraft(patch) }))}
              />
            </div>
          )}
          {action.capability === 'add_habit' && (
            <div className="min-w-0 sm:col-span-2">
              <TaskDraftCard
                value={taskDraftValueFromPendingAction(action, draft)}
                editable
                statusLabel={statusLabel}
                statusTone={pendingStatusTone(action)}
                onChange={(patch) => setDraft((current) => ({ ...current, ...taskDraftPatchToPendingDraft(patch) }))}
              />
            </div>
          )}
          {action.capability === 'add_calorie_entry' && (
            <div className="min-w-0 sm:col-span-2">
              <CalorieEntryDraftCard
                entries={calorieDraftsFromPendingAction(action, draft)}
                editable
                statusLabel={statusLabel}
                statusTone={pendingStatusTone(action)}
                onChange={(_index, patch) => setDraft((current) => ({ ...current, ...patch }))}
              />
            </div>
          )}
          {action.capability === 'add_calorie_entries' && (
            <div className="min-w-0 sm:col-span-2">
              <CalorieEntryDraftCard
                entries={calorieDraftsFromPendingAction(action, draft)}
                editable
                statusLabel={statusLabel}
                statusTone={pendingStatusTone(action)}
                onChange={(index, patch) => {
                  Object.entries(patch).forEach(([key, value]) => setEntryField(index, key, value))
                }}
              />
            </div>
          )}
          {action.capability === 'add_weight_entry' && (
            <>
              <TextField label="Date" value={draft.date} type="date" onChange={(value) => setField('date', value)} />
              <TextField label="Weight kg" value={draft.weightKg} type="number" onChange={(value) => setField('weightKg', value)} />
            </>
          )}
          {action.capability === 'add_achievement_entry' && (
            <>
              <TextField label="Date" value={draft.date} type="date" onChange={(value) => setField('date', value)} />
              <TextField label="Value" value={draft.value} type="number" onChange={(value) => setField('value', value)} />
              <TextField label="Supporting value" value={draft.supportingValue} type="number" onChange={(value) => setField('supportingValue', value)} />
              <TextField label="Supporting unit" value={draft.supportingUnit} onChange={(value) => setField('supportingUnit', value)} />
              <TextField label="Notes" value={draft.notes} onChange={(value) => setField('notes', value)} />
            </>
          )}
          {action.capability === 'add_workout_session' && (
            <>
              <TextField label="Date" value={draft.date} type="date" onChange={(value) => setField('date', value)} />
              <TextField label="Title" value={draft.title} onChange={(value) => setField('title', value)} />
              <TextField label="Notes" value={draft.notes} onChange={(value) => setField('notes', value)} />
              <label className="grid gap-1 text-xs font-medium text-ink-muted sm:col-span-2">
                <span>Exercises JSON</span>
                <textarea className="min-h-28 rounded-md border border-line bg-sunken px-3 py-2 font-mono text-sm text-ink outline-none transition-colors focus:border-accent" value={fieldValue(draft.exercises)} onChange={(event) => setField('exercises', event.target.value)} />
              </label>
            </>
          )}
          {action.capability === 'create_focus_block' && (
            <>
              <TextField label="Date" value={draft.scheduledDate} type="date" onChange={(value) => setField('scheduledDate', value)} />
              <TextField label="Start time" value={draft.startTime} type="time" onChange={(value) => setField('startTime', value)} />
              <TextField label="Focused minutes" value={draft.plannedMinutes} type="number" onChange={(value) => setField('plannedMinutes', value)} />
              <TextField label="Transition minutes" value={draft.transitionMinutes} type="number" onChange={(value) => setField('transitionMinutes', value)} />
              <TextField label="Break minutes" value={draft.breakMinutes} type="number" onChange={(value) => setField('breakMinutes', value)} />
              <div className="hidden sm:block" />
              <div className="sm:col-span-2">
                <TextField label="Intended outcome" value={draft.intendedOutcome} onChange={(value) => setField('intendedOutcome', value)} />
              </div>
              <div className="sm:col-span-2">
                <TextField label="Observable evidence" value={draft.intendedEvidence} onChange={(value) => setField('intendedEvidence', value)} />
              </div>
            </>
          )}
          {action.capability === 'update_item' && (
            <>
              {hasField(draft, 'title') && <TextField label="Title" value={draft.title} onChange={(value) => setField('title', value)} />}
              {hasField(draft, 'category') && <SelectField label="Category" value={draft.category ?? 'personal'} options={categories} onChange={(value) => setField('category', value)} />}
              {hasField(draft, 'duration') && <TextField label="Duration" value={draft.duration} type="number" onChange={(value) => setField('duration', value)} />}
              {hasField(draft, 'startTime') && <TextField label="Start time" value={draft.startTime} type="time" onChange={(value) => setField('startTime', value)} />}
              {hasField(draft, 'scheduledDate') && <TextField label="Scheduled date" value={draft.scheduledDate} type="date" onChange={(value) => setField('scheduledDate', value)} />}
              {hasField(draft, 'position') && <TextField label="Anytime position" value={draft.position} type="number" onChange={(value) => setField('position', value)} />}
            </>
          )}
          {action.capability === 'complete_task' && taskItemFromAction(action) && (
            <div className="min-w-0 sm:col-span-2">
              <TaskDraftCard
                value={taskDraftValueFromRecord(taskItemFromAction(action)!)}
                statusLabel={statusLabel}
                statusTone={pendingStatusTone(action)}
              />
            </div>
          )}
          {action.capability === 'delete_item' && (
            <SelectField label="Delete scope" value={draft.deleteScope ?? 'instance'} options={['instance', 'habit']} onChange={(value) => setField('deleteScope', value)} />
          )}
          {!['add_task', 'add_habit', 'add_calorie_entry', 'add_calorie_entries', 'add_weight_entry', 'add_achievement_entry', 'add_workout_session', 'create_focus_block', 'update_item', 'delete_item', 'complete_task'].includes(action.capability) && (
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-card bg-sunken p-3 text-xs text-ink-soft sm:col-span-2">
              {JSON.stringify(action.preview, null, 2)}
            </pre>
          )}
        </div>
      ) : (
        ['add_task', 'add_habit'].includes(action.capability) ? (
          <TaskDraftCard
            value={taskDraftValueFromPendingAction(action, draft)}
            statusLabel={statusLabel}
            statusTone={pendingStatusTone(action)}
          />
        ) : ['add_calorie_entry', 'add_calorie_entries'].includes(action.capability) ? (
          <CalorieEntryDraftCard
            entries={calorieDraftsFromPendingAction(action, draft)}
            statusLabel={statusLabel}
            statusTone={pendingStatusTone(action)}
          />
        ) : ['complete_task', 'update_item'].includes(action.capability) && updateDraftValue ? (
          <TaskDraftCard
            value={updateDraftValue}
            statusLabel={statusLabel}
            statusTone={pendingStatusTone(action)}
          />
        ) : action.capability === 'delete_item' ? (
          <div className={`rounded-md border px-3 py-2 text-xs ${statusToneClasses(pendingStatusTone(action))}`}>
            {statusLabel}
            {deleteItemTitle(action) && <span className="ml-1 font-medium">{deleteItemTitle(action)}</span>}
          </div>
        ) : (
          <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-card bg-sunken p-3 text-xs text-ink-soft">
            {JSON.stringify(status === 'confirmed' ? { args: action.args, result: action.result } : buildEditedArgs(action, draft), null, 2)}
          </pre>
        )
      )}

      {isPending && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary min-h-11 px-3 py-2 text-sm disabled:cursor-wait disabled:opacity-60"
            onClick={confirm}
            disabled={isBusy}
          >
            {isBusy
              ? 'Working…'
              : action.retry === 'cancel'
                ? 'Try dismissing again'
              : action.retry === 'prepare'
                ? 'Prepare again'
                : action.error
                  ? 'Try Again'
                  : confirmLabel}
          </button>
          <button
            type="button"
            className="btn-secondary min-h-11 px-3 py-2 text-sm disabled:cursor-wait disabled:opacity-60"
            onClick={() => onCancel(action.id)}
            disabled={isBusy}
          >
            {cancelLabel}
          </button>
        </div>
      )}
    </div>
  )
}
