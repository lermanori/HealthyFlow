import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { parseTasks } from '../lib/ai/parseTasksApi'
import type { AnalyzerPhoto, TaskSuggestion } from '../lib/ai/parseTasksSchema'
import { analytics } from '../lib/analytics'

export function useParsedItems() {
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([])
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set())
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const analyzeText = useCallback(async (
    inputText: string,
    photo?: AnalyzerPhoto,
    defaultScheduleDate?: string,
    onSuccess?: (items: TaskSuggestion[]) => void
  ) => {
    if (!inputText.trim() && !photo) {
      toast.error('Please enter text or upload a photo to analyze')
      return
    }
    setIsAnalyzing(true)
    const input = photo ? (inputText.trim() ? 'text+photo' : 'photo') : 'text'
    try {
      toast.loading('Analyzing with AI...', { id: 'ai-analysis' })
      const items = await parseTasks(inputText, photo, defaultScheduleDate)
      analytics.capture('ai_parse_requested', { surface: 'tasks', input, succeeded: true, item_count: items.length })
      setSuggestions(items)
      setSelectedSuggestions(new Set(items.map(s => s.id)))
      toast.success('AI analysis complete! 🧠', { id: 'ai-analysis' })
      onSuccess?.(items)
    } catch (error) {
      analytics.capture('ai_parse_requested', { surface: 'tasks', input, succeeded: false, item_count: null })
      console.error('AI Analysis error:', error)
      toast.error('Could not parse — try again', { id: 'ai-analysis' })
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  const toggleSuggestion = useCallback((id: string) => {
    setSelectedSuggestions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const updateTaskDate = useCallback((taskId: string, newDate: string) => {
    setSuggestions(prev =>
      prev.map(task => task.id === taskId ? { ...task, scheduledDate: newDate } : task)
    )
  }, [])

  const reset = useCallback(() => {
    setSuggestions([])
    setSelectedSuggestions(new Set())
  }, [])

  return { suggestions, selectedSuggestions, isAnalyzing, analyzeText, toggleSuggestion, updateTaskDate, reset }
}
