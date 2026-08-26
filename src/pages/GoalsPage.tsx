import { useEffect, useMemo, useState } from 'react'
import { Archive, Loader2, MessageCircle, Pencil, Plus, RotateCcw, Target, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  GOAL_MODULES,
  GoalCreateInputSchema,
  type Goal,
  type GoalModule,
  type GoalUpdateInput,
} from '../../backend/src/goals-schema'
import { useGoals } from '../hooks/useGoals'

function GoalCard({
  goal,
  onUpdate,
  busy,
}: {
  goal: Goal
  onUpdate: (goalId: string, input: GoalUpdateInput) => Promise<unknown>
  busy: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [statement, setStatement] = useState(goal.statement)
  const [context, setContext] = useState(goal.context)
  const [module, setModule] = useState(goal.module)

  useEffect(() => {
    setStatement(goal.statement)
    setContext(goal.context)
    setModule(goal.module)
  }, [goal.context, goal.module, goal.statement])

  const save = async () => {
    const parsed = GoalCreateInputSchema.safeParse({ module, statement, context })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Goal is invalid')
      return
    }
    try {
      await onUpdate(goal.id, parsed.data)
      setEditing(false)
      toast.success('Goal updated')
    } catch {
      toast.error('Could not update Goal')
    }
  }

  const setArchived = async (archived: boolean) => {
    try {
      await onUpdate(goal.id, { archived })
      toast.success(archived ? 'Goal archived' : 'Goal restored')
    } catch {
      toast.error(archived ? 'Could not archive Goal' : 'Could not restore Goal')
    }
  }

  return (
    <article className={`rounded-lg border p-4 ${goal.archivedAt ? 'border-line/60 bg-sunken/25' : 'border-line bg-page/55'}`}>
      {editing ? (
        <div className="grid gap-3">
          <select
            aria-label="Goal module"
            className="input-field min-h-11"
            value={module}
            onChange={(event) => setModule(event.target.value as GoalModule)}
          >
            {GOAL_MODULES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <textarea
            aria-label="Goal statement"
            className="input-field min-h-28 resize-y"
            maxLength={500}
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
          />
          <label className="grid gap-1.5 text-sm text-ink-muted">
            Context
            <textarea
              aria-label="Goal context"
              className="input-field min-h-36 resize-y"
              maxLength={4000}
              value={context}
              placeholder="Why this matters, relevant background, constraints, and facts Talk should know."
              onChange={(event) => setContext(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary min-h-11 px-4 py-2 text-sm" onClick={() => void save()} disabled={busy}>
              Save Goal
            </button>
            <button type="button" className="btn-secondary min-h-11 px-4 py-2 text-sm" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={`whitespace-pre-wrap text-sm leading-6 ${goal.archivedAt ? 'text-ink-muted' : 'text-ink'}`}>
              {goal.statement}
            </p>
            {goal.context && (
              <div className="mt-3 border-t border-line/70 pt-3">
                <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Context</div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{goal.context}</p>
              </div>
            )}
          </div>
          <div className="flex flex-none gap-1">
            {!goal.archivedAt && (
              <button type="button" aria-label="Edit Goal" className="rounded-md p-2 text-ink-muted hover:bg-card hover:text-accent" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              aria-label={goal.archivedAt ? 'Restore Goal' : 'Archive Goal'}
              className="rounded-md p-2 text-ink-muted hover:bg-card hover:text-accent"
              onClick={() => void setArchived(!goal.archivedAt)}
              disabled={busy}
            >
              {goal.archivedAt ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

export default function GoalsPage() {
  const { goals, resolution, retry, createGoal, updateGoal, isSaving } = useGoals()
  const [module, setModule] = useState<GoalModule>('whole_day')
  const [statement, setStatement] = useState('')
  const [context, setContext] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const active = useMemo(() => (goals ?? []).filter((goal) => !goal.archivedAt), [goals])
  const archived = useMemo(() => (goals ?? []).filter((goal) => goal.archivedAt), [goals])

  const addGoal = async () => {
    const parsed = GoalCreateInputSchema.safeParse({ module, statement, context })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Describe the Goal first')
      return
    }
    try {
      await createGoal(parsed.data)
      setStatement('')
      setContext('')
      toast.success('Goal added')
    } catch {
      toast.error('Could not add Goal')
    }
  }

  if (resolution === 'loading') {
    return <div className="flex min-h-[45vh] items-center justify-center gap-2 text-ink-muted" role="status"><Loader2 className="h-5 w-5 animate-spin" />Loading Goals</div>
  }

  if (resolution === 'error') {
    return (
      <div className="card mx-auto max-w-lg space-y-4" role="alert">
        <h1 className="text-xl font-semibold text-ink">Goals are unavailable</h1>
        <p className="text-sm text-ink-muted">The read failed, so HealthyFlow has not treated it as an empty Goal list.</p>
        <button type="button" className="btn-primary px-4 py-2" onClick={() => void retry()}>Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-6 w-6 text-accent" />
            <h1 className="text-2xl font-bold text-ink">Goals</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">
            Bigger direction in your own words. Goals guide planning; the owning module still records what was planned and what actually happened.
          </p>
        </div>
        <Link to="/talk" className="btn-secondary inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 text-sm">
          <MessageCircle className="h-4 w-4" />
          Manage with Talk
        </Link>
      </header>

      <section className="card">
        <div className="mb-4 flex items-start gap-3">
          <Plus className="mt-0.5 h-5 w-5 text-accent" />
          <div>
            <h2 className="text-lg font-semibold text-ink">Add a Goal</h2>
            <p className="text-sm text-ink-muted">Say the outcome, direction, and any guardrail naturally. No form fields for dates or progress.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <label className="grid gap-1.5 text-sm text-ink-muted">
            Module
            <select className="input-field min-h-11" value={module} onChange={(event) => setModule(event.target.value as GoalModule)}>
              {GOAL_MODULES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm text-ink-muted">
            Goal
            <textarea
              className="input-field min-h-24 resize-y"
              maxLength={500}
              value={statement}
              placeholder="Launch HealthyFlow without sacrificing training consistency."
              onChange={(event) => setStatement(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-ink-muted sm:col-span-2">
            Context <span className="font-normal text-ink-muted">(optional)</span>
            <textarea
              className="input-field min-h-32 resize-y"
              maxLength={4000}
              value={context}
              placeholder="Why it matters, what led here, constraints, decisions, and facts Talk should remember."
              onChange={(event) => setContext(event.target.value)}
            />
          </label>
          <div className="sm:col-span-2">
            <button type="button" className="btn-primary min-h-11 px-4 py-2 text-sm" disabled={isSaving} onClick={() => void addGoal()}>
              {isSaving ? 'Saving…' : 'Add Goal'}
            </button>
          </div>
        </div>
      </section>

      <div className="space-y-5">
        {GOAL_MODULES.map((goalModule) => {
          const records = active.filter((goal) => goal.module === goalModule.id)
          if (records.length === 0) return null
          return (
            <section key={goalModule.id} className="card">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-ink">{goalModule.label}</h2>
                <p className="text-sm text-ink-muted">{goalModule.description}</p>
              </div>
              <div className="grid gap-3">
                {records.map((goal) => <GoalCard key={goal.id} goal={goal} onUpdate={updateGoal} busy={isSaving} />)}
              </div>
            </section>
          )
        })}

        {active.length === 0 && (
          <div className="card py-10 text-center">
            <Target className="mx-auto h-8 w-8 text-ink-muted" />
            <h2 className="mt-3 font-semibold text-ink">No active Goals</h2>
            <p className="mt-1 text-sm text-ink-muted">Add one above, or tell Talk what larger outcome you want to pursue.</p>
          </div>
        )}
      </div>

      {archived.length > 0 && (
        <section className="card">
          <button type="button" className="flex min-h-11 w-full items-center justify-between text-left" onClick={() => setShowArchived((value) => !value)}>
            <span>
              <span className="font-semibold text-ink">Archived Goals</span>
              <span className="ml-2 text-sm text-ink-muted">{archived.length}</span>
            </span>
            {showArchived ? <X className="h-4 w-4 text-ink-muted" /> : <Archive className="h-4 w-4 text-ink-muted" />}
          </button>
          {showArchived && (
            <div className="mt-3 grid gap-3 border-t border-line pt-4">
              {archived.map((goal) => <GoalCard key={goal.id} goal={goal} onUpdate={updateGoal} busy={isSaving} />)}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
