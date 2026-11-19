import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
import { Award, Check, Clock, Dumbbell, Flame, GripVertical, Minus, Plus, RotateCcw, Scale } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ExternalCalendarEvent, Task, HabitItem } from '../services/api'
import TimelineDetailsSheet from './TimelineDetailsSheet'
import TaskCard from './TaskCard'
import { positionDayTimelineEntries } from '../utils/dayTimelineLayout'
import { formatClockRange } from '../utils/dateHelpers'
import { taskService } from '../services/api'
import {
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
  nowMinute?: number
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
  /**
   * Work Focus blocks, pre-bucketed by the caller into hour slots.
   *
   * Kept strictly apart from `tasks`: a Focus block is not an Item, is never
   * draggable, and must never reach the drag-persistence path, which would try
   * to save it as a Task.
   */
  focusBlockRows?: Array<{ id: string; slot: string; clock: string; heightPx: number; render: () => ReactNode }>
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
  heightPx: number
  draggable: boolean
  render: (dragIndex: number, overlapping: boolean) => ReactNode
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

// The legacy base scale remains shared with Focus-block callers.
const HOUR_SLOT_HEIGHT_PX = 72
const MIN_TIMED_TASK_MINUTES = 30
const MIN_TIMED_TASK_HEIGHT_PX = 52
const MIN_TIMED_HABIT_HEIGHT_PX = 72
const HOUR_HEIGHTS = [108, 144, 180, 216]

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
    return event.localEndTime ? `${event.localStartTime} - ${event.localEndTime}` : `${event.localStartTime} · duration not set`
  }

  if (!event.startAt) return 'Time not set'
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const start = formatter.format(new Date(event.startAt))
  const end = event.endAt ? formatter.format(new Date(event.endAt)) : null
  return end ? `${start} - ${end}` : `${start} · duration not set`
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
  const duration = Math.round((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60000)
  return duration > 0 ? duration : undefined
}

function timedBlockHeight(duration?: number): number {
  const minutes = Math.max(duration || MIN_TIMED_TASK_MINUTES, MIN_TIMED_TASK_MINUTES)
  return Math.max(MIN_TIMED_TASK_HEIGHT_PX, Math.round((minutes / 60) * HOUR_SLOT_HEIGHT_PX))
}

/**
 * A Focus block is sized by its planned minutes, but floors at the Habit height
 * rather than the Task one: it carries two lines (target, then time · Project ·
 * Tasks), so the taller floor is what keeps that from clipping.
 */
export function timedFocusBlockHeight(plannedMinutes: number): number {
  return Math.max(timedBlockHeight(plannedMinutes), MIN_TIMED_HABIT_HEIGHT_PX)
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

/** Day is a proportional clock; List supplies full titles and separate completion. */
function TimelineEntryBlock({
  title, time, kind, completed, onOpen, onComplete, completionLabel, readOnly = false, list = false,
}: {
  title: string
  time: string
  kind: string
  completed: boolean
  onOpen: () => void
  onComplete: () => void
  completionLabel: string
  readOnly?: boolean
  list?: boolean
}) {
  const accent = kind === 'Calendar' ? 'border-state-success/50 bg-state-success/10' : kind === 'Habit' ? 'border-category-fitness/50 bg-category-fitness/10' : 'border-accent/50 bg-accent/10'
  return (
    <div className={`relative flex h-full min-w-0 overflow-hidden rounded-lg border-l-[3px] ${accent} ${completed ? 'opacity-70' : ''} ${list ? 'items-start gap-1 py-2' : ''}`}>
      {list && <button type="button" onClick={onComplete} disabled={readOnly} aria-label={completionLabel} title={readOnly ? 'Device Calendar events are read-only' : undefined} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60">
        <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${completed ? 'border-state-success bg-state-success text-on-action' : 'border-line-strong'}`}>{kind === 'Habit' ? <RotateCcw className="h-3 w-3" /> : completed ? <Check className="h-3 w-3" /> : null}</span>
      </button>}
      <button type="button" onClick={onOpen} aria-label={`View details for ${title}`} title={`${title} · ${time}`} className={`flex min-w-0 flex-1 flex-col items-start justify-start overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus ${list ? 'min-h-11 px-2 py-1' : 'h-full px-1.5 py-1.5'}`}>
        <h3 className={`w-full shrink-0 break-words text-sm font-semibold leading-[17px] ${completed ? 'text-ink-muted line-through' : 'text-ink'} ${list ? '' : 'line-clamp-3'}`}>{title}</h3>
        <span className={`mt-1 block shrink-0 text-[10px] tabular-nums text-ink-muted ${list ? 'break-words text-xs' : ''}`}>{time}</span>
        {list && <span className="mt-1 text-xs text-ink-muted">{kind}{readOnly ? ' · Read-only' : ''}</span>}
        {!list && kind === 'Calendar' && <span className="mt-1 text-[10px] text-state-success">{readOnly ? 'Fixed' : 'Calendar'}</span>}
      </button>
    </div>
  )
}

// Read-only record rows. Each module gets its own accent hue so the day reads as
// colour-coded at a glance; habit progress reuses the plan hue (cyan) because a
// chunk is you doing the thing you planned, not a measurement of your body.
const RECORD_STYLE: Record<RecordKind, { icon: typeof Flame; accent: string; chip: string }> = {
  'calendar-transition': {
    icon: Clock,
    accent: 'border-state-success/30 bg-state-success/10 hover:bg-state-success/20',
    chip: 'border-state-success/30 bg-state-success/20 text-state-success',
  },
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
  list = false,
}: {
  record: TimelineRecord
  onHabitSelect?: (habitId: string) => void
  list?: boolean
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
        <span className={`flex min-w-0 gap-2 ${list ? 'flex-wrap items-baseline' : 'items-baseline'}`}>
          <span className={`${list ? 'break-words' : 'truncate'} text-sm font-medium text-ink`}>{record.title}</span>
          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${style.chip}`}>
            {record.kind === 'calendar-transition' ? 'Protected' : 'Actual'}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] tabular-nums text-ink-muted">
            <Clock className="h-3 w-3" />
            {record.time}
            {record.stamped && <span className="opacity-60">logged</span>}
          </span>
        </span>
        <span className={`block ${list ? 'break-words' : 'truncate'} text-xs text-ink-muted`}>{record.detail}</span>
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

  if (record.externalHref) {
    return (
      <a
        href={record.externalHref}
        target="_blank"
        rel="noreferrer"
        data-testid="timeline-record"
        data-record-kind={record.kind}
        className={className}
      >
        {body}
      </a>
    )
  }

  if (!record.href) {
    return (
      <div data-testid="timeline-record" data-record-kind={record.kind} className={className}>
        {body}
      </div>
    )
  }

  return (
    <Link
      to={record.href}
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
  nowMinute = 0,
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
  focusBlockRows = [],
}: DayTimelineProps) {
  const [view, setView] = useState<'day' | 'list'>('day')
  const [zoomIndex, setZoomIndex] = useState(1)
  const [details, setDetails] = useState<{ kind: 'item' | 'calendar'; id: string; date: string } | null>(null)
  const hourHeight = HOUR_HEIGHTS[zoomIndex]
  const blockHeight = (duration?: number) => (duration && duration > 0 ? duration : MIN_TIMED_TASK_MINUTES) * hourHeight / 60
  const earliestHour = Math.min(6,
    ...tasks.filter(task => timelineHour(task) !== null).map(task => parseInt(timelineClock(task), 10)),
    ...calendarEvents.map(eventHour).filter((hour): hour is number => hour !== null),
    ...records.map(record => parseInt(record.time, 10)),
    ...focusBlockRows.map(row => parseInt(row.clock, 10)),
  )
  const HOUR_SLOTS = Array.from({ length: 24 - earliestHour }, (_, index) => `${String(index + earliestHour).padStart(2, '0')}:00`)
  const clockSlot = (clock: string) => `${clock.slice(0, 2)}:00`
  const selectedTask = details?.kind === 'item' && details.date === dateKey ? tasks.find(task => task.id === details.id) : undefined
  const selectedEvent = details?.kind === 'calendar' && details.date === dateKey ? calendarEvents.find(event => event.id === details.id) : undefined
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
    setDetails(null)
  }, [dateKey])

  useEffect(() => {
    if (details && !selectedTask && !selectedEvent) setDetails(null)
  }, [details, selectedTask, selectedEvent])

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
  // when actually dragged. Earlier clock times expand the visible grid rather
  // than silently shifting an Item to 6am.
  const slotBuckets: Record<string, Task[]> = {}
  for (const slot of HOUR_SLOTS) slotBuckets[slot] = []
  for (const t of scheduled) {
    slotBuckets[clockSlot(timelineClock(t))]?.push(t)
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
    calendarBuckets[`${String(hour).padStart(2, '0')}:00`]?.push(event)
  }
  // Read-only record rows bucket by their (server-resolved) logged hour.
  const recordBuckets: Record<string, TimelineRecord[]> = {}
  for (const slot of HOUR_SLOTS) recordBuckets[slot] = []
  for (const record of records) {
    recordBuckets[clockSlot(record.time)]?.push(record)
  }
  for (const slot of HOUR_SLOTS) {
    recordBuckets[slot].sort((a, b) => a.time.localeCompare(b.time))
  }

  // Reopen a Habit's check-in sheet from one of its progress chunks — a chunk has
  // no module page to navigate to, and the sheet is where the rest gets logged.
  const handleHabitSelect = (habitId: string) => {
    const habit = tasks.find(task => task.id === habitId)
    if (habit?.type === 'habit') onHabitCheckIn(habit)
  }

  const openItem = (task: Task) => setDetails({ kind: 'item', id: task.id, date: dateKey })
  const openEvent = (event: ExternalCalendarEvent) => setDetails({ kind: 'calendar', id: event.id, date: dateKey })
  const itemTime = (task: Task) => task.startTime
    ? `${formatClockRange(task.startTime, task.duration).replace(' - ', '–')}${task.duration && task.duration > 0 ? '' : ' · duration not set'}`
    : isStamped(task) ? `logged ${timelineClock(task)}` : task.duration ? `Anytime · ${task.duration} min` : 'Anytime · duration not set'
  const itemBlock = (task: Task, list = false) => <TimelineEntryBlock
    title={task.title} time={itemTime(task)} kind={task.type === 'habit' ? 'Habit' : task.type === 'meal' ? 'Meal plan' : task.type === 'workout' ? 'Workout plan' : task.type === 'grocery' ? 'Grocery' : 'Task'} completed={task.completed} onOpen={() => openItem(task)}
    onComplete={() => task.type === 'habit' ? onHabitCheckIn(task) : task.completed ? onUncompleteTask(task.id) : onCompleteTask(task.id)}
    completionLabel={task.type === 'habit' ? `Check in ${task.title}` : task.completed ? 'Uncheck task' : 'Check task'} list={list}
  />
  const calendarBlock = (event: ExternalCalendarEvent, list = false) => <TimelineEntryBlock
    title={event.title} time={eventTimeRange(event)} kind="Calendar" completed={event.completed} onOpen={() => openEvent(event)} onComplete={() => onCalendarEventComplete(event.id, !event.completed)}
    completionLabel={event.provider === 'device' ? 'Device Calendar event, read-only' : event.completed ? 'Uncheck calendar event' : 'Check calendar event'} readOnly={event.provider === 'device'} list={list}
  />

  const renderCalendarRow = (event: ExternalCalendarEvent, index: number, overlapping = false) => (
    event.provider === 'device' ? <div data-timeline-drag-id={`calendar:${event.id}`} className="h-full min-w-0">{calendarBlock(event)}</div>
    : <Draggable draggableId={`calendar:${event.id}`} index={index}>
      {(provided, snapshot) => <div ref={provided.innerRef} {...provided.draggableProps} {...(overlapping ? provided.dragHandleProps : {})} data-timeline-drag-handle={overlapping ? 'true' : undefined} aria-label={overlapping ? `Move ${event.title}` : undefined} data-timeline-drag-id={`calendar:${event.id}`} className={`relative flex min-h-0 min-w-0 gap-1 ${snapshot.isDragging ? 'opacity-90' : ''}`} style={{ ...provided.draggableProps.style, height: blockHeight(eventDurationMinutes(event)) }}>
        {!overlapping && <TaskDragGrip dragHandleProps={provided.dragHandleProps} label={`Move ${event.title}`} compact />}
        <div className="h-full min-w-0 flex-1">{calendarBlock(event)}</div>
      </div>}
    </Draggable>
  )
  const renderTaskRow = (task: Task, index: number, overlapping = false) => <Draggable draggableId={task.id} index={index}>
    {(provided) => <div ref={provided.innerRef} {...provided.draggableProps} {...(overlapping ? provided.dragHandleProps : {})} data-timeline-drag-handle={overlapping ? 'true' : undefined} aria-label={overlapping ? `Move ${task.title}` : undefined} data-testid="timeline-draggable-task" data-demo-id={taskDemoId(task)} data-timeline-drag-id={task.id} data-stamped={isStamped(task) ? 'true' : 'false'} className="relative flex min-h-0 min-w-0 gap-1" style={{ ...provided.draggableProps.style, height: blockHeight(task.duration) }}>
      {!overlapping && <TaskDragGrip dragHandleProps={provided.dragHandleProps} label={`Move ${task.title}`} compact />}
      <div className="h-full min-w-0 flex-1">{itemBlock(task)}</div>
    </div>}
  </Draggable>

  const rowsBySlot: Record<string, SlotRow[]> = Object.fromEntries(HOUR_SLOTS.map(slot => [slot, [
    ...calendarBuckets[slot].map((event): SlotRow => ({
      key: `calendar:${event.id}`,
      clock: event.localStartTime ?? (event.startAt
        ? `${String(new Date(event.startAt).getHours()).padStart(2, '0')}:${String(new Date(event.startAt).getMinutes()).padStart(2, '0')}`
        : slot),
      heightPx: blockHeight(eventDurationMinutes(event)),
      draggable: event.provider !== 'device',
      render: (index, overlapping) => renderCalendarRow(event, index, overlapping),
    })),
    ...slotBuckets[slot].map((task): SlotRow => ({
      key: task.id,
      clock: timelineClock(task),
      heightPx: blockHeight(task.duration),
      draggable: true,
      render: (index, overlapping) => renderTaskRow(task, index, overlapping),
    })),
    ...recordBuckets[slot].map((record): SlotRow => ({
      key: record.id,
      clock: record.time,
      heightPx: MIN_TIMED_TASK_HEIGHT_PX,
      draggable: false,
      render: () => <TimelineRecordBlock record={record} onHabitSelect={handleHabitSelect} />,
    })),
    ...focusBlockRows.filter(row => clockSlot(row.clock) === slot).map((row): SlotRow => ({
      key: `focus:${row.id}`,
      clock: row.clock,
      heightPx: row.heightPx * hourHeight / HOUR_SLOT_HEIGHT_PX,
      draggable: false,
      render: () => <div style={{ height: row.heightPx * hourHeight / HOUR_SLOT_HEIGHT_PX }} className="min-w-0">{row.render()}</div>,
    })),
  ].sort((a, b) => a.clock.localeCompare(b.clock))]))
  const positionedRows = new Map(positionDayTimelineEntries(HOUR_SLOTS.flatMap(slot => rowsBySlot[slot].map(row => {
    const start = minutesFromTime(row.clock)
    if (start === null) throw new Error(`Invalid timeline clock: ${row.clock}`)
    return { ...row, start, end: start + row.heightPx * 60 / hourHeight }
  }))).map(row => [row.key, row]))
  const afterHoursHeight = [...positionedRows.values()].reduce((height, row) =>
    Math.max(height, (row.end - 24 * 60) * hourHeight / 60), 0
  )
  const occupiedSlots = new Set(HOUR_SLOTS.filter(slot => {
    const start = parseInt(slot, 10) * 60
    return [...positionedRows.values()].some(row => row.start < start + 60 && row.end > start)
  }))

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
    const handle = source?.querySelector<HTMLElement>('[data-timeline-drag-handle="true"]') ?? source
    const handleTopBefore = handle?.getBoundingClientRect().top ?? null

    dragSnapshotRef.current = {
      tasks: [...tasks],
      anytimeIds: anytime.map(task => task.id),
      mode: before.mode,
    }

    // The library invokes this hook before it measures any draggable or droppable.
    // Expand the real DOM synchronously so compacted hours and hidden Anytime rows
    // become valid measured destinations without a React render race.
    if (source) source.dataset.timelineDragSource = 'true'
    if (root) root.dataset.dragLayout = 'expanded'

    if (handleTopBefore !== null && handle) {
      const delta = handle.getBoundingClientRect().top - handleTopBefore
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
      planGridRef.current?.querySelectorAll<HTMLElement>('[data-timeline-drag-source]')
        .forEach(element => element.removeAttribute('data-timeline-drag-source'))

      window.requestAnimationFrame(() => {
        const restored = findDraggable(focusId)
        if (anchorTopBefore !== null && restored) {
          const delta = restored.getBoundingClientRect().top - anchorTopBefore
          if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, behavior: 'auto' })
        }
        if (shouldRestoreFocus) {
          const handle = restored?.matches('[data-timeline-drag-handle="true"]')
            ? restored
            : restored?.querySelector<HTMLElement>('[data-timeline-drag-handle="true"]')
          handle?.focus({ preventScroll: true })
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-ink">{heading}</h2>
        <div role="group" aria-label="Calendar view" className="flex rounded-xl border border-line bg-card p-1">
          {(['day', 'list'] as const).map(option => <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)} className={`min-h-11 min-w-[52px] rounded-lg px-3 text-sm font-medium ${view === option ? 'bg-raised text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}>{option === 'day' ? 'Day' : 'List'}</button>)}
        </div>
      </div>

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
          style={{ '--today-anytime-height': `${anytimePanelHeight}px`, '--today-hour-height': `${hourHeight}px` } as CSSProperties}
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
                              onOpen={openItem}
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
            {view === 'day' ? <>
            <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
              <span>Blocks follow the clock · Tap for details</span>
              <div className="flex shrink-0 gap-1" role="group" aria-label="Calendar zoom">
                <button type="button" aria-label="Zoom out" disabled={zoomIndex === 0} onClick={() => setZoomIndex(index => index - 1)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-line hover:bg-card disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                <button type="button" aria-label="Zoom in" disabled={zoomIndex === HOUR_HEIGHTS.length - 1} onClick={() => setZoomIndex(index => index + 1)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-line hover:bg-card disabled:opacity-40"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
            <div aria-label="Day timeline">
              {HOUR_SLOTS.map(slot => {
                const hasContent = occupiedSlots.has(slot)
                const isCurrentHour = parseInt(slot, 10) === nowHour
                const slotHeight = hourHeight
                let dragCursor = 0
                const renderedRows = rowsBySlot[slot].map(row => {
                  const index = row.draggable ? dragCursor++ : -1
                  const position = positionedRows.get(row.key)!
                  return (
                    <div
                      key={row.key}
                      data-timeline-entry={row.key}
                      className="absolute z-10 min-w-0"
                      style={{
                        top: (position.start - parseInt(slot, 10) * 60) * hourHeight / 60,
                        left: `${position.column * 100 / position.columns}%`,
                        width: `calc(${position.columnSpan * 100 / position.columns}% - ${position.columns > 1 ? 4 : 0}px)`,
                        height: row.heightPx,
                      }}
                    >
                      {row.render(index, position.columns > 1)}
                    </div>
                  )
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
                        data-compacted="false"
                        className={`timeline-slot relative flex min-w-0 gap-1 overflow-visible rounded px-1 transition-colors sm:gap-2 sm:px-2 ${
                          snapshot.isDraggingOver
                            ? 'bg-state-info/10 drop-zone'
                            : hasContent
                              ? 'bg-card/30'
                              : 'bg-transparent hover:bg-card/10'
                        }`}
                        style={{ height: slotHeight }}
                      >
                        <span className="w-10 flex-shrink-0 text-xs text-ink-muted sm:w-12">
                          {formatHour(slot)}
                        </span>

                        <div className="relative min-w-0 flex-1 overflow-visible">
                          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 border-t border-line/30" />
                          {renderedRows}
                          {isCurrentHour && (
                            <div className="pointer-events-none absolute inset-x-0 z-30 -translate-y-1/2" style={{ top: nowMinute * hourHeight / 60 }}>
                              <NowMarker />
                            </div>
                          )}
                          <div className="hidden">{provided.placeholder}</div>
                          {snapshot.isDraggingOver && rowsBySlot[slot].length === 0 && (
                            <div className="px-1 py-1 text-xs text-state-info">Drop to schedule at {formatHour(slot)}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </Droppable>
                )
              })}
              {afterHoursHeight > 0 && <div aria-hidden="true" style={{ height: afterHoursHeight }} />}
            </div>
            </> : <div className="space-y-2" aria-label="Schedule list">
              {[...scheduled.map(task => ({ key: task.id, clock: timelineClock(task), render: () => itemBlock(task, true) })),
                ...calendarEvents.filter(event => !allDayEvents.includes(event)).map(event => ({ key: `calendar:${event.id}`, clock: event.localStartTime ?? (event.startAt ? `${String(new Date(event.startAt).getHours()).padStart(2, '0')}:${String(new Date(event.startAt).getMinutes()).padStart(2, '0')}` : ''), render: () => calendarBlock(event, true) })),
                ...records.map(record => ({ key: record.id, clock: record.time, render: () => <TimelineRecordBlock record={record} onHabitSelect={handleHabitSelect} list /> })),
                ...focusBlockRows.map(row => ({ key: `focus:${row.id}`, clock: row.clock, render: row.render })),
              ].sort((a, b) => a.clock.localeCompare(b.clock)).map(row => <div key={row.key} data-timeline-entry={row.key} data-timeline-drag-id={row.key}>{row.render()}</div>)}
            </div>}

            {allDayEvents.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium uppercase tracking-wider text-ink-muted">All-day calendar</h4>
                <div className="space-y-2 rounded-lg bg-card/20 p-3">
                  {allDayEvents.map(event => (
                    <div key={event.id}>{calendarBlock(event, true)}</div>
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
      {(selectedTask || selectedEvent) && <TimelineDetailsSheet
        selection={selectedTask ? { task: selectedTask } : { event: selectedEvent! }} dateKey={dateKey} eventTimeRange={eventTimeRange} onClose={() => setDetails(null)}
        onComplete={onCompleteTask} onUncomplete={onUncompleteTask} onCalendarComplete={onCalendarEventComplete} onHabitCheckIn={onHabitCheckIn} onEdit={onEditTask} onDelete={onDeleteTask}
      />}
    </div>
  )
}
