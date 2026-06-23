import { useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { CalendarDays, Check, Clock, MapPin } from 'lucide-react'
import { ExternalCalendarEvent, Task } from '../services/api'
import TaskCard from './TaskCard'
import { taskService } from '../services/api'

interface DayTimelineProps {
  tasks: Task[]
  calendarEvents?: ExternalCalendarEvent[]
  onTasksReorder: (tasks: Task[]) => void
  onCompleteTask: (id: string) => void
  onUncompleteTask: (id: string) => void
  onCalendarEventComplete: (id: string, completed: boolean) => void
  onEditTask: (task: Task) => void
  onDeleteTask: (id: string) => void
}

// ponytail: mirrors backend/src/utils/hourSlots.ts — 18 slots 6am–11pm
const HOUR_SLOTS: string[] = Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`)

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

function CalendarEventBlock({
  event,
  onComplete,
}: {
  event: ExternalCalendarEvent
  onComplete: (id: string, completed: boolean) => void
}) {
  return (
    <div
      className={`group relative rounded-xl border p-4 transition-all duration-300 ${
        event.completed
          ? 'bg-gray-800/50 border-gray-600/50 opacity-75'
          : 'card glass-effect hover:shadow-lg'
      }`}
    >
      <div className="flex items-start space-x-3">
        <button
          type="button"
          onClick={() => onComplete(event.id, !event.completed)}
          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${
            event.completed
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 border-green-500 text-white'
              : 'border-gray-600 hover:border-cyan-400 hover:bg-cyan-400/10'
          }`}
          aria-label={event.completed ? 'Uncheck calendar event' : 'Check calendar event'}
        >
          {event.completed && <Check className="h-3 w-3" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center space-x-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/20 text-emerald-300">
                <CalendarDays className="h-4 w-4" />
              </div>
              <h3 className={`truncate font-medium ${
                event.completed ? 'line-through text-gray-500' : 'text-gray-100'
              }`}>
                {event.title}
              </h3>
            </div>

            <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">
              Calendar
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
            <span className="inline-flex items-center gap-1 text-gray-400">
              <Clock className="h-3 w-3" />
              {eventTimeRange(event)}
            </span>
            {event.location && (
              <span className="inline-flex min-w-0 items-center gap-1 text-gray-400">
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

export default function DayTimeline({
  tasks,
  calendarEvents = [],
  onTasksReorder,
  onCompleteTask,
  onUncompleteTask,
  onCalendarEventComplete,
  onEditTask,
  onDeleteTask,
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
  const allDayEvents = calendarEvents.filter(event => event.allDay || !event.startAt)
  for (const event of calendarEvents) {
    const hour = eventHour(event)
    if (hour === null) continue
    const clampedHour = Math.min(23, Math.max(6, hour))
    calendarBuckets[`${String(clampedHour).padStart(2, '0')}:00`].push(event)
  }

  const handleDragStart = (start: any) => {
    setDraggedTaskId(start.draggableId)
  }

  const handleDragEnd = async (result: DropResult) => {
    setDraggedTaskId(null)
    if (!result.destination) return

    const { draggableId: taskId, destination } = result
    const zone = destination.droppableId // 'anytime' | 'HH:00'

    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    if (zone === 'anytime') {
      // timed→untimed (or virtual habit→anytime): clear startTime, assign position by drop index
      const newAnytime = anytime.filter(t => t.id !== taskId)
      newAnytime.splice(destination.index, 0, { ...task, startTime: undefined, position: destination.index })
      onTasksReorder([...scheduled.filter(t => t.id !== taskId), ...newAnytime])

      // updateTask returns the real row (may have a new real id if this was a virtual habit instance)
      const updated = await taskService.updateTask(taskId, { startTime: null as any, position: destination.index })
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
      const updated = await taskService.updateTask(taskId, { startTime: zone, position: null as any })
      if (updated.id !== taskId) {
        // Swap synthetic id for real id so next drag uses the real row
        // ponytail: cast needed because spread of discriminated-union loses narrowing
        onTasksReorder(tasks.map(t => (t.id === taskId ? ({ ...t, ...updated } as Task) : t)))
      }
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <h2 className="text-xl font-semibold text-gray-100">Today's Schedule</h2>

      <DragDropContext onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
        {/* Scheduled section — one droppable per hour slot */}
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">Scheduled</h3>
          {HOUR_SLOTS.map(slot => {
            const slotTasks = slotBuckets[slot]
            const slotCalendarEvents = calendarBuckets[slot]
            const hasContent = slotTasks.length > 0 || slotCalendarEvents.length > 0

            return (
              <Droppable droppableId={slot} key={slot}>
                {(provided, snapshot) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className={`flex gap-2 min-h-10 px-2 py-1 rounded transition-colors ${
                      snapshot.isDraggingOver
                        ? 'bg-blue-900/40 drop-zone'
                        : hasContent
                        ? 'bg-gray-800/30'
                        : 'bg-transparent hover:bg-gray-800/10'
                    }`}
                  >
                    {/* Time label */}
                    <span className={`text-xs w-12 flex-shrink-0 pt-2 ${hasContent || snapshot.isDraggingOver ? 'text-gray-400' : 'text-gray-600'}`}>
                      {formatHour(slot)}
                    </span>

                    {/* Tasks in this slot */}
                    <div className="flex-1 space-y-1">
                      {slotCalendarEvents.map(event => (
                        <CalendarEventBlock
                          key={event.id}
                          event={event}
                          onComplete={onCalendarEventComplete}
                        />
                      ))}
                      {slotTasks.map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              <TaskCard
                                task={task}
                                onComplete={onCompleteTask}
                                onUncomplete={onUncompleteTask}
                                onEdit={onEditTask}
                                onDelete={onDeleteTask}
                                isDragging={snapshot.isDragging || draggedTaskId === task.id}
                              />
                            </div>
                          )}
                        </Draggable>
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
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Calendar</h3>
            <div className="space-y-2 rounded-lg bg-gray-800/20 p-4">
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
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Anytime</h3>
          <Droppable droppableId="anytime">
            {(provided, snapshot) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className={`space-y-3 min-h-24 p-4 rounded-lg transition-colors ${
                  snapshot.isDraggingOver ? 'drop-zone' : 'bg-gray-800/20'
                }`}
              >
                {anytime.map((task, index) => (
                  <Draggable key={task.id} draggableId={task.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                      >
                        <TaskCard
                          task={task}
                          onComplete={onCompleteTask}
                          onUncomplete={onUncompleteTask}
                          onEdit={onEditTask}
                          onDelete={onDeleteTask}
                          isDragging={snapshot.isDragging || draggedTaskId === task.id}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}

                {anytime.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-gray-300">No unscheduled tasks.</p>
                    <p className="text-sm mt-1 text-gray-400">Add tasks without a time, or drag a scheduled task here to unschedule.</p>
                  </div>
                )}
              </div>
            )}
          </Droppable>
        </div>
      </DragDropContext>

      {/* Empty state when both sections are empty */}
      {tasks.length === 0 && calendarEvents.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-gray-300">No tasks scheduled for today.</p>
          <p className="text-sm mt-1 text-gray-400">Add some tasks to get started!</p>
        </div>
      )}
    </div>
  )
}
