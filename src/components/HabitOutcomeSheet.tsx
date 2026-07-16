import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Minus, Pencil, Plus, RotateCcw, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { HabitItem, HabitOutcome, HabitProgressDetail, HabitTargetUnit, taskService } from '../services/api'

const labels: Record<HabitOutcome, string> = { pending: 'Pending', partial: 'Partial', completed: 'Completed', failed: 'Not done' }
const quickAmounts: Record<HabitTargetUnit, number[]> = { minutes: [5, 10, 20], reps: [1, 5, 10], count: [1, 2, 5] }
const unitLabel = (unit: HabitTargetUnit, amount: number) => unit === 'minutes' ? 'min' : unit === 'count' ? (amount === 1 ? 'time' : 'times') : 'reps'

export default function HabitOutcomeSheet({ habit, date, onClose }: { habit: HabitItem; date: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const panelRef = useRef<HTMLDivElement>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const queryKey = ['habit-progress', habit.id, date]
  const { data, isLoading } = useQuery({ queryKey, queryFn: () => taskService.getHabitProgress(habit.id, date) })
  const detail: HabitProgressDetail = data ?? { habit, entries: [] }
  const info = detail.habit.habitInfo ?? { target: null, outcome: detail.habit.completed ? 'completed' : 'pending', progressTotal: 0 }
  const target = info.target
  const percent = target ? Math.min(100, Math.round((info.progressTotal / target.value) * 100)) : 0

  const refresh = (next: HabitProgressDetail) => {
    queryClient.setQueryData(queryKey, next)
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['habit-streaks'] })
  }
  const mutation = useMutation({
    mutationFn: async (action: { kind: 'add'; amount: number; note: string | null } | { kind: 'outcome'; outcome: 'pending' | 'completed' | 'failed' } | { kind: 'delete'; entryId: string } | { kind: 'edit'; entryId: string; amount: number; note: string | null }) => {
      if (action.kind === 'add') return taskService.addHabitProgress(habit.id, { amount: action.amount, note: action.note, date })
      if (action.kind === 'outcome') return taskService.setHabitOutcome(habit.id, action.outcome, date)
      if (action.kind === 'delete') return taskService.deleteHabitProgress(habit.id, action.entryId, date)
      return taskService.updateHabitProgress(habit.id, action.entryId, { amount: action.amount, note: action.note, date })
    },
    onSuccess: (next) => {
      refresh(next)
      setAmount('')
      setNote('')
      setEditingId(null)
    },
    onError: (error: any) => toast.error(error?.response?.data?.error ?? 'Could not update Habit'),
  })

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); previouslyFocused?.focus() }
  }, [onClose])

  const submitAmount = (value = Number(amount)) => {
    if (!Number.isFinite(value) || value <= 0) return
    mutation.mutate({ kind: 'add', amount: value, note: note.trim() || null })
  }

  const submitTerminalOutcome = (outcome: 'completed' | 'failed') => {
    mutation.mutate({ kind: 'outcome', outcome })
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="habit-outcome-title">
      <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-label="Close Habit check-in" />
      <div ref={panelRef} tabIndex={-1} className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-page p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl outline-none sm:rounded-3xl">
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-line-strong sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{target ? 'Log progress' : 'Record outcome'}</p><h2 id="habit-outcome-title" className="mt-1 text-xl font-bold text-ink">{habit.title}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted hover:bg-card"><X className="h-5 w-5" /></button>
        </div>

        {isLoading ? <p className="py-10 text-center text-sm text-ink-muted">Loading Habit…</p> : target ? <>
          <div className="mt-5 flex items-end justify-between"><strong className="text-3xl text-ink">{info.progressTotal} <span className="text-base font-medium text-ink-muted">/ {target.value} {unitLabel(target.unit, target.value)}</span></strong><span className="text-xs text-ink-muted">{percent}% · {labels[info.outcome]}</span></div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-card"><div className={`h-full rounded-full ${info.outcome === 'completed' ? 'bg-emerald-400' : 'bg-gradient-to-r from-cyan-400 to-amber-400'}`} style={{ width: `${percent}%` }} /></div>
          <p className="mt-5 text-sm font-medium text-ink">How much did you do?</p>
          <div className="mt-2 grid grid-cols-3 gap-2">{quickAmounts[target.unit].map(value => <button key={value} type="button" disabled={mutation.isPending} onClick={() => submitAmount(value)} className="btn-primary min-h-12 px-2 text-sm">+ {value} {unitLabel(target.unit, value)}</button>)}</div>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2"><input type="text" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} className="input-field" placeholder={`Other ${target.unit}`} /><button type="button" onClick={() => submitAmount()} disabled={mutation.isPending || !amount} className="btn-secondary min-h-11 px-4"><Plus className="h-4 w-4" /></button></div>
          <input value={note} onChange={event => setNote(event.target.value)} maxLength={120} className="input-field mt-2" placeholder="Optional note, e.g. Run" />

          {detail.entries.length > 0 && <div className="mt-5 space-y-2"><h3 className="text-sm font-semibold text-ink">Progress chunks</h3>{detail.entries.map(entry => editingId === entry.id ? <div key={entry.id} className="rounded-xl border border-cyan-400/30 bg-card/50 p-3"><div className="grid grid-cols-2 gap-2"><input type="text" inputMode="decimal" defaultValue={entry.amount} id={`amount-${entry.id}`} className="input-field" /><input defaultValue={entry.note ?? ''} id={`note-${entry.id}`} className="input-field" placeholder="Note" /></div><div className="mt-2 flex justify-end gap-2"><button type="button" className="btn-secondary px-3 py-2 text-sm" onClick={() => setEditingId(null)}>Cancel</button><button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => { const nextAmount = Number((document.getElementById(`amount-${entry.id}`) as HTMLInputElement).value); const nextNote = (document.getElementById(`note-${entry.id}`) as HTMLInputElement).value; if (nextAmount > 0) mutation.mutate({ kind: 'edit', entryId: entry.id, amount: nextAmount, note: nextNote.trim() || null }) }}>Save</button></div></div> : <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card/50 px-3 py-2"><div className="min-w-0"><p className="text-sm text-ink-soft">{entry.amount} {unitLabel(target.unit, entry.amount)}</p>{entry.note && <p className="truncate text-xs text-ink-muted">{entry.note}</p>}</div><div className="flex gap-1"><button type="button" aria-label="Edit progress chunk" onClick={() => setEditingId(entry.id)} className="flex h-11 w-11 items-center justify-center text-ink-muted"><Pencil className="h-4 w-4" /></button><button type="button" aria-label="Delete progress chunk" onClick={() => mutation.mutate({ kind: 'delete', entryId: entry.id })} className="flex h-11 w-11 items-center justify-center text-rose-300"><Minus className="h-4 w-4" /></button></div></div>)}</div>}

          <div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" disabled={mutation.isPending || info.outcome === 'completed'} onClick={() => submitTerminalOutcome('completed')} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-400/10 font-semibold text-emerald-200 disabled:opacity-40"><Check className="h-4 w-4" />Complete remaining</button><button type="button" disabled={mutation.isPending || info.outcome === 'completed'} onClick={() => submitTerminalOutcome('failed')} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rose-400/35 bg-rose-400/10 font-semibold text-rose-200 disabled:opacity-40"><X className="h-4 w-4" />Not done</button></div>
          {info.outcome === 'failed' && <button type="button" onClick={() => mutation.mutate({ kind: 'outcome', outcome: 'pending' })} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 text-sm text-ink-muted"><RotateCcw className="h-4 w-4" />Clear outcome</button>}
        </> : <>
          <p className="mt-3 text-sm text-ink-muted">Choose what happened for this Habit today.</p>
          <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" disabled={mutation.isPending} onClick={() => submitTerminalOutcome('completed')} className="flex min-h-16 flex-col items-center justify-center rounded-2xl border border-emerald-400/35 bg-emerald-400/10 font-semibold text-emerald-200"><Check className="mb-1 h-5 w-5" />Done</button><button type="button" disabled={mutation.isPending} onClick={() => submitTerminalOutcome('failed')} className="flex min-h-16 flex-col items-center justify-center rounded-2xl border border-rose-400/35 bg-rose-400/10 font-semibold text-rose-200"><X className="mb-1 h-5 w-5" />Not done</button></div>
          {info.outcome !== 'pending' && <button type="button" onClick={() => mutation.mutate({ kind: 'outcome', outcome: 'pending' })} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 text-sm text-ink-muted"><RotateCcw className="h-4 w-4" />Clear outcome</button>}
        </>}
      </div>
    </div>,
    document.body,
  )
}
