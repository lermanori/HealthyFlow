import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Sparkles, Wand2, Plus, X, Loader2, Key, Mic } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { taskService } from '../services/api'
import { useTTS } from '../hooks/useTTS'
import TTSSettings from './TTSSettings'
import TTSActions from './TTSActions'
import VoiceInput from './VoiceInput'
import toast from 'react-hot-toast'

interface TaskSuggestion {
  id: string
  title: string
  category: string
  estimatedDuration: number
  priority: 'high' | 'medium' | 'low'
  type: 'task' | 'habit'
  startTime?: string
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
  
  // TTS State
  const [ttsEnabled, setTtsEnabled] = useState(enableTTS)
  const [autoSpeakResults, setAutoSpeakResults] = useState(true)
  const [selectedVoice, setSelectedVoice] = useState('')
  const [speechRate, setSpeechRate] = useState(1.0)
  
  // Voice Input State
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text')
  
  const queryClient = useQueryClient()
  const { speak } = useTTS()

  const addTasksMutation = useMutation({
    mutationFn: async (tasks: Omit<TaskSuggestion, 'id' | 'priority'>[]) => {
      console.log('AITextAnalyzer - scheduledDate prop:', scheduledDate)
      console.log('AITextAnalyzer - fallback date:', new Date().toISOString().split('T')[0])
      console.log('AITextAnalyzer - final scheduledDate:', scheduledDate || new Date().toISOString().split('T')[0])
      
      const promises = tasks.map(task => 
        taskService.addTask({
          title: task.title,
          type: task.type,
          category: task.category,
          duration: task.estimatedDuration,
          startTime: task.startTime,
          repeat: task.type === 'habit' ? 'daily' : 'none',
          scheduledDate: scheduledDate || new Date().toISOString().split('T')[0]
        })
      )
      return Promise.all(promises)
    },
    onSuccess: (tasks) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success(`Added ${tasks.length} task${tasks.length > 1 ? 's' : ''} successfully! 🚀`)
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
    
    const taskList = suggestions.map(s => 
      `${s.title} at ${s.startTime || 'flexible time'}`
    ).join('. ')
    
    return `I've analyzed your input and created ${totalTasks} tasks for you. 
      The plan includes ${categories.join(', ')} activities totaling ${totalDuration} minutes. 
      ${taskList}. 
      Would you like me to add these to your schedule?`
  }

  // Speak individual task details
  const speakTaskDetails = (task: TaskSuggestion) => {
    const text = `${task.title}. This is a ${task.priority} priority ${task.category} task. 
      Estimated duration: ${task.estimatedDuration} minutes. 
      ${task.startTime ? `Scheduled for ${task.startTime}` : 'Flexible timing'}.`
    
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
    const testText = "Hello! I'm your AI productivity assistant. I'm here to help you plan your day effectively."
    speak(testText, { 
      voice: selectedVoice, 
      rate: speechRate 
    })
  }

  // Handle voice input transcript
  const handleVoiceTranscript = (transcript: string) => {
    setInputText(transcript)
  }

  const analyzeWithOpenAI = async (text: string): Promise<TaskSuggestion[]> => {
    const apiKey = localStorage.getItem('openai_api_key')
    
    if (!apiKey) {
      throw new Error('OpenAI API key not configured')
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `Convert user input into actionable tasks. Respond ONLY with a valid JSON array.

Required fields for each task:
- title: Clear, specific task name
- category: "health", "work", "personal", or "fitness"
- estimatedDuration: Time in minutes
- priority: "high", "medium", or "low"
- type: "habit" for daily activities, "task" for one-time
- startTime: "HH:MM" format (24-hour)

Keep it simple and direct. Focus on essential tasks only.

Example input: "I want to have a productive day with exercise, work, and a date tonight"
Example output:
[
  {
    "title": "Morning workout",
    "category": "fitness",
    "estimatedDuration": 45,
    "priority": "high",
    "type": "habit",
    "startTime": "07:00"
  },
  {
    "title": "Work on priority project",
    "category": "work",
    "estimatedDuration": 120,
    "priority": "high",
    "type": "task",
    "startTime": "09:00"
  },
  {
    "title": "Prepare for date",
    "category": "personal",
    "estimatedDuration": 30,
    "priority": "medium",
    "type": "task",
    "startTime": "18:00"
  }
]`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`OpenAI API error: ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('No response from OpenAI')
    }

    try {
      // Clean the response in case there's any extra text
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      const jsonString = jsonMatch ? jsonMatch[0] : content
      
      const tasks = JSON.parse(jsonString)
      
      if (!Array.isArray(tasks)) {
        throw new Error('Response is not an array')
      }

      return tasks.map((task: any, index: number) => ({
        id: `ai-task-${index}-${Date.now()}`,
        title: task.title || 'Untitled Task',
        category: task.category || 'personal',
        estimatedDuration: task.estimatedDuration || 30,
        priority: task.priority || 'medium',
        type: task.type || 'task',
        startTime: task.startTime
      }))
    } catch (error) {
      console.error('Failed to parse OpenAI response:', content)
      throw new Error('Failed to parse AI response - please try again')
    }
  }

  const analyzeText = async () => {
    if (!inputText.trim()) {
      toast.error('Please enter some text to analyze')
      return
    }

    setIsAnalyzing(true)
    
    try {
      const apiKey = localStorage.getItem('openai_api_key')
      
      if (apiKey) {
        // Use OpenAI API
        toast.loading('Analyzing with OpenAI...', { id: 'ai-analysis' })
        const aiSuggestions = await analyzeWithOpenAI(inputText)
        setSuggestions(aiSuggestions)
        setSelectedSuggestions(new Set(aiSuggestions.map(s => s.id)))
        toast.success('AI analysis complete! 🧠', { id: 'ai-analysis' })
        
        // Auto-speak results if enabled
        if (ttsEnabled && autoSpeakResults) {
          setTimeout(() => {
            const summary = generateTTSSummary(aiSuggestions)
            speak(summary, { 
              voice: selectedVoice, 
              rate: speechRate 
            })
          }, 1000) // Small delay to let user see results first
        }
      } else {
        // Fallback to mock analysis
        toast.loading('Analyzing...', { id: 'ai-analysis' })
        await new Promise(resolve => setTimeout(resolve, 2000))
        const mockSuggestions = generateMockSuggestions(inputText)
        setSuggestions(mockSuggestions)
        setSelectedSuggestions(new Set(mockSuggestions.map(s => s.id)))
        toast.success('Analysis complete! (Add OpenAI key for enhanced AI)', { id: 'ai-analysis' })
        
        // Auto-speak results if enabled
        if (ttsEnabled && autoSpeakResults) {
          setTimeout(() => {
            const summary = generateTTSSummary(mockSuggestions)
            speak(summary, { 
              voice: selectedVoice, 
              rate: speechRate 
            })
          }, 1000)
        }
      }
    } catch (error) {
      console.error('AI Analysis error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to analyze text', { id: 'ai-analysis' })
      
      // Fallback to mock analysis on error
      const mockSuggestions = generateMockSuggestions(inputText)
      setSuggestions(mockSuggestions)
      setSelectedSuggestions(new Set(mockSuggestions.map(s => s.id)))
      
      // Auto-speak results if enabled
      if (ttsEnabled && autoSpeakResults) {
        setTimeout(() => {
          const summary = generateTTSSummary(mockSuggestions)
          speak(summary, { 
            voice: selectedVoice, 
            rate: speechRate 
          })
        }, 1000)
      }
    } finally {
      setIsAnalyzing(false)
    }
  }

  const generateMockSuggestions = (text: string): TaskSuggestion[] => {
    const suggestions: TaskSuggestion[] = []
    const lowerText = text.toLowerCase()

    // Simple keyword-based analysis (fallback when OpenAI is not available)
    if (lowerText.includes('workout') || lowerText.includes('exercise') || lowerText.includes('gym')) {
      suggestions.push({
        id: 'workout-1',
        title: 'Complete workout session',
        category: 'fitness',
        estimatedDuration: 60,
        priority: 'high',
        type: 'habit',
        startTime: '07:00'
      })
    }

    if (lowerText.includes('meeting') || lowerText.includes('call') || lowerText.includes('presentation')) {
      suggestions.push({
        id: 'work-1',
        title: 'Prepare for meeting',
        category: 'work',
        estimatedDuration: 30,
        priority: 'high',
        type: 'task',
        startTime: '09:00'
      })
    }

    if (lowerText.includes('read') || lowerText.includes('book') || lowerText.includes('study')) {
      suggestions.push({
        id: 'personal-1',
        title: 'Reading session',
        category: 'personal',
        estimatedDuration: 30,
        priority: 'medium',
        type: 'habit',
        startTime: '20:00'
      })
    }

    if (lowerText.includes('meditat') || lowerText.includes('mindful') || lowerText.includes('relax')) {
      suggestions.push({
        id: 'health-1',
        title: 'Meditation practice',
        category: 'health',
        estimatedDuration: 15,
        priority: 'medium',
        type: 'habit',
        startTime: '06:30'
      })
    }

    if (lowerText.includes('shop') || lowerText.includes('grocery') || lowerText.includes('buy')) {
      suggestions.push({
        id: 'personal-2',
        title: 'Grocery shopping',
        category: 'personal',
        estimatedDuration: 45,
        priority: 'medium',
        type: 'task',
        startTime: '14:00'
      })
    }

    // If no specific keywords found, create a generic task
    if (suggestions.length === 0) {
      suggestions.push({
        id: 'generic-1',
        title: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
        category: 'personal',
        estimatedDuration: 30,
        priority: 'medium',
        type: 'task'
      })
    }

    return suggestions
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

  const hasOpenAIKey = !!localStorage.getItem('openai_api_key')

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
                  <Key className="w-3 h-3 text-yellow-400" />
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
      <div className="flex-1 overflow-y-auto space-y-6">
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
              <Mic className="w-4 h-4" />
              <span>Speak</span>
            </span>
          </button>
        </div>

        {/* OpenAI Status */}
        {!hasOpenAIKey && (
          <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
            <div className="flex items-center space-x-2">
              <Key className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-yellow-400 font-medium">Enhanced AI Available</span>
            </div>
            <p className="text-xs text-gray-300 mt-1">
              Add your OpenAI API key in Settings for more intelligent task analysis
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
• 'Start a morning routine with meditation and reading'
• 'Plan a productive work day with meetings and focused coding time'
• 'I want to have a testosterone-boosting day with surf session and a date tonight'"
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
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-white">
                  {hasOpenAIKey ? 'Analyzing with OpenAI...' : 'Analyzing with AI...'}
                </span>
              </>
            ) : (
              <>
                <Wand2 className="w-5 h-5" />
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
                              {suggestion.startTime}
                            </span>
                          )}
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

              <div className="flex items-center justify-between pt-4 border-t border-gray-700/50">
                <button
                  onClick={addSelectedTasks}
                  disabled={selectedSuggestions.size === 0 || addTasksMutation.isPending}
                  className="btn-primary flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Selected Tasks ({selectedSuggestions.size})</span>
                </button>
              </div>
            </motion.div>
          }
        </AnimatePresence>
      </div>
    </motion.div>
  )
}