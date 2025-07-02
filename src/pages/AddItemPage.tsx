import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Clock, Repeat, Tag, Calendar, Sparkles, Brain } from 'lucide-react'
import { taskService } from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import { format, addDays } from 'date-fns'
import toast from 'react-hot-toast'

export default function AddItemPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    title: '',
    type: 'task' as 'task' | 'habit',
    category: 'personal',
    startTime: '',
    duration: 30,
    repeat: 'none' as 'daily' | 'weekly' | 'none',
    scheduledDate: format(new Date(), 'yyyy-MM-dd'), // Default to today
  })

  const addTaskMutation = useMutation({
    mutationFn: taskService.addTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task added successfully!')
      navigate('/')
    },
    onError: () => {
      toast.error('Failed to add task')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title.trim()) {
      toast.error('Please enter a title')
      return
    }

    addTaskMutation.mutate({
      title: formData.title,
      type: formData.type,
      category: formData.category,
      startTime: formData.startTime || undefined,
      duration: formData.duration,
      repeat: formData.repeat,
      scheduledDate: formData.scheduledDate,
    })
  }

  const categories = [
    { value: 'health', label: 'Health', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    { value: 'work', label: 'Work', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    { value: 'personal', label: 'Personal', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    { value: 'fitness', label: 'Fitness', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  ]

  // Generate quick date options
  const quickDates = [
    { label: 'Today', value: format(new Date(), 'yyyy-MM-dd') },
    { label: 'Tomorrow', value: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
    { label: 'This Weekend', value: format(addDays(new Date(), 6 - new Date().getDay()), 'yyyy-MM-dd') },
    { label: 'Next Week', value: format(addDays(new Date(), 7), 'yyyy-MM-dd') },
  ]

  // Check if we're on mobile
  const isMobile = window.innerWidth < 768

  return (
    <div className="max-w-2xl mx-auto pb-28 md:pb-0">
      <div className="flex items-center space-x-4 mb-6">
        <button
          onClick={() => navigate('/')}
          className="p-3 rounded-xl hover:bg-gray-800/50 transition-all duration-300 text-gray-400 hover:text-cyan-400 hover:shadow-lg hover:shadow-cyan-500/20"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center animate-float">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-100 neon-text">Add New Item</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card ai-glow space-y-6">
        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-200 mb-2">
            Title *
          </label>
          <input
            id="title"
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="input-field"
            placeholder="e.g., Morning workout, Review project proposal"
            required
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-3">
            Type
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, type: 'task' })}
              className={`p-4 rounded-xl border-2 text-left transition-all duration-300 ${
                formData.type === 'task'
                  ? 'border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/20'
                  : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
              }`}
            >
              <div className="font-medium text-gray-100">Task</div>
              <div className="text-sm text-gray-400">One-time or scheduled activity</div>
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, type: 'habit' })}
              className={`p-4 rounded-xl border-2 text-left transition-all duration-300 ${
                formData.type === 'habit'
                  ? 'border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/20'
                  : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
              }`}
            >
              <div className="font-medium text-gray-100">Habit</div>
              <div className="text-sm text-gray-400">Recurring daily activity</div>
            </button>
          </div>
        </div>

        {/* Scheduled Date */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-3">
            <Calendar className="w-4 h-4 inline mr-1" />
            Schedule For
          </label>
          
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

        {/* Category */}
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

        {/* Time & Duration */}
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
              Duration (minutes)
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

        {/* Repeat */}
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-3">
            <Repeat className="w-4 h-4 inline mr-1" />
            Repeat
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'none', label: 'No Repeat' },
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFormData({ ...formData, repeat: option.value as any })}
                className={`p-3 rounded-xl border-2 text-center transition-all duration-300 ${
                  formData.repeat === option.value
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400 shadow-lg shadow-cyan-500/20'
                    : 'border-gray-600 hover:border-gray-500 text-gray-300 bg-gray-800/50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-700/50">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={addTaskMutation.isPending}
            className="btn-primary flex items-center space-x-2"
          >
            {addTaskMutation.isPending ? (
              <>
                <LoadingSpinner size="sm" />
                <span>Adding...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Add Item</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}