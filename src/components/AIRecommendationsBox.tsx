import { useId, useState } from 'react'
import { Brain, CalendarClock, ChevronDown, HeartPulse, RefreshCw, Utensils, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { aiService, dailySignalsQueryKey, type DailySignal } from '../services/api'

type AIRecommendationsBoxProps = {
  date: string
}

const signalTypeLabel: Record<DailySignal['type'], string> = {
  schedule_overload: 'Schedule',
  habit_risk: 'Habit',
  missing_calorie_log: 'Nutrition',
}

function SignalIcon({ type }: { type: DailySignal['type'] }) {
  if (type === 'schedule_overload') return <CalendarClock className="h-4 w-4" />
  if (type === 'habit_risk') return <HeartPulse className="h-4 w-4" />
  if (type === 'missing_calorie_log') return <Utensils className="h-4 w-4" />
  return <Brain className="h-4 w-4" />
}

export default function AIRecommendationsBox({ date }: AIRecommendationsBoxProps) {
  const detailsId = useId()
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [isExpanded, setIsExpanded] = useState(false)

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

  const handleDismiss = (id: string) => {
    setDismissedIds((previous) => [...previous, id])
    if ('navigator' in window && 'vibrate' in navigator) navigator.vibrate(50)
  }

  return (
    <section
      aria-labelledby={`${detailsId}-title`}
      data-demo-id="daily-signals-summary"
      className="border-y border-line/60 bg-card/20"
    >
      <div className="flex min-h-12 items-center gap-3 px-3 py-2 sm:px-4">
        <Brain className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden="true" />
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
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-cyan-300 hover:bg-cyan-500/10"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Retry</span>
            </button>
            <Link
              to="/talk"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-card"
            >
              Open Talk
            </Link>
          </div>
        ) : firstSignal ? (
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-controls={detailsId}
            onClick={() => setIsExpanded((expanded) => !expanded)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-cyan-300 hover:bg-cyan-500/10"
          >
            {isExpanded ? 'Close' : 'Review'}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>

      {isExpanded && firstSignal && (
        <div id={detailsId} className="border-t border-line/60 px-3 py-2 sm:px-4">
          <ul className="divide-y divide-line/50">
            {visibleSignals.map((signal) => (
              <li key={signal.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-muted">
                  <SignalIcon type={signal.type} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                    {signalTypeLabel[signal.type]} · {signal.severity} priority
                    {signal.suggestedAction ? ' · Suggested action' : ' · Information'}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink">{signal.summary}</p>
                  {signal.suggestedAction && (
                    <p className="mt-1 text-xs text-ink-muted">{signal.suggestedAction.label}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDismiss(signal.id)}
                  aria-label={`Dismiss signal: ${signal.summary}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-card hover:text-ink"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
