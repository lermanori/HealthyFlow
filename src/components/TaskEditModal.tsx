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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  // Update isMobile state on window resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative card ai-glow w-full max-w-md mx-4 max-h-[90vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
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

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Task Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className={`w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${isMobile ? 'text-base' : ''}`}
                    placeholder="Enter task title..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Category
                  </label>
                  <div className={`grid ${isMobile ? 'grid-cols-2 gap-2' : 'grid-cols-4 gap-3'}`}>
                    {categories.map((category) => (
                      <button
                        key={category.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, category: category.value })}
                        className={`p-3 rounded-lg border-2 transition-all ${formData.category === category.value 
                          ? `${category.color} border-current` 
                          : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                        } ${isMobile ? 'text-sm' : ''}`}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`grid ${isMobile ? 'grid-cols-1 gap-4' : 'grid-cols-2 gap-4'}`}>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      <Clock className="inline w-4 h-4 mr-2" />
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Duration (minutes)
                    </label>
                    <input
                      type="number"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 30 })}
                      min="5"
                      max="480"
                      className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <Calendar className="inline w-4 h-4 mr-2" />
                    Scheduled Date
                  </label>
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={formData.scheduledDate}
                      onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                    
                    {/* Quick date options */}
                    <div className={`flex ${isMobile ? 'flex-wrap gap-2' : 'space-x-2'}`}>
                      {quickDates.map((dateOption) => (
                        <button
                          key={dateOption.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, scheduledDate: dateOption.value })}
                          className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                            formData.scheduledDate === dateOption.value
                              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/20'
                              : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {dateOption.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Buttons - Part of scrollable content */}
                <div className="pt-6 border-t border-gray-700/50">
                  <div className="flex items-center justify-end space-x-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className={`px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700/50 transition-colors ${isMobile ? 'flex-1' : ''}`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmit}
                      className={`btn-primary ${isMobile ? 'flex-1 py-3 text-base font-medium' : ''}`}
                    >
                      {isMobile ? '💾 Save Changes' : 'Save Changes'}
                    </button>
                  </div>
                </div>
                {/* Extra spacer for scrollable area above bottom nav */}
                <div className="h-24" />
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}