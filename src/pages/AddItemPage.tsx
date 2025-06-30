import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Clock, Repeat, Tag, Calendar } from 'lucide-react'
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
    { value: 'health', label: 'Health', color: 'bg-green-100 text-green-800' },
    { value: 'work', label: 'Work', color: 'bg-blue-100 text-blue-800' },
    { value: 'personal', label: 'Personal', color: 'bg-purple-100 text-purple-800' },
    { value: 'fitness', label: 'Fitness', color: 'bg-orange-100 text-orange-800' },
  ]

  // Generate quick date options
  const quickDates = [
    { label: 'Today', value: format(new Date(), 'yyyy-MM-dd') },
    { label: 'Tomorrow', value: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
    { label: 'This Weekend', value: format(addDays(new Date(), 6 - new Date().getDay()), 'yyyy-MM-dd') },
    { label: 'Next Week', value: format(addDays(new Date(), 7), 'yyyy-MM-dd') },
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center space-x-4 mb-6">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Add New Item</h1>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6">
        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
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
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Type
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, type: 'task' })}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${
                formData.type === 'task'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium">Task</div>
              <div className="text-sm text-gray-600">One-time or scheduled activity</div>
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, type: 'habit' })}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${
                formData.type === 'habit'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium">Habit</div>
              <div className="text-sm text-gray-600">Recurring daily activity</div>
            </button>
          </div>
        </div>

        {/* Scheduled Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
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
                className={`p-2 rounded-lg border text-sm transition-colors ${
                  formData.scheduledDate === date.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 hover:border-gray-300'
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
          <label className="block text-sm font-medium text-gray-700 mb-3">
            <Tag className="w-4 h-4 inline mr-1" />
            Category
          </label>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((category) => (
              <button
                key={category.value}
                type="button"
                onClick={() => setFormData({ ...formData, category: category.value })}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${
                  formData.category === category.value
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${category.color}`}>
                  {category.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Time & Duration */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-2">
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
            <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-2">
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
          <label className="block text-sm font-medium text-gray-700 mb-3">
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
                className={`p-3 rounded-lg border-2 text-center transition-colors ${
                  formData.repeat === option.value
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end space-x-3 pt-4">
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
              <LoadingSpinner size="sm" />
            ) : (
              <span>Add Item</span>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}