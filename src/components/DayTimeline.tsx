import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type {
  BeforeCapture,
  DragStart,
  DragUpdate,
  DraggableProvidedDragHandleProps,
  DropResult,
  MovementMode,
  ResponderProvided,
} from '@hello-pangea/dnd'
import { Award, CalendarDays, Check, Clock, Dumbbell, Flame, GripVertical, MapPin, RotateCcw, Scale } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ExternalCalendarEvent, Task, HabitItem } from '../services/api'
import TaskCard from './TaskCard'
import { taskService } from '../services/api'
import {
  isSettled,
  isStamped,
  timelineClock,
  timelineHour,
  type RecordKind,
  type TimelineRecord,
} from '../timelineRecords'

interface DayTimelineProps {
  heading?: string
  dateKey: string
  tasks: Task[]
  calendarEvents?: ExternalCalendarEvent[]
  /** Everything on the day that isn't an Item: nutrition, weight, workouts, progress. */
  records?: TimelineRecord[]
  /** Current hour (0–23) when viewing today, else null. Drives the now-line. */
  nowHour?: number | null
  onTasksReorder: (tasks: Task[]) => void
  onTasksPersisted: () => void
  onCompleteTask: (id: string) => void
  onUncompleteTask: (id: string) => void
  onCalendarEventComplete: (id: string, completed: boolean) => void
  onCalendarEventSchedule: (id: string, startTime: string) => Promise<void> | void
  onEditTask: (task: Task) => void
  onDeleteTask: (task: Task) => void
  onHabitCheckIn: (habit: HabitItem) => void
  supportingContent?: ReactNode
}

interface DragSnapshot {
  tasks: Task[]
  anytimeIds: string[]
  mode: MovementMode
}

/** A single row inside one hour, before draggable indices are assigned. */
interface SlotRow {
  key: string
  /** Wall-clock time used to order rows within the hour. */
  clock: string
  /** True for rows that belong above the now-line in the current hour. */
  settled: boolean
  draggable: boolean
  render: (dragIndex: number) => ReactNode
}

// ponytail: age badge for the anytime shelf — how stale is this untimed item.
// Effective date is the item's scheduledDate (rolled-over items keep an older one).
function ageBadge(scheduledDate: string): string | null {
  if (!scheduledDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(`${scheduledDate}T00:00:00`)
  const days = Math.round((today.getTime() - d.getTime()) / 86400000)
  if (days <= 0) return null
  if (days < 7) return `${days} day${days === 1 ? '' : 's'}`
  const weeks = Math.round(days / 7)
  return `${weeks} wk${weeks === 1 ? '' : 's'}`
}

// ponytail: mirrors backend/src/utils/hourSlots.ts — 18 slots 6am–11pm
const HOUR_SLOTS: string[] = Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`)
const HOUR_SLOT_HEIGHT_PX = 72
const COMPACT_EMPTY_SLOT_HEIGHT_PX = 28
const MIN_TIMED_TASK_MINUTES = 30
const MIN_TIMED_TASK_HEIGHT_PX = 52
const MIN_TIMED_HABIT_HEIGHT_PX = 72
const SLOT_VERTICAL_PADDING_PX = 16
const SLOT_CONTENT_GAP_PX = 4

function formatHour(slot: string): string {
  const h = parseInt(slot, 10)
  if (h === 0 || h === 12) return h === 0 ? '12 AM' : '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function eventHour(event: ExternalCalendarEvent): number | null {
  if (event.allDay) return null
  if (event.localStartTime) return parseInt(event.localStartTime, 10)
  if (!event.startAt) return null
  return new Date(event.startAt).getHours()
}

function eventTimeRange(event: ExternalCalendarEvent): string {
  if (event.allDay) return 'All day'
  if (event.localStartTime) {
    return event.localEndTime ? `${event.localStartTime} - ${event.localEndTime}` : event.localStartTime
  }

  if (!event.startAt) return 'Time not set'
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const start = formatter.format(new Date(event.startAt))
  const end = event.endAt ? formatter.format(new Date(event.endAt)) : null
  return end ? `${start} - ${end}` : start
}

function minutesFromTime(value: string): number | null {
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function eventDurationMinutes(event: ExternalCalendarEvent): number | undefined {
  if (event.allDay) return undefined

  if (event.localStartTime && event.localEndTime) {
    const start = minutesFromTime(event.localStartTime)
    const end = minutesFromTime(event.localEndTime)
    if (start === null || end === null) return undefined
    return end > start ? end - start : end + 24 * 60 - start
  }

  if (!event.startAt || !event.endAt) return undefined
  return Math.max(MIN_TIMED_TASK_MINUTES, Math.round((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60000))
}

function timedBlockHeight(duration?: number): number {
  const minutes = Math.max(duration || MIN_TIMED_TASK_MINUTES, MIN_TIMED_TASK_MINUTES)
  return Math.max(MIN_TIMED_TASK_HEIGHT_PX, Math.round((minutes / 60) * HOUR_SLOT_HEIGHT_PX))
}

function timedTaskBlockHeight(task: Task): number {
  const height = timedBlockHeight(task.duration)
  return task.type === 'habit' ? Math.max(height, MIN_TIMED_HABIT_HEIGHT_PX) : height
}

function slotHeightForContent(tasks: Task[], events: ExternalCalendarEvent[], records: TimelineRecord[], isCompacted: boolean): number {
  if (isCompacted) return COMPACT_EMPTY_SLOT_HEIGHT_PX

  const taskHeights = tasks.map(timedTaskBlockHeight)
  const eventHeights = events.map(event => timedBlockHeight(eventDurationMinutes(event)))
  const recordHeights = records.map(() => MIN_TIMED_TASK_HEIGHT_PX)
  const itemHeights = [...eventHeights, ...taskHeights, ...recordHeights]
  if (itemHeights.length === 0) return HOUR_SLOT_HEIGHT_PX

  const contentHeight =
    SLOT_VERTICAL_PADDING_PX +
    itemHeights.reduce((sum, height) => sum + height, 0) +
    Math.max(0, itemHeights.length - 1) * SLOT_CONTENT_GAP_PX

  return Math.max(HOUR_SLOT_HEIGHT_PX, contentHeight)
}

function compactableEmptySlots(slots: string[], hasContent: (slot: string) => boolean): Set<string> {
  const compacted = new Set<string>()
  let run: string[] = []

  const flush = () => {
    if (run.length >= 4) run.forEach(slot => compacted.add(slot))
    run = []
  }

  for (const slot of slots) {
    if (hasContent(slot)) flush()
    else run.push(slot)
  }
  flush()

  return compacted
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * The Anytime backlog holds only what still needs a decision. An Item leaves it
 * the moment it earns an hour — by being scheduled, or by being settled. Drag
 * persistence must use this exact predicate or the drop indices desync from what
 * is rendered.
 */
function isAnytime(task: Task): boolean {
  return timelineHour(task) === null
}

function taskDemoId(task: Task): string {
  const todayKey = localDateKey()
  if (!task.startTime && task.scheduledDate && task.scheduledDate < todayKey) return 'rollover-task'
  if (task.type === 'habit') return 'habit-row'
  return 'today-task-card'
}

function CalendarEventBlock({
  event,
  onComplete,
}: {
  event: ExternalCalendarEvent
  onComplete: (id: string, completed: boolean) => void
}) {
  return (
    <div
      className={`group relative flex h-full min-w-0 items-center overflow-hidden rounded-lg border p-2.5 transition-all duration-300 ${
        event.completed
          ? 'bg-card/50 border-line-strong/50 opacity-75'
          : 'card glass-effect hover:shadow-lg'
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={() => onComplete(event.id, !event.completed)}
          className="-m-3 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          aria-label={event.completed ? 'Uncheck calendar event' : 'Check calendar event'}
        >
          <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors sm:h-5 sm:w-5 ${event.completed ? 'border-state-success bg-state-success text-on-action' : 'border-line-strong'}`}>
            {event.completed && <Check className="h-3 w-3" />}
          </span>
        </button>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border border-state-success/30 bg-state-success/20 text-state-success">
                <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
              <h3 className={`truncate text-sm font-medium sm:text-base ${
                event.completed ? 'line-through text-ink-muted' : 'text-ink'
              }`}>
                {event.title}
              </h3>
            </div>

            <span className="hidden shrink-0 rounded-full border border-state-success/30 bg-state-success/15 px-2 py-1 text-xs text-state-success sm:inline-flex">
              Calendar
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-1 text-xs text-ink-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
            <span className="inline-flex min-w-0 items-center gap-1 text-ink-muted">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="truncate">{eventTimeRange(event)}</span>
            </span>
            {event.location && (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-ink-muted">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{event.location}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Read-only record rows. Each module gets its own accent hue so the day reads as
// colour-coded at a glance; habit progress reuses the plan hue (cyan) because a
// chunk is you doing the thing you planned, not a measurement of your body.
const RECORD_STYLE: Record<RecordKind, { icon: typeof Flame; accent: string; chip: string }> = {
  nutrition: {
    icon: Flame,
    accent: 'border-state-danger/30 bg-state-danger/10 hover:bg-state-danger/20',
    chip: 'border-state-danger/30 bg-state-danger/20 text-state-danger',
  },
  weight: {
    icon: Scale,
    accent: 'border-state-info/30 bg-state-info/10 hover:bg-state-info/20',
    chip: 'border-state-info/30 bg-state-info/20 text-state-info',
  },
  workout: {
    icon: Dumbbell,
    accent: 'border-category-fitness/30 bg-category-fitness/10 hover:bg-category-fitness/20',
    chip: 'border-category-fitness/30 bg-category-fitness/20 text-category-fitness',
  },
  progress: {
    icon: Award,
    accent: 'border-state-warning/30 bg-state-warning/10 hover:bg-state-warning/20',
    chip: 'border-state-warning/30 bg-state-warning/20 text-state-warning',
  },
  'habit-progress': {
    icon: RotateCcw,
    accent: 'border-accent/30 bg-accent/10 hover:bg-accent/20',
    chip: 'border-accent/30 bg-accent/20 text-accent',
  },
}

function TimelineRecordBlock({
  record,
  onHabitSelect,
}: {
  record: TimelineRecord
  onHabitSelect?: (habitId: string) => void
}) {
  const style = RECORD_STYLE[record.kind]
  const Icon = style.icon
  const className = `group flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg border p-2.5 text-left transition-colors ${style.accent}`

  const body = (
    <>
      <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border ${style.chip}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium text-ink">{record.title}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] tabular-nums text-ink-muted">
            <Clock className="h-3 w-3" />
            {record.time}
            {record.stamped && <span className="opacity-60">logged</span>}
          </span>
        </span>
        <span className="block truncate text-xs text-ink-muted">{record.detail}</span>
      </span>
    </>
  )

  // A progress chunk has no module page to go to — it reopens its Habit's
  // check-in sheet, which is where the rest would be logged.
  if (record.habitId) {
    return (
      <button
        type="button"
        onClick={() => onHabitSelect?.(record.habitId as string)}
        data-testid="timeline-record"
        data-record-kind={record.kind}
        className={className}
      >
        {body}
      </button>
    )
  }

  return (
    <Link
      to={record.href ?? '#'}
      data-testid="timeline-record"
      data-record-kind={record.kind}
      className={className}
    >
      {body}
    </Link>
  )
}

function NowMarker() {
  return (
    <div className="relative flex items-center gap-2 py-0.5" data-testid="timeline-now-marker">
      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black">
        Now
      </span>
      <span className="h-px flex-1 bg-accent/60" />
    </div>
  )
}

function TaskDragGrip({
  dragHandleProps,
  label,
  compact = false,
}: {
  dragHandleProps: DraggableProvidedDragHandleProps | null
  label: string
  compact?: boolean
}) {
  return (
    <div
      {...dragHandleProps}
      role="button"
      tabIndex={0}
      data-testid="timeline-task-drag-grip"
      data-timeline-drag-handle="true"
      aria-label={label}
      className="flex h-11 min-h-11 w-11 min-w-11 shrink-0 cursor-grab touch-none select-none items-center justify-center self-center rounded-md border border-line/70 bg-page/60 text-ink-muted transition-colors hover:border-accent/50 hover:text-accent active:cursor-grabbing"
    >
      <GripVertical className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
    </div>
  )
}

export default function DayTimeline({
  heading = "Today's Schedule",
  dateKey,
  tasks,
  calendarEvents = [],
  records = [],
  nowHour = null,
  onTasksReorder,
  onTasksPersisted,
  onCompleteTask,
  onUncompleteTask,
  onCalendarEventComplete,
  onCalendarEventSchedule,
  onEditTask,
  onDeleteTask,
  onHabitCheckIn,
  supportingContent,
}: DayTimelineProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragStatus, setDragStatus] = useState('')
  const [isAnytimeExpanded, setIsAnytimeExpanded] = useState(false)
  const [anytimePanelHeight, setAnytimePanelHeight] = useState(0)
  const anytimePanelRef = useRef<HTMLElement | null>(null)
  const planGridRef = useRef<HTMLDivElement | null>(null)
  const dragSnapshotRef = useRef<DragSnapshot | null>(null)

  // Split: anything with an hour goes into the clock, the rest into Anytime.
  const scheduled = tasks.filter(task => !isAnytime(task))
  const anytime = tasks.filter(isAnytime)
  const incompleteAnytime = anytime.filter(task => !task.completed)
  const anytimeWithKnownDuration = incompleteAnytime.filter(
    task => Number.isFinite(task.duration) && (task.duration ?? 0) > 0
  )
  const knownFlexibleMinutes = anytimeWithKnownDuration.length > 0
    ? anytimeWithKnownDuration.reduce((sum, task) => sum + (task.duration ?? 0), 0)
    : null
  const missingDurationCount = incompleteAnytime.length - anytimeWithKnownDuration.length

  useEffect(() => {
    setIsAnytimeExpanded(false)
  }, [dateKey])

  useEffect(() => {
    const panel = anytimePanelRef.current
    if (!panel) return
    const updateHeight = () => setAnytimePanelHeight(panel.getBoundingClientRect().height)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [])

  // Group scheduled tasks into hour buckets. A task keeps its real startTime (e.g.
  // "09:30") but renders under its hour's slot; off-the-hour times only snap to ":00"
  // when actually dragged. Hours outside 6am–11pm clamp to the nearest edge slot so a
  // timed task is never dropped from the view (it has a startTime, so it can't fall
  // through to the Anytime backlog).
  const slotBuckets: Record<string, Task[]> = {}
  for (const slot of HOUR_SLOTS) slotBuckets[slot] = []
  for (const t of scheduled) {
    slotBuckets[timelineHour(t) as string].push(t)
  }
  for (const slot of HOUR_SLOTS) {
    // Order within an hour is by minute, not by kind or creation order — a 07:05
    // record must read above a 07:45 habit.
    slotBuckets[slot].sort((a, b) =>
      timelineClock(a).localeCompare(timelineClock(b)) || a.createdAt.localeCompare(b.createdAt)
    )
  }

  const calendarBuckets: Record<string, ExternalCalendarEvent[]> = {}
  for (const slot of HOUR_SLOTS) calendarBuckets[slot] = []
  const allDayEvents = calendarEvents.filter(event => event.allDay || (!event.startAt && !event.localStartTime))
  for (const event of calendarEvents) {
    const hour = eventHour(event)
    if (hour === null) continue
    const clampedHour = Math.min(23, Math.max(6, hour))
    calendarBuckets[`${String(clampedHour).padStart(2, '0')}:00`].push(event)
  }
  // Read-only record rows bucket by their (server-resolved) logged hour.
  const recordBuckets: Record<string, TimelineRecord[]> = {}
  for (const slot of HOUR_SLOTS) recordBuckets[slot] = []
  for (const record of records) {
    recordBuckets[record.hour]?.push(record)
  }
  for (const slot of HOUR_SLOTS) {
    recordBuckets[slot].sort((a, b) => a.time.localeCompare(b.time))
  }

  const hasSlotContent = (slot: string) => slotBuckets[slot].length > 0 || calendarBuckets[slot].length > 0 || recordBuckets[slot].length > 0
  // The current hour never collapses — the now-line has to stay findable on a
  // quiet afternoon.
  const compactedEmptySlots = compactableEmptySlots(
    HOUR_SLOTS,
    slot => hasSlotContent(slot) || parseInt(slot, 10) === nowHour
  )

  // Reopen a Habit's check-in sheet from one of its progress chunks — a chunk has
  // no module page to navigate to, and the sheet is where the rest gets logged.
  const handleHabitSelect = (habitId: string) => {
    const habit = tasks.find(task => task.id === habitId)
    if (habit?.type === 'habit') onHabitCheckIn(habit)
  }

  const renderCalendarRow = (event: ExternalCalendarEvent, index: number) => (
    <Draggable draggableId={`calendar:${event.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          data-timeline-drag-handle="true"
          data-timeline-drag-id={`calendar:${event.id}`}
          className={`min-w-0 ${snapshot.isDragging ? 'opacity-90' : ''}`}
          style={{
            ...provided.draggableProps.style,
            height: timedBlockHeight(eventDurationMinutes(event)),
          }}
        >
          <CalendarEventBlock event={event} onComplete={onCalendarEventComplete} />
        </div>
      )}
    </Draggable>
  )

  const renderTaskRow = (task: Task, index: number) => (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          data-testid="timeline-draggable-task"
          data-demo-id={taskDemoId(task)}
          data-timeline-drag-id={task.id}
          data-stamped={isStamped(task) ? 'true' : 'false'}
          className="relative flex min-h-0 min-w-0 gap-1.5"
          style={{
            ...provided.draggableProps.style,
            height: timedTaskBlockHeight(task),
          }}
        >
          <TaskDragGrip dragHandleProps={provided.dragHandleProps} label={`Move ${task.title}`} compact />
          <TaskCard
            task={task}
            onComplete={onCompleteTask}
            onUncomplete={onUncompleteTask}
            onEdit={onEditTask}
            onDelete={onDeleteTask}
            onHabitCheckIn={onHabitCheckIn}
            isDragging={snapshot.isDragging || draggedTaskId === task.id}
            compact
            className="h-full min-w-0 flex-1"
          />
          {isStamped(task) && (
            // An untimed Item only has an hour because it was settled — say when,
            // or the timeline asserts a time the Item never actually had.
            <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-accent/30 bg-accent/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-accent">
              logged {timelineClock(task)}
            </span>
          )}
        </div>
      )}
    </Draggable>
  )

  const findDraggable = (id: string): HTMLElement | null => {
    const root = planGridRef.current
    if (!root) return null
    return Array.from(root.querySelectorAll<HTMLElement>('[data-timeline-drag-id]'))
      .find(element => element.dataset.timelineDragId === id) ?? null
  }

  const dragLabel = (id: string): string => {
    if (id.startsWith('calendar:')) {
      return calendarEvents.find(event => `calendar:${event.id}` === id)?.title ?? 'Calendar obligation'
    }
    return tasks.find(task => task.id === id)?.title ?? 'Item'
  }

  const destinationLabel = (droppableId: string, index: number): string => {
    if (droppableId === 'anytime') return `Anytime, position ${index + 1}`
    return `${formatHour(droppableId)} in the schedule`
  }

  const handleBeforeCapture = (before: BeforeCapture) => {
    const root = planGridRef.current
    const source = findDraggable(before.draggableId)
    const sourceTopBefore = source?.getBoundingClientRect().top ?? null

    dragSnapshotRef.current = {
      tasks: [...tasks],
      anytimeIds: anytime.map(task => task.id),
      mode: before.mode,
    }

    // The library invokes this hook before it measures any draggable or droppable.
    // Expand the real DOM synchronously so compacted hours and hidden Anytime rows
    // become valid measured destinations without a React render race.
    if (root) root.dataset.dragLayout = 'expanded'

    if (sourceTopBefore !== null && source) {
      const sourceTopAfter = source.getBoundingClientRect().top
      const delta = sourceTopAfter - sourceTopBefore
      if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, behavior: 'auto' })
    }
  }

  const handleDragStart = (start: DragStart, provided: ResponderProvided) => {
    setDraggedTaskId(start.draggableId)
    const label = dragLabel(start.draggableId)
    const message = start.mode === 'SNAP'
      ? `${label} lifted. Use arrow keys to choose a destination, Space to drop, or Escape to cancel.`
      : `${label} lifted.`
    provided.announce(message)
    setDragStatus(message)
  }

  const handleDragUpdate = (update: DragUpdate, provided: ResponderProvided) => {
    if (!update.destination) {
      provided.announce('Not over a drop destination.')
      return
    }
    const message = `Moving ${dragLabel(update.draggableId)} to ${destinationLabel(
      update.destination.droppableId,
      update.destination.index
    )}.`
    provided.announce(message)
    setDragStatus(message)
  }

  const finishDragLayout = (focusId: string) => {
    const snapshot = dragSnapshotRef.current
    const shouldRestoreFocus = snapshot?.mode === 'SNAP'

    window.requestAnimationFrame(() => {
      const anchor = findDraggable(focusId)
      const anchorTopBefore = anchor?.getBoundingClientRect().top ?? null
      planGridRef.current?.removeAttribute('data-drag-layout')

      window.requestAnimationFrame(() => {
        const restored = findDraggable(focusId)
        if (anchorTopBefore !== null && restored) {
          const delta = restored.getBoundingClientRect().top - anchorTopBefore
          if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, behavior: 'auto' })
        }
        if (shouldRestoreFocus) {
          restored?.querySelector<HTMLElement>('[data-timeline-drag-handle="true"]')
            ?.focus({ preventScroll: true })
        }
        dragSnapshotRef.current = null
      })
    })
  }

  const restorePersistedDrag = async (
    original: Task,
    updated: Task | null,
    originalAnytimeIds: string[]
  ) => {
    if (updated) {
      if (updated.id !== original.id && original.type === 'habit') {
        await taskService.rollbackDragMaterialization(updated.id, { virtualId: original.id })
      } else {
        const rollbackUpdates = {
          startTime: original.startTime ?? null,
          position: original.position ?? null,
          ...(original.type !== 'habit' ? { scheduledDate: original.scheduledDate ?? null } : {}),
        } as Partial<Task>
        await taskService.updateTask(updated.id, rollbackUpdates)
      }
    }

    if (originalAnytimeIds.length > 0) {
      await taskService.reorderTasks(originalAnytimeIds)
    }
  }

  const persistTaskDrag = async (result: DropResult) => {
    const snapshot = dragSnapshotRef.current
    const originalTasks = snapshot?.tasks ?? tasks
    const taskId = result.draggableId
    const task = originalTasks.find(item => item.id === taskId)
    const destination = result.destination
    if (!task || !destination) {
      finishDragLayout(taskId)
      return
    }

    // Must match how the Anytime list is rendered, or drop indices desync.
    const originalScheduled = originalTasks.filter(item => !isAnytime(item))
    const originalAnytime = originalTasks.filter(isAnytime)
    const zone = destination.droppableId
    let updated: Task | null = null
    let focusId = taskId

    try {
      if (zone === 'anytime') {
        const reorderedAnytime = originalAnytime.filter(item => item.id !== taskId)
        reorderedAnytime.splice(destination.index, 0, { ...task, startTime: undefined })
        const positionedAnytime = reorderedAnytime.map((item, position) => ({
          ...item,
          startTime: undefined,
          position,
        } as Task))
        const optimistic = [
          ...originalScheduled.filter(item => item.id !== taskId),
          ...positionedAnytime,
        ]
        onTasksReorder(optimistic)

        updated = await taskService.updateTask(taskId, {
          startTime: null,
          position: destination.index,
        })
        focusId = updated.id
        const reconciled = optimistic.map(item => (
          item.id === taskId ? ({ ...item, ...updated } as Task) : item
        ))
        onTasksReorder(reconciled)
        await taskService.reorderTasks(
          positionedAnytime.map(item => item.id === taskId ? updated!.id : item.id)
        )
      } else {
        const optimistic = [
          ...originalScheduled.filter(item => item.id !== taskId),
          { ...task, startTime: zone, position: null } as Task,
          ...originalAnytime.filter(item => item.id !== taskId),
        ]
        onTasksReorder(optimistic)

        updated = await taskService.updateTask(taskId, { startTime: zone, position: null })
        focusId = updated.id
        onTasksReorder(optimistic.map(item => (
          item.id === taskId ? ({ ...item, ...updated } as Task) : item
        )))
      }

      onTasksPersisted()
      const message = `${task.title} moved to ${destinationLabel(zone, destination.index)}.`
      setDragStatus(message)
      if (zone === 'anytime' && destination.index >= 2) setIsAnytimeExpanded(true)
    } catch (error) {
      onTasksReorder(originalTasks)
      let rollbackSucceeded = true
      try {
        await restorePersistedDrag(task, updated, snapshot?.anytimeIds ?? originalAnytime.map(item => item.id))
      } catch (rollbackError) {
        rollbackSucceeded = false
        console.error('Failed to compensate persisted drag', rollbackError)
      }
      onTasksPersisted()
      const message = rollbackSucceeded
        ? `${task.title} could not be moved. Its original position was restored.`
        : `${task.title} could not be moved. Refreshing the latest saved position.`
      setDragStatus(message)
      toast.error(message, { id: 'today-drag-save' })
      console.error('Failed to persist timeline drag', error)
      focusId = task.id
    } finally {
      setDraggedTaskId(null)
      finishDragLayout(focusId)
    }
  }

  const persistCalendarDrag = async (result: DropResult) => {
    const destination = result.destination
    if (!destination) {
      finishDragLayout(result.draggableId)
      return
    }
    const eventId = result.draggableId.slice('calendar:'.length)
    const event = calendarEvents.find(item => item.id === eventId)
    try {
      await onCalendarEventSchedule(eventId, destination.droppableId)
      setDragStatus(`${event?.title ?? 'Calendar obligation'} moved to ${formatHour(destination.droppableId)}.`)
    } catch {
      setDragStatus(`${event?.title ?? 'Calendar obligation'} could not be moved. Its original time was restored.`)
    } finally {
      setDraggedTaskId(null)
      finishDragLayout(result.draggableId)
    }
  }

  const handleDragEnd = (result: DropResult, provided: ResponderProvided) => {
    const label = dragLabel(result.draggableId)
    if (result.reason === 'CANCEL' || !result.destination) {
      const message = `${label} move cancelled.`
      provided.announce(message)
      setDragStatus(message)
      setDraggedTaskId(null)
      finishDragLayout(result.draggableId)
      return
    }

    if (
      result.source.droppableId === result.destination.droppableId
      && result.source.index === result.destination.index
    ) {
      const message = `${label} stayed in its original position.`
      provided.announce(message)
      setDragStatus(message)
      setDraggedTaskId(null)
      finishDragLayout(result.draggableId)
      return
    }

    if (result.draggableId.startsWith('calendar:')) {
      const eventId = result.draggableId.slice('calendar:'.length)
      const event = calendarEvents.find(e => e.id === eventId)
      if (!event || event.allDay || result.destination.droppableId === 'anytime') {
        const message = 'Calendar obligations can only move to a scheduled time.'
        provided.announce(message)
        setDragStatus(message)
        setDraggedTaskId(null)
        finishDragLayout(result.draggableId)
        return
      }
      provided.announce(`${label} dropped at ${formatHour(result.destination.droppableId)}. Saving.`)
      void persistCalendarDrag(result)
      return
    }

    provided.announce(`${label} dropped at ${destinationLabel(
      result.destination.droppableId,
      result.destination.index
    )}. Saving.`)
    void persistTaskDrag(result)
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <h2 className="text-xl font-semibold text-ink">{heading}</h2>

      {/* Named so it is distinguishable from the other role="status" regions on
          the page (Layout's module notices, LoadingSpinner) — both for assistive
          tech and for tests, which otherwise match several live regions at once. */}
      <p className="sr-only" role="status" aria-label="Schedule changes" aria-live="polite" aria-atomic="true">
        {dragStatus}
      </p>

      <DragDropContext
        onBeforeCapture={handleBeforeCapture}
        onDragStart={handleDragStart}
        onDragUpdate={handleDragUpdate}
        onDragEnd={handleDragEnd}
      >
        <div
          ref={planGridRef}
          className="today-plan-grid"
          style={{ '--today-anytime-height': `${anytimePanelHeight}px` } as CSSProperties}
        >
          {/* DOM order deliberately matches mobile: Anytime access, Schedule, supporting context. */}
          <section ref={anytimePanelRef} className="today-anytime-panel min-w-0" data-demo-id="anytime-backlog" aria-labelledby="anytime-heading">
            <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 id="anytime-heading" className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
                  Anytime <span className="font-normal normal-case tracking-normal">({anytime.length})</span>
                </h3>
                <p className="mt-0.5 text-xs text-ink-muted" data-testid="anytime-summary">
                  {incompleteAnytime.length === 0
                    ? 'All complete'
                    : `${incompleteAnytime.length} incomplete`}
                  {incompleteAnytime.length > 0 && knownFlexibleMinutes !== null
                    ? ` · ${knownFlexibleMinutes} min known`
                    : incompleteAnytime.length > 0
                      ? ' · no known minutes'
                      : ''}
                  {missingDurationCount > 0
                    ? ` · ${missingDurationCount} without duration`
                    : ''}
                </p>
              </div>
              {anytime.length > 2 && (
                <button
                  type="button"
                  aria-expanded={isAnytimeExpanded}
                  aria-controls="anytime-items"
                  onClick={() => setIsAnytimeExpanded((expanded) => !expanded)}
                  className="today-anytime-disclosure inline-flex h-11 min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium text-accent hover:bg-accent/10"
                >
                  {isAnytimeExpanded ? 'Show less' : `Show all ${anytime.length}`}
                </button>
              )}
            </div>
            <Droppable droppableId="anytime">
              {(provided, snapshot) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  id="anytime-items"
                  className={`min-h-20 space-y-2 rounded-lg border border-line/60 p-2 transition-colors ${
                    snapshot.isDraggingOver ? 'drop-zone' : 'bg-card/20'
                  }`}
                >
                  {anytime.map((task, index) => (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          data-testid="timeline-draggable-task"
                          data-demo-id={taskDemoId(task)}
                          data-timeline-drag-id={task.id}
                          data-anytime-collapsed={!isAnytimeExpanded && index >= 2 ? 'true' : 'false'}
                          className="today-anytime-item flex min-w-0 gap-1.5"
                        >
                          <TaskDragGrip dragHandleProps={provided.dragHandleProps} label={`Move ${task.title}`} compact />
                          <div className="relative min-w-0 flex-1">
                            <TaskCard
                              task={task}
                              onComplete={onCompleteTask}
                              onUncomplete={onUncompleteTask}
                              onEdit={onEditTask}
                              onDelete={onDeleteTask}
                              onHabitCheckIn={onHabitCheckIn}
                              isDragging={snapshot.isDragging || draggedTaskId === task.id}
                              compact
                              className="min-w-0"
                            />
                            {ageBadge(task.scheduledDate) && (
                              <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-state-warning/30 bg-state-warning/15 px-2 py-0.5 text-[10px] font-medium text-state-warning">
                                {ageBadge(task.scheduledDate)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}

                  {anytime.length === 0 && (
                    <div className="px-2 py-4 text-center text-ink-muted">
                      <p className="text-sm text-ink-soft">No Anytime Items.</p>
                      <p className="mt-1 text-xs text-ink-muted">Add one, or drag a scheduled Item here.</p>
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </section>

          <section className="today-schedule-panel min-w-0 space-y-3" data-demo-id="schedule-section" aria-labelledby="scheduled-heading">
            <h3 id="scheduled-heading" className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
              Schedule + obligations
            </h3>
            <div className="space-y-1">
              {HOUR_SLOTS.map(slot => {
                const slotTasks = slotBuckets[slot]
                const slotCalendarEvents = calendarBuckets[slot]
                const slotRecords = recordBuckets[slot]
                const hasContent = slotTasks.length > 0 || slotCalendarEvents.length > 0 || slotRecords.length > 0
                const isCompacted = compactedEmptySlots.has(slot)
                const isCurrentHour = parseInt(slot, 10) === nowHour
                const slotHeight = slotHeightForContent(slotTasks, slotCalendarEvents, slotRecords, isCompacted)

                // One ordered list per hour, interleaved by minute so a 07:05
                // record reads above a 07:45 habit. Draggable rows must receive
                // contiguous indices, so they are numbered after ordering.
                const slotRows: SlotRow[] = [
                  ...slotCalendarEvents.map((event): SlotRow => ({
                    key: `calendar:${event.id}`,
                    clock: event.localStartTime ?? slot,
                    settled: false,
                    draggable: true,
                    render: (index) => renderCalendarRow(event, index),
                  })),
                  ...slotTasks.map((task): SlotRow => ({
                    key: task.id,
                    clock: timelineClock(task),
                    // In the current hour, what is already settled belongs above
                    // the now-line even though its minute may be later.
                    settled: isStamped(task) || isSettled(task),
                    draggable: true,
                    render: (index) => renderTaskRow(task, index),
                  })),
                  ...slotRecords.map((record): SlotRow => ({
                    key: record.id,
                    clock: record.time,
                    settled: true,
                    draggable: false,
                    render: () => <TimelineRecordBlock record={record} onHabitSelect={handleHabitSelect} />,
                  })),
                ].sort((a, b) => a.clock.localeCompare(b.clock))

                // The now-line cuts *through* the current hour rather than sitting
                // between hours, so a thing done at 10:05 reads as behind you at 10:30.
                const settledCount = slotRows.filter(row => row.settled).length
                const ordered = isCurrentHour
                  ? [...slotRows.filter(row => row.settled), ...slotRows.filter(row => !row.settled)]
                  : slotRows

                let dragCursor = 0
                const renderedRows = ordered.map(row => {
                  const index = row.draggable ? dragCursor++ : -1
                  return <Fragment key={row.key}>{row.render(index)}</Fragment>
                })

                return (
                  <Droppable droppableId={slot} key={slot}>
                    {(provided, snapshot) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        data-testid="timeline-hour-slot"
                        data-slot={slot}
                        data-demo-id={`schedule-slot-${slot}`}
                        data-compacted={isCompacted ? 'true' : 'false'}
                        className={`timeline-slot relative flex min-w-0 gap-1 overflow-visible rounded px-1 py-2 transition-colors sm:gap-2 sm:px-2 ${hasContent ? 'z-20' : ''} ${isCompacted ? 'pointer-events-none' : ''} ${
                          snapshot.isDraggingOver
                            ? 'bg-state-info/10 drop-zone'
                            : hasContent
                              ? 'bg-card/30'
                              : isCompacted
                                ? 'bg-transparent hover:bg-card/5'
                                : 'bg-transparent hover:bg-card/10'
                        }`}
                        style={{ height: slotHeight }}
                      >
                        <span className={`w-10 flex-shrink-0 text-xs sm:w-12 ${isCompacted ? 'pt-0 text-[11px]' : 'pt-2'} ${hasContent || snapshot.isDraggingOver ? 'text-ink-muted' : 'text-ink-muted'}`}>
                          {formatHour(slot)}
                        </span>

                        <div className="relative z-10 min-w-0 flex-1 space-y-1 overflow-visible">
                          {isCurrentHour ? renderedRows.slice(0, settledCount) : renderedRows}
                          {isCurrentHour && <NowMarker />}
                          {isCurrentHour && renderedRows.slice(settledCount)}
                          {provided.placeholder}
                          {snapshot.isDraggingOver && slotTasks.length === 0 && (
                            <div className="px-1 py-1 text-xs text-state-info">Drop to schedule at {formatHour(slot)}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </Droppable>
                )
              })}
            </div>

            {allDayEvents.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium uppercase tracking-wider text-ink-muted">All-day calendar</h4>
                <div className="space-y-2 rounded-lg bg-card/20 p-3">
                  {allDayEvents.map(event => (
                    <CalendarEventBlock key={event.id} event={event} onComplete={onCalendarEventComplete} />
                  ))}
                </div>
              </div>
            )}

            {tasks.length === 0 && calendarEvents.length === 0 && (
              <div className="border-y border-line/60 px-3 py-8 text-center text-ink-muted">
                <p className="text-ink-soft">Nothing planned for this day.</p>
                <p className="mt-1 text-sm text-ink-muted">Add an Item when you are ready.</p>
              </div>
            )}
          </section>

          {supportingContent && (
            <aside className="today-supporting-panel min-w-0">
              {supportingContent}
            </aside>
          )}
        </div>
      </DragDropContext>
    </div>
  )
}
