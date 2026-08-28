import {
  useState,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
} from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, addDays, subDays, isSameDay, isBefore } from 'date-fns'
import {
  AlertTriangle,
  Award,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  Brain,
  HeartPulse,
  Plus,
  RotateCcw,
  Share2,
  Sparkles,
  Trash2,
  Utensils,
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import FocusBlockRow from '../components/today/FocusBlockRow'
import FocusBlockOverlay from '../components/today/FocusBlockOverlay'
import WorkReviewSheet from '../components/work/WorkReviewSheet'
import { useTodayFocusBlocks } from '../hooks/useTodayFocusBlocks'
import {
  calendarService,
  dailySignalsQueryKey,
  daySummaryQueryKey,
  daySummaryService,
  DAILY_SIGNALS_QUERY_KEY,
  DAY_SUMMARY_QUERY_KEY,
  isDaySummaryItemAddressed,
  rhythmService,
  settingsService,
  taskService,
  ExternalCalendarEvent,
  FocusBlockTransitionInput,
  Task,
  HabitItem,
  TouchpointType,
  UserRhythm,
  type DaySummary,
} from '../services/api'
import DayTimeline, { timedFocusBlockHeight } from '../components/DayTimeline'
import { buildTimelineRecords } from '../timelineRecords'
import AIRecommendationsBox from '../components/AIRecommendationsBox'
import { DAILY_SIGNALS_ENABLED } from '../featureFlags'
import TaskEditModal from '../components/TaskEditModal'
import SmartReminders from '../components/SmartReminders'
import LoadingSpinner from '../components/LoadingSpinner'
import { showUndoToast } from '../components/UndoToast'
import {
  formatRelativeDate,
  formatScheduleHeading,
  formatSelectedDateAnnouncement,
  getDaySwipeDirection,
  getWeekDates,
  getWeekNavigationIndex,
  type WeekStartsOn,
} from '../utils/dateHelpers'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettings } from '../hooks/useSettings'
import { clearLocalDay, isStrandedLocalDay } from '../lib/local/store'
import { useHeldDay } from '../hooks/useHeldDay'
import HabitOutcomeSheet from '../components/HabitOutcomeSheet'
import { enabledModulePresentations, getModulePresentation, moduleHealthHref } from '../modulePresentation'
import {
  demoPersonaById,
  readDemoAcquisition,
} from '../demoPersonas'
import { analytics } from '../lib/analytics'
import { completionHaptic, shareFromHealthyFlow } from '../lib/native'
import { updateTodayWidget } from '../lib/widget'
import { talkHandoffState } from '../talkHandoff'

const touchpointCtas: Record<TouchpointType, { title: string; body: string; button: string }> = {
  morning: {
    title: 'Morning planning is ready',
    body: 'Set the shape of the day before the timeline fills up.',
    button: 'Start morning planning',
  },
  midday: {
    title: 'Mid-day check-in is ready',
    body: 'Rebalance what is left and move anything that changed.',
    button: 'Start mid-day check-in',
  },
  weekly: {
    title: 'Weekly planning is ready',
    body: 'Zoom out, reset priorities, and make the week easier to trust.',
    button: 'Start weekly planning',
  },
}

type TouchpointCta = (typeof touchpointCtas)[TouchpointType]

type DueKickoff = {
  type: TouchpointType
  startMinutes: number
} & TouchpointCta

const weekdayIndexes: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

const touchpointWindowMinutes: Record<TouchpointType, number> = {
  morning: 4 * 60,
  midday: 4 * 60,
  weekly: 12 * 60,
}

const daytimeCutoffs = {
  morningEnds: 12 * 60,
  middayEnds: 18 * 60,
}

/** Which Focus block's overlay was open, so an accidental reload can restore it. */
const FOCUS_OVERLAY_KEY = 'hf.focusOverlay'

const DAY_SWIPE_IGNORED_TARGETS = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[data-timeline-drag-handle="true"]',
  '[data-timeline-drag-id]',
  '[data-testid="timeline-draggable-task"]',
  '[data-no-day-swipe="true"]',
].join(',')

type DaySwipeGesture = {
  identifier: number
  startX: number
  startY: number
  currentX: number
  currentY: number
  cancelled: boolean
}

function parseTimeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return (hours || 0) * 60 + (minutes || 0)
}

function getRhythmLocalParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value
  const weekday = weekdayIndexes[value('weekday') ?? ''] ?? now.getDay()
  const hour = Number(value('hour') ?? now.getHours())
  const minute = Number(value('minute') ?? now.getMinutes())
  return { weekday, minutes: hour * 60 + minute }
}

function getDueKickoff(rhythm: UserRhythm | undefined, now: Date): DueKickoff | null {
  if (!rhythm) return null

  const { weekday, minutes } = getRhythmLocalParts(now, rhythm.timezone)
  const candidates: DueKickoff[] = []

  const addCandidate = (type: TouchpointType, startMinutes: number) => {
    const windowMinutes = touchpointWindowMinutes[type]
    if (minutes >= startMinutes && minutes < startMinutes + windowMinutes) {
      candidates.push({ type, startMinutes, ...touchpointCtas[type] })
    }
  }

  if (rhythm.morning.enabled && rhythm.morning.days.includes(weekday)) {
    addCandidate('morning', parseTimeToMinutes(rhythm.morning.time))
  }

  if (rhythm.midday.enabled && rhythm.midday.days.includes(weekday)) {
    addCandidate('midday', parseTimeToMinutes(rhythm.midday.time))
  }

  if (rhythm.weekly.enabled && rhythm.weekly.day === weekday) {
    addCandidate('weekly', parseTimeToMinutes(rhythm.weekly.time))
  }

  const scheduledDue = candidates.sort((a, b) => b.startMinutes - a.startMinutes)[0]
  if (scheduledDue) return scheduledDue

  if (rhythm.weekly.enabled && rhythm.weekly.day === weekday) {
    return {
      type: 'weekly',
      startMinutes: parseTimeToMinutes(rhythm.weekly.time),
      ...touchpointCtas.weekly,
    }
  }

  if (minutes < daytimeCutoffs.morningEnds && rhythm.morning.days.includes(weekday)) {
    return {
      type: 'morning',
      startMinutes: parseTimeToMinutes(rhythm.morning.time),
      ...touchpointCtas.morning,
    }
  }

  if (minutes < daytimeCutoffs.middayEnds && rhythm.midday.days.includes(weekday)) {
    return {
      type: 'midday',
      startMinutes: parseTimeToMinutes(rhythm.midday.time),
      ...touchpointCtas.midday,
    }
  }

  return {
    type: 'midday',
    startMinutes: parseTimeToMinutes(rhythm.midday.time),
    ...touchpointCtas.midday,
  }
}

function WeekRibbon({
  selectedDate,
  onSelect,
  loadByDay,
  weekStartsOn,
}: {
  selectedDate: Date
  onSelect: (d: Date) => void
  loadByDay: Record<string, { total: number; completed: number; addressed?: number }>
  weekStartsOn: WeekStartsOn
}) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const today = new Date()
  const days = getWeekDates(selectedDate, weekStartsOn)

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const targetIndex = getWeekNavigationIndex(index, event.key)
    if (targetIndex === null) return
    event.preventDefault()
    onSelect(days[targetIndex])
    window.requestAnimationFrame(() => buttonRefs.current[targetIndex]?.focus())
  }

  return (
    <div
      role="group"
      aria-label="Week dates"
      className="mt-2.5 grid grid-cols-7 gap-1.5 lg:mt-4 lg:gap-2"
    >
      {days.map((day, index) => {
        const key = format(day, 'yyyy-MM-dd')
        const load = loadByDay[key] ?? { total: 0, completed: 0, addressed: 0 }
        const addressed = load.addressed ?? load.completed
        const isSelected = isSameDay(day, selectedDate)
        const isFuture = isBefore(today, day) && !isSameDay(day, today)
        const allDone = load.total > 0 && addressed >= load.total
        const pct = load.total > 0 ? Math.round((addressed / load.total) * 100) : 0
        const barColor = allDone ? '#4ade80' : '#22d3ee'

        return (
          <button
            key={key}
            ref={(button) => { buttonRefs.current[index] = button }}
            type="button"
            onClick={() => onSelect(day)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            tabIndex={isSelected ? 0 : -1}
            aria-current={isSelected ? 'date' : undefined}
            aria-label={`${format(day, 'EEEE, MMMM d, yyyy')}, ${addressed} of ${load.total} addressed`}
            data-week-date={key}
            data-demo-id={isSelected ? 'week-tab' : undefined}
            className={`flex flex-col overflow-hidden rounded-xl border transition-all ${
              isSelected
                ? 'border-accent/50 bg-accent/[.12]'
                : 'border-line/50 bg-card/[.35] hover:border-accent/30'
            }`}
          >
            {/* content: stacked on mobile, row on desktop */}
            <div className="flex flex-1 flex-col items-center gap-1 pt-2 lg:flex-row lg:justify-between lg:gap-2 lg:px-3 lg:pb-2 lg:pt-2.5">
              <time dateTime={key} className="flex flex-col items-center gap-1 lg:flex-row lg:items-baseline lg:gap-1.5">
                <span
                  className={`text-[10px] tracking-wide lg:uppercase lg:tracking-widest ${
                    isSelected ? 'font-semibold text-accent' : 'text-ink-muted'
                  }`}
                >
                  <span className="lg:hidden">{format(day, 'EEEEE')}</span>
                  <span className="hidden lg:inline">{format(day, 'EEE')}</span>
                </span>
                <span
                  className={`text-[15px] leading-none lg:text-lg ${
                    isSelected
                      ? 'font-bold text-accent'
                      : isFuture
                        ? 'font-semibold text-ink-muted'
                        : 'font-semibold text-ink-soft'
                  }`}
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {format(day, 'd')}
                </span>
              </time>
              <span
                className={`text-[10px] font-semibold lg:text-[11px] ${
                  allDone && !isSelected
                    ? 'text-state-success'
                    : isSelected
                      ? 'text-accent'
                      : 'text-ink-muted'
                }`}
              >
                {isFuture ? (
                  <>
                    <span className="lg:hidden">{load.total || '·'}</span>
                    <span className="hidden lg:inline">
                      {load.total ? `${load.total} tasks` : '—'}
                    </span>
                  </>
                ) : (
                  `${addressed}/${load.total}`
                )}
              </span>
            </div>
            {/* fill bar */}
            <span
              className={`mt-1 block h-[3px] w-full lg:mt-0 ${
                isSelected ? 'bg-accent/15' : 'bg-[#1c2739]'
              }`}
            >
              {!isFuture && load.total > 0 && (
                <span
                  className="block h-full"
                  style={{ width: `${pct}%`, background: barColor }}
                />
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const focusReasonCopy: Record<NonNullable<DaySummary['attention']['focus']['reasonCode']>, string> = {
  active_timed_item: 'This is the Item planned for the current time.',
  overdue_timed_item: 'Its planned start has passed and it is still incomplete.',
  first_anytime_item: 'This is first in your Anytime order.',
  past_incomplete_item: 'This Item was left incomplete on this past day.',
  first_future_item: 'This is the first planned Item for this future day.',
}

const capacityReasonCopy: Record<DaySummary['capacity']['reasonCodes'][number], string> = {
  planning_window_missing: 'Set a usable-day window in Settings.',
  planning_window_invalid: 'The usable-day window needs correction.',
  timezone_missing: 'A time zone is required.',
  timezone_invalid: 'The saved time zone needs correction.',
  calendar_unavailable: 'Calendar obligations could not be checked.',
  calendar_event_all_day: 'An all-day obligation has no duration.',
  calendar_event_missing_time: 'An obligation is missing its time.',
  calendar_event_invalid_time: 'An obligation has an invalid time.',
  item_missing_duration: 'One or more timed Items have no duration.',
  item_invalid_duration: 'One or more Item durations need correction.',
  item_invalid_start_time: 'One or more Items have an invalid start time.',
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours === 0) return `${remainder}m`
  if (remainder === 0) return `${hours}h`
  return `${hours}h ${remainder}m`
}

function itemTypeLabel(item: DaySummary['items'][number]) {
  if (item.type === 'habit') return 'Habit'
  if (item.type === 'workout') return 'Workout'
  if (item.type === 'meal') return 'Meal'
  if (item.type === 'grocery') return 'Grocery'
  return 'Item'
}

type DailyPlanReference = DaySummary['dailyPlan']['references'][number]

function dailyPlanReferenceTitle(summary: DaySummary, reference: DailyPlanReference) {
  if (reference.kind === 'calendar_event' || reference.kind === 'calendar_transition') {
    const event = summary.calendar.events.find(candidate => candidate.id === reference.sourceId)
    if (!event) return null
    return reference.kind === 'calendar_transition' ? `Transition after ${event.title}` : event.title
  }
  if (reference.kind === 'focus_block') {
    const block = summary.work.focusBlocks.find(candidate => candidate.id === reference.sourceId)
    if (!block) return null
    return block.standaloneTitle ?? block.project?.name ?? block.tasks[0]?.title ?? 'Focus block'
  }
  if (
    reference.kind === 'task' || reference.kind === 'habit' || reference.kind === 'grocery' ||
    reference.kind === 'meal_plan' || reference.kind === 'workout_plan'
  ) {
    return summary.items.find(candidate => candidate.id === reference.sourceId)?.title ?? null
  }
  if (reference.kind === 'progress_target') {
    return summary.supporting.progress.targets.find(
      candidate => candidate.achievementId === reference.sourceId
    )?.name ?? null
  }
  return null
}

function dailyPlanReferenceModule(reference: DailyPlanReference) {
  if (reference.kind === 'calendar_transition') return 'Protected transition'
  if (reference.kind === 'calendar_event') return 'Calendar · fixed'
  if (reference.kind === 'focus_block') return 'Work · Focus block'
  if (reference.kind === 'meal_plan') return 'Nutrition · Meal plan'
  if (reference.kind === 'workout_plan') return 'Workouts · Workout plan'
  if (reference.kind === 'habit') return 'Habits · Habit instance'
  if (reference.kind === 'task') return 'Tasks · Task'
  if (reference.kind === 'grocery') return 'Tasks · Grocery Item'
  if (reference.kind === 'progress_target') return 'Progress · target'
  return reference.module
}

function isOpenDailyPlanReference(summary: DaySummary, reference: DailyPlanReference) {
  if (reference.semantics === 'actual') return false
  if (reference.kind === 'calendar_event') {
    return !summary.calendar.events.find(candidate => candidate.id === reference.sourceId)?.completed
  }
  return !['completed', 'canceled', 'failed', 'recorded'].includes(reference.state)
}

type DayContextDisclosureProps = {
  dateKey: string
  id: 'habits' | 'nutrition' | 'workouts' | 'progress'
  icon: ReactNode
  title: string
  summary: string
  children: ReactNode
}

function DayContextDisclosure({
  dateKey,
  id,
  icon,
  title,
  summary,
  children,
}: DayContextDisclosureProps) {
  const [expanded, setExpanded] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const triggerId = `day-context-${id}-trigger`
  const panelId = `day-context-${id}-panel`

  useEffect(() => setExpanded(false), [dateKey])

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    setExpanded(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <div>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((current) => !current)}
        className="group flex min-h-11 w-full items-start gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <span className="mt-0.5 shrink-0" aria-hidden="true">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{summary}</span>
        </span>
        <ChevronRight
          className={`mt-1 h-4 w-4 shrink-0 text-ink-muted transition-transform motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={triggerId}
          tabIndex={-1}
          onKeyDown={handlePanelKeyDown}
          className="pb-4 pl-7 pr-1"
        >
          {children}
        </div>
      )}
    </div>
  )
}

function habitOutcomeLabel(habit: DaySummary['items'][number]) {
  const outcome = habit.habitInfo?.outcome ?? (habit.completed ? 'completed' : 'pending')
  if (outcome === 'completed') return 'Completed'
  if (outcome === 'partial') return 'Partial'
  if (outcome === 'failed') return 'Not done'
  return 'Pending'
}

function habitTargetUnit(unit: 'minutes' | 'reps' | 'count') {
  if (unit === 'minutes') return 'min'
  if (unit === 'reps') return 'reps'
  return ''
}

function nutritionMetricCopy(
  metric: DaySummary['supporting']['nutrition']['calories'],
  unit: 'kcal' | 'g'
) {
  if (metric.value === null) return 'Unavailable'
  const value = `${metric.value}${unit === 'g' ? 'g' : ' kcal'}`
  return metric.status === 'partial' ? `${value} known` : value
}

function workoutExerciseMetricCopy(
  exercise: Pick<
    DaySummary['supporting']['workouts']['sessions'][number]['exercises'][number],
    'sets' | 'reps' | 'weightKg' | 'durationMinutes' | 'distanceKm'
  >
) {
  return [
    exercise.sets !== null ? `${exercise.sets} sets` : null,
    exercise.reps !== null ? `${exercise.reps} reps` : null,
    exercise.weightKg !== null ? `${exercise.weightKg} kg` : null,
    exercise.durationMinutes !== null ? `${exercise.durationMinutes} min` : null,
    exercise.distanceKm !== null ? `${exercise.distanceKm} km` : null,
  ].filter((metric): metric is string => metric !== null)
}

function DecisionBand({ summary, nowMinutes }: { summary: DaySummary; nowMinutes: number | null }) {
  const focus = summary.attention.focus
  const focusItem = focus.itemId
    ? summary.items.find((item) => item.id === focus.itemId)
    : null
  const next = summary.attention.nextObligation
  const nextPlanned = summary.attention.nextPlannedItem
  const nextCalendar = summary.attention.nextCalendarObligation
  const capacity = summary.capacity
  const capacityEnabled = summary.settings.planningWindow !== null
  const activeFocusReference = summary.dailyPlan.references.find(
    reference => reference.kind === 'focus_block' && reference.state === 'active'
  )
  const activeFocusBlock = activeFocusReference
    ? summary.work.focusBlocks.find(block => block.id === activeFocusReference.sourceId) ?? null
    : null
  const nextCutoff = summary.dateMode === 'future'
    ? -1
    : summary.dateMode === 'today'
      ? nowMinutes ?? 0
      : 24 * 60
  const nextPlanReference = summary.dailyPlan.references.find((reference) => (
    reference.time !== null &&
    reference.id !== activeFocusReference?.id &&
    isOpenDailyPlanReference(summary, reference) &&
    parseTimeToMinutes(reference.time) > nextCutoff
  )) ?? null
  const nextPlanTitle = nextPlanReference
    ? dailyPlanReferenceTitle(summary, nextPlanReference)
    : null

  const addressed = summary.completion.addressed ?? summary.completion.completed
  const emptyFocusCopy = focus.state === 'completed_day'
    ? summary.completion.completed === summary.completion.total
      ? { title: 'Day complete', detail: 'Everything planned for this day is complete.' }
      : { title: 'Day addressed', detail: 'Every planned Item has a completion or Habit outcome.' }
    : focus.state === 'empty_day'
      ? { title: 'Open day', detail: 'Nothing is planned yet.' }
      : focus.state === 'nothing_needs_attention'
        ? { title: 'Nothing needs attention', detail: 'There is no unaddressed Item to surface.' }
        : focus.state === 'past_incomplete'
          ? { title: 'Past day needs review', detail: 'Incomplete work remains on this date.' }
          : focus.state === 'future_planned'
            ? { title: 'Future plan is open', detail: 'No Item needs focus before this date.' }
            : { title: 'No focus selected', detail: 'The daily plan has no eligible focus Item.' }

  const capacityTitle = capacity.status === 'complete'
    ? capacity.basis.scope === 'remaining'
      ? `${formatMinutes(capacity.availableMinutes)} usable time left`
      : `${formatMinutes(capacity.availableMinutes)} unallocated`
    : capacity.status === 'partial'
      ? `At most ${formatMinutes(capacity.availableUpperBoundMinutes)} unallocated`
      : 'Usable time unavailable'

  // The window is shown for every status that has one, including `partial`.
  // The planning window defaults rather than being chosen, so a number computed
  // against it must always state its basis — an upper bound with the window
  // hidden is exactly the unexplained figure Capacity is designed not to give.
  // Only `unavailable` has no window to show (`window: null`).
  const capacityWindowLabel = capacity.status === 'unavailable'
    ? null
    : `${capacity.window.startTime}–${capacity.window.endTime} window`

  const capacityDetail = capacity.status === 'unavailable'
    ? capacityReasonCopy[capacity.reasonCodes[0]]
    : capacity.status === 'partial'
      ? `${capacityWindowLabel} · ${capacity.reasonCodes.map((reason) => capacityReasonCopy[reason]).join(' ')}`
      : `${capacityWindowLabel} · ${formatMinutes(capacity.basis.knownLoadMinutes)} known load${capacity.window.transitionBufferMinutes ? ` · ${capacity.window.transitionBufferMinutes}m buffers` : ''}`

  return (
    <section
      aria-labelledby="daily-decisions-heading"
      data-demo-id="decision-band"
      className="overflow-hidden rounded-xl border border-line/70 bg-page/45"
    >
      <h2 id="daily-decisions-heading" className="sr-only">Daily decisions</h2>
      <div
        className="today-decision-grid"
        data-capacity-enabled={capacityEnabled ? 'true' : 'false'}
      >
        <div className="today-decision-primary min-w-0 border-b border-line/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            Focus now
          </p>
          <div className="mt-2 flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
              {focus.state === 'completed_day'
                ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                : <Clock className="h-4 w-4" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold leading-tight text-ink">
                {activeFocusBlock
                  ? dailyPlanReferenceTitle(summary, activeFocusReference as DailyPlanReference)
                  : focusItem?.title ?? emptyFocusCopy.title}
              </p>
              <p className="mt-1 text-xs font-medium text-ink-muted">
                {activeFocusBlock
                  ? 'Work · Focus block active'
                  : focusItem
                  ? `${itemTypeLabel(focusItem)} · ${focusItem.startTime ? `Planned ${focusItem.startTime}` : 'Anytime'}`
                  : emptyFocusCopy.detail}
              </p>
              {activeFocusBlock ? (
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {activeFocusBlock.intendedOutcome || 'Continue the active Focus block.'}
                </p>
              ) : focusItem && focus.reasonCode && (
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {focusReasonCopy[focus.reasonCode]}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="today-decision-secondary min-w-0 border-b border-line/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Next obligation
          </p>
          <div className="mt-2 flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-muted">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-ink">
                {nextPlanTitle ?? next?.title ?? 'No upcoming obligation'}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {nextPlanReference
                  ? `${dailyPlanReferenceModule(nextPlanReference)} · ${nextPlanReference.time}`
                  : next
                  ? `${next.source === 'calendar' ? 'Calendar' : 'Item'} · ${next.startTime}`
                  : summary.calendar.status === 'unavailable'
                    ? 'Calendar could not be checked.'
                    : 'No timed Item or calendar event is next.'}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                {nextPlanReference
                  ? nextPlanReference.kind === 'calendar_transition'
                    ? `Protected until ${nextPlanReference.endTime}.`
                    : 'This points to the owning source record; Today does not copy it.'
                  : next?.conflictIds.length
                  ? `${next.conflictIds.length} overlapping ${next.conflictIds.length === 1 ? 'obligation' : 'obligations'}`
                  : [
                      nextPlanned ? `Next Item ${nextPlanned.startTime}` : 'No next Item',
                      nextCalendar
                        ? `calendar ${nextCalendar.startTime}`
                        : summary.calendar.status === 'not_connected'
                          ? 'calendar not connected'
                          : summary.calendar.status === 'unavailable'
                            ? 'calendar unavailable'
                            : 'no next calendar event',
                    ].join(' · ')}
              </p>
            </div>
          </div>
        </div>

        {capacityEnabled && (
          <div className="today-decision-capacity min-w-0 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  {capacity.status === 'partial' ? 'Capacity · partly known' : 'Capacity'}
                </p>
                <p className="mt-2 text-base font-semibold text-ink">{capacityTitle}</p>
              </div>
              {capacity.status === 'partial' || capacity.status === 'unavailable'
                ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-state-warning" aria-label="Incomplete capacity data" />
                : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-state-success" aria-label="Capacity data complete" />}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{capacityDetail}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-ink-soft">
              <span className="font-semibold text-ink">
                {addressed} of {summary.completion.total} addressed
              </span>
              {summary.completion.percent !== null && (
                <span
                  role="progressbar"
                  aria-label="Daily Item check-in progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(summary.completion.percent)}
                  className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-raised"
                >
                  <span
                    className="block h-full bg-accent"
                    style={{ width: `${summary.completion.percent}%` }}
                  />
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function DayContextSummary({
  summary,
  enabledSummaries,
}: {
  summary: DaySummary
  enabledSummaries: ReadonlySet<string>
}) {
  const habits = summary.supporting.habits
  const nutrition = summary.supporting.nutrition
  const workouts = summary.supporting.workouts
  const progress = summary.supporting.progress
  const habitInstances = summary.items.filter((item) => item.type === 'habit')
  const habitSummaryCopy = habits.total === 0
    ? 'No Habits due this day'
    : [
        habits.completed ? `${habits.completed} completed` : null,
        habits.partial ? `${habits.partial} partial` : null,
        habits.pending ? `${habits.pending} pending` : null,
        habits.failed ? `${habits.failed} not done` : null,
      ].filter(Boolean).join(' · ')
  const weightSummaryCopy = nutrition.weight.status === 'recorded' && nutrition.weight.entry
    ? `${nutrition.weight.entry.weightKg} kg recorded`
    : nutrition.weight.status === 'not_recorded'
      ? 'Weight not recorded'
      : 'Weight unavailable'
  const nutritionSummaryCopy = nutrition.status === 'available'
    ? `${nutritionMetricCopy(nutrition.calories, 'kcal')} · ${weightSummaryCopy}`
    : nutrition.status === 'not_logged'
      ? `Calories not logged · ${weightSummaryCopy}`
      : `Calorie entries unavailable · ${weightSummaryCopy}`
  const workoutSessionCopy = workouts.status === 'logged'
    ? `${workouts.sessions.length} logged ${workouts.sessions.length === 1 ? 'session' : 'sessions'}`
    : workouts.status === 'not_logged'
      ? 'No logged sessions'
      : 'Logged sessions unavailable'
  const progressSummaryCopy = progress.status === 'unavailable'
    ? 'Progress measurements unavailable'
    : progress.status === 'recorded'
      ? `${progress.entries.length} recorded · ${progress.targets.length} ${progress.targets.length === 1 ? 'target' : 'targets'}`
      : progress.targets.length > 0
        ? `${progress.targets.length} ${progress.targets.length === 1 ? 'target' : 'targets'} · no measurement today`
        : 'No Progress targets or measurements'

  return (
    <section aria-labelledby="day-context-heading" data-demo-id="day-context">
      <h3 id="day-context-heading" className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
        Day context
      </h3>
      <div className="mt-2 divide-y divide-line/60 border-y border-line/60">
        <DayContextDisclosure
          dateKey={summary.date}
          id="habits"
          icon={<HeartPulse className="h-4 w-4 text-accent" />}
          title="Habits"
          summary={habitSummaryCopy}
        >
          {habitInstances.length === 0 ? (
            <p className="text-xs leading-relaxed text-ink-muted">
              No Habit instances are due on this date. Habit data loaded successfully.
            </p>
          ) : (
            <ul className="space-y-3">
              {habitInstances.map((habit) => {
                const target = habit.habitInfo?.target
                const progress = habit.habitInfo?.progressTotal ?? 0
                const progressPercent = target
                  ? Math.min(100, Math.round((progress / target.value) * 100))
                  : null
                return (
                  <li key={habit.id} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-xs font-medium text-ink-soft">{habit.title}</span>
                      <span className="shrink-0 text-[11px] font-medium text-ink-muted">
                        {habitOutcomeLabel(habit)}
                      </span>
                    </div>
                    {target ? (
                      <>
                        <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-ink-muted">
                          <span>
                            {progress} of {target.value}{habitTargetUnit(target.unit) ? ` ${habitTargetUnit(target.unit)}` : ''}
                          </span>
                          <span>Target {target.value}{habitTargetUnit(target.unit) ? ` ${habitTargetUnit(target.unit)}` : ''}</span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label={`${habit.title} Habit progress`}
                          aria-valuemin={0}
                          aria-valuemax={Math.max(target.value, progress)}
                          aria-valuenow={progress}
                          aria-valuetext={`${progress} of target ${target.value}${habitTargetUnit(target.unit) ? ` ${habitTargetUnit(target.unit)}` : ''}`}
                          className="mt-1.5 h-1 overflow-hidden rounded-full bg-raised"
                        >
                          <span
                            className="block h-full bg-accent"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      <p className="mt-1 text-[11px] text-ink-muted">Binary Habit · no numeric target</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </DayContextDisclosure>

        {enabledSummaries.has('nutrition') && summary.modules.nutrition !== 'disabled' && (
          <DayContextDisclosure
            dateKey={summary.date}
            id="nutrition"
            icon={<Utensils className="h-4 w-4 text-state-danger" />}
            title="Nutrition and Weight"
            summary={nutritionSummaryCopy}
          >
            <div className="space-y-3">
              {nutrition.status === 'unavailable' ? (
                <p className="text-xs leading-relaxed text-ink-muted">
                  Calorie entries could not be checked. Missing data is not counted as zero.
                </p>
              ) : nutrition.status === 'not_logged' ? (
                <p className="text-xs leading-relaxed text-ink-muted">
                  No Calorie entries were logged for this date.
                </p>
              ) : (
                <>
                  <p className="text-[11px] text-ink-muted">
                    {nutrition.entries.length} {nutrition.entries.length === 1 ? 'Calorie entry' : 'Calorie entries'}
                  </p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {([
                      ['Calories', nutrition.calories, 'kcal'],
                      ['Protein', nutrition.protein, 'g'],
                      ['Carbohydrate', nutrition.carbs, 'g'],
                      ['Fat', nutrition.fat, 'g'],
                    ] as const).map(([label, metric, unit]) => (
                      <div key={label}>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{label}</dt>
                        <dd className="mt-0.5 text-xs font-medium text-ink-soft">
                          {nutritionMetricCopy(metric, unit)}
                        </dd>
                        {metric.status === 'partial' && (
                          <p className="mt-0.5 text-[10px] leading-snug text-ink-muted">
                            Some entries are missing this value.
                          </p>
                        )}
                      </div>
                    ))}
                  </dl>
                </>
              )}
              <div className="border-t border-line/60 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Weight</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {nutrition.weight.status === 'recorded' && nutrition.weight.entry
                    ? `${nutrition.weight.entry.weightKg} kg recorded on this date`
                    : nutrition.weight.status === 'not_recorded'
                      ? 'Not recorded on this date'
                      : 'Weight data could not be checked'}
                </p>
              </div>
            </div>
          </DayContextDisclosure>
        )}

        {enabledSummaries.has('workouts') && summary.modules.workouts !== 'disabled' && (
          <DayContextDisclosure
            dateKey={summary.date}
            id="workouts"
            icon={<Dumbbell className="h-4 w-4 text-state-warning" />}
            title="Workout"
            summary={workoutSessionCopy}
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                Logged Workout sessions
              </p>
              {workouts.status === 'unavailable' ? (
                <p className="mt-1 text-xs text-ink-muted">Workout sessions could not be checked.</p>
              ) : workouts.sessions.length === 0 ? (
                <p className="mt-1 text-xs text-ink-muted">No Workout session logged for this date.</p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {workouts.sessions.map((session) => (
                    <li key={session.id} className="min-w-0">
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-ink-soft">
                          {session.title ?? 'Workout session'}
                        </span>
                        <span className="shrink-0 text-[11px] text-ink-muted">
                          {session.exercises.length} {session.exercises.length === 1 ? 'exercise' : 'exercises'}
                        </span>
                      </div>
                      {session.exercises.length === 0 ? (
                        <p className="mt-1 text-[11px] text-ink-muted">No exercises recorded</p>
                      ) : (
                        <ul className="mt-2 space-y-2 border-l border-line/60 pl-3">
                          {session.exercises.map((exercise) => {
                            const metrics = workoutExerciseMetricCopy(exercise)
                            return (
                              <li key={exercise.id} className="min-w-0">
                                <p className="truncate text-xs font-medium text-ink-soft">{exercise.name}</p>
                                <p className="mt-0.5 text-[11px] text-ink-muted">
                                  {metrics.length > 0 ? metrics.join(' · ') : 'No metrics recorded'}
                                </p>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DayContextDisclosure>
        )}

        {enabledSummaries.has('progress') && summary.modules.achievements !== 'disabled' && (
          <DayContextDisclosure
            dateKey={summary.date}
            id="progress"
            icon={<Award className="h-4 w-4 text-state-warning" />}
            title="Progress"
            summary={progressSummaryCopy}
          >
            <div className="space-y-4">
              {progress.status === 'unavailable' ? (
                <p className="text-xs leading-relaxed text-ink-muted">
                  Progress definitions and measurements could not be checked.
                </p>
              ) : (
                <>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                      Targets
                    </p>
                    {progress.targets.length === 0 ? (
                      <p className="mt-1 text-xs text-ink-muted">No active Progress targets.</p>
                    ) : (
                      <ul className="mt-2 space-y-3">
                        {progress.targets.map((target) => (
                          <li key={target.achievementId}>
                            <div className="flex items-baseline justify-between gap-3 text-xs">
                              <span className="truncate font-medium text-ink-soft">{target.name}</span>
                              <span className="shrink-0 text-[11px] text-ink-muted">
                                Target {target.targetValue} {target.unit}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-ink-muted">
                              {target.latestValue === null
                                ? 'No measurement recorded yet'
                                : `Latest ${target.latestValue} ${target.unit}`}
                            </p>
                            {target.targetProgress !== null && (
                              <div
                                role="progressbar"
                                aria-label={`${target.name} target progress`}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(target.targetProgress)}
                                className="mt-1.5 h-1 overflow-hidden rounded-full bg-raised"
                              >
                                <span
                                  className="block h-full bg-state-warning"
                                  style={{ width: `${Math.min(100, target.targetProgress)}%` }}
                                />
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="border-t border-line/60 pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                      Recorded today
                    </p>
                    {progress.entries.length === 0 ? (
                      <p className="mt-1 text-xs text-ink-muted">No Progress measurement recorded for this date.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {progress.entries.map((entry) => (
                          <li key={entry.id} className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="truncate text-ink-soft">{entry.name}</span>
                            <span className="shrink-0 font-medium text-ink">{entry.value} {entry.unit}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Link
                    to={moduleHealthHref(getModulePresentation('achievements'), summary.date)}
                    className="inline-flex min-h-11 items-center rounded-lg text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    Open Progress
                  </Link>
                </>
              )}
            </div>
          </DayContextDisclosure>
        )}
      </div>
    </section>
  )
}

function RhythmKickoffRow({ kickoff }: { kickoff: DueKickoff }) {
  return (
    <div data-demo-id="morning-planning-card" className="flex min-h-12 flex-col gap-2 border-y border-line/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <p className="truncate text-sm text-ink-soft">
          <span className="font-semibold text-ink">{kickoff.title}.</span>{' '}
          {kickoff.body}
        </p>
      </div>
      <Link
        to={`/talk?kickoff=${kickoff.type}`}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-3 text-sm font-semibold text-accent hover:bg-accent/10"
      >
        <span>{kickoff.button}</span>
      </Link>
    </div>
  )
}

export default function TodayPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [now, setNow] = useState(new Date())
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [habitDeleteCandidate, setHabitDeleteCandidate] = useState<Task | null>(null)
  const [habitCheckIn, setHabitCheckIn] = useState<HabitItem | null>(null)
  const [daySwipeOffset, setDaySwipeOffset] = useState(0)
  const [isDaySwipeTracking, setIsDaySwipeTracking] = useState(false)
  const [demoAcquisition] = useState(readDemoAcquisition)
  const [daySetupBannerDismissed, setDaySetupBannerDismissed] = useState(false)
  const daySwipeGesture = useRef<DaySwipeGesture | null>(null)
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  // Read once at mount, not inside the error branch: a hook cannot be called
  // conditionally, and the screens below need to know whose day this device holds.
  const heldDay = useHeldDay()

  const { settings, modules } = useSettings()
  const enabledTodaySummaries = new Set(
    enabledModulePresentations(modules)
      .map((presentation) => presentation.todaySummary)
      .filter((summary): summary is NonNullable<typeof summary> => summary !== null)
  )
  const selectedDateKey = format(selectedDate, 'yyyy-MM-dd')

  // Old AI deep links now enter the one Talk composer with typed context.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('ai') === 'true') {
      navigate('/talk', {
        replace: true,
        state: talkHandoffState({
          source: 'today',
          intent: 'plan_day',
          date: selectedDateKey,
        }),
      })
    }
  }, [location.search, navigate, selectedDateKey])

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(intervalId)
  }, [])

  const {
    data: daySummary,
    isLoading,
    isError: isDaySummaryError,
    error: daySummaryError,
    refetch: retryDaySummary,
  } = useQuery({
    queryKey: daySummaryQueryKey(selectedDateKey),
    queryFn: () => daySummaryService.get(selectedDateKey),
    placeholderData: (previousSummary) => previousSummary,
    retry: 1,
  })
  const tasksData = useMemo(
    () => (daySummary?.items ?? []) as Task[],
    [daySummary?.items]
  )
  const calendarEvents = daySummary?.calendar.events ?? []
  const weekStartsOn = (daySummary?.week.weekStartsOn ?? settings?.weekStartsOn ?? 1) as WeekStartsOn

  // Focus blocks belong to Work. Today renders the same record and hands every
  // action straight back — it never keeps a copy.
  const focusBlocks = daySummary?.work.focusBlocks ?? []
  const focusBlockActions = useTodayFocusBlocks(selectedDateKey)

  // The overlay is view state, so it does not survive a reload on its own. The
  // breadcrumb reopens it after an accidental refresh mid-focus without letting
  // a forgotten block wall off the app on some later visit.
  const [openFocusBlockId, setOpenFocusBlockId] = useState<string | null>(
    () => sessionStorage.getItem(FOCUS_OVERLAY_KEY)
  )
  const [reviewFocusBlockId, setReviewFocusBlockId] = useState<string | null>(null)

  const openFocusOverlay = (focusBlockId: string) => {
    sessionStorage.setItem(FOCUS_OVERLAY_KEY, focusBlockId)
    setOpenFocusBlockId(focusBlockId)
  }
  const closeFocusOverlay = () => {
    sessionStorage.removeItem(FOCUS_OVERLAY_KEY)
    setOpenFocusBlockId(null)
  }

  const activeFocusBlock = focusBlocks.find(
    (block) => block.id === openFocusBlockId && block.status === 'active'
  ) ?? null
  const reviewingFocusBlock = focusBlocks.find(
    (block) => block.id === reviewFocusBlockId && block.status === 'reviewing'
  ) ?? null

  // A block that stopped being active (finished elsewhere, cancelled in another
  // tab) must not leave a stale breadcrumb behind.
  useEffect(() => {
    if (openFocusBlockId && !activeFocusBlock && daySummary) closeFocusOverlay()
  }, [openFocusBlockId, activeFocusBlock, daySummary])

  const handleFocusTransition = async (focusBlockId: string, action: FocusBlockTransitionInput['action']) => {
    await focusBlockActions.transition.mutateAsync({ focusBlockId, action })
    if (action === 'start' || action === 'continue') {
      setReviewFocusBlockId(null)
      openFocusOverlay(focusBlockId)
      return
    }
    closeFocusOverlay()
    // finish/drift/blocked leave the block in `reviewing` on the server; the
    // sheet renders off that state rather than off a local guess.
    setReviewFocusBlockId(action === 'cancel' ? null : focusBlockId)
  }

  // Records are everything on the day that isn't an Item. All wall-clock times
  // arrive pre-resolved from the server so they reflect the user's timezone.
  const timelineRecords = useMemo(
    () => (daySummary ? buildTimelineRecords(daySummary, tasksData) : []),
    [daySummary, tasksData]
  )

  const { data: rhythm } = useQuery({
    queryKey: ['user-rhythm'],
    queryFn: rhythmService.getRhythm,
    retry: false,
  })

  const loadByDay = (daySummary?.week.days ?? []).reduce((acc, day) => {
    acc[day.date] = { total: day.total, completed: day.completed, addressed: day.addressed }
    return acc
  }, {} as Record<string, { total: number; completed: number; addressed?: number }>)

  const addressedIds = useMemo(
    () => new Set((daySummary?.items ?? []).filter(isDaySummaryItemAddressed).map((item) => item.id)),
    [daySummary?.items]
  )
  const addressedCount = daySummary?.completion.addressed ?? daySummary?.completion.completed ?? 0
  const timedLeft = tasksData.filter((task) => task.startTime && !addressedIds.has(task.id)).length
  const untimedLeft = tasksData.filter((task) => !task.startTime && !addressedIds.has(task.id)).length
  const headerSubline =
    tasksData.length === 0
      ? 'Nothing scheduled yet'
      : [
          `${addressedCount} of ${tasksData.length} addressed`,
          timedLeft ? `${timedLeft} timed left` : null,
          untimedLeft ? `${untimedLeft} untimed` : null,
        ]
          .filter(Boolean)
          .join(' · ')
  const isViewingToday = isSameDay(selectedDate, now)
  const dueKickoff = useMemo(
    () => (isViewingToday ? getDueKickoff(rhythm, now) : null),
    [isViewingToday, now, rhythm]
  )

  useEffect(() => {
    if (!isViewingToday || !daySummary) return
    void updateTodayWidget(daySummary).catch((error) => {
      console.error('[widget] could not update Today widget:', error)
    })
  }, [daySummary, isViewingToday])

  useEffect(() => {
    const syncTimedTasks = async () => {
      if (isLoading || tasksData.length === 0) return
      const date = format(selectedDate, 'yyyy-MM-dd')
      const hasTimedTasks = tasksData.some((task: Task) =>
        task.type === 'task' &&
        task.scheduledDate === date &&
        task.startTime &&
        task.googleSyncStatus !== 'skipped' &&
        (!task.syncedToGoogle || task.googleSyncStatus === 'failed')
      )
      if (!hasTimedTasks) return

      try {
        await calendarService.syncTimedTasks(date)
        queryClient.invalidateQueries({ queryKey: ['google-calendar-events', date] })
        queryClient.invalidateQueries({ queryKey: ['tasks', date] })
        queryClient.invalidateQueries({ queryKey: daySummaryQueryKey(date) })
        queryClient.invalidateQueries({ queryKey: dailySignalsQueryKey(date) })
      } catch (error) {
        console.error('Today - Error syncing timed tasks to Google Calendar:', error)
      }
    }

    syncTimedTasks()
  }, [isLoading, tasksData, selectedDate, queryClient])
  
  const completeTaskMutation = useMutation({
    mutationFn: taskService.completeTask,
    onSuccess: (completedTask) => {
      void completionHaptic()
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: DAILY_SIGNALS_QUERY_KEY })
      showUndoToast(
        `"${completedTask.title}" completed.`,
        () => {
          void taskService.updateTask(completedTask.id, { completed: false })
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['tasks'] })
              queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY })
              queryClient.invalidateQueries({ queryKey: DAILY_SIGNALS_QUERY_KEY })
            })
            .catch(() => toast.error('Could not undo completion'))
        },
        `Undo completion of ${completedTask.title}`,
      )
    },
  })

  const uncompleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      // Update task to mark as incomplete
      return taskService.updateTask(id, { completed: false })
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: DAILY_SIGNALS_QUERY_KEY })
      toast.success(`"${task.title}" marked as incomplete`)
    },
    onError: () => {
      toast.error('Failed to update task')
    }
  })

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, updates, editScope }: { id: string; updates: Partial<Task>; editScope?: 'instance' | 'habit' }) =>
      taskService.updateTask(id, updates, editScope),
    onSuccess: (updatedTask, variables) => {
      // Render the successful PUT response immediately instead of keeping the old
      // card visible until a second GET finishes. A virtual Habit can materialize
      // during the edit, so match both its submitted id and its parent Habit id.
      queryClient.setQueryData<Task[]>(['tasks', selectedDateKey], (current = []) =>
        current.map(task => {
          const sameSubmittedRow = task.id === variables.id
          const sameHabitDay = updatedTask.type === 'habit' && task.type === 'habit' && updatedTask.originalHabitId &&
            (task.originalHabitId === updatedTask.originalHabitId || task.id.startsWith(`${updatedTask.originalHabitId}-`))
          return sameSubmittedRow || sameHabitDay ? updatedTask : task
        })
      )
      queryClient.setQueryData<DaySummary>(daySummaryQueryKey(selectedDateKey), (current) => {
        if (!current) return current
        return {
          ...current,
          items: current.items.map((task) => {
            const sameSubmittedRow = task.id === variables.id
            const sameHabitDay = updatedTask.type === 'habit' && task.type === 'habit' && updatedTask.originalHabitId &&
              (task.originalHabitId === updatedTask.originalHabitId || task.id.startsWith(`${updatedTask.originalHabitId}-`))
            return sameSubmittedRow || sameHabitDay
              ? updatedTask as DaySummary['items'][number]
              : task
          }),
        }
      })
      queryClient.invalidateQueries({
        predicate: query => query.queryKey[0] === 'tasks' && query.queryKey[1] !== selectedDateKey,
      })
      queryClient.invalidateQueries({
        queryKey: variables.editScope === 'habit'
          ? DAY_SUMMARY_QUERY_KEY
          : daySummaryQueryKey(selectedDateKey),
      })
      queryClient.invalidateQueries({
        queryKey: variables.editScope === 'habit'
          ? DAILY_SIGNALS_QUERY_KEY
          : dailySignalsQueryKey(selectedDateKey),
      })
      toast.success('Task updated successfully!')
    },
    onError: () => toast.error('Failed to update task'),
  })

  const updateCalendarEventCompletionMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      calendarService.updateGoogleEventCompletion(id, completed),
    onSuccess: (updatedEvent) => {
      const date = format(selectedDate, 'yyyy-MM-dd')
      queryClient.setQueryData(
        ['google-calendar-events', date],
        (events: ExternalCalendarEvent[] = []) =>
          events.map(event => event.id === updatedEvent.id ? updatedEvent : event)
      )
      queryClient.setQueryData<DaySummary>(daySummaryQueryKey(date), (current) => current
        ? {
            ...current,
            calendar: {
              ...current.calendar,
              events: current.calendar.events.map((event) =>
                event.id === updatedEvent.id ? updatedEvent : event
              ),
            },
          }
        : current
      )
      queryClient.invalidateQueries({ queryKey: daySummaryQueryKey(date) })
      queryClient.invalidateQueries({ queryKey: dailySignalsQueryKey(date) })
    },
    onError: () => {
      toast.error('Failed to update calendar event')
    },
  })

  const updateCalendarEventScheduleMutation = useMutation({
    mutationFn: ({ id, startTime }: { id: string; startTime: string }) =>
      calendarService.updateGoogleEventSchedule(id, {
        date: format(selectedDate, 'yyyy-MM-dd'),
        startTime,
      }),
    onSuccess: (updatedEvent) => {
      const date = format(selectedDate, 'yyyy-MM-dd')
      queryClient.setQueryData(
        ['google-calendar-events', date],
        (events: ExternalCalendarEvent[] = []) =>
          events.map(event => event.id === updatedEvent.id ? updatedEvent : event)
      )
      queryClient.setQueryData<DaySummary>(daySummaryQueryKey(date), (current) => current
        ? {
            ...current,
            calendar: {
              ...current.calendar,
              events: current.calendar.events.map((event) =>
                event.id === updatedEvent.id ? updatedEvent : event
              ),
            },
          }
        : current
      )
      queryClient.invalidateQueries({ queryKey: daySummaryQueryKey(date) })
      queryClient.invalidateQueries({ queryKey: dailySignalsQueryKey(date) })
      toast.success('Calendar event moved')
    },
    onError: () => {
      toast.error('Failed to move calendar event')
    },
  })

  // ponytail: reorder mutation is now a no-op; DayTimeline calls taskService.reorderTasks directly
  // and passes back the reordered array for the optimistic cache update below.

  const deleteTaskMutation = useMutation({
    mutationFn: ({ id, deleteScope }: { id: string; deleteScope?: 'instance' | 'habit' }) =>
      taskService.deleteTask(id, deleteScope),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: DAILY_SIGNALS_QUERY_KEY })
      setHabitDeleteCandidate(null)
      toast.success('Task deleted')
    },
  })

  const skipOnboardingMutation = useMutation({
    mutationFn: () => settingsService.updateSettings({ onboardingStatus: 'skipped' }),
    onSuccess: () => {
      analytics.capture('onboarding_skipped')
      analytics.setUserProperties({ onboarding_status: 'skipped' })
      setDaySetupBannerDismissed(true)
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: () => toast.error('Failed to skip day setup'),
  })

  const handleCompleteTask = (id: string) => {
    completeTaskMutation.mutate(id)
  }

  const handleUncompleteTask = (id: string) => {
    uncompleteTaskMutation.mutate(id)
  }

  const handleCalendarEventComplete = (id: string, completed: boolean) => {
    updateCalendarEventCompletionMutation.mutate({ id, completed })
  }

  const handleCalendarEventSchedule = async (id: string, startTime: string) => {
    await updateCalendarEventScheduleMutation.mutateAsync({ id, startTime })
  }

  // Optimistic local update only — persistence happens inside DayTimeline via reorderTasks
  const handleTasksReorder = (reorderedTasks: Task[]) => {
    queryClient.setQueryData(['tasks', format(selectedDate, 'yyyy-MM-dd')], reorderedTasks)
    queryClient.setQueryData<DaySummary>(daySummaryQueryKey(selectedDateKey), (current) => current
      ? { ...current, items: reorderedTasks as DaySummary['items'] }
      : current
    )
  }

  const handleEditTask = (task: Task) => {
    setEditingTask(task)
  }

  const handleSaveTask = (taskId: string, updates: Partial<Task>, editScope?: 'instance' | 'habit') => {
    updateTaskMutation.mutate({ id: taskId, updates, editScope })
    setEditingTask(null)
  }

  const handleDeleteTask = (task: Task) => {
    if (task.type === 'habit') {
      setHabitDeleteCandidate(task)
      return
    }

    if (confirm('Are you sure you want to delete this task?')) {
      deleteTaskMutation.mutate({ id: task.id })
    }
  }

  const confirmHabitDelete = (deleteScope: 'instance' | 'habit') => {
    if (!habitDeleteCandidate) return
    deleteTaskMutation.mutate({
      id: habitDeleteCandidate.id,
      deleteScope,
    })
  }

  const handlePreviousDay = () => {
    setSelectedDate(prev => subDays(prev, 1))
  }

  const handleNextDay = () => {
    setSelectedDate(prev => addDays(prev, 1))
  }

  const handleToday = () => {
    setSelectedDate(new Date())
  }

  const handleShareDay = async () => {
    if (!daySummary) return
    const addressed = daySummary.completion.addressed ?? daySummary.completion.completed
    const text = daySummary.completion.total === 0
      ? 'I shaped a clear day in HealthyFlow.'
      : `I addressed ${addressed} of ${daySummary.completion.total} Items in HealthyFlow today.`
    try {
      await shareFromHealthyFlow({
        title: 'My HealthyFlow day',
        text,
        url: 'https://healthyflow.app',
      })
      analytics.capture('day_progress_shared', {
        addressed,
        total: daySummary.completion.total,
      })
    } catch (error) {
      if ((error as { name?: string })?.name !== 'AbortError') {
        toast.error('Could not share this day')
      }
    }
  }

  const resetDaySwipe = () => {
    daySwipeGesture.current = null
    setIsDaySwipeTracking(false)
    setDaySwipeOffset(0)
  }

  const handleDaySwipeStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!window.matchMedia('(max-width: 639px)').matches || event.touches.length !== 1) {
      resetDaySwipe()
      return
    }
    if (habitDeleteCandidate || editingTask || habitCheckIn) {
      resetDaySwipe()
      return
    }
    const target = event.target
    if (target instanceof Element && target.closest(DAY_SWIPE_IGNORED_TARGETS)) {
      resetDaySwipe()
      return
    }

    const touch = event.touches[0]
    daySwipeGesture.current = {
      identifier: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      cancelled: false,
    }
    setIsDaySwipeTracking(true)
    setDaySwipeOffset(0)
  }

  const handleDaySwipeMove = (event: TouchEvent<HTMLDivElement>) => {
    const gesture = daySwipeGesture.current
    if (!gesture || event.touches.length !== 1) {
      resetDaySwipe()
      return
    }
    const touch = Array.from(event.touches).find(({ identifier }) => identifier === gesture.identifier)
    if (!touch) {
      resetDaySwipe()
      return
    }

    gesture.currentX = touch.clientX
    gesture.currentY = touch.clientY
    const deltaX = gesture.currentX - gesture.startX
    const deltaY = gesture.currentY - gesture.startY
    if (Math.abs(deltaY) > 16 && Math.abs(deltaY) >= Math.abs(deltaX)) {
      gesture.cancelled = true
      setIsDaySwipeTracking(false)
      setDaySwipeOffset(0)
      return
    }
    if (
      Math.abs(deltaX) > Math.abs(deltaY) &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDaySwipeOffset(Math.max(-36, Math.min(36, deltaX * 0.32)))
    }
  }

  const handleDaySwipeEnd = (event: TouchEvent<HTMLDivElement>) => {
    const gesture = daySwipeGesture.current
    resetDaySwipe()
    if (!gesture || gesture.cancelled) return

    const touch = Array.from(event.changedTouches).find(
      ({ identifier }) => identifier === gesture.identifier
    )
    const endX = touch?.clientX ?? gesture.currentX
    const endY = touch?.clientY ?? gesture.currentY
    const direction = getDaySwipeDirection(endX - gesture.startX, endY - gesture.startY)
    if (direction === 'next') handleNextDay()
    if (direction === 'previous') handlePreviousDay()
  }

  // Carry-forward is now query-time (ADR-0002): incomplete untimed tasks with
  // scheduled_date NULL or < the viewed day surface automatically on GET. No
  // client-side rollover trigger needed.

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (isDaySummaryError) {
    // A day saved by a session this device can no longer produce is stranded:
    // retrying cannot reach it, and saying "retry" forever is the dead end, not
    // the fix. The only way on is to start again, and that has to be chosen with
    // the loss stated (ADR-0010, ADR-0011).
    if (isStrandedLocalDay(daySummaryError)) {
      // An account's day and a Guest's are not alike here. An account's is
      // reachable — signing in as it opens it — so offering to erase it as the
      // only way out would destroy something recoverable. Only a Guest's day
      // genuinely has no key but its own session.
      if (heldDay.kind === 'sign_in') {
        return (
          <div className="mx-auto max-w-lg rounded-xl border border-brand/30 bg-brand/10 p-5 text-center">
            <h1 className="text-lg font-semibold text-ink">This iPhone is holding another account&rsquo;s day</h1>
            <p className="mt-2 text-sm text-ink-muted">
              It belongs to {heldDay.email}. Signing in with that account opens it.
              Nothing has been lost and nothing needs to be erased.
            </p>
            <Link to="/login" className="btn-primary mt-4 inline-flex min-h-11 items-center px-4 py-2 text-sm">
              Go to sign in
            </Link>
          </div>
        )
      }

      return (
        <div className="mx-auto max-w-lg rounded-xl border border-state-danger/30 bg-state-danger/10 p-5 text-center">
          <h1 className="text-lg font-semibold text-ink">This iPhone holds a day from an earlier session</h1>
          <p className="mt-2 text-sm text-ink-muted">
            It was saved before this session began, and there is no way to reopen
            it — a guest session is the only key to its own day.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Starting fresh erases it permanently.
          </p>
          <button
            type="button"
            onClick={() => {
              void clearLocalDay()
                .then(() => window.location.reload())
                .catch((error) => console.error('[local] could not erase the stranded day:', error))
            }}
            className="btn-secondary mt-4 min-h-11 px-4 py-2 text-sm"
          >
            Start fresh on this iPhone
          </button>
        </div>
      )
    }

    return (
      <div className="mx-auto max-w-lg rounded-xl border border-state-danger/30 bg-state-danger/10 p-5 text-center">
        <h1 className="text-lg font-semibold text-ink">Could not load this daily plan</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your Items were not changed. Retry the selected date.
        </p>
        <button
          type="button"
          onClick={() => void retryDaySummary()}
          className="btn-secondary mt-4 min-h-11 px-4 py-2 text-sm"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div
      className="today-workspace relative space-y-4 pb-4 md:space-y-5 md:pb-0"
      data-testid="today-swipe-surface"
      data-swipe-active={isDaySwipeTracking ? 'true' : 'false'}
      onTouchStart={handleDaySwipeStart}
      onTouchMove={handleDaySwipeMove}
      onTouchEnd={handleDaySwipeEnd}
      onTouchCancel={resetDaySwipe}
      style={{
        touchAction: 'pan-y',
        transform: daySwipeOffset ? `translate3d(${daySwipeOffset}px, 0, 0)` : undefined,
        transition: isDaySwipeTracking
          ? 'none'
          : 'transform var(--motion-fast) ease-out',
        willChange: isDaySwipeTracking ? 'transform' : undefined,
      }}
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed top-1/2 z-40 hidden -translate-y-1/2 items-center gap-1 rounded-full border border-accent/30 bg-raised/95 px-2.5 py-1.5 text-xs font-semibold text-accent shadow-overlay max-sm:flex ${
          daySwipeOffset < 0 ? 'right-3' : 'left-3'
        }`}
        style={{
          opacity: Math.min(1, Math.abs(daySwipeOffset) / 24),
          transform: `translateY(-50%) scale(${0.88 + Math.min(1, Math.abs(daySwipeOffset) / 24) * 0.12})`,
        }}
      >
        {daySwipeOffset < 0 ? (
          <>
            <span>Next day</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </>
        ) : (
          <>
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Previous day</span>
          </>
        )}
      </div>
      <SmartReminders />
      {/* Day-first header: title row + week ribbon */}
      <div className="space-y-3">
        {/* Title + actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1
              className="text-[23px] font-bold leading-tight text-ink lg:text-[26px]"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <time dateTime={selectedDateKey}>{formatRelativeDate(selectedDate, now)}</time>
            </h1>
            <p className="text-xs text-ink-muted lg:text-[13px]">
              <time dateTime={selectedDateKey}>{format(selectedDate, 'EEEE, d MMMM')}</time>
              <span> · </span>
              {headerSubline}
              {!isSameDay(selectedDate, new Date()) && (
                <button
                  onClick={handleToday}
                  className="ml-2 text-xs font-medium text-accent transition-colors hover:text-accent"
                >
                  Today
                </button>
              )}
            </p>
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {formatSelectedDateAnnouncement(selectedDate, now)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Day nav — desktop only (mobile version lives in the week-nav row) */}
            <div className="hidden items-stretch overflow-hidden rounded-xl border border-line/60 bg-card/40 lg:flex">
              <button
                type="button"
                onClick={handlePreviousDay}
                aria-label="Previous day"
                className="flex h-11 w-11 items-center justify-center border-r border-line/60 text-ink-muted transition-colors hover:text-accent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleNextDay}
                aria-label="Next day"
                className="flex h-11 w-11 items-center justify-center text-ink-muted transition-colors hover:text-accent"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <Link
              to="/talk"
              data-demo-id="talk-button"
              className="flex min-h-11 items-center gap-1.5 rounded-xl bg-action px-4 py-2 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover"
            >
              <Sparkles className="h-4 w-4" />
              <span>Talk</span>
            </Link>
            <button
              type="button"
              onClick={handleShareDay}
              disabled={!daySummary}
              aria-label="Share today’s progress"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-card/50 text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Share2 className="h-[17px] w-[17px]" />
            </button>
            <Link
              to="/add"
              aria-label="Add"
              data-demo-id="add-task-button"
              className="flex h-11 w-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card/50 text-ink-soft transition-colors hover:border-line-strong hover:text-ink lg:w-auto lg:px-3.5"
            >
              <Plus className="h-[17px] w-[17px]" />
              <span className="hidden text-sm font-medium lg:inline">Add</span>
            </Link>
          </div>
        </div>

        {/* Week-nav row — mobile only */}
        <div className="mt-1 flex items-center justify-between lg:hidden">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            This week
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePreviousDay}
              aria-label="Previous day"
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-line/60 bg-card/40 text-ink-muted transition-colors hover:text-accent"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleNextDay}
              aria-label="Next day"
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-line/60 bg-card/40 text-ink-muted transition-colors hover:text-accent"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <WeekRibbon
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          loadByDay={loadByDay}
          weekStartsOn={weekStartsOn}
        />
      </div>

      {daySummary && (
        <DecisionBand
          summary={daySummary}
          nowMinutes={isViewingToday ? now.getHours() * 60 + now.getMinutes() : null}
        />
      )}
      {DAILY_SIGNALS_ENABLED && <AIRecommendationsBox date={selectedDateKey} />}
      {isViewingToday && dueKickoff && <RhythmKickoffRow kickoff={dueKickoff} />}

      {!daySetupBannerDismissed && settings && settings.onboardingStatus !== 'completed' && (
        <section className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/[.06] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">Set up your day</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {demoAcquisition
                ? demoPersonaById(demoAcquisition.persona).activationPrompt
                : 'Four questions, so the clock measures against your day.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => skipOnboardingMutation.mutate()}
              disabled={skipOnboardingMutation.isPending}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-ink-muted hover:bg-card hover:text-ink"
            >
              Later
            </button>
            <button
              type="button"
              onClick={() => navigate('/day-setup')}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover"
            >
              <Brain className="h-4 w-4" aria-hidden="true" />
              Set up my day
            </button>
          </div>
        </section>
      )}

      <AnimatePresence>
        {habitDeleteCandidate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setHabitDeleteCandidate(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 16 }}
              onClick={(e) => e.stopPropagation()}
              className="surface-overlay w-full max-w-md p-5"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-state-danger/30 bg-state-danger/15 text-state-danger">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-ink">Delete habit</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    Choose what to remove for "{habitDeleteCandidate.title}".
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => confirmHabitDelete('instance')}
                  className="flex items-center justify-center gap-2 rounded-lg border border-line bg-card px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
                >
                  <Calendar className="h-4 w-4" />
                  This day
                </button>
                <button
                  type="button"
                  onClick={() => confirmHabitDelete('habit')}
                  className="flex items-center justify-center gap-2 rounded-lg border border-state-danger/40 bg-state-danger/15 px-4 py-3 text-sm font-medium text-state-danger transition-colors hover:bg-state-danger/25"
                >
                  <RotateCcw className="h-4 w-4" />
                  Whole habit
                </button>
              </div>

              <button
                type="button"
                onClick={() => setHabitDeleteCandidate(null)}
                className="mt-3 w-full rounded-lg px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-card hover:text-ink-soft"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {activeFocusBlock && (
        <FocusBlockOverlay
          block={activeFocusBlock}
          isBusy={focusBlockActions.isBusy}
          onMinimize={closeFocusOverlay}
          onTransition={(action) => handleFocusTransition(activeFocusBlock.id, action)}
        />
      )}

      {reviewingFocusBlock && (
        <WorkReviewSheet
          block={reviewingFocusBlock}
          isBusy={focusBlockActions.isBusy}
          onReview={async (input) => {
            await focusBlockActions.completeReview.mutateAsync({ focusBlockId: reviewingFocusBlock.id, ...input })
            setReviewFocusBlockId(null)
          }}
          onTransition={(action) => handleFocusTransition(reviewingFocusBlock.id, action)}
        />
      )}

      <DayTimeline
        heading={formatScheduleHeading(selectedDate, now)}
        dateKey={selectedDateKey}
        tasks={tasksData}
        calendarEvents={calendarEvents}
        records={timelineRecords}
        focusBlockRows={focusBlocks.map((block) => ({
          id: block.id,
          slot: block.slot,
          clock: block.startTime,
          // Sized by its planned minutes, exactly like any other timed row.
          heightPx: timedFocusBlockHeight(block.plannedMinutes),
          render: () => (
            <FocusBlockRow
              block={block}
              isToday={isViewingToday}
              isBusy={focusBlockActions.isBusy}
              onStart={() => handleFocusTransition(block.id, 'start')}
              onResume={() => openFocusOverlay(block.id)}
              onReview={() => setReviewFocusBlockId(block.id)}
              onDelete={() => focusBlockActions.remove.mutate(block.id)}
            />
          ),
        }))}
        nowHour={isSameDay(selectedDate, now) ? now.getHours() : null}
        onTasksReorder={handleTasksReorder}
        onTasksPersisted={() => {
          queryClient.invalidateQueries({ queryKey: daySummaryQueryKey(selectedDateKey) })
          queryClient.invalidateQueries({ queryKey: dailySignalsQueryKey(selectedDateKey) })
          queryClient.invalidateQueries({ queryKey: ['tasks', selectedDateKey] })
        }}
        onCompleteTask={handleCompleteTask}
        onUncompleteTask={handleUncompleteTask}
        onCalendarEventComplete={handleCalendarEventComplete}
        onCalendarEventSchedule={handleCalendarEventSchedule}
        onEditTask={handleEditTask}
        onDeleteTask={handleDeleteTask}
        onHabitCheckIn={setHabitCheckIn}
        supportingContent={daySummary ? (
          <DayContextSummary summary={daySummary} enabledSummaries={enabledTodaySummaries} />
        ) : null}
      />
      {/* Task Edit Modal */}
      <TaskEditModal
        task={editingTask}
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleSaveTask}
      />
      {habitCheckIn && <HabitOutcomeSheet habit={habitCheckIn} date={selectedDateKey} onClose={() => setHabitCheckIn(null)} />}
      
    </div>
  )
}
