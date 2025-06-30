import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, addDays, subDays } from 'date-fns'
import { Plus, Calendar, ChevronLeft, ChevronRight, Brain, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import api, { taskService, Task } from '../services/api'
import DayTimeline from '../components/DayTimeline'
import HabitTrackerBar from '../components/HabitTrackerBar'
import AIRecommendationsBox from '../components/AIRecommendationsBox'
import TaskEditModal from '../components/TaskEditModal'
import ConfettiAnimation from '../components/ConfettiAnimation'
import SmartReminders from '../components/SmartReminders'
import AITextAnalyzer from '../components/AITextAnalyzer'
import LoadingSpinner from '../components/LoadingSpinner'
import { useNotifications } from '../hooks/useNotifications'
import { formatRelativeDate } from '../utils/dateHelpers'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import AskAIModal from '../components/AskAIModal'

export default function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showAIAnalyzer, setShowAIAnalyzer] = useState(false)
  const [showAskAIModal, setShowAskAIModal] = useState(false)
  const queryClient = useQueryClient()
  const { showNotification } = useNotifications()

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', format(selectedDate, 'yyyy-MM-dd')],
    queryFn: () => taskService.getTasks(format(selectedDate, 'yyyy-MM-dd')),
  })
  console.log('DashboardPage tasks:', tasks)

  const completeTaskMutation = useMutation({
    mutationFn: taskService.completeTask,
    onSuccess: (completedTask) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setShowConfetti(true)
      showNotification('Task Completed! 🚀', {
        body: `Excellent work completing "${completedTask.title}"!`,
        tag: 'task-completion'
      })
      toast.success('Task completed! 🚀')
    },
  })

  const uncompleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      // Update task to mark as incomplete
      return taskService.updateTask(id, { completed: false })
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success(`"${task.title}" marked as incomplete`)
    },
    onError: () => {
      toast.error('Failed to update task')
    }
  })

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Task> }) => 
      taskService.updateTask(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task updated successfully!')
    },
  })

  const updateTasksMutation = useMutation({
    mutationFn: async (reorderedTasks: Task[]) => {
      for (let i = 0; i < reorderedTasks.length; i++) {
        await taskService.updateTask(reorderedTasks[i].id, { 
          ...reorderedTasks[i],
        })
      }
      return reorderedTasks
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const deleteTaskMutation = useMutation({
    mutationFn: taskService.deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task deleted')
    },
  })

  const handleCompleteTask = (id: string) => {
    completeTaskMutation.mutate(id)
  }

  const handleUncompleteTask = (id: string) => {
    uncompleteTaskMutation.mutate(id)
  }

  const handleTasksReorder = (reorderedTasks: Task[]) => {
    queryClient.setQueryData(['tasks', format(selectedDate, 'yyyy-MM-dd')], reorderedTasks)
    updateTasksMutation.mutate(reorderedTasks)
  }

  const handleEditTask = (task: Task) => {
    setEditingTask(task)
  }

  const handleSaveTask = (taskId: string, updates: Partial<Task>) => {
    updateTaskMutation.mutate({ id: taskId, updates })
    setEditingTask(null)
  }

  const handleDeleteTask = (id: string) => {
    if (confirm('Are you sure you want to delete this task?')) {
      deleteTaskMutation.mutate(id)
    }
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

  // Calculate habit statistics
  const habits = tasks.filter(task => task.type === 'habit')
  const completedHabits = habits.filter(habit => habit.completed)
  
  const categories = tasks.reduce((acc, task) => {
    if (!acc[task.category]) {
      acc[task.category] = { total: 0, completed: 0 }
    }
    acc[task.category].total++
    if (task.completed) {
      acc[task.category].completed++
    }
    return acc
  }, {} as Record<string, { total: number; completed: number }>)

  // Clear current date's tasks
  const handleClearCurrentDate = async () => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    const isToday = dateStr === format(new Date(), 'yyyy-MM-dd')
    const dateLabel = isToday ? 'today' : formatRelativeDate(selectedDate).toLowerCase()
    
    if (confirm(`Are you sure you want to delete all tasks for ${dateLabel}? This cannot be undone.`)) {
      try {
        await api.delete('/tasks', { params: { date: dateStr } })
        queryClient.invalidateQueries({ queryKey: ['tasks'] })
        toast.success(`All tasks for ${dateLabel} deleted`)
      } catch (e) {
        toast.error(`Failed to delete ${dateLabel}'s tasks`)
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Smart Reminders */}
      <SmartReminders />

      {/* Confetti Animation */}
      <ConfettiAnimation 
        show={showConfetti} 
        onComplete={() => setShowConfetti(false)} 
      />

      {/* Header with Date Navigation */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center space-x-4">
          <div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handlePreviousDay}
                className="p-3 rounded-xl hover:bg-gray-800/50 transition-all duration-300 text-gray-400 hover:text-cyan-400 hover:shadow-lg hover:shadow-cyan-500/20"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              <h1 className="text-3xl font-bold text-gray-100 neon-text">
                {formatRelativeDate(selectedDate)}
              </h1>
              
              <button
                onClick={handleNextDay}
                className="p-3 rounded-xl hover:bg-gray-800/50 transition-all duration-300 text-gray-400 hover:text-cyan-400 hover:shadow-lg hover:shadow-cyan-500/20"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex items-center space-x-4 mt-2">
              <p className="text-gray-400">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </p>
              
              {!format(selectedDate, 'yyyy-MM-dd').includes(format(new Date(), 'yyyy-MM-dd')) && (
                <button
                  onClick={handleToday}
                  className="text-sm text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
                >
                  Go to Today
                </button>
              )}
            </div>
            
            <div className="flex items-center space-x-4 mt-2">
              <span className="text-gray-500 text-sm">
                {tasks.length} tasks • {tasks.filter(t => t.completed).length} completed
              </span>
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowAIAnalyzer(true)}
            className="btn-primary flex items-center space-x-2 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500"
          >
            <Brain className="w-4 h-4" />
            <span>AI Analyzer</span>
            <Sparkles className="w-4 h-4 animate-neon-flicker" />
          </motion.button>

          {/* Ask AI Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowAskAIModal(true)}
            className="btn-secondary flex items-center space-x-2"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Ask AI</span>
          </motion.button>

          {/* Clear Current Date's Tasks Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleClearCurrentDate}
            className="btn-secondary flex items-center space-x-2 text-red-400 border-red-400 hover:bg-red-500/10"
          >
            <span>🗑️</span>
            <span>Clear {formatRelativeDate(selectedDate)}</span>
          </motion.button>

          <Link
            to="/add"
            className="btn-primary flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Task</span>
          </Link>
          
          <Link
            to="/week"
            className="btn-secondary flex items-center space-x-2"
          >
            <Calendar className="w-4 h-4" />
            <span>Week View</span>
          </Link>
        </div>
      </motion.div>

      {/* AI Text Analyzer Modal */}
      <AnimatePresence>
        {showAIAnalyzer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAIAnalyzer(false)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <AITextAnalyzer 
                onClose={() => setShowAIAnalyzer(false)}
                scheduledDate={format(selectedDate, 'yyyy-MM-dd')}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ask AI Modal */}
      <AskAIModal isOpen={showAskAIModal} onClose={() => setShowAskAIModal(false)} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Timeline */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-2"
        >
          <DayTimeline
            tasks={tasks}
            onTasksReorder={handleTasksReorder}
            onCompleteTask={handleCompleteTask}
            onUncompleteTask={handleUncompleteTask}
            onEditTask={handleEditTask}
            onDeleteTask={handleDeleteTask}
          />
        </motion.div>

        {/* Futuristic Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          {/* Habit Tracker */}
          <div className="card holographic">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100">
                {formatRelativeDate(selectedDate)} Progress
              </h3>
            </div>
            <div className="space-y-4">
              <HabitTrackerBar
                title="Overall Progress"
                completed={completedHabits.length}
                total={habits.length}
                color="bg-gradient-to-r from-cyan-500 to-blue-600"
              />
              
              {Object.entries(categories).map(([category, stats]) => (
                <HabitTrackerBar
                  key={category}
                  title={category.charAt(0).toUpperCase() + category.slice(1)}
                  completed={stats.completed}
                  total={stats.total}
                  color={
                    category === 'health' ? 'bg-gradient-to-r from-green-500 to-emerald-600' :
                    category === 'work' ? 'bg-gradient-to-r from-blue-500 to-indigo-600' :
                    category === 'fitness' ? 'bg-gradient-to-r from-orange-500 to-red-600' :
                    'bg-gradient-to-r from-purple-500 to-pink-600'
                  }
                />
              ))}
            </div>
          </div>

          {/* AI Recommendations */}
          <AIRecommendationsBox />
        </motion.div>
      </div>

      {/* Task Edit Modal */}
      <TaskEditModal
        task={editingTask}
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleSaveTask}
      />
    </div>
  )
}