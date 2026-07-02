import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { taskService } from '../services/api'
import { format, addDays } from 'date-fns'
import toast from 'react-hot-toast'
import type { TaskSuggestion } from '../lib/ai/parseTasksSchema'

export function useAddItems(onSuccess?: () => void) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (tasks: Omit<TaskSuggestion, 'id' | 'priority'>[]) => {
      console.log('AITextAnalyzer - Adding tasks with dates:', tasks)
      const promises = tasks.map(task => {
        const taskData = {
          title: task.title,
          type: task.type,
          category: task.category,
          duration: task.estimatedDuration,
          startTime: task.startTime,
          repeat: (task.type === 'habit' ? 'daily' : 'none') as 'daily' | 'none' | 'weekly',
          scheduledDate: task.type === 'habit' ? format(new Date(), 'yyyy-MM-dd') : task.scheduledDate,
        }
        return taskService.addTask(taskData, 'ai_parse')
      })
      return Promise.all(promises)
    },
    onSuccess: (tasks) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })

      const regularTasks = tasks.filter(t => t.type !== 'habit')
      const habits = tasks.filter(t => t.type === 'habit')

      let successMessage = ''

      if (habits.length > 0) {
        successMessage += `Added ${habits.length} daily habit${habits.length > 1 ? 's' : ''} (will appear every day starting today)`
      }

      if (regularTasks.length > 0) {
        if (successMessage) successMessage += ' and '

        const tasksByDate = regularTasks.reduce((acc, task) => {
          const date = task.scheduledDate || 'unknown'
          if (!acc[date]) acc[date] = []
          acc[date].push(task.title)
          return acc
        }, {} as Record<string, string[]>)

        const dateInfo = Object.entries(tasksByDate).map(([date, taskTitles]) => {
          const dateLabel =
            date === format(new Date(), 'yyyy-MM-dd') ? 'today' :
            date === format(addDays(new Date(), 1), 'yyyy-MM-dd') ? 'tomorrow' :
            format(new Date(date), 'MMM d')
          return `${taskTitles.length} task${taskTitles.length > 1 ? 's' : ''} for ${dateLabel}`
        }).join(', ')

        successMessage += `Added ${regularTasks.length} task${regularTasks.length > 1 ? 's' : ''} (${dateInfo})`
      }

      toast.success(`${successMessage} 🚀`)
      onSuccess?.()
    },
    onError: () => {
      toast.error('Failed to add tasks')
    },
  })

  const addSelectedTasks = useCallback((
    suggestions: TaskSuggestion[],
    selectedIds: Set<string>
  ) => {
    const tasksToAdd = suggestions
      .filter(s => selectedIds.has(s.id))
      .map(({ id, priority, ...task }) => task)

    if (tasksToAdd.length === 0) {
      toast.error('Please select at least one task')
      return
    }

    mutation.mutate(tasksToAdd)
  }, [mutation])

  return { mutation, addSelectedTasks }
}
