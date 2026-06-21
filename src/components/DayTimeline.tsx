import { useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd'
import { Task } from '../services/api'
import TaskCard from './TaskCard'
import { taskService } from '../services/api'

interface DayTimelineProps {
  tasks: Task[]
  onTasksReorder: (tasks: Task[]) => void
  onCompleteTask: (id: string) => void
  onUncompleteTask: (id: string) => void
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

export default function DayTimeline({
  tasks,
  onTasksReorder,
  onCompleteTask,
  onUncompleteTask,
  onEditTask,
  onDeleteTask,
}: DayTimelineProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)

  // Split: scheduled tasks go into hour-slot buckets, untimed go into anytime
  const scheduled = tasks.filter(t => t.startTime)
  const anytime = tasks.filter(t => !t.startTime)

  // Group scheduled tasks by their slot (HH:00) — tasks in same slot order by createdAt
  const slotBuckets: Record<string, Task[]> = {}
  for (const slot of HOUR_SLOTS) {
    slotBuckets[slot] = scheduled
      .filter(t => t.startTime === slot)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
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
      // timed→untimed: clear startTime, assign position by drop index
      const newAnytime = anytime.filter(t => t.id !== taskId)
      newAnytime.splice(destination.index, 0, { ...task, startTime: undefined, position: destination.index })
      onTasksReorder([...scheduled.filter(t => t.id !== taskId), ...newAnytime])

      await taskService.updateTask(taskId, { startTime: null as any, position: destination.index })
      // Re-persist ordering for the whole anytime list after this insertion
      await taskService.reorderTasks(newAnytime.map(t => t.id))
    } else {
      // untimed→timed or timed→timed: set startTime to slot, clear position
      const updatedTask = { ...task, startTime: zone, position: null }
      const newScheduled = scheduled.filter(t => t.id !== taskId)
      newScheduled.push(updatedTask)
      const newAnytime = anytime.filter(t => t.id !== taskId)
      onTasksReorder([...newScheduled, ...newAnytime])

      await taskService.updateTask(taskId, { startTime: zone, position: null as any })
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
            const hasContent = slotTasks.length > 0

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
      {tasks.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-gray-300">No tasks scheduled for today.</p>
          <p className="text-sm mt-1 text-gray-400">Add some tasks to get started!</p>
        </div>
      )}
    </div>
  )
}
