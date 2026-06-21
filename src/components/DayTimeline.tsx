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

export default function DayTimeline({
  tasks,
  onTasksReorder,
  onCompleteTask,
  onUncompleteTask,
  onEditTask,
  onDeleteTask,
}: DayTimelineProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)

  // Split into two sections
  const scheduled = tasks.filter(t => t.startTime)
  const anytime = tasks.filter(t => !t.startTime)

  const handleDragEnd = async (result: DropResult) => {
    setDraggedTaskId(null)
    if (!result.destination) return
    if (result.source.droppableId !== 'anytime') return

    const reordered = Array.from(anytime)
    const [moved] = reordered.splice(result.source.index, 1)
    reordered.splice(result.destination.index, 0, moved)

    // Optimistically update local state by re-assembling the full task list
    onTasksReorder([...scheduled, ...reordered])

    // Persist — single batch call
    await taskService.reorderTasks(reordered.map(t => t.id))
  }

  const handleDragStart = (start: any) => {
    setDraggedTaskId(start.draggableId)
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <h2 className="text-xl font-semibold text-gray-100">Today's Schedule</h2>

      {/* Scheduled section — not draggable */}
      {scheduled.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Scheduled</h3>
          <div className="space-y-3">
            {scheduled.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={onCompleteTask}
                onUncomplete={onUncompleteTask}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
                isDragging={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Anytime section — draggable */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Anytime</h3>
        <DragDropContext onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
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
                    <p className="text-sm mt-1 text-gray-400">Add tasks without a time to see them here.</p>
                  </div>
                )}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

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
