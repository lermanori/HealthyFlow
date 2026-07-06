import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Brain, X, Plus, Sparkles, Image as ImageIcon, CornerDownLeft, Mic, Square } from 'lucide-react'
import toast from 'react-hot-toast'
import { aiService, ParsedMeal, CalorieEntryInput, MealParseReview } from '../../services/api'
import { useCalorieEntries } from '../../hooks/useCalorieEntries'
import { useDictatedText } from '../../hooks/useDictatedText'
import { analytics } from '../../lib/analytics'

const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const currentTime = () => new Date().toTimeString().slice(0, 5)

type Photo = { fileName: string; mimeType: (typeof ACCEPTED_PHOTO_TYPES)[number]; data: string; previewUrl: string }

interface MealAnalyzerProps {
  date: string
  onClose?: () => void
}

export default function MealAnalyzer({ date, onClose }: MealAnalyzerProps) {
  const [inputText, setInputText] = useState('')
  const [photo, setPhoto] = useState<Photo | undefined>()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [suggestions, setSuggestions] = useState<ParsedMeal[]>([])
  const [review, setReview] = useState<MealParseReview | undefined>()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { createEntry } = useCalorieEntries(date)
  const {
    isListening,
    isDictationSupported,
    dictationError,
    toggleDictation,
    clearTranscript,
  } = useDictatedText({ text: inputText, setText: setInputText, disabled: isAnalyzing })

  const handlePhotoChange = async (file: File | undefined) => {
    if (!file) return
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type as Photo['mimeType'])) {
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
    setPhoto({ fileName: file.name, mimeType: file.type as Photo['mimeType'], data, previewUrl: dataUrl })
  }

  const removePhoto = () => {
    setPhoto(undefined)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleAnalyze = async () => {
    if (!inputText.trim() && !photo) {
      toast.error('Please enter text or upload a photo to analyze')
      return
    }
    setIsAnalyzing(true)
    const input = photo ? (inputText.trim() ? 'text+photo' : 'photo') : 'text'
    try {
      toast.loading('Analyzing meal...', { id: 'meal-analysis' })
      const { meals, review: parseReview } = await aiService.parseMeals(
        inputText,
        photo ? { mimeType: photo.mimeType, data: photo.data } : undefined,
        date
      )
      analytics.capture('ai_parse_requested', { surface: 'meals', input, succeeded: true, item_count: meals.length })
      setSuggestions(meals)
      setReview(parseReview?.needsReview ? parseReview : undefined)
      setSelected(new Set(meals.map((_, i) => i)))
      toast.success(parseReview?.needsReview ? 'Check the label values before adding' : 'AI analysis complete!', { id: 'meal-analysis' })
    } catch (error) {
      analytics.capture('ai_parse_requested', { surface: 'meals', input, succeeded: false, item_count: null })
      console.error('Meal analysis error:', error)
      toast.error('Could not parse — try again', { id: 'meal-analysis' })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const confirmSelected = () => {
    const toAdd = suggestions.filter((_, i) => selected.has(i))
    if (toAdd.length === 0) {
      toast.error('Please select at least one meal')
      return
    }
    toAdd.forEach((meal) => {
      const entry: CalorieEntryInput = {
        date,
        time: currentTime(),
        name: meal.name,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        quantity: meal.quantity,
      }
      createEntry(entry, 'ai_parse')
    })
    toast.success(`Added ${toAdd.length} meal${toAdd.length > 1 ? 's' : ''} to your log`)
    setSuggestions([])
    setReview(undefined)
    setSelected(new Set())
    setInputText('')
    clearTranscript()
    setPhoto(undefined)
    onClose?.()
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="card ai-glow mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-xl p-4 sm:rounded-2xl sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink neon-text">AI Meal Entry</h2>
            <p className="text-sm text-ink-soft">Describe a meal or snap a photo</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-2 text-ink-muted hover:bg-gray-700 hover:text-ink-soft">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-cyan-300/70 bg-sunken/45 p-4 shadow-2xl shadow-cyan-500/20 ring-1 ring-cyan-400/20">
        {photo && (
          <div className="mb-3 inline-flex max-w-full items-center gap-3 rounded-xl bg-gray-700/90 p-2 pr-3">
            <img src={photo.previewUrl} alt="" className="h-12 w-12 rounded-lg border border-line-strong object-cover" />
            <span className="truncate text-sm text-ink">{photo.fileName}</span>
            <button
              type="button"
              onClick={removePhoto}
              disabled={isAnalyzing}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-300 text-gray-900 hover:bg-gray-100 disabled:opacity-50"
              aria-label="Remove photo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`Describe what you ate...\n\nExamples:\n• '2 eggs, toast, black coffee'\n• 'Chicken salad with olive oil dressing'`}
          className="min-h-[8rem] w-full resize-none bg-transparent text-base leading-7 text-ink placeholder-ink-muted outline-none"
          disabled={isAnalyzing}
          maxLength={2000}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-cyan-300/10 pt-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalyzing}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/25 bg-page/25 text-ink-soft transition-colors hover:bg-gray-700 disabled:opacity-50"
            aria-label={photo ? 'Replace photo' : 'Upload photo'}
          >
            <Plus className="h-6 w-6" />
          </button>
          {photo && <ImageIcon className="h-4 w-4 text-cyan-400" />}
          <button
            type="button"
            onClick={toggleDictation}
            disabled={isAnalyzing || !isDictationSupported}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              isListening
                ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                : 'border-cyan-500/25 bg-page/25 text-ink-soft hover:bg-gray-700'
            }`}
            aria-label={isListening ? 'Stop dictation' : 'Dictate'}
          >
            {isListening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <div className="ml-auto flex items-center gap-2">
            {isListening && <span className="text-xs text-cyan-300">Listening</span>}
            {dictationError && <span className="max-w-32 truncate text-xs text-red-300">{dictationError}</span>}
            <Sparkles className="h-4 w-4 animate-neon-flicker text-cyan-400" />
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || (!inputText.trim() && !photo)}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 transition-all hover:from-cyan-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Analyze meal"
            >
              {isAnalyzing ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <CornerDownLeft className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => void handlePhotoChange(e.target.files?.[0])}
          className="hidden"
        />
      </div>

      {suggestions.length > 0 && (
        <div className="mt-4 space-y-3">
          {review && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
                <div className="min-w-0">
                  <p className="font-medium">Check label values</p>
                  {review.summary && <p className="mt-1 text-amber-100/80">{review.summary}</p>}
                  {review.reasons.length > 0 && (
                    <p className="mt-1 text-amber-100/80">{review.reasons.join(', ')}</p>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <h3 className="flex items-center space-x-2 text-base font-semibold text-ink">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <span>Suggested Meals</span>
            </h3>
            <span className="text-sm text-ink-soft">{selected.size} of {suggestions.length} selected</span>
          </div>
          <div className="grid max-h-72 gap-3 overflow-y-auto">
            {suggestions.map((meal, i) => (
              <div
                key={i}
                onClick={() => toggle(i)}
                className={`task-suggestion cursor-pointer ${selected.has(i) ? 'ring-2 ring-cyan-400' : ''}`}
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                      selected.has(i) ? 'border-cyan-500 bg-cyan-500' : 'border-gray-500 hover:border-cyan-400'
                    }`}
                  >
                    {selected.has(i) && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="mb-1 font-medium text-ink">{meal.name}</h4>
                    {meal.quantity && <p className="mb-2 text-xs text-ink-muted">{meal.quantity}</p>}
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-cyan-500/30 bg-cyan-500/20 px-2 py-1 text-xs text-cyan-300">
                        {meal.calories} cal
                      </span>
                      {meal.protein != null && (
                        <span className="rounded-full border border-gray-500/30 bg-gray-500/20 px-2 py-1 text-xs text-ink-soft">
                          P {meal.protein}g
                        </span>
                      )}
                      {meal.carbs != null && (
                        <span className="rounded-full border border-gray-500/30 bg-gray-500/20 px-2 py-1 text-xs text-ink-soft">
                          C {meal.carbs}g
                        </span>
                      )}
                      {meal.fat != null && (
                        <span className="rounded-full border border-gray-500/30 bg-gray-500/20 px-2 py-1 text-xs text-ink-soft">
                          F {meal.fat}g
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={confirmSelected}
            disabled={selected.size === 0}
            className="btn-primary flex w-full items-center justify-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Selected Meals ({selected.size})</span>
          </button>
        </div>
      )}
    </motion.div>
  )
}
