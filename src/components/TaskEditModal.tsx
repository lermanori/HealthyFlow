import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, Sparkles, Calendar, MapPin } from 'lucide-react'
import { format, addDays } from 'date-fns'
import { Task } from '../services/api'

interface TaskEditModalProps {
  task: Task | null
  isOpen: boolean
  onClose: () => void
  onSave: (taskId: string, updates: Partial<Task>, editScope?: 'instance' | 'habit') => void
}

export default function TaskEditModal({ task, isOpen, onClose, onSave }: TaskEditModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    category: 'personal',
    startTime: '',
    location: '',
    duration: 30,
    scheduledDate: format(new Date(), 'yyyy-MM-dd'), // Add scheduled date
  })
  // For recurring habits: 'instance' = just this day, 'habit' = the whole habit.
  const [editScope, setEditScope] = useState<'instance' | 'habit'>('instance')
  const [habitTracking, setHabitTracking] = useState<'binary' | 'target'>('binary')
  const [habitTargetValue, setHabitTargetValue] = useState('45')
  const [habitTargetUnit, setHabitTargetUnit] = useState<'minutes' | 'reps' | 'count'>('minutes')
  const isHabit = task?.type === 'habit'
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
        location: task.type === 'task' ? task.location || '' : '',
        duration: task.duration || 30,
        scheduledDate: task.scheduledDate || format(new Date(), 'yyyy-MM-dd'), // Use task's date or default to today
      })
      setEditScope('instance') // default to this-day-only each time the modal opens
      setHabitTracking(task.type === 'habit' && task.habitInfo?.target ? 'target' : 'binary')
      if (task.type === 'habit' && task.habitInfo?.target) {
        setHabitTargetValue(String(task.habitInfo.target.value))
        setHabitTargetUnit(task.habitInfo.target.unit)
      }
    }
  }, [task])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (task) {
      const updates = {
        ...formData,
        location: task.type === 'task' ? formData.location.trim() || null : undefined,
        ...(task.type === 'habit' && editScope === 'habit' ? {
          habitTarget: habitTracking === 'target'
            ? { value: Number(habitTargetValue), unit: habitTargetUnit }
            : null,
        } : {}),
      }
      onSave(task.id, updates, task.type === 'habit' ? editScope : undefined)
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
                <h2 className="text-lg font-semibold text-ink neon-text">Edit Task</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-700 transition-colors text-ink-muted hover:text-ink-soft"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-2">
                    Task Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className={`w-full px-4 py-3 bg-card/50 border border-line-strong rounded-lg text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${isMobile ? 'text-base' : ''}`}
                    placeholder="Enter task title..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-2">
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
                          : 'border-line-strong text-ink-muted hover:border-gray-500 hover:text-ink-soft'
                        } ${isMobile ? 'text-sm' : ''}`}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>
                </div>

                {task?.type === 'task' && (
                  <div>
                    <label className="block text-sm font-medium text-ink-soft mb-2">
                      <MapPin className="inline w-4 h-4 mr-2" />
                      Location (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className={`w-full px-4 py-3 bg-card/50 border border-line-strong rounded-lg text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${isMobile ? 'text-base' : ''}`}
                      placeholder="Add a place or address..."
                    />
                  </div>
                )}

                <div className={`grid ${isMobile ? 'grid-cols-1 gap-4' : 'grid-cols-2 gap-4'}`}>
                  <div>
                    <label className="block text-sm font-medium text-ink-soft mb-2">
                      <Clock className="inline w-4 h-4 mr-2" />
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full px-4 py-3 bg-card/50 border border-line-strong rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink-soft mb-2">
                      Duration (minutes)
                    </label>
                    <input
                      type="number"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 30 })}
                      min="5"
                      max="480"
                      className="w-full px-4 py-3 bg-card/50 border border-line-strong rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-2">
                    <Calendar className="inline w-4 h-4 mr-2" />
                    Scheduled Date
                  </label>
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={formData.scheduledDate}
                      onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                      className="w-full px-4 py-3 bg-card/50 border border-line-strong rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
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
                              : 'border-line-strong text-ink-muted hover:border-gray-500 hover:text-ink-soft'
                          }`}
                        >
                          {dateOption.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Habit edit scope — only for recurring habits */}
                {isHabit && (
                  <div>
                    <label className="block text-sm font-medium text-ink-soft mb-2">
                      Apply changes to
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setEditScope('instance')}
                        className={`p-3 rounded-lg border-2 text-sm transition-all ${
                          editScope === 'instance'
                            ? 'border-cyan-500 text-cyan-400 bg-cyan-500/20'
                            : 'border-line-strong text-ink-muted hover:border-gray-500 hover:text-ink-soft'
                        }`}
                      >
                        This day only
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditScope('habit')}
                        className={`p-3 rounded-lg border-2 text-sm transition-all ${
                          editScope === 'habit'
                            ? 'border-cyan-500 text-cyan-400 bg-cyan-500/20'
                            : 'border-line-strong text-ink-muted hover:border-gray-500 hover:text-ink-soft'
                        }`}
                      >
                        The whole habit
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      {editScope === 'instance'
                        ? 'Changes affect only this date.'
                        : 'Changes apply from today forward; past days keep their saved values.'}
                    </p>
                  </div>
                )}

                {isHabit && editScope === 'habit' && <div className="space-y-3 rounded-xl border border-purple-500/25 bg-purple-500/5 p-4">
                  <div><p className="text-sm font-medium text-ink-soft">Habit tracking</p><p className="mt-1 text-xs text-ink-muted">Changes apply to this day and future unrecorded days.</p></div>
                  <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setHabitTracking('binary')} className={`rounded-lg border px-3 py-2 text-sm ${habitTracking === 'binary' ? 'border-purple-400/50 bg-purple-400/15 text-purple-200' : 'border-line text-ink-muted'}`}>Binary</button><button type="button" onClick={() => setHabitTracking('target')} className={`rounded-lg border px-3 py-2 text-sm ${habitTracking === 'target' ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200' : 'border-line text-ink-muted'}`}>Target</button></div>
                  {habitTracking === 'target' && <div className="grid grid-cols-2 gap-2"><input type="text" inputMode="decimal" value={habitTargetValue} onChange={event => setHabitTargetValue(event.target.value)} className="input-field" aria-label="Habit target value" /><select value={habitTargetUnit} onChange={event => setHabitTargetUnit(event.target.value as typeof habitTargetUnit)} className="input-field" aria-label="Habit target unit"><option value="minutes">Minutes</option><option value="reps">Repetitions</option><option value="count">Count</option></select></div>}
                </div>}

                {/* Action Buttons - Part of scrollable content */}
                <div className="pt-6 border-t border-line/50">
                  <div className="flex items-center justify-end space-x-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className={`px-4 py-2 rounded-lg border border-line-strong text-ink-soft hover:bg-gray-700/50 transition-colors ${isMobile ? 'flex-1' : ''}`}
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
