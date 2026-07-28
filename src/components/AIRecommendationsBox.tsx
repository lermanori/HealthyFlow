import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Brain, CalendarClock, ChevronDown, HeartPulse, RefreshCw, Utensils } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  aiService,
  dailySignalsQueryKey,
  type DailySignal,
} from '../services/api'
import PendingActionCard, { type PendingActionView } from './PendingActionCard'
import { invalidatePendingActionQueries } from '../utils/pendingActionInvalidation'

type AIRecommendationsBoxProps = {
  date: string
}

type ApiFailure = {
  message: string
  code?: string
}

type ActionableSignal = Extract<DailySignal, { kind: 'actionable' }>

const signalTypeLabel: Record<DailySignal['type'], string> = {
  schedule_overload: 'Schedule',
  habit_risk: 'Habit',
  missing_calorie_log: 'Nutrition',
}

const recordKindLabel: Record<ActionableSignal['proposal']['affectedRecords'][number]['kind'], string> = {
  task: 'Task',
  habit_instance: 'Habit instance',
  calorie_entry: 'Calorie entry',
  weight_entry: 'Weight entry',
  achievement: 'Achievement',
  workout_session: 'Workout session',
}

function SignalIcon({ type }: { type: DailySignal['type'] }) {
  if (type === 'schedule_overload') return <CalendarClock className="h-4 w-4" />
  if (type === 'habit_risk') return <HeartPulse className="h-4 w-4" />
  if (type === 'missing_calorie_log') return <Utensils className="h-4 w-4" />
  return <Brain className="h-4 w-4" />
}

function apiFailure(error: unknown, fallback: string): ApiFailure {
  if (!error || typeof error !== 'object') return { message: fallback }
  const response = (error as { response?: { data?: unknown } }).response
  if (!response?.data || typeof response.data !== 'object') return { message: fallback }
  const data = response.data as Record<string, unknown>
  return {
    message: typeof data.error === 'string' ? data.error : fallback,
    code: typeof data.code === 'string' ? data.code : undefined,
  }
}

function changeValue(value: string | number | boolean | null, field: string) {
  if (value === null) return field === 'startTime' ? 'Anytime' : 'None'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function talkState(date: string, signal?: DailySignal) {
  return {
    dailySignalContext: {
      date,
      ...(signal
        ? {
            type: signal.type,
            summary: signal.summary,
            rationale: signal.rationale,
          }
        : {}),
    },
  }
}

export default function AIRecommendationsBox({ date }: AIRecommendationsBoxProps) {
  const detailsId = useId()
  const queryClient = useQueryClient()
  const sectionRef = useRef<HTMLElement>(null)
  const reviewButtonRef = useRef<HTMLButtonElement>(null)
  const signalRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [actions, setActions] = useState<Record<string, PendingActionView>>({})
  const [preparationErrors, setPreparationErrors] = useState<Record<string, string>>({})
  const [busySignalId, setBusySignalId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const {
    data: dailyContext,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: dailySignalsQueryKey(date),
    queryFn: () => aiService.getDailyContext(date),
    retry: false,
  })

  const visibleSignals = dailyContext?.signals.filter(
    (signal) => !dismissedIds.includes(signal.id)
  ) ?? []
  const firstSignal = visibleSignals[0]

  const focusReview = () => {
    requestAnimationFrame(() => (reviewButtonRef.current ?? sectionRef.current)?.focus())
  }

  const dismissLocally = (signal: DailySignal, message = 'Daily Signal dismissed.') => {
    setDismissedIds((previous) => previous.includes(signal.id) ? previous : [...previous, signal.id])
    setAnnouncement(message)
    focusReview()
  }

  const handleDismiss = async (signal: DailySignal) => {
    const action = actions[signal.id]
    if (!action || action.status === 'confirmed' || action.status === 'canceled') {
      dismissLocally(signal)
      return
    }

    setBusySignalId(signal.id)
    try {
      await aiService.cancelChatAction(action.id)
      dismissLocally(signal, 'Prepared action canceled and Daily Signal dismissed.')
    } catch (error) {
      const failure = apiFailure(error, 'Could not dismiss this prepared action')
      setActions((current) => ({
        ...current,
        [signal.id]: { ...action, error: failure.message, retry: 'cancel' },
      }))
      setAnnouncement(failure.message)
      toast.error(failure.message)
    } finally {
      setBusySignalId(null)
    }
  }

  const prepareSignal = async (signal: ActionableSignal) => {
    setBusySignalId(signal.id)
    setPreparationErrors((current) => ({ ...current, [signal.id]: '' }))
    try {
      const response = await aiService.reviewDailySignal(date, signal.id)
      setActions((current) => ({
        ...current,
        [signal.id]: {
          ...response.pendingAction,
          status: 'pending',
        },
      }))
      setAnnouncement(`Prepared change for ${signal.proposal.affectedRecords[0].title}. Review it before applying.`)
      requestAnimationFrame(() => signalRefs.current[signal.id]?.focus())
    } catch (error) {
      const failure = apiFailure(error, 'Could not prepare this Daily Signal change')
      setPreparationErrors((current) => ({ ...current, [signal.id]: failure.message }))
      setAnnouncement(failure.message)
      if (failure.code === 'daily_signal_stale') {
        const refreshed = await refetch()
        if (!refreshed.isError) setAnnouncement('Daily Signals refreshed. Review the latest proposal.')
        focusReview()
      } else {
        requestAnimationFrame(() => signalRefs.current[signal.id]?.focus())
      }
    } finally {
      setBusySignalId(null)
    }
  }

  const applySignal = async (
    signal: ActionableSignal,
    actionId: string,
    args?: Record<string, unknown>
  ) => {
    const action = actions[signal.id]
    if (!action) return
    setBusySignalId(signal.id)
    try {
      const response = await aiService.confirmChatAction(actionId, args)
      setActions((current) => ({
        ...current,
        [signal.id]: {
          ...response.action,
          status: 'confirmed',
          result: response.result,
          completedAt: new Date().toISOString(),
        },
      }))
      await invalidatePendingActionQueries(queryClient, response.action)
      dismissLocally(signal, `Applied: ${signal.proposal.label}. Daily plan updated.`)
      toast.success('Daily plan updated')
    } catch (error) {
      const failure = apiFailure(error, 'Could not apply this change')
      setActions((current) => ({
        ...current,
        [signal.id]: {
          ...action,
          error: failure.message,
          retry: failure.code === 'pending_action_unavailable' ? 'prepare' : 'confirm',
        },
      }))
      setAnnouncement(failure.message)
      toast.error(failure.message)
    } finally {
      setBusySignalId(null)
    }
  }

  const handleDetailsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    setIsExpanded(false)
    focusReview()
  }

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby={`${detailsId}-title`}
      data-demo-id="daily-signals-summary"
      className="border-y border-line/60 bg-card/20 outline-none"
    >
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <div className="flex min-h-12 items-center gap-3 px-3 py-2 sm:px-4">
        <Brain className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id={`${detailsId}-title`} className="sr-only">Daily Signals</h2>
          {isLoading ? (
            <p className="text-sm text-ink-muted" role="status">Checking Daily Signals…</p>
          ) : isError ? (
            <p className="text-sm text-ink-muted">
              <span className="font-medium text-ink-soft">Daily Signals unavailable.</span>{' '}
              Your daily plan is still ready.
            </p>
          ) : firstSignal ? (
            <p className="truncate text-sm text-ink-soft">
              <span className="font-semibold text-ink">
                {visibleSignals.length} {visibleSignals.length === 1 ? 'signal' : 'signals'}
              </span>
              <span aria-hidden="true"> · </span>
              <span className="sr-only">. Top signal: </span>
              {firstSignal.summary}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">
              {dailyContext?.signals.length ? 'Daily Signals cleared for this view.' : 'No Daily Signals need attention.'}
            </p>
          )}
        </div>

        {isError ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-accent hover:bg-accent/10"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Retry</span>
            </button>
            <Link
              to="/talk"
              state={talkState(date)}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-card"
            >
              Open Talk
            </Link>
          </div>
        ) : firstSignal ? (
          <button
            ref={reviewButtonRef}
            type="button"
            aria-expanded={isExpanded}
            aria-controls={detailsId}
            onClick={() => setIsExpanded((expanded) => !expanded)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-accent hover:bg-accent/10"
          >
            {isExpanded ? 'Close' : 'Review'}
            <ChevronDown
              className={`h-4 w-4 transition-transform motion-reduce:transition-none ${isExpanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>

      {isExpanded && firstSignal && (
        <div
          id={detailsId}
          className="border-t border-line/60 px-3 py-2 sm:px-4"
          onKeyDown={handleDetailsKeyDown}
        >
          <ul className="divide-y divide-line/50">
            {visibleSignals.map((signal) => {
              const action = actions[signal.id]
              const preparationError = preparationErrors[signal.id]
              const isBusy = busySignalId === signal.id
              return (
                <li key={signal.id} className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-muted">
                    <SignalIcon type={signal.type} />
                  </span>
                  <div
                    ref={(element) => { signalRefs.current[signal.id] = element }}
                    tabIndex={-1}
                    className="min-w-0 flex-1 outline-none"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                      {signalTypeLabel[signal.type]} · {signal.severity} priority · {signal.kind === 'actionable' ? 'Actionable proposal' : 'Information'}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink">{signal.summary}</p>
                    <div className="mt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Why this surfaced</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-soft">{signal.rationale}</p>
                    </div>
                    <dl className="mt-2 grid gap-1 text-xs text-ink-muted sm:grid-cols-2">
                      {signal.evidence.map((item) => (
                        <div key={`${item.label}:${item.value}`} className="min-w-0">
                          <dt className="font-medium text-ink-soft">{item.label}</dt>
                          <dd className="truncate">{item.value}</dd>
                        </div>
                      ))}
                    </dl>

                    {signal.kind === 'actionable' && (
                      <div className="mt-3 border-l-2 border-accent/50 pl-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">Proposed change</p>
                        <p className="mt-1 text-sm font-medium text-ink">{signal.proposal.label}</p>
                        <ul className="mt-2 space-y-1.5">
                          {signal.proposal.affectedRecords.map((record) => (
                            <li key={record.id} className="text-xs text-ink-soft">
                              <span className="font-medium">{record.title}</span>
                              <span className="text-ink-muted"> · {recordKindLabel[record.kind]}{record.date ? ` · ${record.date}` : ''}</span>
                            </li>
                          ))}
                        </ul>
                        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                          {signal.proposal.changes.map((change) => (
                            <div key={change.field} className="text-xs">
                              <dt className="font-medium text-ink-soft">{change.label}</dt>
                              <dd className="mt-0.5 text-ink-muted">
                                {changeValue(change.before, change.field)} <span aria-hidden="true">→</span><span className="sr-only"> changes to </span> {changeValue(change.after, change.field)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        {!action && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => void prepareSignal(signal)}
                              disabled={isBusy}
                              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-accent hover:bg-accent/10 disabled:cursor-wait disabled:opacity-60"
                            >
                              {isBusy ? 'Preparing…' : preparationError ? 'Retry review' : 'Review change'}
                            </button>
                          </div>
                        )}
                        {preparationError && !action && (
                          <p className="mt-2 text-xs leading-relaxed text-state-danger" role="alert">{preparationError}</p>
                        )}
                        {action && (
                          <PendingActionCard
                            action={action}
                            confirmLabel="Apply"
                            cancelLabel="Dismiss"
                            pendingStatusLabel="Review before applying"
                            isBusy={isBusy}
                            onConfirm={(actionId, args) => void applySignal(signal, actionId, args)}
                            onCancel={() => void handleDismiss(signal)}
                            onRetry={() => void prepareSignal(signal)}
                          />
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        to="/talk"
                        state={talkState(date, signal)}
                        className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-card"
                      >
                        Open Talk
                      </Link>
                      {!action && (
                        <button
                          type="button"
                          onClick={() => void handleDismiss(signal)}
                          className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-ink-muted hover:bg-card hover:text-ink"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
