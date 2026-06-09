import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, X, Clock, Calendar, Plus, Sparkles } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { taskService, aiService } from '../services/api'
import { useTTS } from '../hooks/useTTS'
import TTSSettings from './TTSSettings'
import TTSActions from './TTSActions'
import VoiceInput from './VoiceInput'
import { format, addDays } from 'date-fns'
import toast from 'react-hot-toast'

interface TaskSuggestion {
  id: string
  title: string
  category: string
  estimatedDuration: number
  priority: 'high' | 'medium' | 'low'
  type: 'task' | 'habit'
  startTime?: string
  scheduledDate: string // Make this required
}

interface AITextAnalyzerProps {
  onClose?: () => void
  scheduledDate?: string
  enableTTS?: boolean
}

export default function AITextAnalyzer({ 
  onClose, 
  scheduledDate, 
  enableTTS = true 
}: AITextAnalyzerProps) {
  const [inputText, setInputText] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([])
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set())
  const [defaultScheduleDate, setDefaultScheduleDate] = useState(scheduledDate || format(new Date(), 'yyyy-MM-dd'))
  
  // TTS State
  const [ttsEnabled, setTtsEnabled] = useState(enableTTS)
  const [autoSpeakResults, setAutoSpeakResults] = useState(true)
  const [selectedVoice, setSelectedVoice] = useState('')
  const [speechRate, setSpeechRate] = useState(1.0)
  
  // Voice Input State
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text')
  const [syncToGoogle, setSyncToGoogle] = useState(false)
  
  const queryClient = useQueryClient()
  const { speak } = useTTS()

  const addTasksMutation = useMutation({
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
          // For habits, always use today as the start date so they begin recurring immediately
          scheduledDate: task.type === 'habit' ? format(new Date(), 'yyyy-MM-dd') : task.scheduledDate
        }
        
        // Use Google Calendar sync for tasks with time/date, otherwise use regular addTask
        return syncToGoogle && task.type === 'task' && task.startTime 
          ? taskService.addTaskWithGoogleSync(taskData)
          : taskService.addTask(taskData)
      })
      return Promise.all(promises)
    },
    onSuccess: (tasks) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      
      // Count habits separately since they start recurring from today
      const regularTasks = tasks.filter(t => t.type !== 'habit')
      const habits = tasks.filter(t => t.type === 'habit')
      
      let successMessage = ''
      
      if (habits.length > 0) {
        successMessage += `Added ${habits.length} daily habit${habits.length > 1 ? 's' : ''} (will appear every day starting today)`
      }
      
      if (regularTasks.length > 0) {
        if (successMessage) successMessage += ' and '
        
        // Group regular tasks by date for better feedback
        const tasksByDate = regularTasks.reduce((acc, task) => {
          const date = task.scheduledDate || 'unknown'
          if (!acc[date]) acc[date] = []
          acc[date].push(task.title)
          return acc
        }, {} as Record<string, string[]>)
        
        const dateInfo = Object.entries(tasksByDate).map(([date, taskTitles]) => {
          const dateLabel = date === format(new Date(), 'yyyy-MM-dd') ? 'today' : 
                           date === format(addDays(new Date(), 1), 'yyyy-MM-dd') ? 'tomorrow' :
                           format(new Date(date), 'MMM d')
          return `${taskTitles.length} task${taskTitles.length > 1 ? 's' : ''} for ${dateLabel}`
        }).join(', ')
        
        const syncInfo = syncToGoogle ? ' and synced to Google Calendar' : ''
        successMessage += `Added ${regularTasks.length} task${regularTasks.length > 1 ? 's' : ''} (${dateInfo})${syncInfo}`
      }
      
      toast.success(`${successMessage} 🚀`)
      setSuggestions([])
      setInputText('')
      setSelectedSuggestions(new Set())
      onClose?.()
    },
    onError: () => {
      toast.error('Failed to add tasks')
    }
  })

  // TTS Summary Generation
  const generateTTSSummary = (suggestions: TaskSuggestion[]): string => {
    if (suggestions.length === 0) return ''
    
    const totalTasks = suggestions.length
    const categories = [...new Set(suggestions.map(s => s.category))]
    const totalDuration = suggestions.reduce((sum, s) => sum + s.estimatedDuration, 0)
    
    // Group by date for better summary
    const tasksByDate = suggestions.reduce((acc, task) => {
      const date = task.scheduledDate
      if (!acc[date]) acc[date] = []
      acc[date].push(task)
      return acc
    }, {} as Record<string, TaskSuggestion[]>)
    
    const dateInfo = Object.entries(tasksByDate).map(([date, tasks]) => {
      const dateLabel = date === format(new Date(), 'yyyy-MM-dd') ? 'today' : 
                       date === format(addDays(new Date(), 1), 'yyyy-MM-dd') ? 'tomorrow' :
                       format(new Date(date), 'EEEE, MMMM d')
      const taskList = tasks.map(t => `${t.title} at ${t.startTime || 'flexible time'}`).join(', ')
      return `${tasks.length} task${tasks.length > 1 ? 's' : ''} for ${dateLabel}: ${taskList}`
    }).join('. ')
    
    return `I've analyzed your input and created ${totalTasks} tasks across ${Object.keys(tasksByDate).length} day${Object.keys(tasksByDate).length > 1 ? 's' : ''}. 
      The plan includes ${categories.join(', ')} activities totaling ${totalDuration} minutes. 
      ${dateInfo}. 
      Would you like me to add these to your schedule?`
  }

  // Speak individual task details
  const speakTaskDetails = (task: TaskSuggestion) => {
    const dateLabel = task.scheduledDate === format(new Date(), 'yyyy-MM-dd') ? 'today' : 
                     task.scheduledDate === format(addDays(new Date(), 1), 'yyyy-MM-dd') ? 'tomorrow' :
                     format(new Date(task.scheduledDate), 'EEEE, MMMM d')
    
    const text = `${task.title}. This is a ${task.priority} priority ${task.category} task. 
      Estimated duration: ${task.estimatedDuration} minutes. 
      Scheduled for ${dateLabel} ${task.startTime ? `at ${task.startTime}` : 'with flexible timing'}.`
    
    speak(text, { 
      voice: selectedVoice, 
      rate: speechRate 
    })
  }

  // Handle speaking results
  const handleSpeakResults = () => {
    const summary = generateTTSSummary(suggestions)
    if (summary) {
      speak(summary, { 
        voice: selectedVoice, 
        rate: speechRate 
      })
    }
  }

  // Test voice function
  const testVoice = () => {
    const testText = "Hello! I'm your AI productivity assistant. I can help you plan tasks for today, tomorrow, or any future date."
    speak(testText, { 
      voice: selectedVoice, 
      rate: speechRate 
    })
  }

  // Handle voice input transcript
  const handleVoiceTranscript = (transcript: string) => {
    setInputText(transcript)
  }

  const analyzeWithBackend = async (text: string): Promise<TaskSuggestion[]> => {
    const { items } = await aiService.parseTasks(text)
    return items.map((it, idx) => ({
      id: `ai-${idx}`,
      title: it.title,
      category: it.category,
      estimatedDuration: it.duration,
      priority: it.priority,
      type: it.type,
      startTime: it.startTime ?? undefined,
      scheduledDate: it.scheduledDate,
    }))
  }

  const analyzeText = async () => {
    if (!inputText.trim()) {
      toast.error('Please enter some text to analyze')
      return
    }

    setIsAnalyzing(true)
    
    try {
      toast.loading('Analyzing with AI...', { id: 'ai-analysis' })
      const aiSuggestions = await analyzeWithBackend(inputText)
      setSuggestions(aiSuggestions)
      setSelectedSuggestions(new Set(aiSuggestions.map(s => s.id)))
      toast.success('AI analysis complete! 🧠', { id: 'ai-analysis' })
      
      if (ttsEnabled && autoSpeakResults) {
        setTimeout(() => {
          const summary = generateTTSSummary(aiSuggestions)
          speak(summary, { 
            voice: selectedVoice, 
            rate: speechRate 
          })
        }, 1000)
      }
    } catch (error) {
      console.error('AI Analysis error:', error)
      toast.error('Could not parse — try again', { id: 'ai-analysis' })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const toggleSuggestion = (id: string) => {
    const newSelected = new Set(selectedSuggestions)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedSuggestions(newSelected)
  }

  const updateTaskDate = (taskId: string, newDate: string) => {
    setSuggestions(prev => prev.map(task => 
      task.id === taskId ? { ...task, scheduledDate: newDate } : task
    ))
  }

  const addSelectedTasks = () => {
    const tasksToAdd = suggestions
      .filter(s => selectedSuggestions.has(s.id))
      .map(({ id, priority, ...task }) => task)
    
    if (tasksToAdd.length === 0) {
      toast.error('Please select at least one task')
      return
    }

    addTasksMutation.mutate(tasksToAdd)
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-400 bg-red-500/20 border-red-500/30'
      case 'medium': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30'
      case 'low': return 'text-green-400 bg-green-500/20 border-green-500/30'
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/30'
    }
  }

  const getCategoryColor = (category: string) => {
    const colors = {
      health: 'bg-green-500/20 text-green-400 border-green-500/30',
      work: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      personal: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      fitness: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    }
    return colors[category as keyof typeof colors] || colors.personal
  }

  const getDateLabel = (date: string) => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
    
    if (date === today) return 'Today'
    if (date === tomorrow) return 'Tomorrow'
    return format(new Date(date), 'MMM d')
  }

  const getDateColor = (date: string) => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
    
    if (date === today) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
    if (date === tomorrow) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }

  const hasOpenAIKey = !!localStorage.getItem('openai_api_key')

  // Quick date options
  const quickDates = [
    { label: 'Today', value: format(new Date(), 'yyyy-MM-dd') },
    { label: 'Tomorrow', value: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
    { label: 'This Weekend', value: format(addDays(new Date(), 6 - new Date().getDay()), 'yyyy-MM-dd') },
    { label: 'Next Week', value: format(addDays(new Date(), 7), 'yyyy-MM-dd') },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="card ai-glow max-w-4xl mx-auto max-h-[90vh] overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center animate-float">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-100 neon-text">AI Task Analyzer</h2>
            <div className="flex items-center space-x-2">
              <p className="text-gray-300 text-sm">Transform your thoughts into structured tasks</p>
              {hasOpenAIKey ? (
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-green-400">AI Enhanced</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1">
                  <span className="text-xs text-yellow-400">Basic Mode</span>
                </div>
              )}
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-700 transition-colors text-gray-400 hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto space-y-6 pb-32 md:pb-20">
        {/* TTS Settings */}
        <TTSSettings
          ttsEnabled={ttsEnabled}
          onTTSEnabledChange={setTtsEnabled}
          selectedVoice={selectedVoice}
          onVoiceChange={setSelectedVoice}
          autoSpeakResults={autoSpeakResults}
          onAutoSpeakChange={setAutoSpeakResults}
          rate={speechRate}
          onRateChange={setSpeechRate}
          onTestVoice={testVoice}
        />

        {/* Default Schedule Date */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-cyan-500/30">
          <div className="flex items-center space-x-2 mb-3">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <h4 className="text-sm font-medium text-gray-200">Default Schedule Date</h4>
          </div>
          
          {/* Quick Date Buttons */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {quickDates.map((date) => (
              <button
                key={date.value}
                onClick={() => setDefaultScheduleDate(date.value)}
                className={`p-2 rounded-lg border text-xs transition-all duration-300 ${
                  defaultScheduleDate === date.value
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
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
            value={defaultScheduleDate}
            onChange={(e) => setDefaultScheduleDate(e.target.value)}
            className="input-field text-sm w-full"
            min={format(new Date(), 'yyyy-MM-dd')}
          />
          <p className="text-xs text-gray-400 mt-2">
            Tasks will be scheduled for this date unless specified otherwise in your input
          </p>
        </div>

        {/* Google Calendar Sync Toggle */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-blue-500/30">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="syncToGoogleAI"
              checked={syncToGoogle}
              onChange={(e) => setSyncToGoogle(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
            />
            <label htmlFor="syncToGoogleAI" className="text-sm text-blue-400 flex items-center space-x-2">
              <span>📅</span>
              <span>Sync tasks to Google Calendar</span>
            </label>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Only tasks with specific times will be synced to Google Calendar
          </p>
        </div>

        {/* Input Mode Toggle */}
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => setInputMode('text')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              inputMode === 'text'
                ? 'bg-cyan-500 text-white shadow-lg'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <span className="flex items-center space-x-2">
              <span>✏️</span>
              <span>Type</span>
            </span>
          </button>
          <button
            onClick={() => setInputMode('voice')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              inputMode === 'voice'
                ? 'bg-cyan-500 text-white shadow-lg'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <span className="flex items-center space-x-2">
              <span>🎤</span>
              <span>Speak</span>
            </span>
          </button>
        </div>

        {/* OpenAI Status */}
        {!hasOpenAIKey && (
          <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-yellow-400 font-medium">Enhanced AI Available</span>
            </div>
            <p className="text-xs text-gray-300 mt-1">
              Add your OpenAI API key in Settings for more intelligent task analysis and smart date scheduling
            </p>
          </div>
        )}

        {/* Input Section */}
        <div className="space-y-4">
          {inputMode === 'text' ? (
            <div className="relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Describe what you want to accomplish... 

Examples:
• 'I need to prepare for tomorrow's presentation, go to the gym, and buy groceries'
• 'Start a morning routine with meditation and reading for next week'
• 'Plan a productive work day with meetings and focused coding time'
• 'I want to have a testosterone-boosting day with surf session and a date tonight'
• 'Schedule gym sessions for this weekend and meal prep for Monday'"
                className="input-field min-h-32 resize-none holographic text-gray-100 placeholder-gray-400"
                disabled={isAnalyzing}
                maxLength={500}
              />
              <div className="absolute bottom-3 right-3 flex items-center space-x-2">
                <span className="text-xs text-gray-400">{inputText.length}/500</span>
                <Sparkles className="w-4 h-4 text-cyan-400 animate-neon-flicker" />
              </div>
            </div>
          ) : (
            <VoiceInput
              onTranscriptChange={handleVoiceTranscript}
              placeholder="Speak to describe your tasks..."
              disabled={isAnalyzing}
            />
          )}

          <button
            onClick={analyzeText}
            disabled={isAnalyzing || !inputText.trim()}
            className="btn-primary w-full flex items-center justify-center space-x-2"
          >
            {isAnalyzing ? (
              <>
                <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></span>
                <span className="text-white">
                  {hasOpenAIKey ? 'Analyzing with OpenAI...' : 'Analyzing with AI...'}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span className="text-white">
                  {inputMode === 'voice' ? 'Analyze Voice Input' : 'Analyze & Generate Tasks'}
                </span>
              </>
            )}
          </button>
        </div>

        {/* AI Analysis Results */}
        <AnimatePresence>
          {suggestions.length > 0 &&
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-100 flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  <span>AI Generated Tasks</span>
                </h3>
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-300">
                    {selectedSuggestions.size} of {suggestions.length} selected
                  </span>
                  <TTSActions 
                    suggestions={suggestions}
                    onSpeakResults={handleSpeakResults}
                  />
                </div>
              </div>

              <div className="grid gap-3 max-h-64 overflow-y-auto">
                {suggestions.map((suggestion) => (
                  <motion.div
                    key={suggestion.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`task-suggestion cursor-pointer ${
                      selectedSuggestions.has(suggestion.id) ? 'ring-2 ring-cyan-400' : ''
                    }`}
                    onClick={() => toggleSuggestion(suggestion.id)}
                  >
                    <div className="flex items-start space-x-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-all ${
                        selectedSuggestions.has(suggestion.id)
                          ? 'bg-cyan-500 border-cyan-500'
                          : 'border-gray-500 hover:border-cyan-400'
                      }`}>
                        {selectedSuggestions.has(suggestion.id) && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            className="w-2 h-2 bg-white rounded-full"
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-100 mb-2">{suggestion.title}</h4>
                        
                        <div className="flex flex-wrap gap-2 mb-3">
                          <span className={`px-2 py-1 rounded-full text-xs border ${getCategoryColor(suggestion.category)}`}>
                            {suggestion.category}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs border ${getPriorityColor(suggestion.priority)}`}>
                            {suggestion.priority} priority
                          </span>
                          <span className="px-2 py-1 rounded-full text-xs bg-gray-500/20 text-gray-400 border border-gray-500/30">
                            {suggestion.estimatedDuration}min
                          </span>
                          <span className="px-2 py-1 rounded-full text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30">
                            {suggestion.type}
                          </span>
                          {suggestion.startTime && (
                            <span className="px-2 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {suggestion.startTime}
                            </span>
                          )}
                          {/* Date Badge */}
                          <span className={`px-2 py-1 rounded-full text-xs border ${getDateColor(suggestion.scheduledDate)}`}>
                            <Calendar className="w-3 h-3 inline mr-1" />
                            {getDateLabel(suggestion.scheduledDate)}
                          </span>
                        </div>

                        {/* Date Selector */}
                        <div className="mb-3">
                          <label className="text-xs text-gray-400 block mb-1">Schedule for:</label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="date"
                              value={suggestion.scheduledDate}
                              onChange={(e) => {
                                e.stopPropagation()
                                updateTaskDate(suggestion.id, e.target.value)
                              }}
                              className="input-field text-xs py-1 px-2 w-auto"
                              min={format(new Date(), 'yyyy-MM-dd')}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex space-x-1">
                              {quickDates.slice(0, 2).map((date) => (
                                <button
                                  key={date.value}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    updateTaskDate(suggestion.id, date.value)
                                  }}
                                  className={`px-2 py-1 rounded text-xs transition-all ${
                                    suggestion.scheduledDate === date.value
                                      ? 'bg-cyan-500 text-white'
                                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                  }`}
                                >
                                  {date.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* TTS Button for Individual Task */}
                        {ttsEnabled && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              speakTaskDetails(suggestion)
                            }}
                            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                          >
                            🔊 Speak details
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          }
        </AnimatePresence>
      </div>

      {/* Fixed Add Button at Bottom */}
      {suggestions.length > 0 && (
        <div className="fixed bottom-32 left-0 right-0 p-4 bg-gray-900/95 backdrop-blur-xl border-t border-gray-700/50 z-30 md:static md:bg-transparent md:backdrop-blur-none md:border-t-0 md:p-0 md:z-auto">
          <button
            onClick={addSelectedTasks}
            disabled={selectedSuggestions.size === 0 || addTasksMutation.isPending}
            className="btn-primary w-full flex items-center justify-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Selected Tasks ({selectedSuggestions.size})</span>
          </button>
        </div>
      )}
    </motion.div>
  )
}