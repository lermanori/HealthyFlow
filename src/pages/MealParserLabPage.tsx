import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Image as ImageIcon, Loader2, Upload, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { aiService, MealParseReview, ParsedMeal } from '../services/api'

const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

type Photo = {
  fileName: string
  mimeType: (typeof ACCEPTED_PHOTO_TYPES)[number]
  data: string
  previewUrl: string
}

type ParseResult = {
  meals: ParsedMeal[]
  review?: MealParseReview
}

function confidenceStyles(confidence?: MealParseReview['confidence']) {
  if (confidence === 'high') return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
  if (confidence === 'medium') return 'border-amber-400/40 bg-amber-500/10 text-amber-100'
  if (confidence === 'low') return 'border-red-400/40 bg-red-500/10 text-red-100'
  return 'border-gray-700 bg-gray-950/30 text-gray-300'
}

function ReviewPanel({ review }: { review?: MealParseReview }) {
  if (!review) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-950/30 p-4 text-sm text-gray-400">
        No review metadata returned.
      </div>
    )
  }

  const Icon = review.confidence === 'high' ? CheckCircle2 : review.confidence === 'medium' ? AlertTriangle : XCircle

  return (
    <div className={`rounded-lg border p-4 ${confidenceStyles(review.confidence)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold capitalize">{review.confidence} confidence</p>
            <p className="text-xs opacity-80">{review.needsReview ? 'Needs review before adding' : 'Looks ready'}</p>
          </div>
        </div>
        <div className="rounded-full border border-current/30 px-3 py-1 text-sm font-semibold">
          {review.score}/100
        </div>
      </div>
      {review.summary && <p className="mt-3 text-sm opacity-90">{review.summary}</p>}
      {review.reasons.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm opacity-90">
          {review.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
    </div>
  )
}

function MealCard({ meal }: { meal: ParsedMeal }) {
  return (
    <div className="rounded-lg border border-gray-700/70 bg-gray-950/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-100">{meal.name}</h3>
          {meal.quantity && <p className="mt-1 text-sm text-gray-400">{meal.quantity}</p>}
        </div>
        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/15 px-3 py-1 text-sm font-semibold text-cyan-200">
          {meal.calories} cal
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-md border border-gray-700/70 bg-gray-900/40 p-2 text-gray-300">P {meal.protein ?? '-'}g</div>
        <div className="rounded-md border border-gray-700/70 bg-gray-900/40 p-2 text-gray-300">C {meal.carbs ?? '-'}g</div>
        <div className="rounded-md border border-gray-700/70 bg-gray-900/40 p-2 text-gray-300">F {meal.fat ?? '-'}g</div>
      </div>
    </div>
  )
}

export default function MealParserLabPage() {
  const [photo, setPhoto] = useState<Photo | undefined>()
  const [result, setResult] = useState<ParseResult | undefined>()
  const [isParsing, setIsParsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    setResult(undefined)
  }

  const parsePhoto = async () => {
    if (!photo) {
      toast.error('Upload a photo first')
      return
    }
    setIsParsing(true)
    try {
      const parsed = await aiService.parseMeals('', { mimeType: photo.mimeType, data: photo.data })
      setResult(parsed)
      toast.success('Photo parsed')
    } catch (error) {
      console.error('Meal OCR lab error:', error)
      toast.error('Could not parse photo')
    } finally {
      setIsParsing(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-28 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 neon-text">Meal OCR Lab</h1>
          <p className="mt-1 text-sm text-gray-400">Test photo-to-data extraction, confidence, and review scoring.</p>
        </div>
        <button
          className="btn-primary inline-flex items-center gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={isParsing}
        >
          <Upload className="h-4 w-4" /> Upload Photo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => void handlePhotoChange(event.target.files?.[0])}
          className="hidden"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="card space-y-4">
          <div className="flex items-center gap-2 text-gray-100">
            <ImageIcon className="h-5 w-5 text-cyan-300" />
            <h2 className="font-semibold">Input</h2>
          </div>
          {photo ? (
            <>
              <img src={photo.previewUrl} alt="" className="max-h-[32rem] w-full rounded-lg border border-gray-700 object-contain" />
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-gray-300">{photo.fileName}</p>
                <button className="btn-secondary px-4 py-2 text-sm" onClick={parsePhoto} disabled={isParsing}>
                  {isParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Parse'}
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[18rem] w-full flex-col items-center justify-center rounded-lg border border-dashed border-gray-600 bg-gray-950/30 text-gray-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-200"
            >
              <Upload className="mb-3 h-8 w-8" />
              <span className="text-sm">Upload a nutrition label photo</span>
            </button>
          )}
        </section>

        <section className="space-y-4">
          <ReviewPanel review={result?.review} />

          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-100">Extracted Meals</h2>
            {result ? (
              result.meals.length > 0 ? (
                <div className="space-y-3">
                  {result.meals.map((meal, index) => <MealCard key={`${meal.name}-${index}`} meal={meal} />)}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No meal suggestions returned.</p>
              )
            ) : (
              <p className="text-sm text-gray-400">Parse a photo to see extracted data.</p>
            )}
          </div>

          {result && (
            <div className="card">
              <h2 className="mb-3 font-semibold text-gray-100">Raw Response</h2>
              <pre className="max-h-96 overflow-auto rounded-lg border border-gray-700 bg-gray-950/60 p-3 text-xs text-gray-300">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
