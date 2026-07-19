import { useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd'
import { CalendarDays, Check, Clock, Flame, GripVertical, MapPin } from 'lucide-react'
import { ExternalCalendarEvent, Task, CalorieEntry, HabitItem } from '../services/api'
import TaskCard from './TaskCard'
import { taskService } from '../services/api'

interface DayTimelineProps {
  tasks: Task[]
  calendarEvents?: ExternalCalendarEvent[]
  calorieEntries?: CalorieEntry[]
  onTasksReorder: (tasks: Task[]) => void
  onCompleteTask: (id: string) => void
  onUncompleteTask: (id: string) => void
  onCalendarEventComplete: (id: string, completed: boolean) => void
  onCalendarEventSchedule: (id: string, startTime: string) => Promise<void> | void
  onEditTask: (task: Task) => void
  onDeleteTask: (task: Task) => void
  onHabitCheckIn: (habit: HabitItem) => void
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

function slotHeightForContent(tasks: Task[], events: ExternalCalendarEvent[], calories: CalorieEntry[], isCompacted: boolean): number {
  if (isCompacted) return COMPACT_EMPTY_SLOT_HEIGHT_PX

  const taskHeights = tasks.map(timedTaskBlockHeight)
  const eventHeights = events.map(event => timedBlockHeight(eventDurationMinutes(event)))
  const calorieHeights = calories.map(() => MIN_TIMED_TASK_HEIGHT_PX)
  const itemHeights = [...eventHeights, ...taskHeights, ...calorieHeights]
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
          className="-m-3 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          aria-label={event.completed ? 'Uncheck calendar event' : 'Check calendar event'}
        >
          <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-all duration-300 sm:h-5 sm:w-5 ${event.completed ? 'border-green-500 bg-gradient-to-r from-green-500 to-emerald-600 text-white' : 'border-line-strong'}`}>
            {event.completed && <Check className="h-3 w-3" />}
          </span>
        </button>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/20 text-emerald-300">
                <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
              <h3 className={`truncate text-sm font-medium sm:text-base ${
                event.completed ? 'line-through text-gray-500' : 'text-ink'
              }`}>
                {event.title}
              </h3>
            </div>

            <span className="hidden shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300 sm:inline-flex">
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

// ponytail: read-only body row (calorie entry). Second accent hue (rose) so body
// facts read as distinct from plan rows. Not draggable, not completable.
function CalorieEntryBlock({ entry }: { entry: CalorieEntry }) {
  return (
    <div className="group relative flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5">
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/20 text-rose-300">
        <Flame className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-rose-100">{entry.name}</h3>
        <div className="flex items-center gap-2 text-xs text-rose-300/80">
          {entry.time && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {entry.time}
            </span>
          )}
          <span>{entry.calories} cal</span>
        </div>
      </div>
    </div>
  )
}

function TaskDragGrip({
  dragHandleProps,
  compact = false,
}: {
  dragHandleProps: DraggableProvidedDragHandleProps | null
  compact?: boolean
}) {
  return (
    <div
      {...dragHandleProps}
      role="button"
      tabIndex={0}
      data-testid="timeline-task-drag-grip"
      data-timeline-drag-handle="true"
      aria-label="Drag task"
      className={`flex shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-md border border-line/70 bg-page/60 text-gray-500 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 active:cursor-grabbing ${
        compact ? 'h-full w-6 sm:w-5' : 'min-h-11 w-8 self-stretch sm:min-h-10 sm:w-7'
      }`}
    >
      <GripVertical className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
    </div>
  )
}

export default function DayTimeline({
  tasks,
  calendarEvents = [],
  calorieEntries = [],
  onTasksReorder,
  onCompleteTask,
  onUncompleteTask,
  onCalendarEventComplete,
  onCalendarEventSchedule,
  onEditTask,
  onDeleteTask,
  onHabitCheckIn,
}: DayTimelineProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)

  // Split: scheduled tasks go into hour-slot buckets, untimed go into anytime
  const scheduled = tasks.filter(t => t.startTime)
  const anytime = tasks.filter(t => !t.startTime)

  // Group scheduled tasks into hour buckets. A task keeps its real startTime (e.g.
  // "09:30") but renders under its hour's slot; off-the-hour times only snap to ":00"
  // when actually dragged. Hours outside 6am–11pm clamp to the nearest edge slot so a
  // timed task is never dropped from the view (it has a startTime, so it can't fall
  // through to the Anytime backlog).
  const slotBuckets: Record<string, Task[]> = {}
  for (const slot of HOUR_SLOTS) slotBuckets[slot] = []
  for (const t of scheduled) {
    const hour = Math.min(23, Math.max(6, parseInt(t.startTime as string, 10)))
    slotBuckets[`${String(hour).padStart(2, '0')}:00`].push(t)
  }
  for (const slot of HOUR_SLOTS) {
    slotBuckets[slot].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
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
  // Read-only calorie rows bucket by their logged hour. Entries without a time are dropped
  // (nowhere to place them on a clock); degrade gracefully rather than inventing a slot.
  const calorieBuckets: Record<string, CalorieEntry[]> = {}
  for (const slot of HOUR_SLOTS) calorieBuckets[slot] = []
  for (const entry of calorieEntries) {
    if (!entry.time) continue
    const hour = Math.min(23, Math.max(6, parseInt(entry.time, 10)))
    calorieBuckets[`${String(hour).padStart(2, '0')}:00`].push(entry)
  }

  const hasSlotContent = (slot: string) => slotBuckets[slot].length > 0 || calendarBuckets[slot].length > 0 || calorieBuckets[slot].length > 0
  // Compaction is static — it never changes during a drag. Expanding mid-lift reflows the
  // timeline and desyncs the dragged clone from the pointer. @hello-pangea/dnd hit-detects by
  // rect intersection, so a compacted 28px slot is still a valid drop target without expanding.
  const compactedEmptySlots = compactableEmptySlots(HOUR_SLOTS, hasSlotContent)

  useEffect(() => {
    window.__healthyFlowDemo = {
      ...(window.__healthyFlowDemo ?? {}),
      moveRolloverTaskToToday: async (startTime: string) => {
        const todayKey = localDateKey()
        const task = tasks.find(item => !item.startTime && item.scheduledDate && item.scheduledDate < todayKey)
          ?? tasks.find(item => !item.startTime)
        if (!task) {
          console.warn('[demo] No rollover task available to move')
          return
        }
        const optimistic = tasks.map(item => (
          item.id === task.id ? { ...item, startTime, position: null } as Task : item
        ))
        onTasksReorder(optimistic)
        const updated = await taskService.updateTask(task.id, { startTime, position: null })
        onTasksReorder(tasks.map(item => (item.id === task.id ? ({ ...item, ...updated } as Task) : item)))
      },
    }

    return () => {
      if (!window.__healthyFlowDemo) return
      delete window.__healthyFlowDemo.moveRolloverTaskToToday
    }
  }, [onTasksReorder, tasks])

  const handleDragStart = (start: any) => {
    setDraggedTaskId(start.draggableId)
  }

  const handleDragEnd = async (result: DropResult) => {
    setDraggedTaskId(null)
    if (!result.destination) return

    const { draggableId: taskId, destination } = result
    const zone = destination.droppableId // 'anytime' | 'HH:00'

    if (taskId.startsWith('calendar:')) {
      const eventId = taskId.slice('calendar:'.length)
      const event = calendarEvents.find(e => e.id === eventId)
      if (!event || event.allDay || zone === 'anytime') return
      await onCalendarEventSchedule(eventId, zone)
      return
    }

    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    if (zone === 'anytime') {
      // timed→untimed (or virtual habit→anytime): clear startTime, assign position by drop index
      const newAnytime = anytime.filter(t => t.id !== taskId)
      newAnytime.splice(destination.index, 0, { ...task, startTime: undefined, position: destination.index })
      onTasksReorder([...scheduled.filter(t => t.id !== taskId), ...newAnytime])

      // updateTask returns the real row (may have a new real id if this was a virtual habit instance)
      const updated = await taskService.updateTask(taskId, { startTime: null, position: destination.index })
      if (updated.id !== taskId) {
        // Virtual habit was materialized — id changed; swap in real row for next interaction
        // ponytail: cast needed because spread of discriminated-union loses narrowing
        onTasksReorder(tasks.map(t => (t.id === taskId ? ({ ...t, ...updated } as Task) : t)))
      }
      // Re-persist ordering for the whole anytime list after this insertion
      // Use real id (updated.id) in case taskId was virtual
      const finalAnytime = newAnytime.map(t => (t.id === taskId ? updated.id : t.id))
      await taskService.reorderTasks(finalAnytime)
    } else {
      // untimed→timed or timed→timed (or virtual habit→hour slot): set startTime to slot, clear position
      const updatedTask = { ...task, startTime: zone, position: null }
      const newScheduled = scheduled.filter(t => t.id !== taskId)
      newScheduled.push(updatedTask as Task)
      const newAnytime = anytime.filter(t => t.id !== taskId)
      onTasksReorder([...newScheduled, ...newAnytime])

      // updateTask materializes virtual habit instances; returned row has the real id
      const updated = await taskService.updateTask(taskId, { startTime: zone, position: null })
      if (updated.id !== taskId) {
        // Swap synthetic id for real id so next drag uses the real row
        // ponytail: cast needed because spread of discriminated-union loses narrowing
        onTasksReorder(tasks.map(t => (t.id === taskId ? ({ ...t, ...updated } as Task) : t)))
      }
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <h2 className="text-xl font-semibold text-ink">Today's Schedule</h2>

      <DragDropContext onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
        <div>
        {/* Scheduled section — one droppable per hour slot */}
        <div className="space-y-1" data-demo-id="schedule-section">
          <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-2">Scheduled</h3>
          {HOUR_SLOTS.map(slot => {
            const slotTasks = slotBuckets[slot]
            const slotCalendarEvents = calendarBuckets[slot]
            const slotCalories = calorieBuckets[slot]
            const hasContent = slotTasks.length > 0 || slotCalendarEvents.length > 0 || slotCalories.length > 0
            const isCompacted = compactedEmptySlots.has(slot)
            const slotHeight = slotHeightForContent(slotTasks, slotCalendarEvents, slotCalories, isCompacted)

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
                        ? 'bg-blue-900/40 drop-zone'
                        : hasContent
                        ? 'bg-card/30'
                        : isCompacted
                        ? 'bg-transparent hover:bg-card/5'
                        : 'bg-transparent hover:bg-card/10'
                    }`}
                    style={{ height: slotHeight }}
                  >
                    {/* Time label */}
                    <span className={`w-10 flex-shrink-0 text-xs sm:w-12 ${isCompacted ? 'pt-0 text-[11px]' : 'pt-2'} ${hasContent || snapshot.isDraggingOver ? 'text-ink-muted' : 'text-gray-600'}`}>
                      {formatHour(slot)}
                    </span>

                    {/* Tasks in this slot */}
                    <div className="relative z-10 min-w-0 flex-1 space-y-1 overflow-visible">
                      {slotCalendarEvents.map((event, index) => (
                        <Draggable key={event.id} draggableId={`calendar:${event.id}`} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              data-timeline-drag-handle="true"
                              className={`min-w-0 ${snapshot.isDragging ? 'opacity-90' : ''}`}
                              style={{
                                ...provided.draggableProps.style,
                                height: timedBlockHeight(eventDurationMinutes(event)),
                              }}
                            >
                              <CalendarEventBlock
                                event={event}
                                onComplete={onCalendarEventComplete}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {slotTasks.map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={slotCalendarEvents.length + index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              data-testid="timeline-draggable-task"
                              data-demo-id={taskDemoId(task)}
                              className="flex min-h-0 min-w-0 gap-1.5"
                              style={{
                                ...provided.draggableProps.style,
                                height: timedTaskBlockHeight(task),
                              }}
                            >
                              <TaskDragGrip dragHandleProps={provided.dragHandleProps} compact />
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
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {slotCalories.map(entry => (
                        <CalorieEntryBlock key={entry.id} entry={entry} />
                      ))}
                      {provided.placeholder}
                      {snapshot.isDraggingOver && slotTasks.length === 0 && (
                        <div className="text-xs text-blue-400 py-1 px-1">Drop to schedule at {formatHour(slot)}</div>
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
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider">Calendar</h3>
            <div className="space-y-2 rounded-lg bg-card/20 p-4">
              {allDayEvents.map(event => (
                <CalendarEventBlock
                  key={event.id}
                  event={event}
                  onComplete={onCalendarEventComplete}
                />
              ))}
            </div>
          </div>
        )}

        {/* Anytime section — single droppable for untimed backlog */}
        <div className="space-y-2" data-demo-id="anytime-backlog">
          <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider">Anytime</h3>
          <Droppable droppableId="anytime">
            {(provided, snapshot) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className={`space-y-3 min-h-24 p-4 rounded-lg transition-colors ${
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
                        className="flex min-w-0 gap-2"
                      >
                        <TaskDragGrip dragHandleProps={provided.dragHandleProps} />
                        <div className="relative min-w-0 flex-1">
                          <TaskCard
                            task={task}
                            onComplete={onCompleteTask}
                            onUncomplete={onUncompleteTask}
                            onEdit={onEditTask}
                            onDelete={onDeleteTask}
                            onHabitCheckIn={onHabitCheckIn}
                            isDragging={snapshot.isDragging || draggedTaskId === task.id}
                            className="min-w-0"
                          />
                          {ageBadge(task.scheduledDate) && (
                            <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
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
                  <div className="text-center py-8 text-ink-muted">
                    <p className="text-ink-soft">No unscheduled tasks.</p>
                    <p className="text-sm mt-1 text-ink-muted">Add tasks without a time, or drag a scheduled task here to unschedule.</p>
                  </div>
                )}
              </div>
            )}
          </Droppable>
        </div>
        </div>
      </DragDropContext>

      {/* Empty state when both sections are empty */}
      {tasks.length === 0 && calendarEvents.length === 0 && (
        <div className="text-center py-12 text-ink-muted">
          <p className="text-ink-soft">No tasks scheduled for today.</p>
          <p className="text-sm mt-1 text-ink-muted">Add some tasks to get started!</p>
        </div>
      )}
    </div>
  )
}
