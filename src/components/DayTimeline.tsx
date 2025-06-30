import { useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd'
import { Task } from '../services/api'
import TaskCard from './TaskCard'
import { format, addHours } from 'date-fns'

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
  onDeleteTask 
}: DayTimelineProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)

  const handleDragEnd = (result: DropResult) => {
    setDraggedTaskId(null)
    
    if (!result.destination) return

    const items = Array.from(tasks)
    const [reorderedItem] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, reorderedItem)

    onTasksReorder(items)
  }

  const handleDragStart = (start: any) => {
    setDraggedTaskId(start.draggableId)
  }

  // Generate time slots for the day
  const timeSlots = []
  const startHour = 6 // 6 AM
  const endHour = 23 // 11 PM

  for (let hour = startHour; hour <= endHour; hour++) {
    const time = new Date()
    time.setHours(hour, 0, 0, 0)
    timeSlots.push(format(time, 'h:mm a'))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-100">Today's Schedule</h2>
        <div className="text-sm text-gray-300">
          Drag and drop to reorder tasks
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
        <div className="grid grid-cols-12 gap-4">
          {/* Time column */}
          <div className="col-span-2 space-y-4">
            {timeSlots.map((time) => (
              <div key={time} className="h-20 flex items-center">
                <span className="text-sm text-gray-400 font-medium">{time}</span>
              </div>
            ))}
          </div>

          {/* Tasks column */}
          <div className="col-span-10">
            <Droppable droppableId="tasks">
              {(provided, snapshot) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={`space-y-3 min-h-96 p-4 rounded-lg transition-colors ${
                    snapshot.isDraggingOver ? 'drop-zone' : 'bg-gray-800/20'
                  }`}
                >
                  {tasks.map((task, index) => (
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
                  
                  {tasks.length === 0 && (
                    <div className="text-center py-12 text-gray-400">
                      <p className="text-gray-300">No tasks scheduled for today.</p>
                      <p className="text-sm mt-1 text-gray-400">Add some tasks to get started!</p>
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      </DragDropContext>
    </div>
  )
}