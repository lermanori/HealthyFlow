import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, X, Calendar, Plus, Sparkles, Image as ImageIcon, Mic, CornerDownLeft, Square } from 'lucide-react'
import { format, addDays } from 'date-fns'
import toast from 'react-hot-toast'
import { useTTS } from '../../hooks/useTTS'
import TTSSettings from '../TTSSettings'
import TTSActions from '../TTSActions'
import { useParsedItems } from '../../hooks/useParsedItems'
import { useAddItems } from '../../hooks/useAddItems'
import SuggestionCard from './SuggestionCard'
import type { AITextAnalyzerProps, AnalyzerPhoto, TaskSuggestion } from '../../lib/ai/parseTasksSchema'
import { useSTT } from '../../hooks/useSTT'

const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export default function AITextAnalyzer({ onClose, enableTTS = false }: AITextAnalyzerProps) {
  const [inputText, setInputText] = useState('')
  const [photo, setPhoto] = useState<AnalyzerPhoto | undefined>()
  const [defaultScheduleDate, setDefaultScheduleDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [customDateDraft, setCustomDateDraft] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [isCustomDateOpen, setIsCustomDateOpen] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(enableTTS)
  const [autoSpeakResults, setAutoSpeakResults] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState('')
  const [speechRate, setSpeechRate] = useState(1.0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dictatedBaseTextRef = useRef('')

  const { speak } = useTTS()
  const {
    isListening,
    isSupported: isDictationSupported,
    transcript,
    interimTranscript,
    error: dictationError,
    startListening,
    stopListening,
    clearTranscript,
  } = useSTT()
  const { suggestions, selectedSuggestions, isAnalyzing, analyzeText, toggleSuggestion, updateTaskDate, reset } =
    useParsedItems()
  const { mutation: addTasksMutation, addSelectedTasks } = useAddItems(() => {
    reset()
    setInputText('')
    setPhoto(undefined)
    clearTranscript()
    onClose?.()
  })

  useEffect(() => {
    const dictatedText = transcript || interimTranscript
    if (!dictatedText) return

    setInputText([dictatedBaseTextRef.current, dictatedText.trim()].filter(Boolean).join(' '))
  }, [transcript, interimTranscript])

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
    analyzeText(inputText, photo, defaultScheduleDate, (items) => {
      if (ttsEnabled && autoSpeakResults) {
        setTimeout(() => {
          speak(generateTTSSummary(items), { voice: selectedVoice, rate: speechRate })
        }, 1000)
      }
    })
  }

  const handleToggleDictation = () => {
    if (isAnalyzing) return
    if (!isDictationSupported) {
      toast.error('Dictation is not supported in this browser')
      return
    }
    if (isListening) {
      stopListening()
      return
    }

    dictatedBaseTextRef.current = inputText.trim()
    clearTranscript()
    startListening({
      language: 'en-US',
      continuous: false,
      interimResults: true,
      maxAlternatives: 1,
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
  const selectedQuickDate = quickDates.find(date => date.value === defaultScheduleDate)

  const handleScheduleDateChange = (value: string) => {
    if (value === 'custom') {
      setCustomDateDraft(defaultScheduleDate)
      setIsCustomDateOpen(true)
      return
    }
    setDefaultScheduleDate(value)
  }

  const applyCustomDate = () => {
    setDefaultScheduleDate(customDateDraft)
    setIsCustomDateOpen(false)
  }

  const renderAnalyzeButton = (className = '') => (
    <button
      onClick={handleAnalyzeText}
      disabled={isAnalyzing || (!inputText.trim() && !photo)}
      className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 transition-all duration-300 hover:from-cyan-400 hover:to-blue-500 hover:shadow-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-gray-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      aria-label="Analyze and generate tasks"
    >
      {isAnalyzing ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
      ) : (
        <CornerDownLeft className="h-5 w-5" />
      )}
    </button>
  )

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
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 sm:space-y-5 sm:px-0 sm:pb-0">
        <div className="space-y-4">
          <div className="rounded-2xl border border-cyan-300/70 bg-gray-950/45 p-4 shadow-2xl shadow-cyan-500/20 ring-1 ring-cyan-400/20 sm:p-5">
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
              className="min-h-[18rem] w-full resize-none bg-transparent text-base leading-7 text-gray-100 placeholder-gray-400 outline-none sm:min-h-[20rem]"
              disabled={isAnalyzing}
              maxLength={500}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-cyan-300/10 pt-3">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnalyzing}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/25 bg-gray-900/25 text-gray-200 transition-colors hover:bg-gray-700 disabled:opacity-50"
                  aria-label={photo ? 'Replace photo' : 'Upload photo'}
                >
                  <Plus className="w-6 h-6" />
                </button>
                {photo && <ImageIcon className="w-4 h-4 text-cyan-400" />}
              </div>
              <button
                type="button"
                onClick={handleToggleDictation}
                disabled={isAnalyzing || !isDictationSupported}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  isListening
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                    : 'border-cyan-500/25 bg-gray-900/25 text-gray-300 hover:bg-gray-700'
                }`}
                aria-label={isListening ? 'Stop dictation' : 'Dictate'}
              >
                {isListening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
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
                embedded
              />
              <label className="relative flex h-10 items-center gap-1.5 rounded-xl border border-cyan-500/25 bg-gray-900/25 px-3 text-gray-300 transition-colors hover:bg-gray-700">
                <Calendar className="h-4 w-4 text-cyan-400" />
                <span className="sr-only">Default Schedule Date</span>
                <select
                  value={selectedQuickDate ? defaultScheduleDate : 'custom'}
                  onChange={(event) => handleScheduleDateChange(event.target.value)}
                  className="cursor-pointer appearance-none bg-transparent pr-4 text-xs font-medium text-gray-300 outline-none"
                  aria-label="Default schedule date"
                >
                  {quickDates.map((date) => (
                    <option key={date.label} value={date.value}>
                      {date.label}
                    </option>
                  ))}
                  <option value="custom">Custom...</option>
                </select>
              </label>
              <div className="ml-auto flex items-center justify-end gap-2">
                {isListening && <span className="text-xs text-cyan-300">Listening</span>}
                {dictationError && <span className="max-w-32 truncate text-xs text-red-300">{dictationError}</span>}
                <span className="text-xs text-gray-400">{inputText.length}/500</span>
                <Sparkles className="w-4 h-4 text-cyan-400 animate-neon-flicker" />
                {renderAnalyzeButton()}
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

      {suggestions.length > 0 && (
        <div
          className="flex-shrink-0 border-t border-gray-700/50 bg-gray-900/95 p-3 backdrop-blur-xl sm:p-4"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => addSelectedTasks(suggestions, selectedSuggestions)}
            disabled={selectedSuggestions.size === 0 || addTasksMutation.isPending}
            className="btn-primary w-full flex items-center justify-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Selected Tasks ({selectedSuggestions.size})</span>
          </button>
        </div>
      )}

      {isCustomDateOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/75 p-4 backdrop-blur-sm"
          onClick={() => setIsCustomDateOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-cyan-500/30 bg-gray-900 p-5 shadow-2xl shadow-cyan-500/20"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15">
                  <Calendar className="h-4 w-4 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-100">Default Schedule Date</h3>
                  <p className="text-xs text-gray-400">Use when no date is mentioned.</p>
                </div>
              </div>
              <button
                onClick={() => setIsCustomDateOpen(false)}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
                aria-label="Close custom date picker"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <input
              type="date"
              value={customDateDraft}
              onChange={(event) => setCustomDateDraft(event.target.value)}
              className="input-field w-full text-sm"
              min={format(new Date(), 'yyyy-MM-dd')}
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setIsCustomDateOpen(false)}
                className="btn-secondary px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={applyCustomDate}
                className="btn-primary px-4 py-2 text-sm"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
