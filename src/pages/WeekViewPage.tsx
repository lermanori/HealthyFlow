import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, isSameDay, parseISO } from 'date-fns'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  Infinity as InfinityIcon,
  MoveRight,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  Utensils,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  calendarService,
  DAILY_SIGNALS_QUERY_KEY,
  DAY_SUMMARY_QUERY_KEY,
  summaryService,
  taskService,
  WEEK_SUMMARY_QUERY_KEY,
  weekSummaryQueryKey,
  type HabitItem,
  type WeekPlanningDecision,
  type WeekSummary,
} from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import HabitOutcomeSheet from '../components/HabitOutcomeSheet'
import {
  getWeekDates,
  getWeekNavigationIndex,
} from '../utils/dateHelpers'
import { useSettings } from '../hooks/useSettings'
import {
  findHabitItem,
  selectWeekAgenda,
  type WeekAgendaEntry,
  type WeekDomainFilter,
  type WeekScope,
} from '../utils/weekSummary'
import type { WeekDomain } from '../../backend/src/day-summary-schema'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const domainOrder: WeekDomain[] = ['task', 'habit', 'calendar', 'workout', 'meal', 'grocery']
const domainLabel: Record<WeekDomain, string> = {
  task: 'Tasks',
  habit: 'Habits',
  calendar: 'Calendar',
  workout: 'Workouts',
  meal: 'Meals',
  grocery: 'Groceries',
}

function validDate(value: string | null): value is string {
  if (!value || !ISO_DATE.test(value)) return false
  return !Number.isNaN(parseISO(value).getTime())
}

function dateLabel(date: string, today: Date) {
  const value = parseISO(date)
  if (isSameDay(value, today)) return 'Today'
  return format(value, 'EEEE, MMM d')
}

function timeLabel(value: string | null) {
  if (!value) return ''
  const [hour, minute] = value.split(':').map(Number)
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

function minutesLabel(value: number) {
  if (value < 60) return `${value}m`
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

function capacityCopy(day: WeekSummary['days'][number]) {
  if (day.capacity.status === 'unavailable') {
    return { title: 'Capacity unavailable', detail: 'Set a usable-day window or reconnect missing sources.' }
  }
  if (day.capacity.status === 'partial') {
    return {
      title: `${minutesLabel(day.capacity.basis.knownLoadMinutes)} known load`,
      detail: `Capacity partly known · at most ${minutesLabel(day.capacity.availableUpperBoundMinutes)} unallocated`,
    }
  }
  if (day.dateMode === 'past') {
    return {
      title: `${minutesLabel(day.capacity.basis.knownLoadMinutes)} known load`,
      detail: `${minutesLabel(day.capacity.availableMinutes)} was unallocated`,
    }
  }
  return {
    title: day.dateMode === 'today'
      ? `${minutesLabel(day.capacity.availableMinutes)} usable time left`
      : `${minutesLabel(day.capacity.availableMinutes)} unallocated`,
    detail: `${minutesLabel(day.capacity.basis.knownLoadMinutes)} known load`,
  }
}

function DomainIcon({ domain }: { domain: WeekDomain }) {
  const className = 'h-4 w-4'
  if (domain === 'habit') return <RotateCcw className={className} />
  if (domain === 'calendar') return <Calendar className={className} />
  if (domain === 'workout') return <Dumbbell className={className} />
  if (domain === 'meal') return <Utensils className={className} />
  if (domain === 'grocery') return <ShoppingCart className={className} />
  return <Check className={className} />
}

function outcomeLabel(outcome: string) {
  if (outcome === 'completed') return 'Completed'
  if (outcome === 'failed') return 'Not done'
  if (outcome === 'partial') return 'Partial'
  return 'Pending'
}

function planningStateLabel(state: string) {
  if (state === 'overloaded') return 'Over'
  if (state === 'partial') return 'Partly known'
  if (state === 'unavailable') return 'Unavailable'
  if (state === 'tight') return 'Tight'
  return 'Open'
}

function planningStateClass(state: string) {
  if (state === 'overloaded') return 'bg-rose-400'
  if (state === 'tight') return 'bg-amber-400'
  if (state === 'partial' || state === 'unavailable') return 'bg-slate-400'
  return 'bg-emerald-400'
}

export default function WeekViewPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { settings, isLoading: settingsLoading } = useSettings()
  const [searchParams, setSearchParams] = useSearchParams()
  const today = useMemo(() => new Date(), [])
  const todayKey = format(today, 'yyyy-MM-dd')
  const weekStartsOn = settings?.weekStartsOn ?? 1
  const rawDate = searchParams.get('date')
  const rawWeek = searchParams.get('week')
  const allScope = searchParams.get('scope') === 'all'
  const selectedDate = !allScope && validDate(rawDate) ? rawDate : todayKey
  const anchorDate = allScope && validDate(rawWeek) ? rawWeek : selectedDate
  const clientWeekStart = format(getWeekDates(parseISO(anchorDate), weekStartsOn)[0], 'yyyy-MM-dd')
  const scope = useMemo<WeekScope>(
    () => allScope ? { kind: 'all' } : { kind: 'day', date: selectedDate },
    [allScope, selectedDate]
  )

  const [showCompleted, setShowCompleted] = useState(true)
  const [domain, setDomain] = useState<WeekDomainFilter>('all')
  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null)
  const [habitCheckIn, setHabitCheckIn] = useState<{ habit: HabitItem; date: string } | null>(null)
  const [dismissedDecisionIds, setDismissedDecisionIds] = useState<string[]>([])
  const [decisionIndex, setDecisionIndex] = useState(0)
  const dayButtonRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (settingsLoading) return
    const invalidScope = searchParams.has('scope') && searchParams.get('scope') !== 'all'
    const invalidDate = rawDate != null && !validDate(rawDate)
    const invalidWeek = rawWeek != null && !validDate(rawWeek)
    if (invalidScope || invalidDate || invalidWeek) {
      setSearchParams({}, { replace: true })
      return
    }

    if (allScope) {
      const canonical = new URLSearchParams({ scope: 'all', week: clientWeekStart })
      if (searchParams.toString() !== canonical.toString()) {
        setSearchParams(canonical, { replace: true })
      }
      return
    }

    const canonical = selectedDate === todayKey
      ? new URLSearchParams()
      : new URLSearchParams({ date: selectedDate })
    if (searchParams.toString() !== canonical.toString()) {
      setSearchParams(canonical, { replace: true })
    }
  }, [
    allScope,
    clientWeekStart,
    rawDate,
    rawWeek,
    searchParams,
    selectedDate,
    setSearchParams,
    settingsLoading,
    todayKey,
  ])

  const {
    data: summary,
    isLoading: summaryLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: weekSummaryQueryKey(clientWeekStart),
    queryFn: () => summaryService.getWeeklySummary(anchorDate),
    enabled: !settingsLoading,
  })

  useEffect(() => {
    if (!summary || scope.kind !== 'day') return
    if (summary.days.some((day) => day.date === scope.date)) return
    setSearchParams({ date: summary.week.startDate }, { replace: true })
  }, [scope, setSearchParams, summary])

  const invalidatePlanning = () => {
    queryClient.invalidateQueries({ queryKey: WEEK_SUMMARY_QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: DAILY_SIGNALS_QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
  }

  const completeMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      completed ? taskService.updateTask(id, { completed: false }) : taskService.completeTask(id),
    onSuccess: invalidatePlanning,
    onError: () => toast.error('Failed to update Item'),
  })
  const calendarMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      calendarService.updateGoogleEventCompletion(id, !completed),
    onSuccess: () => {
      invalidatePlanning()
      queryClient.invalidateQueries({ queryKey: ['google-calendar-events'] })
    },
    onError: () => toast.error('Failed to update Calendar event'),
  })
  const planningMutation = useMutation({
    mutationFn: async (action: Extract<WeekPlanningDecision['actions'][number], { kind: 'update_item' }>) => {
      const fresh = await summaryService.getWeeklySummary(anchorDate)
      const revalidated = fresh.planning.decisions
        .flatMap((decision) => decision.actions)
        .find((candidate) => candidate.id === action.id)
      if (
        !revalidated ||
        revalidated.kind !== 'update_item' ||
        revalidated.itemId !== action.itemId ||
        JSON.stringify(revalidated.changes) !== JSON.stringify(action.changes)
      ) {
        throw new Error('Planning decision is stale')
      }
      return taskService.updateTask(revalidated.itemId, revalidated.changes)
    },
    onSuccess: () => {
      toast.success('Weekly plan updated')
      invalidatePlanning()
    },
    onError: () => toast.error('The planning change could not be applied'),
  })
  const mutationPending = completeMutation.isPending || calendarMutation.isPending || planningMutation.isPending
  const isTodayPlanning = scope.kind === 'day' && scope.date === todayKey

  const agenda = useMemo(
    () => summary
      ? selectWeekAgenda(summary, scope, {
          showCompleted,
          domain,
          mode: isTodayPlanning ? 'today_planning' : 'full',
        })
      : { days: [], totalCount: 0 },
    [domain, isTodayPlanning, scope, showCompleted, summary]
  )

  if (settingsLoading || summaryLoading) {
    return <div className="flex min-h-[45vh] items-center justify-center"><LoadingSpinner size="lg" /></div>
  }
  if (isError || !summary) {
    return (
      <div className="card mx-auto max-w-lg space-y-4" role="alert">
        <h1 className="text-xl font-semibold text-ink">Could not load this week</h1>
        <p className="text-sm text-ink-muted">Your weekly plan is still unchanged.</p>
        <button type="button" className="btn-primary min-h-11 px-4" onClick={() => void refetch()}>Retry</button>
      </div>
    )
  }
  const selectedDay = scope.kind === 'day'
    ? summary.days.find((day) => day.date === scope.date) ?? summary.days[0]
    : null
  const completion = selectedDay?.completion ?? summary.completion
  const populatedDomains = domainOrder.filter((candidate) =>
    summary.contributions.some((contribution) => contribution.domain === candidate)
  )
  const weekStartDate = parseISO(summary.week.startDate)
  const weekEndDate = parseISO(summary.week.endDate)
  const weekLabel = weekStartDate.getMonth() === weekEndDate.getMonth()
    ? `${format(weekStartDate, 'MMM d')} – ${format(weekEndDate, 'd, yyyy')}`
    : `${format(weekStartDate, 'MMM d')} – ${format(weekEndDate, 'MMM d, yyyy')}`
  const openDecisions = summary.planning.decisions.filter(
    (decision) => !dismissedDecisionIds.includes(decision.id)
  )
  const activeDecision = openDecisions.length > 0
    ? openDecisions[decisionIndex % openDecisions.length]
    : null

  const selectDay = (date: string) => {
    setSearchParams(date === todayKey ? {} : { date })
  }
  const selectAll = () => {
    setSearchParams({ scope: 'all', week: summary.week.startDate })
  }
  const navigateWeek = (direction: -1 | 1) => {
    if (scope.kind === 'all') {
      setSearchParams({
        scope: 'all',
        week: format(addDays(parseISO(summary.week.startDate), direction * 7), 'yyyy-MM-dd'),
      })
    } else {
      setSearchParams({
        date: format(addDays(parseISO(scope.date), direction * 7), 'yyyy-MM-dd'),
      })
    }
  }
  const handleDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = getWeekNavigationIndex(index, event.key)
    if (target == null) return
    event.preventDefault()
    selectDay(summary.days[target].date)
    window.requestAnimationFrame(() => dayButtonRefs.current[target]?.focus())
  }
  const toggleEntry = (entry: WeekAgendaEntry) => {
    if (entry.source === 'calendar') {
      calendarMutation.mutate({ id: entry.id, completed: entry.completed })
      return
    }
    if (entry.item?.type === 'habit') {
      setHabitCheckIn({ habit: entry.item as unknown as HabitItem, date: entry.date })
      return
    }
    completeMutation.mutate({ id: entry.id, completed: entry.completed })
  }
  const openHabitCell = (itemId: string) => {
    const found = findHabitItem(summary, itemId)
    if (found?.item.type === 'habit') {
      setHabitCheckIn({ habit: found.item as unknown as HabitItem, date: found.date })
    }
  }
  const handlePlanningAction = (action: WeekPlanningDecision['actions'][number]) => {
    if (action.kind === 'select_day') {
      selectDay(action.date)
      return
    }
    if (action.kind === 'open_settings') {
      navigate('/app/settings')
      return
    }
    planningMutation.mutate(action)
  }
  const dismissDecision = (decision: WeekPlanningDecision) => {
    setDismissedDecisionIds((current) => [...current, decision.id])
    setDecisionIndex(0)
  }

  return (
    <main className="week-workspace space-y-5 text-ink">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Plan across days</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">My Week</h1>
          <p className="mt-1 text-sm text-ink-muted">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="week-focus flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-card/60" aria-label="Previous week" onClick={() => navigateWeek(-1)}><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" className="week-focus min-h-11 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-300" onClick={() => setSearchParams({})}>Today</button>
          <button type="button" className="week-focus flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-card/60" aria-label="Next week" onClick={() => navigateWeek(1)}><ChevronRight className="h-5 w-5" /></button>
        </div>
      </header>

      <div className="sr-only" aria-live="polite">
        {scope.kind === 'all' ? `All week, ${weekLabel}` : `${dateLabel(scope.date, today)} selected`}
      </div>

      <section aria-label="Week scope" className="space-y-3">
        <button
          type="button"
          className={`week-focus min-h-11 rounded-xl border px-4 text-sm font-semibold ${
            scope.kind === 'all' ? 'border-cyan-400 bg-cyan-400/15 text-cyan-300' : 'border-line bg-card/50 text-ink-soft'
          }`}
          aria-pressed={scope.kind === 'all'}
          onClick={selectAll}
        >
          All week
        </button>
        <div role="group" aria-label="Week dates" className="week-rail grid grid-cols-7 gap-2">
          {summary.days.map((day, index) => {
            const date = parseISO(day.date)
            const selected = scope.kind === 'day' && day.date === scope.date
            const planningDay = summary.planning.days[index]
            return (
              <button
                key={day.date}
                ref={(button) => { dayButtonRefs.current[index] = button }}
                type="button"
                className={`week-focus relative flex min-h-[76px] min-w-0 flex-col items-center justify-center rounded-2xl border px-1 py-2 sm:min-h-[88px] ${
                  selected ? 'border-cyan-400 bg-cyan-400/12 text-cyan-300' : 'border-line bg-card/40 text-ink-soft'
                }`}
                data-rail-date={day.date}
                aria-current={selected ? 'date' : undefined}
                aria-pressed={selected}
                aria-label={`${format(date, 'EEEE, MMMM d')}, ${planningStateLabel(planningDay.state)}, ${day.completion.addressed ?? day.completion.completed} addressed of ${day.completion.total}`}
                tabIndex={selected || (scope.kind === 'all' && index === 0) ? 0 : -1}
                onClick={() => selectDay(day.date)}
                onKeyDown={(event) => handleDayKeyDown(event, index)}
              >
                <span className="text-[10px] font-semibold uppercase"><span className="sm:hidden">{format(date, 'EEEEE')}</span><span className="hidden sm:inline">{format(date, 'EEE')}</span></span>
                <time dateTime={day.date} className="mt-1 text-xl font-bold">{format(date, 'd')}</time>
                <span className="mt-1 flex items-center gap-1 text-[9px] text-ink-muted">
                  <span className={`h-1.5 w-1.5 rounded-full ${planningStateClass(planningDay.state)}`} />
                  <span className="hidden md:inline">{planningStateLabel(planningDay.state)}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section
        aria-labelledby="planning-decision-heading"
        className={`overflow-hidden rounded-3xl border ${
          activeDecision?.severity === 'high'
            ? 'border-amber-400/40 bg-amber-400/[0.07]'
            : 'border-cyan-400/35 bg-cyan-400/[0.06]'
        }`}
      >
        {activeDecision ? (
          <div className="p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                  <Sparkles className="h-4 w-4" />
                  Planning decision
                </p>
                <h2 id="planning-decision-heading" className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
                  {activeDecision.title}
                </h2>
              </div>
              <span className="rounded-full border border-line bg-card/50 px-3 py-1 text-xs text-ink-muted">
                {(decisionIndex % openDecisions.length) + 1} of {openDecisions.length}
              </span>
            </div>

            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">{activeDecision.rationale}</p>
            <dl className="mt-4 grid gap-2 sm:grid-cols-2">
              {activeDecision.evidence.map((evidence) => (
                <div key={evidence.label} className="rounded-xl border border-line/80 bg-card/35 px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{evidence.label}</dt>
                  <dd className="mt-1 text-sm font-medium">{evidence.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {activeDecision.actions.map((action, index) => (
                <button
                  type="button"
                  key={action.id}
                  disabled={mutationPending}
                  className={`week-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold ${
                    index === 0
                      ? 'bg-cyan-400 text-slate-950'
                      : 'border border-line bg-card/50 text-ink-soft'
                  }`}
                  onClick={() => handlePlanningAction(action)}
                >
                  {action.label}
                  {index === 0 && <MoveRight className="h-4 w-4" />}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-4 border-t border-line/70 pt-4 text-sm">
              {openDecisions.length > 1 && (
                <button
                  type="button"
                  className="week-focus min-h-11 text-ink-soft"
                  onClick={() => setDecisionIndex((current) => (current + 1) % openDecisions.length)}
                >
                  Next decision
                </button>
              )}
              <button
                type="button"
                className="week-focus min-h-11 text-ink-muted"
                onClick={() => dismissDecision(activeDecision)}
              >
                Dismiss for now
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-32 items-center gap-4 p-5 sm:p-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
              <Check className="h-6 w-6" />
            </span>
            <div>
              <h2 id="planning-decision-heading" className="text-lg font-semibold">This week looks balanced</h2>
              <p className="mt-1 text-sm text-ink-muted">No capacity, estimate, rollover, or scheduling decision needs attention.</p>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-2" aria-label="Agenda filters">
        <button
          type="button"
          className={`week-focus min-h-11 rounded-xl border px-3 text-sm ${domain === 'all' ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300' : 'border-line text-ink-soft'}`}
          aria-pressed={domain === 'all'}
          onClick={() => setDomain('all')}
        >All domains</button>
        {populatedDomains.map((candidate) => (
          <button
            type="button"
            key={candidate}
            className={`week-focus flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm ${domain === candidate ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300' : 'border-line text-ink-soft'}`}
            aria-pressed={domain === candidate}
            onClick={() => setDomain(candidate)}
          >
            <DomainIcon domain={candidate} />{domainLabel[candidate]}
          </button>
        ))}
        {isTodayPlanning ? (
          <Link
            to="/"
            className="week-focus ml-auto inline-flex min-h-11 items-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-300"
          >
            Open Today
          </Link>
        ) : (
          <button
            type="button"
            className="week-focus ml-auto min-h-11 rounded-xl border border-line px-3 text-sm text-ink-soft"
            aria-pressed={!showCompleted}
            onClick={() => setShowCompleted((value) => !value)}
          >
            {showCompleted ? 'Hide completed' : 'Show completed'}
          </button>
        )}
      </section>

      <div className="week-master-detail">
        <section className="min-w-0 space-y-4" data-testid="week-agenda" aria-labelledby="week-agenda-heading">
          <div className="flex items-end justify-between gap-4 border-b border-line pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Selected scope</p>
              <h2 id="week-agenda-heading" className="mt-1 text-xl font-semibold">
                {scope.kind === 'all'
                  ? 'All Week agenda'
                  : isTodayPlanning ? 'Today planning snapshot' : dateLabel(scope.date, today)}
              </h2>
              {isTodayPlanning && (
                <p className="mt-1 max-w-xl text-sm text-ink-muted">
                  Unresolved Items and Calendar obligations only. Habits stay in cadence; execution stays on Today.
                </p>
              )}
            </div>
            <span className="shrink-0 text-sm text-ink-muted">
              {agenda.totalCount} {isTodayPlanning ? 'unresolved' : 'shown'}
            </span>
          </div>

          {agenda.days.length === 0 || agenda.totalCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-muted">
              {domain === 'habit' && scope.kind === 'all'
                ? 'Habits are summarized in Habit cadence.'
                : isTodayPlanning
                  ? 'No unresolved one-off Items or Calendar obligations. Habits are summarized in cadence.'
                : showCompleted ? 'Nothing planned for this scope.' : 'No incomplete Items in this scope.'}
            </div>
          ) : agenda.days.map((day) => (
            <section key={day.date} aria-labelledby={`agenda-${day.date}`} className="space-y-3">
              {scope.kind === 'all' && (
                <h3 id={`agenda-${day.date}`} className="sticky top-0 z-10 border-b border-line bg-page/95 py-2 text-sm font-semibold backdrop-blur">
                  {dateLabel(day.date, today)}
                </h3>
              )}
              {(['scheduled', 'all_day', 'anytime'] as const).map((group) => {
                const entries = day.entries.filter((entry) => entry.group === group)
                if (!entries.length) return null
                const label = group === 'scheduled' ? 'Scheduled' : group === 'all_day' ? 'All-day obligations' : 'Anytime'
                return (
                  <div key={group} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      {group === 'scheduled' ? <Clock className="h-4 w-4" /> : group === 'anytime' ? <InfinityIcon className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                      {label}
                    </div>
                    {entries.map((entry) => (
                      <article
                        key={`${entry.source}-${entry.id}-${entry.date}`}
                        data-date={entry.date}
                        className={`flex items-center gap-3 rounded-2xl border border-line bg-card/45 p-3 ${isTodayPlanning ? 'min-h-14' : 'min-h-16'}`}
                      >
                        {isTodayPlanning ? (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-raised text-cyan-300">
                            <DomainIcon domain={entry.domain} />
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={`week-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${
                              entry.completed ? 'border-emerald-400 bg-emerald-500 text-white' : entry.addressed ? 'border-slate-400 bg-slate-500/20 text-ink-soft' : 'border-line-strong'
                            }`}
                            disabled={mutationPending}
                            aria-label={entry.source === 'item' && entry.item?.type === 'habit'
                              ? `Record outcome for ${entry.title}`
                              : entry.completed ? `Mark ${entry.title} incomplete` : `Mark ${entry.title} complete`}
                            onClick={() => toggleEntry(entry)}
                          >
                            {entry.completed ? <Check className="h-5 w-5" /> : entry.addressed ? <span aria-hidden="true">—</span> : null}
                          </button>
                        )}
                        {!isTodayPlanning && (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-raised text-cyan-300"><DomainIcon domain={entry.domain} /></span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-medium ${entry.completed ? 'text-ink-muted line-through' : 'text-ink'}`}>{entry.title}</p>
                          <p className="mt-1 text-xs text-ink-muted">
                            {entry.time ? timeLabel(entry.time) : domainLabel[entry.domain]}
                            {entry.item?.type === 'habit' && entry.item.habitInfo ? ` · ${outcomeLabel(entry.item.habitInfo.outcome)}` : ''}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                )
              })}
            </section>
          ))}
        </section>

        <aside className="min-w-0 space-y-5">
          <section className="border-b border-line pb-5" aria-labelledby="scope-status-heading">
            <h2 id="scope-status-heading" className="text-base font-semibold">{scope.kind === 'all' ? 'Week status' : 'Day status'}</h2>
            <p className="mt-2 text-2xl font-bold">{completion.addressed ?? completion.completed} of {completion.total} addressed</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-label="Item completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion.percent ?? 0}>
              <div className="h-full bg-cyan-400" style={{ width: `${completion.percent ?? 0}%` }} />
            </div>
            {summary.obligations.total > 0 && <p className="mt-2 text-xs text-ink-muted">{summary.obligations.completed} of {summary.obligations.total} Calendar obligations marked complete</p>}
          </section>

          <section className="border-b border-line pb-5" aria-labelledby="capacity-heading">
            <h2 id="capacity-heading" className="text-base font-semibold">Capacity by day</h2>
            <div className="mt-3 space-y-3">
              {(selectedDay ? [selectedDay] : summary.days).map((day) => {
                const copy = capacityCopy(day)
                return (
                  <div key={day.date} className="flex gap-3">
                    {day.capacity.status === 'complete'
                      ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{dateLabel(day.date, today)} · {copy.title}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">{copy.detail}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {summary.habitCadence.length > 0 && (domain === 'all' || domain === 'habit') && (
            <section className="border-b border-line pb-5" aria-labelledby="habit-cadence-heading">
              <h2 id="habit-cadence-heading" className="text-base font-semibold">Habit cadence</h2>
              <div className="mt-3 space-y-3">
                {summary.habitCadence.map((habit) => {
                  const expanded = expandedHabitId === habit.originalHabitId
                  return (
                    <div key={habit.originalHabitId} className="rounded-2xl border border-line bg-card/35 p-3">
                      <button
                        type="button"
                        className="week-focus flex min-h-11 w-full items-center justify-between gap-3 text-left"
                        aria-expanded={expanded}
                        onClick={() => setExpandedHabitId(expanded ? null : habit.originalHabitId)}
                      >
                        <span className="truncate text-sm font-medium">{habit.title}</span>
                        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                      <div className="mt-2 grid grid-cols-7 gap-1" aria-label={`${habit.title} week outcomes`}>
                        {habit.days.map((cell, index) => (
                          <button
                            type="button"
                            key={summary.days[index].date}
                            className={`week-focus flex h-11 min-w-0 items-center justify-center rounded-lg border text-[10px] font-semibold ${
                              cell?.outcome === 'completed' ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-300'
                                : cell?.outcome === 'failed' ? 'border-slate-400/60 bg-slate-500/20 text-ink-soft'
                                  : cell?.outcome === 'partial' ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                                    : 'border-line text-ink-muted'
                            }`}
                            disabled={!cell}
                            aria-label={`${habit.title}, ${format(parseISO(summary.days[index].date), 'EEEE')}, ${cell ? outcomeLabel(cell.outcome) : 'not due'}`}
                            onClick={() => cell && openHabitCell(cell.itemId)}
                          >
                            {cell?.outcome === 'completed' ? '✓' : cell?.outcome === 'failed' ? '—' : cell?.outcome === 'partial' ? '½' : format(parseISO(summary.days[index].date), 'EEEEE')}
                          </button>
                        ))}
                      </div>
                      {expanded && (
                        <div className="mt-3 space-y-1 border-t border-line pt-3">
                          {habit.days.map((cell, index) => cell && (
                            <button
                              type="button"
                              key={cell.itemId}
                              className="week-focus flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-sm hover:bg-raised"
                              onClick={() => openHabitCell(cell.itemId)}
                            >
                              <span>{format(parseISO(summary.days[index].date), 'EEEE')}</span>
                              <span className="text-ink-muted">{outcomeLabel(cell.outcome)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <section aria-labelledby="contributions-heading">
            <h2 id="contributions-heading" className="text-base font-semibold">This week</h2>
            <div className="mt-3 space-y-2">
              {summary.contributions.map((contribution) => (
                <div key={contribution.domain} className="flex min-h-11 items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-raised text-cyan-300"><DomainIcon domain={contribution.domain} /></span>
                  <span className="flex-1 text-sm text-ink-soft">{domainLabel[contribution.domain]}</span>
                  <span className="text-sm font-semibold">{contribution.addressed}/{contribution.total}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {habitCheckIn && (
        <HabitOutcomeSheet
          habit={habitCheckIn.habit}
          date={habitCheckIn.date}
          onClose={() => {
            setHabitCheckIn(null)
            queryClient.invalidateQueries({ queryKey: WEEK_SUMMARY_QUERY_KEY })
          }}
        />
      )}
    </main>
  )
}
