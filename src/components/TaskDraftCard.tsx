import type { ReactNode, SyntheticEvent } from 'react'
import { Calendar, Check, Clock, Pencil, Repeat, Timer, Volume2 } from 'lucide-react'
import { format, addDays } from 'date-fns'

export type TaskDraftCardValue = {
  title: string
  category: string
  duration: number | string
  priority?: 'high' | 'medium' | 'low' | string
  type: 'task' | 'habit' | string
  startTime?: string | null
  scheduledDate?: string
  repeat?: string
}

type QuickDate = {
  label: string
  value: string
}

type TaskDraftCardProps = {
  value: TaskDraftCardValue
  selected?: boolean
  selectable?: boolean
  editable?: boolean
  statusLabel?: string
  statusTone?: 'pending' | 'confirmed' | 'canceled' | 'error'
  quickDates?: QuickDate[]
  footer?: ReactNode
  onToggle?: () => void
  onChange?: (patch: Partial<TaskDraftCardValue>) => void
  onSpeakDetails?: () => void
}

const categories = ['health', 'work', 'personal', 'fitness', 'grocery', 'nutrition']
const priorities = ['high', 'medium', 'low']
const itemTypes = ['task', 'habit']
const repeatOptions = ['daily', 'weekly']

function getPriorityColor(priority?: string) {
  switch (priority) {
    case 'high': return 'text-red-300 bg-red-500/15 border-red-500/30'
    case 'medium': return 'text-yellow-200 bg-yellow-500/15 border-yellow-500/30'
    case 'low': return 'text-green-300 bg-green-500/15 border-green-500/30'
    default: return 'text-gray-300 bg-gray-500/15 border-gray-500/30'
  }
}

function getCategoryColor(category: string) {
  const colors: Record<string, string> = {
    health: 'bg-green-500/15 text-green-300 border-green-500/30',
    work: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    personal: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    fitness: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    grocery: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    nutrition: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  }
  return colors[category] ?? colors.personal
}

function getDateLabel(date?: string) {
  if (!date) return 'No date'
  const today = format(new Date(), 'yyyy-MM-dd')
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  if (date === today) return 'Today'
  if (date === tomorrow) return 'Tomorrow'
  return format(new Date(`${date}T00:00:00`), 'MMM d')
}

function getDateColor(date?: string) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  if (date === today) return 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30'
  if (date === tomorrow) return 'bg-blue-500/15 text-blue-200 border-blue-500/30'
  return 'bg-gray-500/15 text-gray-300 border-gray-500/30'
}

function statusClasses(tone: TaskDraftCardProps['statusTone']) {
  switch (tone) {
    case 'confirmed': return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
    case 'canceled': return 'border-line bg-page/70 text-ink-soft'
    case 'error': return 'border-red-500/35 bg-red-500/10 text-red-100'
    default: return 'border-amber-500/30 bg-amber-500/10 text-amber-100'
  }
}

function stopControlClick(event: SyntheticEvent) {
  event.stopPropagation()
}

function PillSelect({
  value,
  options,
  className,
  onChange,
  ariaLabel,
}: {
  value: string
  options: string[]
  className: string
  onChange?: (value: string) => void
  ariaLabel: string
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onClick={stopControlClick}
      onChange={(event) => onChange?.(event.target.value)}
      className={`h-8 max-w-full rounded-full border px-2.5 text-xs font-medium outline-none transition-colors focus:border-cyan-400 ${className}`}
    >
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  )
}

function PillInput({
  value,
  className,
  type = 'text',
  onChange,
  ariaLabel,
  suffix,
}: {
  value: string | number
  className: string
  type?: string
  onChange?: (value: string) => void
  ariaLabel: string
  suffix?: string
}) {
  return (
    <label className={`inline-flex h-8 max-w-full items-center gap-1 rounded-full border px-2.5 text-xs font-medium ${className}`} onClick={stopControlClick}>
      <input
        aria-label={ariaLabel}
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
        className="min-w-0 bg-transparent outline-none"
        style={{ width: type === 'number' ? '3.25rem' : type === 'date' ? '6.25rem' : '4.75rem' }}
      />
      {suffix && <span>{suffix}</span>}
    </label>
  )
}

export default function TaskDraftCard({
  value,
  selected = false,
  selectable = false,
  editable = false,
  statusLabel,
  statusTone = 'pending',
  quickDates = [],
  footer,
  onToggle,
  onChange,
  onSpeakDetails,
}: TaskDraftCardProps) {
  const update = (patch: Partial<TaskDraftCardValue>) => onChange?.(patch)
  const dateValue = value.scheduledDate ?? format(new Date(), 'yyyy-MM-dd')
  const canEdit = editable && Boolean(onChange)

  return (
    <div
      className={`task-suggestion box-border w-full max-w-full overflow-hidden rounded-xl border border-cyan-500/25 bg-sunken/55 p-3 shadow-lg shadow-black/15 transition-all sm:p-4 ${
        selectable ? 'cursor-pointer' : ''
      } ${selected ? 'ring-2 ring-cyan-400' : 'hover:border-cyan-400/45'}`}
      onClick={selectable ? onToggle : undefined}
    >
      <div className="flex min-w-0 items-start gap-3">
        {selectable && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggle?.()
            }}
            className={`mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 transition-all ${
              selected ? 'border-cyan-400 bg-cyan-500 text-white' : 'border-gray-500 hover:border-cyan-400'
            }`}
            aria-label={selected ? 'Deselect draft' : 'Select draft'}
          >
            {selected && <Check className="h-3.5 w-3.5" />}
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            {canEdit ? (
              <input
                value={value.title}
                onClick={stopControlClick}
                onChange={(event) => update({ title: event.target.value })}
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-base font-semibold text-ink outline-none transition-colors focus:border-cyan-500/60 focus:bg-page/60"
                dir="auto"
                aria-label="Draft title"
              />
            ) : (
              <h4 className="min-w-0 flex-1 break-words text-base font-semibold text-ink" dir="auto">{value.title}</h4>
            )}
            <span className="inline-flex flex-none items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2 py-1 text-[11px] font-medium text-cyan-200">
              <Pencil className="h-3 w-3" />
              <span className="hidden sm:inline">Draft</span>
            </span>
          </div>

          {statusLabel && (
            <div className={`mt-3 max-w-full overflow-hidden text-ellipsis rounded-md border px-3 py-2 text-xs ${statusClasses(statusTone)}`}>
              {statusLabel}
            </div>
          )}

          <div className="mt-3 flex min-w-0 max-w-full flex-wrap gap-2">
            {canEdit ? (
              <PillSelect
                value={value.category || 'personal'}
                options={categories}
                className={getCategoryColor(value.category || 'personal')}
                onChange={(category) => update({ category })}
                ariaLabel="Category"
              />
            ) : (
              <span className={`rounded-full border px-2.5 py-1.5 text-xs font-medium ${getCategoryColor(value.category)}`}>{value.category}</span>
            )}

            {value.priority && (canEdit ? (
              <PillSelect
                value={value.priority}
                options={priorities}
                className={getPriorityColor(value.priority)}
                onChange={(priority) => update({ priority })}
                ariaLabel="Priority"
              />
            ) : (
              <span className={`rounded-full border px-2.5 py-1.5 text-xs font-medium ${getPriorityColor(value.priority)}`}>{value.priority} priority</span>
            ))}

            {canEdit ? (
              <PillInput
                value={value.duration}
                type="number"
                className="border-gray-500/30 bg-gray-500/15 text-gray-200"
                onChange={(duration) => update({ duration })}
                ariaLabel="Duration"
                suffix="min"
              />
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-500/30 bg-gray-500/15 px-2.5 py-1.5 text-xs font-medium text-gray-200">
                <Timer className="h-3 w-3" />
                {value.duration}min
              </span>
            )}

            {canEdit ? (
              <PillSelect
                value={value.type || 'task'}
                options={itemTypes}
                className="border-purple-500/30 bg-purple-500/15 text-purple-200"
                onChange={(type) => update({ type })}
                ariaLabel="Type"
              />
            ) : (
              <span className="rounded-full border border-purple-500/30 bg-purple-500/15 px-2.5 py-1.5 text-xs font-medium text-purple-200">{value.type}</span>
            )}

            {value.type === 'habit' && (
              canEdit ? (
                <PillSelect
                  value={value.repeat || 'daily'}
                  options={repeatOptions}
                  className="border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                  onChange={(repeat) => update({ repeat })}
                  ariaLabel="Repeat"
                />
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-200">
                  <Repeat className="h-3 w-3" />
                  {value.repeat || 'daily'}
                </span>
              )
            )}

            {canEdit ? (
              <PillInput
                value={value.startTime ?? ''}
                type="time"
                className="border-blue-500/30 bg-blue-500/15 text-blue-200"
                onChange={(startTime) => update({ startTime })}
                ariaLabel="Start time"
              />
            ) : value.startTime ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/15 px-2.5 py-1.5 text-xs font-medium text-blue-200">
                <Clock className="h-3 w-3" />
                {value.startTime}
              </span>
            ) : null}

            {canEdit ? (
              <PillInput
                value={dateValue}
                type="date"
                className={getDateColor(dateValue)}
                onChange={(scheduledDate) => update({ scheduledDate })}
                ariaLabel="Scheduled date"
              />
            ) : (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium ${getDateColor(value.scheduledDate)}`}>
                <Calendar className="h-3 w-3" />
                {getDateLabel(value.scheduledDate)}
              </span>
            )}
          </div>

          {quickDates.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-ink-muted">Schedule for</p>
              <div className="flex min-w-0 flex-wrap gap-2">
                {quickDates.slice(0, 2).map((date) => (
                  <button
                    key={date.label}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      update({ scheduledDate: date.value })
                    }}
                    className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                      dateValue === date.value
                        ? 'border-cyan-400 bg-cyan-500 text-white'
                        : 'border-card bg-page/70 text-ink-soft hover:border-cyan-500/60 hover:text-cyan-200'
                    }`}
                  >
                    {date.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(footer || onSpeakDetails) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {onSpeakDetails && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onSpeakDetails()
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-card px-2.5 py-1.5 text-xs text-cyan-300 transition-colors hover:border-cyan-500/60 hover:text-cyan-100"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  Speak
                </button>
              )}
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
