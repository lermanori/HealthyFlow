import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, Tag, Sparkles, Calendar } from 'lucide-react'
import { format, addDays } from 'date-fns'
import { Task } from '../services/api'

interface TaskEditModalProps {
  task: Task | null
  isOpen: boolean
  onClose: () => void
  onSave: (taskId: string, updates: Partial<Task>) => void
}

export default function TaskEditModal({ task, isOpen, onClose, onSave }: TaskEditModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    category: 'personal',
    startTime: '',
    duration: 30,
    scheduledDate: format(new Date(), 'yyyy-MM-dd'), // Add scheduled date
  })

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        category: task.category,
        startTime: task.startTime || '',
        duration: task.duration || 30,
        scheduledDate: task.scheduledDate || format(new Date(), 'yyyy-MM-dd'), // Use task's date or default to today
      })
    }
  }, [task])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (task) {
      onSave(task.id, formData)
      onClose()
    }
  }

  const categories = [
    { value: 'health', label: 'Health', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    { value: 'work', label: 'Work', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    { value: 'personal', label: 'Personal', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    { value: 'fitness', label: 'Fitness', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  ]

  // Quick date options
  const quickDates = [
    { label: 'Today', value: format(new Date(), 'yyyy-MM-dd') },
    { label: 'Tomorrow', value: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
    { label: 'This Weekend', value: format(addDays(new Date(), 6 - new Date().getDay()), 'yyyy-MM-dd') },
    { label: 'Next Week', value: format(addDays(new Date(), 7), 'yyyy-MM-dd') },
  ]

  const getDateLabel = (date: string) => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
    
    if (date === today) return 'Today'
    if (date === tomorrow) return 'Tomorrow'
    return format(new Date(date), 'MMM d, yyyy')
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative card ai-glow w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center animate-float">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-lg font-semibold text-gray-100 neon-text">Edit Task</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-700 transition-colors text-gray-400 hover:text-gray-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-200 mb-2">
                  Title
                </label>
                <input
                  id="title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-200 mb-3">
                  <Tag className="w-4 h-4 inline mr-1" />
                  Category
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {categories.map((category) => (
                    <button
                      key={category.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, category: category.value })}
                      className={`p-3 rounded-xl border-2 text-left transition-all duration-300 ${
                        formData.category === category.value
                          ? 'border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/20'
                          : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
                      }`}
                    >
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${category.color}`}>
                        {category.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Scheduled Date Section */}
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-3">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Scheduled Date
                </label>
                
                {/* Current Date Display */}
                <div className="mb-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm text-gray-300">Currently scheduled for:</span>
                    <span className="text-sm font-medium text-cyan-400">
                      {getDateLabel(formData.scheduledDate)}
                    </span>
                  </div>
                </div>

                {/* Quick Date Buttons */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {quickDates.map((date) => (
                    <button
                      key={date.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, scheduledDate: date.value })}
                      className={`p-3 rounded-xl border-2 text-sm transition-all duration-300 ${
                        formData.scheduledDate === date.value
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400 shadow-lg shadow-cyan-500/20'
                          : 'border-gray-600 hover:border-gray-500 text-gray-300 bg-gray-800/50'
                      }`}
                    >
                      {date.label}
                    </button>
                  ))}
                </div>

                {/* Custom Date Picker */}
                <input
                  type="date"
                  value={formData.scheduledDate}
                  onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                  className="input-field"
                  min={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="startTime" className="block text-sm font-medium text-gray-200 mb-2">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Start Time
                  </label>
                  <input
                    id="startTime"
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label htmlFor="duration" className="block text-sm font-medium text-gray-200 mb-2">
                    Duration (min)
                  </label>
                  <input
                    id="duration"
                    type="number"
                    min="5"
                    max="480"
                    step="5"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-700/50">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}