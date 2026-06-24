import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, X, Calendar, Plus, Sparkles, Image as ImageIcon } from 'lucide-react'
import { format, addDays } from 'date-fns'
import toast from 'react-hot-toast'
import { useTTS } from '../../hooks/useTTS'
import TTSSettings from '../TTSSettings'
import TTSActions from '../TTSActions'
import VoiceInput from '../VoiceInput'
import { useParsedItems } from '../../hooks/useParsedItems'
import { useAddItems } from '../../hooks/useAddItems'
import SuggestionCard from './SuggestionCard'
import type { AITextAnalyzerProps, AnalyzerPhoto, TaskSuggestion } from '../../lib/ai/parseTasksSchema'

const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export default function AITextAnalyzer({ onClose, scheduledDate, enableTTS = false }: AITextAnalyzerProps) {
  const [inputText, setInputText] = useState('')
  const [photo, setPhoto] = useState<AnalyzerPhoto | undefined>()
  const [defaultScheduleDate, setDefaultScheduleDate] = useState(scheduledDate || format(new Date(), 'yyyy-MM-dd'))
  const [ttsEnabled, setTtsEnabled] = useState(enableTTS)
  const [autoSpeakResults, setAutoSpeakResults] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState('')
  const [speechRate, setSpeechRate] = useState(1.0)
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { speak } = useTTS()
  const { suggestions, selectedSuggestions, isAnalyzing, analyzeText, toggleSuggestion, updateTaskDate, reset } =
    useParsedItems()
  const { mutation: addTasksMutation, addSelectedTasks } = useAddItems(() => {
    reset()
    setInputText('')
    setPhoto(undefined)
    onClose?.()
  })

  const generateTTSSummary = (items: TaskSuggestion[]): string => {
    if (items.length === 0) return ''
    const categories = [...new Set(items.map(s => s.category))]
    const totalDuration = items.reduce((sum, s) => sum + s.estimatedDuration, 0)
    const tasksByDate = items.reduce((acc, task) => {
      if (!acc[task.scheduledDate]) acc[task.scheduledDate] = []
      acc[task.scheduledDate].push(task)
      return acc
    }, {} as Record<string, TaskSuggestion[]>)
    const dateInfo = Object.entries(tasksByDate).map(([date, tasks]) => {
      const dateLabel =
        date === format(new Date(), 'yyyy-MM-dd') ? 'today' :
        date === format(addDays(new Date(), 1), 'yyyy-MM-dd') ? 'tomorrow' :
        format(new Date(date), 'EEEE, MMMM d')
      const taskList = tasks.map(t => `${t.title} at ${t.startTime || 'flexible time'}`).join(', ')
      return `${tasks.length} task${tasks.length > 1 ? 's' : ''} for ${dateLabel}: ${taskList}`
    }).join('. ')
    return `I've analyzed your input and created ${items.length} tasks across ${Object.keys(tasksByDate).length} day${Object.keys(tasksByDate).length > 1 ? 's' : ''}.
      The plan includes ${categories.join(', ')} activities totaling ${totalDuration} minutes.
      ${dateInfo}.
      Would you like me to add these to your schedule?`
  }

  const speakTaskDetails = (task: TaskSuggestion) => {
    if (!ttsEnabled) return

    const dateLabel =
      task.scheduledDate === format(new Date(), 'yyyy-MM-dd') ? 'today' :
      task.scheduledDate === format(addDays(new Date(), 1), 'yyyy-MM-dd') ? 'tomorrow' :
      format(new Date(task.scheduledDate), 'EEEE, MMMM d')
    speak(
      `${task.title}. This is a ${task.priority} priority ${task.category} task.
      Estimated duration: ${task.estimatedDuration} minutes.
      Scheduled for ${dateLabel} ${task.startTime ? `at ${task.startTime}` : 'with flexible timing'}.`,
      { voice: selectedVoice, rate: speechRate }
    )
  }

  const handleSpeakResults = () => {
    if (!ttsEnabled) return

    const summary = generateTTSSummary(suggestions)
    if (summary) speak(summary, { voice: selectedVoice, rate: speechRate })
  }

  const testVoice = () => {
    if (!ttsEnabled) return

    speak(
      "Hello! I'm your AI productivity assistant. I can help you plan tasks for today, tomorrow, or any future date.",
      { voice: selectedVoice, rate: speechRate }
    )
  }

  const handleAnalyzeText = () => {
    analyzeText(inputText, photo, (items) => {
      if (ttsEnabled && autoSpeakResults) {
        setTimeout(() => {
          speak(generateTTSSummary(items), { voice: selectedVoice, rate: speechRate })
        }, 1000)
      }
    })
  }

  const handlePhotoChange = async (file: File | undefined) => {
    if (!file) return
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type as AnalyzerPhoto['mimeType'])) {
      toast.error('Upload a JPG, PNG, or WebP image')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('Photo must be 5MB or smaller')
      return
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    const [, data = ''] = dataUrl.split(',')
    setPhoto({
      fileName: file.name,
      mimeType: file.type as AnalyzerPhoto['mimeType'],
      data,
      previewUrl: dataUrl,
    })
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find(item => item.type.startsWith('image/'))
    if (!imageItem) return

    const file = imageItem.getAsFile()
    if (!file) return

    if (!event.clipboardData.getData('text/plain')) {
      event.preventDefault()
    }
    void handlePhotoChange(file)
  }

  const removePhoto = () => {
    setPhoto(undefined)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

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
      className="card ai-glow mx-auto flex h-[calc(100dvh-6rem)] max-h-[calc(100dvh-6rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl p-0 sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:p-6"
    >
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between px-4 pt-4 pb-3 sm:mb-6 sm:px-0 sm:pt-0 sm:pb-0">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 sm:h-12 sm:w-12 sm:animate-float">
            <Brain className="h-5 w-5 text-white sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-gray-100 neon-text sm:text-xl">AI Task Analyzer</h2>
            <p className="hidden text-sm text-gray-300 sm:block">Transform your thoughts into structured tasks</p>
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
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 sm:space-y-6 sm:px-0 sm:pb-0">
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
          compact
        />

        <div className="rounded-xl border border-cyan-500/30 bg-gray-800/50 p-3 sm:p-4">
          <div className="flex items-center space-x-2 mb-3">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <h4 className="text-sm font-medium text-gray-200">Default Schedule Date</h4>
          </div>
          <div className="mb-3 hidden grid-cols-2 gap-2 sm:grid">
            {quickDates.map((date) => (
              <button
                key={date.label}
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
          <input
            type="date"
            value={defaultScheduleDate}
            onChange={(e) => setDefaultScheduleDate(e.target.value)}
            className="input-field w-full text-sm"
            min={format(new Date(), 'yyyy-MM-dd')}
          />
          <p className="mt-2 hidden text-xs text-gray-400 sm:block">
            Tasks will be scheduled for this date unless specified otherwise in your input
          </p>
        </div>

        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => setInputMode('text')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              inputMode === 'text' ? 'bg-cyan-500 text-white shadow-lg' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <span className="flex items-center space-x-2"><span>✏️</span><span>Type</span></span>
          </button>
          <button
            onClick={() => setInputMode('voice')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              inputMode === 'voice' ? 'bg-cyan-500 text-white shadow-lg' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <span className="flex items-center space-x-2"><span>🎤</span><span>Speak</span></span>
          </button>
        </div>

        <div className="space-y-4">
          {inputMode === 'text' ? (
            <div className="rounded-xl border border-cyan-500/30 bg-gray-800/50 p-3 holographic">
              {photo && (
                <div className="mb-3 inline-flex max-w-full items-center gap-3 rounded-xl bg-gray-700/90 p-2 pr-3">
                  <img
                    src={photo.previewUrl}
                    alt=""
                    className="h-12 w-12 rounded-lg object-cover border border-gray-600"
                  />
                  <span className="truncate text-sm text-gray-100">{photo.fileName}</span>
                  <button
                    type="button"
                    onClick={removePhoto}
                    disabled={isAnalyzing}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-300 text-gray-900 hover:bg-gray-100 disabled:opacity-50"
                    aria-label="Remove photo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onPaste={handlePaste}
                placeholder={`Describe what you want to accomplish...

Examples:
• 'I need to prepare for tomorrow's presentation, go to the gym, and buy groceries'
• 'Start a morning routine with meditation and reading for next week'
• 'Plan a productive work day with meetings and focused coding time'
• 'I want to have a testosterone-boosting day with surf session and a date tonight'
• 'Schedule gym sessions for this weekend and meal prep for Monday'`}
                className="min-h-32 w-full resize-none bg-transparent text-gray-100 placeholder-gray-400 outline-none"
                disabled={isAnalyzing}
                maxLength={500}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAnalyzing}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-gray-200 hover:bg-gray-700 disabled:opacity-50"
                    aria-label={photo ? 'Replace photo' : 'Upload photo'}
                  >
                    <Plus className="w-7 h-7" />
                  </button>
                  {photo && <ImageIcon className="w-4 h-4 text-cyan-400" />}
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-400">{inputText.length}/500</span>
                  <Sparkles className="w-4 h-4 text-cyan-400 animate-neon-flicker" />
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  void handlePhotoChange(event.target.files?.[0])
                }}
                className="hidden"
              />
            </div>
          ) : (
            <VoiceInput
              onTranscriptChange={setInputText}
              placeholder="Speak to describe your tasks..."
              disabled={isAnalyzing}
              compact
            />
          )}
        </div>

        <AnimatePresence>
          {suggestions.length > 0 && (
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
                  {ttsEnabled && <TTSActions suggestions={suggestions} onSpeakResults={handleSpeakResults} />}
                </div>
              </div>

              <div className="grid gap-3 max-h-64 overflow-y-auto">
                {suggestions.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    isSelected={selectedSuggestions.has(suggestion.id)}
                    onToggle={() => toggleSuggestion(suggestion.id)}
                    onUpdateDate={(date) => updateTaskDate(suggestion.id, date)}
                    quickDates={quickDates}
                    ttsEnabled={ttsEnabled}
                    onSpeakDetails={() => speakTaskDetails(suggestion)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Fixed Footer */}
      <div
        className="flex-shrink-0 space-y-3 border-t border-gray-700/50 bg-gray-900/95 p-3 backdrop-blur-xl sm:p-4"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleAnalyzeText}
          disabled={isAnalyzing || (!inputText.trim() && !photo)}
          className="btn-primary flex w-full items-center justify-center space-x-2 py-3"
        >
          {isAnalyzing ? (
            <>
              <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              <span className="text-white">Analyzing with AI...</span>
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
        {suggestions.length > 0 && (
          <button
            onClick={() => addSelectedTasks(suggestions, selectedSuggestions)}
            disabled={selectedSuggestions.size === 0 || addTasksMutation.isPending}
            className="btn-primary w-full flex items-center justify-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Selected Tasks ({selectedSuggestions.size})</span>
          </button>
        )}
      </div>
    </motion.div>
  )
}
