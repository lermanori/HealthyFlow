import { z } from 'zod'
import { Credits, UnpricedModelError } from './credits'
import { WorkoutPlanDraft, WorkoutPlanDraftSchema } from './workouts'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const WORKOUT_PLAN_MODEL = 'gpt-4o-mini'
const WORKOUT_PLAN_MAX_TOKENS = 1400

function usesCompletionTokenLimit(model: string) {
  return model.startsWith('gpt-5') || model.startsWith('o')
}

function supportsCustomTemperature(model: string) {
  return !usesCompletionTokenLimit(model)
}

function applyGenerationParams(
  body: Record<string, unknown>,
  opts: { model: string; temperature?: number; maxTokens?: number }
) {
  if (supportsCustomTemperature(opts.model)) {
    body.temperature = opts.temperature ?? 0.2
  }

  if (!opts.maxTokens) return
  if (usesCompletionTokenLimit(opts.model)) {
    body.max_completion_tokens = opts.maxTokens
  } else {
    body.max_tokens = opts.maxTokens
  }
}

export type OpenAIErrorCode = 'no_key' | 'upstream' | 'invalid_response'

export type TokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type OpenAIResult<T> =
  | { ok: true; value: T; usage?: TokenUsage }
  | { ok: false; code: OpenAIErrorCode; message: string }

export type BillableOpenAIErrorCode =
  | OpenAIErrorCode
  | 'tool_error'
  | 'insufficient_credits'
  | 'unpriced_model'
  | 'billing_error'

export type BillableOpenAIResult<T> =
  | { ok: true; value: T; usage?: TokenUsage }
  | { ok: false; code: BillableOpenAIErrorCode; message: string }

type CallOpts = {
  model: string
  systemPrompt: string
  userPrompt: string | OpenAIUserContent[]
  temperature?: number
  maxTokens?: number
}

type BillableCallOpts = CallOpts & {
  userId: string
  endpoint: string
  maxTokens: number
}

export type OpenAIToolChatMessage = {
  role: 'user' | 'assistant'
  content: string | OpenAIUserContent[]
}

export type OpenAIToolEvent = {
  name: string
  args: unknown
  result: unknown
}

// Minimal shape of the OpenAI chat-completions response — just the fields we
// read. `message` stays loose because the tool-calling path passes it through
// (its full shape is model/version dependent).
interface OpenAIChatResponse {
  choices?: Array<{ message?: Record<string, unknown> & { content?: string } }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * A tool failure the model can recover from within the same turn (e.g. it
 * referenced an Item that does not exist). The tool loop feeds these back to
 * the model as a tool result so it can correct itself, instead of aborting the
 * turn. Infrastructure/unexpected errors are NOT recoverable — they still abort
 * and surface as an explicit `tool_error` (see AI harness rules in CLAUDE.md).
 */
export class RecoverableToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecoverableToolError'
  }
}

type ToolCallOpts = {
  userId: string
  endpoint: string
  model: string
  systemPrompt: string
  messages: OpenAIToolChatMessage[]
  tools: Array<{
    name: string
    description: string
    parameters: any
    execute: (args: unknown) => Promise<unknown>
  }>
  temperature?: number
  maxTokens: number
  maxIterations?: number
}

type OpenAIUserContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

function toolMessagePromptEstimate(messages: OpenAIToolChatMessage[]) {
  return messages.flatMap((message) => {
    if (typeof message.content === 'string') {
      return [{ type: 'text', text: `${message.role}: ${message.content}` }]
    }
    return [
      { type: 'text', text: `${message.role}:` },
      ...message.content,
    ]
  })
}

export const ParsedMeal = z.object({
  name: z.string().min(1),
  calories: z.number().int().nonnegative(),
  // nullable but NOT optional: OpenAI strict structured-output mode requires
  // every property in `required`, so optional fields trigger a 400. The model
  // returns null when a macro/quantity is unknown.
  protein: z.number().nonnegative().nullable(),
  carbs: z.number().nonnegative().nullable(),
  fat: z.number().nonnegative().nullable(),
  quantity: z.string().nullable(),
})

export const ParseMealsReview = z.object({
  confidence: z.enum(['high', 'medium', 'low']),
  score: z.number().int().min(0).max(100),
  needsReview: z.boolean(),
  reasons: z.array(z.string()),
  summary: z.string().nullable(),
})

const NutritionLabelEvidence = z.object({
  basis: z.enum(['estimated', 'per_package', 'per_serving', 'per_100g', 'per_100ml']),
  basisText: z.string().nullable(),
  productText: z.string().nullable(),
  packageAmount: z.number().positive().nullable(),
  packageUnit: z.enum(['g', 'ml']).nullable(),
  numericColumnTopToBottom: z.array(z.string()).max(20),
  labelColumnTopToBottom: z.array(z.string()).max(20),
  calories: z.number().nonnegative().nullable(),
  protein: z.number().nonnegative().nullable(),
  carbs: z.number().nonnegative().nullable(),
  fat: z.number().nonnegative().nullable(),
  sodium: z.number().nonnegative().nullable(),
  calcium: z.number().nonnegative().nullable(),
})

const AiParsedMeal = ParsedMeal.extend({
  labelEvidence: NutritionLabelEvidence.nullable(),
})

export const AiParsedMeals = z.object({ meals: z.array(AiParsedMeal).max(20) })
export const PARSED_MEALS_JSON_SCHEMA = z.toJSONSchema(AiParsedMeals)

const NutritionLabelOcrRow = z.object({
  row: z.number().int(),
  rawLabel: z.string(),
  nutrient: z.enum(['energy', 'fat', 'saturated_fat', 'carbs', 'sugars', 'protein', 'salt', 'sodium', 'calcium', 'other']),
  rawValues: z.array(z.string()).max(6),
})

const NutritionLabelOcrColumn = z.object({
  basis: z.enum(['per_100g', 'per_100ml', 'per_package', 'per_serving', 'unknown']),
  basisText: z.string().nullable(),
})

export const NutritionLabelOcr = z.object({
  nutritionLabelVisible: z.boolean(),
  brand: z.string().nullable(),
  productName: z.string().nullable(),
  claimText: z.string().nullable(),
  packageProteinGrams: z.number().nonnegative().nullable(),
  basisText: z.string().nullable(),
  packageText: z.string().nullable(),
  productText: z.string().nullable(),
  columns: z.array(NutritionLabelOcrColumn).max(6),
  rows: z.array(NutritionLabelOcrRow).max(20),
  notes: z.string(),
})

export const NUTRITION_LABEL_OCR_JSON_SCHEMA = z.toJSONSchema(NutritionLabelOcr)

export type ParsedMealValue = z.infer<typeof ParsedMeal>
type AiParsedMealValue = z.infer<typeof AiParsedMeal>
type NutritionLabelEvidenceValue = z.infer<typeof NutritionLabelEvidence>
type NutritionLabelOcrValue = z.infer<typeof NutritionLabelOcr>
export type ParseMealsReviewValue = z.infer<typeof ParseMealsReview>

export const NUTRITION_LABEL_READING_RULES = `Nutrition-label reading rules:
- If a nutrition label is visible, transcribe and use the label values directly instead of estimating.
- For table-style labels, first extract the numeric column top-to-bottom, then extract the nutrient-label column top-to-bottom, then pair row 1 number with row 1 label, row 2 number with row 2 label, etc. This is especially important for Hebrew right-to-left labels where wrapped labels can look vertically offset.
- Put those raw columns into labelEvidence.numericColumnTopToBottom and labelEvidence.labelColumnTopToBottom before calculating calories/macros.
- Prefer the per-serving / per-package column over the per-100g column. Use per-100g only when no serving/package values are visible.
- If only per-100g or per-100ml values are visible, scale them by the package amount. For example, a 350ml bottle with values "ב-100 מ״ל" should be multiplied by 3.5.
- Hebrew label mapping: "אנרגיה" or "קלוריות" = calories; "חלבונים" = protein; "פחמימות" or "סך הפחמימות" = carbs; "שומנים" or "סך השומנים" = fat.
- Hebrew non-macro mapping: "נתרן" = sodium, "סידן" = calcium. Do not use sodium or calcium values as calories, protein, carbs, or fat.
- Hebrew column mapping: "ביחידה" / "באריזה" / "במנה" / "בחטיף" means per serving/package/item; "ב-100 גרם" means per 100g; "ב-100 מ״ל" / "ב-100 מל" means per 100ml.
- Do not confuse "פחמימות" (carbs) with "חלבונים" (protein). If the per-serving label says "סך הפחמימות 22" and "חלבונים 16", return carbs=22 and protein=16.`

export const NUTRITION_LABEL_OCR_PROMPT = `OCR ONLY. Do not estimate nutrition and do not calculate totals. Read the visible product label in any language from the photo.

Set nutritionLabelVisible=true only when a nutrition facts table is visible. Set it to false for an ordinary food photo with no readable nutrition table.

First, read product identity fields if visible:
- brand/logo text, e.g. Müller
- productName must directly transcribe the visible product title/type/flavor in its original language. Never translate it, infer a flavor from packaging colors, or guess a product category. Use null when the title is not legible. Do not use a nutrition claim such as 0% fat as the productName.
- claim text, e.g. 0% fat, high protein, gluten free
- packageProteinGrams: the explicitly printed protein total for the whole package, or null when no whole-package protein claim is visible
- full visible product/title text if possible
- nutrition table basis/header, e.g. per 100g, pro 160g, or ב-100 מ״ל
- package amount, e.g. 160 g or 350 מ״ל

Then read the nutrition table:
1. Preserve raw labels in their original language; do not translate rawLabel.
2. Count the visible numeric column headers, then create exactly one columns entry for each header, left-to-right as printed.
3. Preserve each table row as one rows entry. Set nutrient to the language-independent meaning of the raw label.
4. For every row, return rawValues left-to-right in the exact same order as columns. The rawValues length must equal the columns length.
5. An energy cell such as "238 kJ / 56 kcal" is one raw value in one energy row. Preserve both numbers and their order in that string.
6. Never merge columns, duplicate one column into another, or use saturated fat, sugar, salt, minerals, vitamins, or folic acid as total fat, carbs, or protein.
7. Do not skip rows just because text is wrapped, multilingual, angled, or blurry. Use an empty string for an unreadable cell so column positions stay aligned.

Return OCR evidence only.`

const PARSE_MEALS_MODEL = 'gpt-4o-mini'
const NUTRITION_LABEL_OCR_MODEL = 'gpt-5.4-mini'
const PARSE_MEALS_MAX_TOKENS = 1000
const NUTRITION_LABEL_OCR_MAX_TOKENS = 1200

export type ParseMealsPhoto = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  data: string
}

export type ParseMealsValue = {
  meals: ParsedMealValue[]
  review: ParseMealsReviewValue
}

function parseMealsSystemPrompt() {
  return `Estimate nutrition for the foods described by the user input.

Return a list of meals, each with:
- name: the food or drink name
- quantity: a short description of the amount (e.g. "2 eggs"), or null if not specified
- calories: estimated total calories for that exact quantity (nonnegative integer)
- protein, carbs, fat: estimated total grams for that exact quantity (nonnegative numbers), or null if unknown
- labelEvidence: nullable nutrition-label evidence for this exact item. Use null when no nutrition label supports the meal. When a label is visible, include the label basis, basis text/header, visible product/claim text, package amount/unit if visible, numeric and label columns top-to-bottom, calories/macros, and sodium/calcium if visible.

Rules:
- Estimate calories and macros as accurately as possible for each distinct food item mentioned.
- Nutrition numbers must be totals for the stated quantity. For example, "3 eggs" should be about 210 calories, not the calories for 1 egg.
- Macros may be null if you cannot reasonably estimate them.
- Do not invent foods that are not present in the text or photo.
- If a nutrition label is visible in the photo, follow these rules:
${NUTRITION_LABEL_READING_RULES}`
}

function parseMealsUserContent(trimmedText: string, photo?: ParseMealsPhoto) {
  return photo
    ? [
        {
          type: 'text' as const,
          text: `User text: ${trimmedText || '(none)'}

If a photo is provided, inspect it for visible food items or a nutrition label. If a nutrition label is present, read its calories and macros directly.

${NUTRITION_LABEL_READING_RULES}

Return only meals that are reasonably supported by the text or image.`,
        },
        {
          type: 'image_url' as const,
          image_url: { url: `data:${photo.mimeType};base64,${photo.data}` },
        },
      ]
    : trimmedText
}

function parseMealsPhotoContent(photo?: ParseMealsPhoto) {
  return photo
    ? [
        {
          type: 'text' as const,
          text: NUTRITION_LABEL_OCR_PROMPT,
        },
        {
          type: 'image_url' as const,
          image_url: { url: `data:${photo.mimeType};base64,${photo.data}` },
        },
      ]
    : null
}

const HEBREW_NUTRIENT_MAP: Array<[RegExp, keyof Pick<ParsedMealValue, 'calories' | 'protein' | 'carbs' | 'fat'>]> = [
  [/(אנרגיה|קלוריות)/, 'calories'],
  [/(חלבונים|חלבון)/, 'protein'],
  [/(פחמימות|סך הפחמימות)/, 'carbs'],
  [/(שומנים|סך השומנים)/, 'fat'],
]

function roundMacro(value: number) {
  return Math.round(value * 10) / 10
}

function normalizedBasis(evidence: NutritionLabelEvidenceValue) {
  const basisText = evidence.basisText ?? ''
  if (/100\s*(מ״ל|מל|ml)/i.test(basisText)) return 'per_100ml'
  if (/100\s*(גרם|g)/i.test(basisText)) return 'per_100g'
  return evidence.basis
}

function labelScaleFactor(evidence: NutritionLabelEvidenceValue) {
  const basis = normalizedBasis(evidence)
  if (basis === 'per_package' || basis === 'per_serving') return 1
  if (basis === 'per_100g' && evidence.packageUnit === 'g' && evidence.packageAmount) {
    return evidence.packageAmount / 100
  }
  if (basis === 'per_100ml' && evidence.packageUnit === 'ml' && evidence.packageAmount) {
    return evidence.packageAmount / 100
  }
  return null
}

function parseLabelNumber(value: string) {
  const normalized = value.replace(',', '.')
  const match = normalized.match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

export function defaultReview(): ParseMealsReviewValue {
  return { confidence: 'high', score: 100, needsReview: false, reasons: [], summary: null }
}

function parsePackageAmount(text: string | null) {
  if (!text) return null
  const value = parseLabelNumber(text)
  if (value == null) return null
  if (/(מ״ל|מל|ml)/i.test(text)) return { amount: value, unit: 'ml' as const }
  if (/(גרם|g)/i.test(text)) return { amount: value, unit: 'g' as const }
  return null
}

function basisFromText(text: string | null): NutritionLabelEvidenceValue['basis'] {
  if (!text) return 'estimated'
  if (/100\s*(מ״ל|מל|ml)/i.test(text)) return 'per_100ml'
  if (/100\s*(גרם|g)/i.test(text)) return 'per_100g'
  return 'estimated'
}

function columnPairedNutrients(evidence: NutritionLabelEvidenceValue) {
  const values: Partial<Pick<ParsedMealValue, 'calories' | 'protein' | 'carbs' | 'fat'>> = {}
  const rowCount = Math.min(evidence.numericColumnTopToBottom.length, evidence.labelColumnTopToBottom.length)

  for (let index = 0; index < rowCount; index += 1) {
    const label = evidence.labelColumnTopToBottom[index]
    const value = parseLabelNumber(evidence.numericColumnTopToBottom[index])
    if (value == null) continue
    const mapped = HEBREW_NUTRIENT_MAP.find(([pattern]) => pattern.test(label))
    if (!mapped) continue
    values[mapped[1]] = value
  }

  return values
}

type OcrNutrients = Partial<Pick<ParsedMealValue, 'calories' | 'protein' | 'carbs' | 'fat'>>

function parseEnergyKcal(value: string) {
  const normalized = value.replace(/,/g, '.')
  const explicitKcal = normalized.match(/(\d+(?:\.\d+)?)\s*kcal/i)
  if (explicitKcal) return Number(explicitKcal[1])
  const numbers = [...normalized.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
  if (/\bkj\b/i.test(normalized) && numbers.length === 1) return null
  return numbers.length >= 2 ? numbers[1] : numbers[0] ?? null
}

function nutrientsForOcrColumn(ocr: NutritionLabelOcrValue, columnIndex: number): OcrNutrients {
  const nutrients: OcrNutrients = {}
  for (const row of ocr.rows) {
    const rawValue = row.rawValues[columnIndex]
    if (!rawValue) continue
    const value = row.nutrient === 'energy' ? parseEnergyKcal(rawValue) : parseLabelNumber(rawValue)
    if (value == null) continue
    if (row.nutrient === 'energy') nutrients.calories = value
    if (row.nutrient === 'protein') nutrients.protein = value
    if (row.nutrient === 'carbs') nutrients.carbs = value
    if (row.nutrient === 'fat') nutrients.fat = value
  }
  return nutrients
}

function semanticOcrColumn(ocr: NutritionLabelOcrValue) {
  const packageAmount = parsePackageAmount(ocr.packageText)
  const usableColumns = ocr.columns
    .map((column, index) => ({ column, nutrients: nutrientsForOcrColumn(ocr, index) }))
    .filter(({ nutrients }) => (
      nutrients.calories != null &&
      (nutrients.protein != null || nutrients.carbs != null || nutrients.fat != null)
    ))
  const directColumn = usableColumns.find(({ column }) => column.basis === 'per_package')
    ?? usableColumns.find(({ column }) => column.basis === 'per_serving')
  const scaledColumn = packageAmount
    ? usableColumns.find(({ column }) => (
        (column.basis === 'per_100g' && packageAmount.unit === 'g') ||
        (column.basis === 'per_100ml' && packageAmount.unit === 'ml')
      ))
    : undefined
  const selected = directColumn ?? scaledColumn
  if (!selected) return null

  return {
    basis: selected.column.basis,
    basisText: selected.column.basisText,
    factor: directColumn ? 1 : packageAmount!.amount / 100,
    nutrients: selected.nutrients,
  }
}

function preferredOcrEvidence(ocr: NutritionLabelOcrValue) {
  return semanticOcrColumn(ocr)
}

export function evaluateOcrEvidence(ocr: NutritionLabelOcrValue): ParseMealsReviewValue {
  let score = 100
  const reasons: string[] = []
  const preferred = preferredOcrEvidence(ocr)
  const packageAmount = parsePackageAmount(ocr.packageText)
  const nutrients = preferred?.nutrients ?? {}

  const penalize = (points: number, reason: string) => {
    score -= points
    reasons.push(reason)
  }

  if (!preferred) penalize(25, 'Missing usable nutrition column')
  if (!packageAmount) penalize(25, 'Missing package size')
  if (nutrients.calories == null) penalize(25, 'Missing calories row')
  if (nutrients.protein == null) penalize(10, 'Missing protein row')
  if (nutrients.carbs == null) penalize(10, 'Missing carbs row')
  if (nutrients.fat == null && !hasZeroFatOcrClaim(ocr)) penalize(10, 'Missing fat row')
  if (ocr.rows.some((row) => row.rawValues.length !== ocr.columns.length)) {
    penalize(15, 'Nutrition table rows look misaligned')
  }
  if (nutrients.carbs != null && nutrients.protein != null && nutrients.carbs > nutrients.protein * 8) {
    penalize(20, 'Possible mineral or row mix-up in macros')
  }
  if (nutrients.calories != null && nutrients.fat != null && nutrients.fat * 9 > nutrients.calories * 1.25) {
    penalize(35, 'Fat is not plausible for the calorie value')
  }

  const boundedScore = Math.max(0, Math.min(100, score))
  const confidence = boundedScore >= 85 ? 'high' : boundedScore >= 60 ? 'medium' : 'low'
  const summary = [
    preferred?.basisText ?? ocr.basisText,
    ocr.packageText,
    nutrients.calories == null ? null : `${nutrients.calories} cal`,
    nutrients.protein == null ? null : `P ${nutrients.protein}g`,
    nutrients.carbs == null ? null : `C ${nutrients.carbs}g`,
    (nutrients.fat == null && !hasZeroFatOcrClaim(ocr)) ? null : `F ${nutrients.fat ?? 0}g`,
  ].filter(Boolean).join(' · ') || null

  return {
    confidence,
    score: boundedScore,
    needsReview: confidence !== 'high',
    reasons,
    summary,
  }
}

function inferHebrewProteinNearCalcium(
  evidence: NutritionLabelEvidenceValue,
  paired: Partial<Pick<ParsedMealValue, 'calories' | 'protein' | 'carbs' | 'fat'>>
) {
  const labels = evidence.labelColumnTopToBottom
  if (!labels.some((label) => /סידן/.test(label))) return null

  const numbers = evidence.numericColumnTopToBottom.map(parseLabelNumber)
  const calciumIndex = labels.findIndex((label) => /סידן/.test(label))
  const proteinIndex = labels.findIndex((label) => /(חלבונים|חלבון)/.test(label))
  const candidates: number[] = []

  const addProteinLike = (value: number | null | undefined) => {
    if (value != null && value >= 5 && value <= 40) candidates.push(value)
  }

  addProteinLike(numbers[proteinIndex])
  addProteinLike(numbers[calciumIndex])
  addProteinLike(numbers[calciumIndex - 1])

  const currentProtein = paired.protein ?? evidence.protein ?? null
  const best = candidates.sort((a, b) => b - a)[0] ?? null
  if (best == null) return null
  if (currentProtein != null && currentProtein >= best) return null
  return best
}

function inferHebrewCarbsBeforeProtein(
  evidence: NutritionLabelEvidenceValue,
  paired: Partial<Pick<ParsedMealValue, 'calories' | 'protein' | 'carbs' | 'fat'>>,
  proteinValue: number | null
) {
  if (!evidence.labelColumnTopToBottom.some((label) => /סידן/.test(label))) return null
  if (proteinValue == null) return null
  const currentCarbs = paired.carbs ?? evidence.carbs ?? null
  if (currentCarbs != null && currentCarbs > 2 && currentCarbs < 30) return null

  const candidates = evidence.numericColumnTopToBottom
    .map(parseLabelNumber)
    .filter((value): value is number => value != null && value >= 2 && value < proteinValue)
  return candidates.sort((a, b) => b - a)[0] ?? null
}

function hasZeroFatClaim(evidence: NutritionLabelEvidenceValue) {
  return /0\s*%.*(שומן|fat)|(שומן|fat).{0,12}0\s*%/i.test(evidence.productText ?? '')
}

function hasZeroFatOcrClaim(ocr: NutritionLabelOcrValue) {
  const text = [ocr.productText, ocr.claimText].filter(Boolean).join(' ')
  return /0\s*%.*(שומן|fat)|(שומן|fat).{0,12}0\s*%/i.test(text)
}

const ZERO_USAGE: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

async function callWithBilling<T>(
  opts: BillableCallOpts,
  call: () => Promise<OpenAIResult<T>>
): Promise<BillableOpenAIResult<T>> {
  let reservedTokens = 0

  try {
    reservedTokens = await Credits.estimateReserve({
      model: opts.model,
      systemPrompt: opts.systemPrompt,
      userPrompt: opts.userPrompt,
      maxOutputTokens: opts.maxTokens,
    })
    const ok = await Credits.reserve(opts.userId, reservedTokens)
    if (!ok) {
      return { ok: false, code: 'insufficient_credits', message: 'Insufficient AI tokens' }
    }
  } catch (error) {
    if (error instanceof UnpricedModelError) {
      return { ok: false, code: 'unpriced_model', message: 'AI model pricing is not configured' }
    }
    console.error('AI billing estimate failed:', error)
    return { ok: false, code: 'billing_error', message: 'AI billing failed' }
  }

  const result = await call()
  if (!result.ok) {
    await Credits.refundReserve(opts.userId, reservedTokens, 'refund_failed_call')
    return result
  }

  await Credits.settleReserved(opts.userId, reservedTokens, result.usage ?? ZERO_USAGE, {
    endpoint: opts.endpoint,
    model: opts.model,
  })
  return result
}

function cleanProductNamePart(value: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed || null
}

function ocrMealName(ocr: NutritionLabelOcrValue, fallbackName?: string) {
  const brand = cleanProductNamePart(ocr.brand)
  const productName = cleanProductNamePart(ocr.productName)
  if (brand && productName && !productName.toLowerCase().includes(brand.toLowerCase())) {
    return `${brand} ${productName}`
  }
  if (productName) return productName
  if (brand) return brand
  const userName = cleanProductNamePart(fallbackName ?? null)
  if (userName) return userName
  return cleanProductNamePart(ocr.productText) || 'Nutrition label item'
}

function reconciledPackageProtein(ocr: NutritionLabelOcrValue, nutrients: OcrNutrients, factor: number) {
  if (nutrients.protein == null) return ocr.packageProteinGrams
  const tableTotal = roundMacro(nutrients.protein * factor)
  const claimedTotal = ocr.packageProteinGrams
  const looksLikePrintedPackageTotal = claimedTotal != null && Math.abs(claimedTotal - Math.round(claimedTotal)) < 0.05
  if (claimedTotal != null && looksLikePrintedPackageTotal && Math.abs(claimedTotal - tableTotal) <= Math.max(1, tableTotal * 0.15)) {
    return claimedTotal
  }

  if (nutrients.calories == null || nutrients.carbs == null || nutrients.fat == null) return tableTotal
  if (nutrients.fat > 1 || nutrients.protein < 5) return tableTotal

  const macroCalories = nutrients.protein * 4 + nutrients.carbs * 4 + nutrients.fat * 9
  const calorieDisagreement = Math.abs(macroCalories - nutrients.calories) / Math.max(1, nutrients.calories)
  if (calorieDisagreement <= 0.03) return tableTotal

  const inferredProtein = (nutrients.calories - nutrients.carbs * 4 - nutrients.fat * 9) / 4
  if (inferredProtein <= 0 || Math.abs(inferredProtein - nutrients.protein) > nutrients.protein * 0.2) return tableTotal
  return roundMacro(inferredProtein * factor)
}

function normalizedIdentityTokens(value: string | null) {
  return new Set((value ?? '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean))
}

function productIdentityNeedsRetry(ocr: NutritionLabelOcrValue) {
  const productTokens = normalizedIdentityTokens(ocr.productName)
  const claimTokens = normalizedIdentityTokens(ocr.claimText)
  if (productTokens.size === 0) return false
  if (claimTokens.size === 0) return false
  const overlap = [...productTokens].filter((token) => claimTokens.has(token)).length
  return overlap / productTokens.size >= 0.6
}

export function nutritionLabelMealFromOcr(ocr: NutritionLabelOcrValue, fallbackName?: string): ParsedMealValue | null {
  const packageAmount = parsePackageAmount(ocr.packageText)
  if (!packageAmount) return null

  const preferred = preferredOcrEvidence(ocr)
  if (!preferred) return null
  const { factor, nutrients } = preferred
  if (nutrients.calories == null) return null
  if (nutrients.protein == null && nutrients.carbs == null && nutrients.fat == null) return null
  if (hasZeroFatOcrClaim(ocr)) nutrients.fat = 0

  return {
    name: ocrMealName(ocr, fallbackName),
    calories: Math.round(nutrients.calories * factor),
    protein: reconciledPackageProtein(ocr, nutrients, factor),
    carbs: nutrients.carbs == null ? null : roundMacro(nutrients.carbs * factor),
    fat: nutrients.fat == null ? null : roundMacro(nutrients.fat * factor),
    quantity: `${packageAmount.amount} ${packageAmount.unit}`,
  }
}

export function normalizeParsedMeal(meal: AiParsedMealValue): ParsedMealValue {
  const { labelEvidence, ...publicMeal } = meal
  if (!labelEvidence || labelEvidence.basis === 'estimated') return publicMeal

  const factor = labelScaleFactor(labelEvidence)
  if (factor == null) return publicMeal
  const paired = columnPairedNutrients(labelEvidence)
  const inferredProtein = inferHebrewProteinNearCalcium(labelEvidence, paired)
  if (inferredProtein != null) paired.protein = inferredProtein
  const inferredCarbs = inferHebrewCarbsBeforeProtein(labelEvidence, paired, paired.protein ?? null)
  if (inferredCarbs != null) paired.carbs = inferredCarbs
  if (hasZeroFatClaim(labelEvidence)) paired.fat = 0
  const evidence = { ...labelEvidence, ...paired }

  return {
    ...publicMeal,
    calories: evidence.calories == null ? publicMeal.calories : Math.round(evidence.calories * factor),
    protein: evidence.protein == null ? publicMeal.protein : roundMacro(evidence.protein * factor),
    carbs: evidence.carbs == null ? publicMeal.carbs : roundMacro(evidence.carbs * factor),
    fat: evidence.fat == null ? publicMeal.fat : roundMacro(evidence.fat * factor),
  }
}

async function rawCall(
  opts: CallOpts & { responseFormat?: any }
): Promise<OpenAIResult<string>> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { ok: false, code: 'no_key', message: 'Missing OPENAI_API_KEY' }
  }

  const body: any = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userPrompt },
    ],
  }
  applyGenerationParams(body, opts)
  if (opts.responseFormat) body.response_format = opts.responseFormat

  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('OpenAI upstream error:', res.status, res.statusText, body)
      return { ok: false, code: 'upstream', message: `Upstream ${res.status}` }
    }
    const data = (await res.json()) as OpenAIChatResponse
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      console.error('OpenAI response missing content:', data)
      return { ok: false, code: 'invalid_response', message: 'Missing content' }
    }
    const rawUsage = data.usage
    const usage: TokenUsage | undefined = rawUsage
      ? {
          promptTokens: rawUsage.prompt_tokens,
          completionTokens: rawUsage.completion_tokens,
          totalTokens: rawUsage.total_tokens,
        }
      : undefined
    return { ok: true, value: String(content), usage }
  } catch (e) {
    console.error('OpenAI call threw:', e)
    return { ok: false, code: 'upstream', message: 'Network error' }
  }
}

function addUsage(a: TokenUsage, b?: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + (b?.promptTokens ?? 0),
    completionTokens: a.completionTokens + (b?.completionTokens ?? 0),
    totalTokens: a.totalTokens + (b?.totalTokens ?? 0),
  }
}

function toolFallbackMessage(toolEvents: OpenAIToolEvent[]) {
  if (toolEvents.length === 0) return null
  const pending = toolEvents
    .map((event) => (event.result as { pendingAction?: unknown })?.pendingAction)
    .find(Boolean)
  if (pending) return 'I prepared that change. Review the preview, then Confirm or Cancel.'
  return 'I ran the requested lookup. See the details above.'
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function compactErrorMessage(value: unknown) {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const parts = ['message', 'code', 'details', 'hint']
    .map((key) => {
      const part = record[key]
      return typeof part === 'string' && part.trim() ? `${key}: ${part.trim()}` : null
    })
    .filter(Boolean)

  if (parts.length > 0) return parts.join('; ')
  return safeJson(value)
}

function toolExecutionErrorMessage(error: unknown) {
  const message = compactErrorMessage(error)
  if (!message) return 'Tool execution failed'
  return message.length > 600 ? `${message.slice(0, 597)}...` : message
}

async function rawToolCall(
  opts: Pick<ToolCallOpts, 'model' | 'temperature' | 'maxTokens'> & {
    messages: any[]
    tools: ToolCallOpts['tools']
  }
): Promise<OpenAIResult<any>> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { ok: false, code: 'no_key', message: 'Missing OPENAI_API_KEY' }
  }

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    tools: opts.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
    tool_choice: 'auto',
  }
  applyGenerationParams(body, opts)

  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('OpenAI upstream error:', res.status, res.statusText, body)
      return { ok: false, code: 'upstream', message: `Upstream ${res.status}` }
    }
    const data = (await res.json()) as OpenAIChatResponse
    const message = data.choices?.[0]?.message
    if (!message) {
      console.error('OpenAI tool response missing message:', data)
      return { ok: false, code: 'invalid_response', message: 'Missing message' }
    }
    const rawUsage = data.usage
    const usage: TokenUsage | undefined = rawUsage
      ? {
          promptTokens: rawUsage.prompt_tokens,
          completionTokens: rawUsage.completion_tokens,
          totalTokens: rawUsage.total_tokens,
        }
      : undefined
    return { ok: true, value: message, usage }
  } catch (e) {
    console.error('OpenAI tool call threw:', e)
    return { ok: false, code: 'upstream', message: 'Network error' }
  }
}

export const Openai = {
  async callText(opts: CallOpts): Promise<OpenAIResult<string>> {
    const result = await rawCall(opts)
    if (!result.ok) return result
    return { ok: true, value: result.value.trim(), usage: result.usage }
  },

  async callBillableText(opts: BillableCallOpts): Promise<BillableOpenAIResult<string>> {
    return callWithBilling(opts, () => this.callText(opts))
  },

  async callStructured<T>(
    opts: CallOpts & {
      schemaName: string
      jsonSchema: any
      parser: (v: unknown) => T
    }
  ): Promise<OpenAIResult<T>> {
    const result = await rawCall({
      ...opts,
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: opts.schemaName,
          schema: opts.jsonSchema,
          strict: true,
        },
      },
    })
    if (!result.ok) return result
    try {
      const parsed = opts.parser(JSON.parse(result.value))
      return { ok: true, value: parsed, usage: result.usage }
    } catch (e) {
      console.error('OpenAI structured parse failed:', e)
      return { ok: false, code: 'invalid_response', message: 'Schema validation failed' }
    }
  },

  async callBillableStructured<T>(
    opts: BillableCallOpts & {
      schemaName: string
      jsonSchema: any
      parser: (v: unknown) => T
    }
  ): Promise<BillableOpenAIResult<T>> {
    return callWithBilling(opts, () => this.callStructured(opts))
  },

  async callBillableTools(
    opts: ToolCallOpts
  ): Promise<BillableOpenAIResult<{ message: string; toolEvents: OpenAIToolEvent[] }>> {
    const maxIterations = opts.maxIterations ?? 4
    const userPrompt = toolMessagePromptEstimate(opts.messages)
    let reservedTokens = 0

    try {
      reservedTokens = await Credits.estimateReserve({
        model: opts.model,
        systemPrompt: opts.systemPrompt,
        userPrompt,
        maxOutputTokens: opts.maxTokens * maxIterations,
      })
      const ok = await Credits.reserve(opts.userId, reservedTokens)
      if (!ok) {
        return { ok: false, code: 'insufficient_credits', message: 'Insufficient AI tokens' }
      }
    } catch (error) {
      if (error instanceof UnpricedModelError) {
        return { ok: false, code: 'unpriced_model', message: 'AI model pricing is not configured' }
      }
      console.error('AI billing estimate failed:', error)
      return { ok: false, code: 'billing_error', message: 'AI billing failed' }
    }

    let usage: TokenUsage = ZERO_USAGE
    const toolEvents: OpenAIToolEvent[] = []
    const messages: any[] = [
      { role: 'system', content: opts.systemPrompt },
      ...opts.messages.map((message) => ({ role: message.role, content: message.content })),
    ]

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const result = await rawToolCall({
        model: opts.model,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        messages,
        tools: opts.tools,
      })

      if (!result.ok) {
        await Credits.settleReserved(opts.userId, reservedTokens, usage, {
          endpoint: opts.endpoint,
          model: opts.model,
        })
        return result
      }
      usage = addUsage(usage, result.usage)

      const message = result.value
      const toolCalls = message.tool_calls ?? []
      if (toolCalls.length === 0) {
        const content = typeof message.content === 'string' ? message.content.trim() : ''
        if (!content) {
          const fallback = toolFallbackMessage(toolEvents)
          if (!fallback) {
            await Credits.settleReserved(opts.userId, reservedTokens, usage, {
              endpoint: opts.endpoint,
              model: opts.model,
            })
            return { ok: false, code: 'invalid_response', message: 'Missing assistant content' }
          }
          await Credits.settleReserved(opts.userId, reservedTokens, usage, {
            endpoint: opts.endpoint,
            model: opts.model,
          })
          return { ok: true, value: { message: fallback, toolEvents }, usage }
        }
        await Credits.settleReserved(opts.userId, reservedTokens, usage, {
          endpoint: opts.endpoint,
          model: opts.model,
        })
        return { ok: true, value: { message: content, toolEvents }, usage }
      }

      messages.push({
        role: 'assistant',
        content: message.content ?? null,
        tool_calls: toolCalls,
      })

      for (const toolCall of toolCalls) {
        const name = toolCall.function?.name
        const tool = opts.tools.find((candidate) => candidate.name === name)
        if (!tool) {
          await Credits.settleReserved(opts.userId, reservedTokens, usage, {
            endpoint: opts.endpoint,
            model: opts.model,
          })
          return { ok: false, code: 'tool_error', message: `Unknown tool: ${name}` }
        }

        let args: unknown
        try {
          args = JSON.parse(toolCall.function?.arguments || '{}')
          const value = await tool.execute(args)
          toolEvents.push({ name, args, result: value })
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ ok: true, value }),
          })
        } catch (error) {
          const message = toolExecutionErrorMessage(error)
          console.error('OpenAI tool execution failed:', {
            tool: name,
            message,
            error,
          })
          if (error instanceof RecoverableToolError) {
            // Let the model correct itself within the turn (e.g. re-list Items
            // and retry with a real id) instead of aborting.
            toolEvents.push({ name, args, result: { ok: false, error: message } })
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ ok: false, error: message }),
            })
            continue
          }
          await Credits.settleReserved(opts.userId, reservedTokens, usage, {
            endpoint: opts.endpoint,
            model: opts.model,
          })
          return { ok: false, code: 'tool_error', message }
        }
      }
    }

    await Credits.settleReserved(opts.userId, reservedTokens, usage, {
      endpoint: opts.endpoint,
      model: opts.model,
    })
    return { ok: false, code: 'invalid_response', message: 'Tool loop did not produce a final answer' }
  },
}

export async function generateWorkoutPlanWithAi(opts: {
  userId: string
  intent: string
}): Promise<BillableOpenAIResult<WorkoutPlanDraft>> {
  const systemPrompt = `Create one reusable HealthyFlow Workout plan from the user's training intent.

Return a plan with a concise name, an optional hex color or null, an optional plan note or null, and an ordered exercise array.

Each exercise must include:
- name
- sets, reps, weightKg, durationMinutes, and distanceKm; use a positive number when relevant and null otherwise
- notes; use a concise instruction when useful and null otherwise

Rules:
- Stay training-agnostic. Support strength, calisthenics, running, walking, cycling, swimming, yoga, mobility, sports practice, or mixed training without assuming a gym.
- Match the user's requested duration, style, equipment, level, and constraints when provided.
- Use only metrics that make sense for each exercise. A yoga pose may use durationMinutes; a run may use durationMinutes or distanceKm; strength may use sets/reps and optional weightKg.
- Put exercises in the intended execution order.
- For multi-day intent, keep this a single named reusable template and use exercise notes to identify day/group boundaries where helpful.
- Do not include medical claims, diagnosis, or extreme prescriptions.
- The result is a draft the user will review and edit before saving.`

  return Openai.callBillableStructured({
    userId: opts.userId,
    endpoint: 'workout-plan-generate',
    model: WORKOUT_PLAN_MODEL,
    systemPrompt,
    userPrompt: opts.intent,
    temperature: 0.3,
    maxTokens: WORKOUT_PLAN_MAX_TOKENS,
    schemaName: 'workout_plan',
    jsonSchema: z.toJSONSchema(WorkoutPlanDraftSchema),
    parser: (value) => WorkoutPlanDraftSchema.parse(value),
  })
}

export async function parseMealsWithAi(opts: {
  userId: string
  text?: string
  photo?: ParseMealsPhoto
  endpoint?: string
}): Promise<BillableOpenAIResult<ParseMealsValue>> {
  const trimmedText = opts.text?.trim() ?? ''
  const photoContent = parseMealsPhotoContent(opts.photo)
  const userContent = parseMealsUserContent(trimmedText, opts.photo)
  const systemPrompt = parseMealsSystemPrompt()
  const model = opts.photo ? NUTRITION_LABEL_OCR_MODEL : PARSE_MEALS_MODEL
  let reservedTokens = 0
  let usage: TokenUsage = ZERO_USAGE

  try {
    reservedTokens = await Credits.estimateReserve({
      model,
      systemPrompt: opts.photo ? 'You are an OCR engine for nutrition labels. Return JSON only.' : systemPrompt,
      userPrompt: photoContent ?? userContent,
      maxOutputTokens: opts.photo ? NUTRITION_LABEL_OCR_MAX_TOKENS : PARSE_MEALS_MAX_TOKENS,
    })
    const ok = await Credits.reserve(opts.userId, reservedTokens)
    if (!ok) {
      return { ok: false, code: 'insufficient_credits', message: 'Insufficient AI tokens' }
    }
  } catch (error) {
    if (error instanceof UnpricedModelError) {
      return { ok: false, code: 'unpriced_model', message: 'AI model pricing is not configured' }
    }
    console.error('AI billing estimate failed:', error)
    return { ok: false, code: 'billing_error', message: 'AI billing failed' }
  }

  if (photoContent) {
    const callOcr = () => Openai.callStructured({
      model,
      systemPrompt: 'You are an OCR engine for nutrition labels. Return JSON only.',
      userPrompt: photoContent,
      temperature: 0,
      maxTokens: NUTRITION_LABEL_OCR_MAX_TOKENS,
      schemaName: 'nutrition_label_ocr',
      jsonSchema: NUTRITION_LABEL_OCR_JSON_SCHEMA,
      parser: (v) => NutritionLabelOcr.parse(v),
    })
    const ocrResult = await callOcr()

    if (!ocrResult.ok) {
      await Credits.refundReserve(opts.userId, reservedTokens, 'refund_failed_call')
      return ocrResult
    }
    usage = ocrResult.usage ?? ZERO_USAGE
    let ocr = ocrResult.value
    let ocrMeal = nutritionLabelMealFromOcr(ocr, trimmedText || undefined)
    let labelWasVisible = ocr.nutritionLabelVisible

    for (let retry = 0; retry < 2 && (productIdentityNeedsRetry(ocr) || (ocr.nutritionLabelVisible && !ocrMeal)); retry += 1) {
      const retryResult = await callOcr()
      if (!retryResult.ok) {
        await Credits.refundReserve(opts.userId, reservedTokens, 'refund_failed_call')
        return retryResult
      }
      usage = addUsage(usage, retryResult.usage)
      labelWasVisible = labelWasVisible || retryResult.value.nutritionLabelVisible
      const retryMeal = nutritionLabelMealFromOcr(retryResult.value, trimmedText || undefined)
      if (retryMeal && (!ocrMeal || !productIdentityNeedsRetry(retryResult.value))) {
        ocr = retryResult.value
        ocrMeal = retryMeal
      }
    }

    const review = evaluateOcrEvidence(ocr)

    if (ocrMeal) {
      await Credits.settleReserved(opts.userId, reservedTokens, usage, {
        endpoint: opts.endpoint ?? 'parse-meals',
        model,
      })
      return { ok: true, value: { meals: [ocrMeal], review }, usage }
    }
    if (labelWasVisible || ocr.nutritionLabelVisible) {
      await Credits.refundReserve(opts.userId, reservedTokens, 'refund_failed_call')
      return { ok: false, code: 'invalid_response', message: 'Could not reliably read the visible nutrition label' }
    }
  }

  const result = await Openai.callStructured({
    model,
    systemPrompt,
    userPrompt: userContent,
    temperature: 0.2,
    maxTokens: PARSE_MEALS_MAX_TOKENS,
    schemaName: 'parsed_meals',
    jsonSchema: PARSED_MEALS_JSON_SCHEMA,
    parser: (v) => AiParsedMeals.parse(v),
  })

  if (!result.ok) {
    await Credits.refundReserve(opts.userId, reservedTokens, 'refund_failed_call')
    return result
  }

  usage = addUsage(usage, result.usage)
  await Credits.settleReserved(opts.userId, reservedTokens, usage, {
    endpoint: opts.endpoint ?? 'parse-meals',
    model,
  })
  return {
    ok: true,
    value: {
      meals: result.value.meals.map(normalizeParsedMeal),
      review: defaultReview(),
    },
    usage,
  }
}
