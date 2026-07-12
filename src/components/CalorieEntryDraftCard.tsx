import type { ReactNode } from 'react'
import { CheckCircle2, Clock, Flame, Pencil, Scale } from 'lucide-react'

export type CalorieEntryDraftValue = {
  date?: string | null
  time?: string | null
  name: string
  calories: number | string
  protein?: number | string | null
  carbs?: number | string | null
  fat?: number | string | null
  quantity?: string | null
}

type CalorieEntryDraftCardProps = {
  entries: CalorieEntryDraftValue[]
  editable?: boolean
  statusLabel?: string
  statusTone?: 'pending' | 'confirmed' | 'canceled' | 'error'
  footer?: ReactNode
  onChange?: (index: number, patch: Partial<CalorieEntryDraftValue>) => void
}

function statusClasses(tone: CalorieEntryDraftCardProps['statusTone']) {
  switch (tone) {
    case 'confirmed': return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
    case 'canceled': return 'border-line bg-page/70 text-ink-soft'
    case 'error': return 'border-red-500/35 bg-red-500/10 text-red-100'
    default: return 'border-amber-500/30 bg-amber-500/10 text-amber-100'
  }
}

function fieldValue(value: unknown) {
  return value == null ? '' : String(value)
}

function macroLabel(label: string, value: unknown) {
  const text = fieldValue(value)
  return text ? `${label} ${text}g` : `${label} -`
}

function inputClass() {
  return 'h-9 min-w-0 rounded-md border border-line bg-sunken px-2.5 text-sm text-ink outline-none transition-colors focus:border-cyan-500'
}

function StatPill({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium ${
      accent
        ? 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200'
        : 'border-gray-500/30 bg-gray-500/15 text-gray-200'
    }`}>
      {children}
    </span>
  )
}

export default function CalorieEntryDraftCard({
  entries,
  editable = false,
  statusLabel,
  statusTone = 'pending',
  footer,
  onChange,
}: CalorieEntryDraftCardProps) {
  const canEdit = editable && Boolean(onChange)
  const safeEntries = entries.length > 0 ? entries : []
  const totalCalories = safeEntries.reduce((sum, entry) => {
    const calories = Number(entry.calories)
    return sum + (Number.isFinite(calories) ? calories : 0)
  }, 0)

  return (
    <div className="box-border w-full max-w-full overflow-hidden rounded-xl border border-cyan-500/25 bg-sunken/55 p-3 shadow-lg shadow-black/15 sm:p-4">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-md ${
            statusTone === 'confirmed' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-cyan-500/15 text-cyan-200'
          }`}>
            {statusTone === 'confirmed' ? <CheckCircle2 className="h-4 w-4" /> : <Flame className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {safeEntries.length === 1 ? 'Calorie entry' : `${safeEntries.length} Calorie entries`}
            </p>
            <p className="text-xs text-ink-muted">{totalCalories} cal total</p>
          </div>
        </div>
        {!canEdit && (
          <span className="inline-flex flex-none items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2 py-1 text-[11px] font-medium text-cyan-200">
            <Pencil className="h-3 w-3" />
            <span className="hidden sm:inline">Preview</span>
          </span>
        )}
      </div>

      {statusLabel && (
        <div className={`mb-3 max-w-full overflow-hidden text-ellipsis rounded-md border px-3 py-2 text-xs ${statusClasses(statusTone)}`}>
          {statusLabel}
        </div>
      )}

      <div className="space-y-3">
        {safeEntries.map((entry, index) => (
          <div key={index} className="rounded-lg border border-card bg-page/45 p-3">
            {canEdit ? (
              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-ink-muted sm:col-span-2">
                  <span>Name</span>
                  <input
                    className={inputClass()}
                    value={fieldValue(entry.name)}
                    dir="auto"
                    onChange={(event) => onChange?.(index, { name: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-ink-muted">
                  <span>Calories for quantity</span>
                  <input className={inputClass()} type="number" value={fieldValue(entry.calories)} onChange={(event) => onChange?.(index, { calories: event.target.value })} />
                </label>
                <label className="grid gap-1 text-xs font-medium text-ink-muted">
                  <span>Quantity</span>
                  <input className={inputClass()} value={fieldValue(entry.quantity)} onChange={(event) => onChange?.(index, { quantity: event.target.value })} />
                </label>
                <label className="grid gap-1 text-xs font-medium text-ink-muted">
                  <span>Protein for quantity</span>
                  <input className={inputClass()} type="number" value={fieldValue(entry.protein)} onChange={(event) => onChange?.(index, { protein: event.target.value })} />
                </label>
                <label className="grid gap-1 text-xs font-medium text-ink-muted">
                  <span>Carbs for quantity</span>
                  <input className={inputClass()} type="number" value={fieldValue(entry.carbs)} onChange={(event) => onChange?.(index, { carbs: event.target.value })} />
                </label>
                <label className="grid gap-1 text-xs font-medium text-ink-muted">
                  <span>Fat for quantity</span>
                  <input className={inputClass()} type="number" value={fieldValue(entry.fat)} onChange={(event) => onChange?.(index, { fat: event.target.value })} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs font-medium text-ink-muted">
                    <span>Date</span>
                    <input className={inputClass()} type="date" value={fieldValue(entry.date)} onChange={(event) => onChange?.(index, { date: event.target.value })} />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-ink-muted">
                    <span>Time</span>
                    <input className={inputClass()} type="time" value={fieldValue(entry.time)} onChange={(event) => onChange?.(index, { time: event.target.value })} />
                  </label>
                </div>
              </div>
            ) : (
              <>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="break-words text-base font-semibold text-ink" dir="auto">{entry.name}</h4>
                    {entry.quantity && <p className="mt-1 break-words text-xs text-ink-muted" dir="auto">{entry.quantity}</p>}
                  </div>
                  <StatPill accent><Flame className="h-3 w-3" />{entry.calories} cal</StatPill>
                </div>
                <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                  <StatPill><Scale className="h-3 w-3" />{macroLabel('P', entry.protein)}</StatPill>
                  <StatPill>{macroLabel('C', entry.carbs)}</StatPill>
                  <StatPill>{macroLabel('F', entry.fat)}</StatPill>
                  {(entry.date || entry.time) && (
                    <StatPill><Clock className="h-3 w-3" />{[entry.date, entry.time].filter(Boolean).join(' ')}</StatPill>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-ink-muted">Nutrition numbers are totals for the shown quantity.</p>

      {footer && <div className="mt-4 flex flex-wrap items-center gap-2">{footer}</div>}
    </div>
  )
}
