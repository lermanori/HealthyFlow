import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { format, addDays } from 'date-fns'
import { Bot, ChevronDown, Dumbbell, Flame, Image as ImageIcon, Mic, MessageSquare, Paperclip, Pencil, Plus, Scale, Send, Target, Trash2, UserRound, Wrench, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { aiService, AssistantChatAttachment, AssistantChatAttachmentMetadata, AssistantChatMessage, AssistantChatModel, AssistantConversation, AssistantPendingAction, AssistantStoredMessage, AssistantToolEvent, pushService } from '../services/api'
import { useDictatedText } from '../hooks/useDictatedText'
import TaskDraftCard, { TaskDraftCardValue } from '../components/TaskDraftCard'
import CalorieEntryDraftCard, { CalorieEntryDraftValue } from '../components/CalorieEntryDraftCard'

type ConversationPendingAction = AssistantPendingAction & {
  status?: 'pending' | 'confirmed' | 'canceled'
  result?: unknown
  error?: string
  completedAt?: string
}

type ConversationMessage = AssistantStoredMessage & {
  pendingActions?: ConversationPendingAction[]
}

type StoredConversation = AssistantConversation

const ASSISTANT_CONVERSATIONS_KEY = 'healthyflow-assistant-conversations-v1'
const ASSISTANT_CONVERSATIONS_MIGRATED_KEY = 'healthyflow-assistant-conversations-v1-migrated'
const MAX_STORED_CONVERSATIONS = 20
const MAX_IMAGE_ATTACHMENT_BYTES = 4 * 1024 * 1024
const MAX_TEXT_ATTACHMENT_BYTES = 64 * 1024
const MAX_TEXT_ATTACHMENT_CHARS = 12_000
const IMAGE_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const TEXT_ATTACHMENT_TYPES = ['text/plain', 'text/markdown'] as const

type ComposerAttachment =
  | (Extract<AssistantChatAttachment, { kind: 'image' }> & { previewUrl: string })
  | Extract<AssistantChatAttachment, { kind: 'text' }>

const starterPrompts = [
  "What's on my plate today?",
  'How many calories did I log today?',
  'Show my recent achievements.',
]

const assistantModels: Array<{ value: AssistantChatModel; label: string }> = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { value: 'gpt-5-mini', label: 'GPT-5 mini' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.5', label: 'GPT-5.5' },
]

function isMayaDemoSession() {
  return localStorage.getItem('demoPersona') === 'maya'
}

function mayaDemoAssistantMessage(): ConversationMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: [
      "Here's a stable plan for Maya's day:",
      '',
      '1. Protect the first clear morning block for the rolled-over task. It is the only item that needs a real schedule change.',
      '2. Keep the lower-pressure personal tasks in Anytime so the timeline stays readable.',
      '3. Treat habits as lightweight anchors: complete the realistic ones today, but do not let them crowd the plan.',
      '',
      "I'll move the rolled-over task into the morning next, then you can keep exploring the real workspace.",
    ].join('\n'),
      toolEvents: [
        {
          name: 'read_today',
          args: { date: 'today' },
          result: { notes: 'Reviewed scheduled work, Anytime tasks, and habits.' },
        },
        {
          name: 'plan_update',
          args: { goal: 'rebalance day' },
          result: { notes: 'Prepared a deterministic demo recommendation.' },
        },
      ],
  }
}

function readStoredConversations(): StoredConversation[] {
  try {
    const raw = localStorage.getItem(ASSISTANT_CONVERSATIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((conversation): conversation is StoredConversation => (
      conversation &&
      typeof conversation.id === 'string' &&
      typeof conversation.title === 'string' &&
      typeof conversation.createdAt === 'string' &&
      typeof conversation.updatedAt === 'string' &&
      Array.isArray(conversation.messages)
    ))
  } catch {
    return []
  }
}

function titleFromMessages(messages: ConversationMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === 'user')
  const title = (firstUserMessage?.displayContent ?? firstUserMessage?.content ?? '').trim()
  if (!title) return 'New chat'
  return title.length > 48 ? `${title.slice(0, 45)}...` : title
}

function renderInlineMarkdown(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
    }
    return <span key={index}>{part}</span>
  })
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements = lines.map((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return <div key={index} className="h-2" />

    const heading = trimmed.match(/^#{1,3}\s+(.+)$/)
    if (heading) {
      return (
        <h3 key={index} className="pt-1 text-[15px] font-semibold leading-6 text-ink">
          {renderInlineMarkdown(heading[1])}
        </h3>
      )
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      return (
        <div key={index} className="flex gap-2">
          <span className="mt-[0.62rem] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/80" />
          <p className="min-w-0">{renderInlineMarkdown(bullet[1])}</p>
        </div>
      )
    }

    const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/)
    if (numbered) {
      return (
        <div key={index} className="flex gap-2">
          <span className="shrink-0 font-semibold text-cyan-300">{numbered[1]}.</span>
          <p className="min-w-0">{renderInlineMarkdown(numbered[2])}</p>
        </div>
      )
    }

    return <p key={index}>{renderInlineMarkdown(trimmed)}</p>
  })

  return <div className="space-y-1.5">{elements}</div>
}

function kickoffDisplayLabel(type: 'morning' | 'midday' | 'weekly') {
  if (type === 'morning') return 'Start morning planning'
  if (type === 'weekly') return 'Start weekly planning'
  return 'Start mid-day check-in'
}

function compactJson(value: unknown) {
  const text = JSON.stringify(value)
  if (!text) return 'null'
  return text.length > 1200 ? `${text.slice(0, 1200)}...` : text
}

function continuationPrompt(action: AssistantPendingAction, result: unknown) {
  return `I confirmed the pending HealthyFlow action.

Action: ${action.capability}
Result: ${compactJson(result)}

Continue the current conversation naturally.
If this is a planning/check-in flow, acknowledge the completed action briefly, then continue topic-by-topic: stay on the current topic if there is still a decision to make, otherwise move to the next relevant topic with one concise question.
Do not repeat the full context, do not show JSON, and do not ask me to confirm something that was already confirmed.`
}

function formatConversationTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function attachmentMetadata(attachment: ComposerAttachment): AssistantChatAttachmentMetadata {
  return {
    kind: attachment.kind,
    name: attachment.name,
    mimeType: attachment.mimeType,
  }
}

function attachmentFromFile(file: File): Promise<ComposerAttachment> {
  if (IMAGE_ATTACHMENT_TYPES.includes(file.type as (typeof IMAGE_ATTACHMENT_TYPES)[number])) {
    if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) throw new Error('Image attachment must be 4MB or smaller')
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = String(reader.result ?? '')
        const data = dataUrl.split(',')[1]
        if (!data) {
          reject(new Error('Could not read image attachment'))
          return
        }
        resolve({
          kind: 'image',
          name: file.name,
          mimeType: file.type as Extract<AssistantChatAttachment, { kind: 'image' }>['mimeType'],
          data,
          previewUrl: dataUrl,
        })
      }
      reader.onerror = () => reject(new Error('Could not read image attachment'))
      reader.readAsDataURL(file)
    })
  }

  const extension = file.name.toLowerCase().split('.').pop()
  const mimeType = file.type === 'text/markdown' || extension === 'md' || extension === 'markdown'
    ? 'text/markdown'
    : file.type === 'text/plain' || extension === 'txt'
      ? 'text/plain'
      : null
  if (!mimeType || !TEXT_ATTACHMENT_TYPES.includes(mimeType as (typeof TEXT_ATTACHMENT_TYPES)[number])) {
    throw new Error('Attach a JPG, PNG, WebP, TXT, or MD file')
  }
  if (file.size > MAX_TEXT_ATTACHMENT_BYTES) throw new Error('Text attachment must be 64KB or smaller')

  return file.text().then((text) => {
    const trimmed = text.trim()
    if (!trimmed) throw new Error('Text attachment is empty')
    if (trimmed.length > MAX_TEXT_ATTACHMENT_CHARS) throw new Error('Text attachment is too long')
    return {
      kind: 'text',
      name: file.name,
      mimeType: mimeType as Extract<AssistantChatAttachment, { kind: 'text' }>['mimeType'],
      text: trimmed,
    }
  })
}

function compactToolName(name: string) {
  return name.replace(/_/g, ' ')
}

function shortValue(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function summarizeArgs(args: unknown) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return ''
  const value = args as Record<string, unknown>
  const interesting = ['query', 'date', 'name', 'calories', 'protein', 'capability']
    .map((key) => [key, shortValue(value[key])] as const)
    .filter(([, item]) => item)
    .slice(0, 3)

  return interesting.map(([key, item]) => `${key}: ${item}`).join(' · ')
}

function summarizeResult(result: unknown) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return shortValue(result)
  const value = result as Record<string, any>
  if (value.pendingAction) return `Prepared ${compactToolName(value.pendingAction.capability ?? 'action')} preview`
  if (Array.isArray(value.matches)) {
    if (value.matches.length === 0) return 'No history matches'
    const match = value.matches[0]
    return `Best history match: ${match.name ?? 'food'} (${match.matchType ?? 'match'}, ${Math.round((match.score ?? 0) * 100)}%)`
  }
  if (Array.isArray(value.candidates)) {
    if (value.candidates.length === 0) return value.notes ?? 'No nutrition candidates'
    const candidate = value.candidates[0]
    return `Best nutrition candidate: ${candidate.name ?? 'food'} · ${candidate.calories ?? '?'} cal · ${candidate.confidence ?? 'unknown'} confidence`
  }
  if (Array.isArray(value.meals)) return `${value.meals.length} meal entries parsed`
  if (Array.isArray(value.entries)) return `${value.entries.length} Calorie entries found`
  if (Array.isArray(value.tasks)) return `${value.tasks.length} Items found`
  if (value.entry?.name) return `Entry: ${value.entry.name}`
  if (value.item?.title) return `Item: ${value.item.title}`
  return 'Tool completed'
}

const categories = ['health', 'work', 'personal', 'fitness', 'grocery', 'nutrition']

function fieldValue(value: unknown) {
  return value == null ? '' : String(value)
}

function numberOrUndefined(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return undefined
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

function nullableNumber(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function nullableText(value: unknown) {
  const text = String(value ?? '').trim()
  return text ? text : null
}

function optionalText(value: unknown) {
  const text = String(value ?? '').trim()
  return text ? text : undefined
}

function arrayValue(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []
}

function labelForCapability(capability: string) {
  return compactToolName(capability).replace(/\b\w/g, (char) => char.toUpperCase())
}

function iconForCapability(capability: string) {
  if (capability.includes('calorie')) return <Flame className="h-4 w-4" />
  if (capability.includes('weight')) return <Scale className="h-4 w-4" />
  if (capability.includes('achievement')) return <Target className="h-4 w-4" />
  if (capability.includes('workout')) return <Dumbbell className="h-4 w-4" />
  if (capability.includes('delete')) return <Trash2 className="h-4 w-4" />
  return <Pencil className="h-4 w-4" />
}

function inputClass() {
  return 'h-10 rounded-md border border-line bg-sunken px-3 text-sm text-ink outline-none transition-colors focus:border-cyan-500'
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: unknown
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-ink-muted">
      <span>{label}</span>
      <input className={inputClass()} type={type} value={fieldValue(value)} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: unknown
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-ink-muted">
      <span>{label}</span>
      <select className={inputClass()} value={fieldValue(value)} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function AssistantReasoningStages({ events }: { events: AssistantToolEvent[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null)

  if (events.length === 0) return null

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-md border border-card bg-sunken px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-cyan-500/50 hover:text-cyan-200"
        aria-expanded={isOpen}
      >
        <Wrench className="h-3.5 w-3.5" />
        Reasoning stages
        <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-ink-soft">{events.length}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="mt-2 space-y-2 rounded-lg border border-card bg-sunken/80 p-3">
          {events.map((event, index) => (
            <div key={`${event.name}-${index}`} className="rounded-md border border-card bg-page/60 p-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-cyan-500/10 text-[11px] font-semibold text-cyan-200">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-ink">{compactToolName(event.name)}</span>
                    {summarizeArgs(event.args) && (
                      <span className="truncate text-xs text-gray-500">{summarizeArgs(event.args)}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-ink-soft">{summarizeResult(event.result)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedEvent((value) => (value === index ? null : index))}
                  className="flex-none rounded border border-card px-2 py-1 text-[11px] text-gray-500 transition-colors hover:border-cyan-500/50 hover:text-cyan-200"
                >
                  {expandedEvent === index ? 'Hide' : 'Details'}
                </button>
              </div>
              {expandedEvent === index && (
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-card bg-sunken p-3 text-[11px] leading-5 text-ink-soft">
                  {JSON.stringify(event, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function buildEditedArgs(action: AssistantPendingAction, draft: Record<string, unknown>) {
  const base = { ...(action.args ?? {}) }
  switch (action.capability) {
    case 'add_task':
      return {
        ...base,
        title: String(draft.title ?? '').trim(),
        category: draft.category,
        duration: numberOrUndefined(draft.duration),
        startTime: optionalText(draft.startTime) ?? null,
        scheduledDate: optionalText(draft.scheduledDate),
      }
    case 'add_habit':
      return {
        ...base,
        title: String(draft.title ?? '').trim(),
        category: draft.category,
        duration: numberOrUndefined(draft.duration),
        startTime: optionalText(draft.startTime) ?? null,
        repeat: draft.repeat,
      }
    case 'add_calorie_entry':
      return {
        ...base,
        date: optionalText(draft.date),
        time: optionalText(draft.time) ?? null,
        name: String(draft.name ?? '').trim(),
        calories: numberOrUndefined(draft.calories),
        protein: nullableNumber(draft.protein),
        carbs: nullableNumber(draft.carbs),
        fat: nullableNumber(draft.fat),
        quantity: nullableText(draft.quantity),
      }
    case 'add_calorie_entries':
      return {
        ...base,
        entries: arrayValue(draft.entries).map((entry) => ({
          date: optionalText(entry.date),
          time: optionalText(entry.time) ?? null,
          name: String(entry.name ?? '').trim(),
          calories: numberOrUndefined(entry.calories),
          protein: nullableNumber(entry.protein),
          carbs: nullableNumber(entry.carbs),
          fat: nullableNumber(entry.fat),
          quantity: nullableText(entry.quantity),
        })),
      }
    case 'add_weight_entry':
      return {
        ...base,
        date: optionalText(draft.date),
        weightKg: numberOrUndefined(draft.weightKg),
      }
    case 'add_achievement_entry':
      return {
        ...base,
        date: optionalText(draft.date),
        value: numberOrUndefined(draft.value),
        supportingValue: nullableNumber(draft.supportingValue),
        supportingUnit: nullableText(draft.supportingUnit),
        notes: nullableText(draft.notes),
      }
    case 'add_workout_session':
      return {
        ...base,
        date: optionalText(draft.date),
        title: nullableText(draft.title),
        notes: nullableText(draft.notes),
        exercises: typeof draft.exercises === 'string' ? JSON.parse(draft.exercises) : base.exercises,
      }
    case 'update_item':
      return {
        ...base,
        title: optionalText(draft.title),
        category: optionalText(draft.category),
        duration: numberOrUndefined(draft.duration),
        startTime: optionalText(draft.startTime) ?? null,
        scheduledDate: optionalText(draft.scheduledDate),
      }
    case 'delete_item':
      return { ...base, deleteScope: draft.deleteScope }
    default:
      return base
  }
}

function taskDraftValueFromPendingAction(action: AssistantPendingAction, draft: Record<string, unknown>): TaskDraftCardValue {
  const isHabit = action.capability === 'add_habit'
  return {
    title: fieldValue(draft.title),
    category: fieldValue(draft.category || 'personal'),
    duration: fieldValue(draft.duration),
    priority: typeof draft.priority === 'string' ? draft.priority : undefined,
    type: isHabit ? 'habit' : 'task',
    startTime: fieldValue(draft.startTime),
    scheduledDate: fieldValue(draft.scheduledDate || format(new Date(), 'yyyy-MM-dd')),
    repeat: isHabit ? fieldValue(draft.repeat || 'daily') : undefined,
  }
}

function taskDraftValueFromRecord(value: Record<string, any>): TaskDraftCardValue {
  return {
    title: String(value.title ?? ''),
    category: fieldValue(value.category || 'personal'),
    duration: fieldValue(value.duration ?? ''),
    type: value.type === 'habit' ? 'habit' : 'task',
    startTime: optionalText(value.startTime) ?? null,
    scheduledDate: optionalText(value.scheduledDate),
    repeat: value.repeat ? fieldValue(value.repeat) : undefined,
  }
}

// Shape of the `result`/`preview` payloads carried by pending actions. They
// arrive as `unknown` (dynamic AI-action output); narrow to just the fields we
// read rather than reaching through `any`.
type ActionItemPayload = { item?: Record<string, unknown> & { title?: string } }
type ActionEntriesPayload = { entries?: unknown; entry?: unknown }

// The Item a complete_task / update_item card should display: the resulting
// Item once confirmed, otherwise the previewed Item.
function taskItemFromAction(action: ConversationPendingAction): Record<string, unknown> | null {
  const result = action.result as ActionItemPayload | undefined
  if ((action.status === 'confirmed' || action.status === 'canceled') && result?.item) return result.item
  const preview = action.preview as ActionItemPayload | undefined
  if (preview?.item) return preview.item
  return null
}

function deleteItemTitle(action: ConversationPendingAction): string | null {
  const preview = action.preview as ActionItemPayload | undefined
  return preview?.item?.title ?? null
}

function taskDraftPatchToPendingDraft(patch: Partial<TaskDraftCardValue>) {
  const next: Record<string, unknown> = {}
  if (patch.title !== undefined) next.title = patch.title
  if (patch.category !== undefined) next.category = patch.category
  if (patch.duration !== undefined) next.duration = patch.duration
  if (patch.startTime !== undefined) next.startTime = patch.startTime
  if (patch.scheduledDate !== undefined) next.scheduledDate = patch.scheduledDate
  if (patch.repeat !== undefined) next.repeat = patch.repeat
  return next
}

function assistantQuickDates() {
  return [
    { label: 'Today', value: format(new Date(), 'yyyy-MM-dd') },
    { label: 'Tomorrow', value: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
    { label: 'Next Week', value: format(addDays(new Date(), 7), 'yyyy-MM-dd') },
  ]
}

function pendingStatusTone(action: ConversationPendingAction): 'pending' | 'confirmed' | 'canceled' | 'error' {
  if (action.error) return 'error'
  return action.status ?? 'pending'
}

function statusToneClasses(tone: 'pending' | 'confirmed' | 'canceled' | 'error') {
  switch (tone) {
    case 'confirmed': return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
    case 'canceled': return 'border-line bg-page/70 text-ink-soft'
    case 'error': return 'border-red-500/35 bg-red-500/10 text-red-100'
    default: return 'border-amber-500/30 bg-amber-500/10 text-amber-100'
  }
}

function calorieEntryFromRecord(value: Record<string, unknown>): CalorieEntryDraftValue {
  return {
    date: optionalText(value.date) ?? null,
    time: optionalText(value.time) ?? null,
    name: String(value.name ?? '').trim(),
    calories: fieldValue(value.calories),
    protein: value.protein == null ? null : fieldValue(value.protein),
    carbs: value.carbs == null ? null : fieldValue(value.carbs),
    fat: value.fat == null ? null : fieldValue(value.fat),
    quantity: nullableText(value.quantity),
  }
}

function calorieDraftsFromPendingAction(action: ConversationPendingAction, draft: Record<string, unknown>): CalorieEntryDraftValue[] {
  const result = action.result as ActionEntriesPayload | undefined
  if ((action.status === 'confirmed' || action.status === 'canceled') && result) {
    if (Array.isArray(result.entries)) return result.entries.map((entry: Record<string, unknown>) => calorieEntryFromRecord(entry))
    if (result.entry && typeof result.entry === 'object') return [calorieEntryFromRecord(result.entry as Record<string, unknown>)]
  }

  if (action.capability === 'add_calorie_entries') {
    return arrayValue(draft.entries).map(calorieEntryFromRecord)
  }

  return [calorieEntryFromRecord(draft)]
}

function PendingActionCard({
  action,
  onConfirm,
  onCancel,
}: {
  action: ConversationPendingAction
  onConfirm: (actionId: string, args?: Record<string, unknown>) => void
  onCancel: (actionId: string) => void
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({
    ...(action.args ?? {}),
    exercises: action.capability === 'add_workout_session'
      ? JSON.stringify(action.args?.exercises ?? [], null, 2)
      : action.args?.exercises,
  }))
  const [isEditing, setIsEditing] = useState(true)

  const setField = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }))
  const setEntryField = (index: number, key: string, value: unknown) => {
    setDraft((current) => {
      const entries = arrayValue(current.entries).map((entry) => ({ ...entry }))
      entries[index] = { ...(entries[index] ?? {}), [key]: value }
      return { ...current, entries }
    })
  }
  const confirm = () => {
    try {
      onConfirm(action.id, buildEditedArgs(action, draft))
    } catch {
      toast.error('Could not read edited preview fields')
    }
  }

  const status = action.status ?? 'pending'
  const isPending = status === 'pending'
  const statusLabel = action.error
    ? action.error
    : status === 'confirmed'
      ? `Completed: ${summarizeResult(action.result)}`
      : status === 'canceled'
        ? 'Canceled'
        : 'Waiting for confirmation'

  return (
    <div className={`mt-3 box-border w-full max-w-full overflow-hidden rounded-lg border bg-sunken p-3 shadow-lg shadow-black/20 sm:p-4 ${
      action.error
        ? 'border-red-500/50'
        : status === 'confirmed'
          ? 'border-emerald-500/50'
          : status === 'canceled'
            ? 'border-line'
            : 'border-amber-500/40'
    }`}>
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <div className={`flex min-w-0 items-center gap-2 text-sm font-semibold ${
          action.error
            ? 'text-red-100'
            : status === 'confirmed'
              ? 'text-emerald-100'
              : status === 'canceled'
                ? 'text-ink-soft'
                : 'text-amber-100'
        }`}>
          <span className={`flex h-8 w-8 items-center justify-center rounded-md ${
            action.error
              ? 'bg-red-500/15 text-red-200'
              : status === 'confirmed'
                ? 'bg-emerald-500/15 text-emerald-200'
                : status === 'canceled'
                  ? 'bg-card text-ink-soft'
                  : 'bg-amber-500/15 text-amber-200'
          }`}>
            {iconForCapability(action.capability)}
          </span>
          <span className="min-w-0 truncate">{labelForCapability(action.capability)}</span>
        </div>
        {isPending && (
          <button className="rounded-md border border-line px-2 py-1 text-xs text-ink-soft hover:border-cyan-500 hover:text-cyan-200" onClick={() => setIsEditing((value) => !value)}>
            {isEditing ? 'Preview' : 'Edit'}
          </button>
        )}
      </div>

      {!['add_task', 'add_habit', 'add_calorie_entry', 'add_calorie_entries', 'complete_task', 'update_item', 'delete_item'].includes(action.capability) && (
        <div className={`mb-3 rounded-md border px-3 py-2 text-xs ${
          action.error
            ? 'border-red-500/30 bg-red-950/30 text-red-100'
            : status === 'confirmed'
              ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-100'
              : status === 'canceled'
                ? 'border-line bg-page text-ink-soft'
                : 'border-amber-500/30 bg-amber-950/20 text-amber-100'
        }`}>
          {statusLabel}
        </div>
      )}

      {isEditing && isPending ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {action.capability === 'add_task' && (
            <div className="min-w-0 sm:col-span-2">
              <TaskDraftCard
                value={taskDraftValueFromPendingAction(action, draft)}
                editable
                statusLabel={statusLabel}
                statusTone={pendingStatusTone(action)}
                quickDates={assistantQuickDates()}
                onChange={(patch) => setDraft((current) => ({ ...current, ...taskDraftPatchToPendingDraft(patch) }))}
              />
            </div>
          )}
          {action.capability === 'add_habit' && (
            <div className="min-w-0 sm:col-span-2">
              <TaskDraftCard
                value={taskDraftValueFromPendingAction(action, draft)}
                editable
                statusLabel={statusLabel}
                statusTone={pendingStatusTone(action)}
                onChange={(patch) => setDraft((current) => ({ ...current, ...taskDraftPatchToPendingDraft(patch) }))}
              />
            </div>
          )}
          {action.capability === 'add_calorie_entry' && (
            <div className="min-w-0 sm:col-span-2">
              <CalorieEntryDraftCard
                entries={calorieDraftsFromPendingAction(action, draft)}
                editable
                statusLabel={statusLabel}
                statusTone={pendingStatusTone(action)}
                onChange={(_index, patch) => setDraft((current) => ({ ...current, ...patch }))}
              />
            </div>
          )}
          {action.capability === 'add_calorie_entries' && (
            <div className="min-w-0 sm:col-span-2">
              <CalorieEntryDraftCard
                entries={calorieDraftsFromPendingAction(action, draft)}
                editable
                statusLabel={statusLabel}
                statusTone={pendingStatusTone(action)}
                onChange={(index, patch) => {
                  Object.entries(patch).forEach(([key, value]) => setEntryField(index, key, value))
                }}
              />
            </div>
          )}
          {action.capability === 'add_weight_entry' && (
            <>
              <TextField label="Date" value={draft.date} type="date" onChange={(value) => setField('date', value)} />
              <TextField label="Weight kg" value={draft.weightKg} type="number" onChange={(value) => setField('weightKg', value)} />
            </>
          )}
          {action.capability === 'add_achievement_entry' && (
            <>
              <TextField label="Date" value={draft.date} type="date" onChange={(value) => setField('date', value)} />
              <TextField label="Value" value={draft.value} type="number" onChange={(value) => setField('value', value)} />
              <TextField label="Supporting value" value={draft.supportingValue} type="number" onChange={(value) => setField('supportingValue', value)} />
              <TextField label="Supporting unit" value={draft.supportingUnit} onChange={(value) => setField('supportingUnit', value)} />
              <TextField label="Notes" value={draft.notes} onChange={(value) => setField('notes', value)} />
            </>
          )}
          {action.capability === 'add_workout_session' && (
            <>
              <TextField label="Date" value={draft.date} type="date" onChange={(value) => setField('date', value)} />
              <TextField label="Title" value={draft.title} onChange={(value) => setField('title', value)} />
              <TextField label="Notes" value={draft.notes} onChange={(value) => setField('notes', value)} />
              <label className="grid gap-1 text-xs font-medium text-ink-muted sm:col-span-2">
                <span>Exercises JSON</span>
                <textarea className="min-h-28 rounded-md border border-line bg-sunken px-3 py-2 font-mono text-sm text-ink outline-none transition-colors focus:border-cyan-500" value={fieldValue(draft.exercises)} onChange={(event) => setField('exercises', event.target.value)} />
              </label>
            </>
          )}
          {action.capability === 'update_item' && (
            <>
              <TextField label="Title" value={draft.title} onChange={(value) => setField('title', value)} />
              <SelectField label="Category" value={draft.category ?? 'personal'} options={categories} onChange={(value) => setField('category', value)} />
              <TextField label="Duration" value={draft.duration} type="number" onChange={(value) => setField('duration', value)} />
              <TextField label="Start time" value={draft.startTime} type="time" onChange={(value) => setField('startTime', value)} />
              <TextField label="Scheduled date" value={draft.scheduledDate} type="date" onChange={(value) => setField('scheduledDate', value)} />
            </>
          )}
          {action.capability === 'complete_task' && taskItemFromAction(action) && (
            <div className="min-w-0 sm:col-span-2">
              <TaskDraftCard
                value={taskDraftValueFromRecord(taskItemFromAction(action)!)}
                statusLabel={statusLabel}
                statusTone={pendingStatusTone(action)}
              />
            </div>
          )}
          {action.capability === 'delete_item' && (
            <SelectField label="Delete scope" value={draft.deleteScope ?? 'instance'} options={['instance', 'habit']} onChange={(value) => setField('deleteScope', value)} />
          )}
          {!['add_task', 'add_habit', 'add_calorie_entry', 'add_calorie_entries', 'add_weight_entry', 'add_achievement_entry', 'add_workout_session', 'update_item', 'delete_item', 'complete_task'].includes(action.capability) && (
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-card bg-sunken p-3 text-xs text-ink-soft sm:col-span-2">
              {JSON.stringify(action.preview, null, 2)}
            </pre>
          )}
        </div>
      ) : (
        ['add_task', 'add_habit'].includes(action.capability) ? (
          <TaskDraftCard
            value={taskDraftValueFromPendingAction(action, draft)}
            statusLabel={statusLabel}
            statusTone={pendingStatusTone(action)}
          />
        ) : ['add_calorie_entry', 'add_calorie_entries'].includes(action.capability) ? (
          <CalorieEntryDraftCard
            entries={calorieDraftsFromPendingAction(action, draft)}
            statusLabel={statusLabel}
            statusTone={pendingStatusTone(action)}
          />
        ) : ['complete_task', 'update_item'].includes(action.capability) && taskItemFromAction(action) ? (
          <TaskDraftCard
            value={taskDraftValueFromRecord(taskItemFromAction(action)!)}
            statusLabel={statusLabel}
            statusTone={pendingStatusTone(action)}
          />
        ) : action.capability === 'delete_item' ? (
          <div className={`rounded-md border px-3 py-2 text-xs ${statusToneClasses(pendingStatusTone(action))}`}>
            {statusLabel}
            {deleteItemTitle(action) && <span className="ml-1 font-medium">{deleteItemTitle(action)}</span>}
          </div>
        ) : (
          <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-card bg-sunken p-3 text-xs text-ink-soft">
            {JSON.stringify(status === 'confirmed' ? { args: action.args, result: action.result } : buildEditedArgs(action, draft), null, 2)}
          </pre>
        )
      )}

      {isPending && (
        <div className="mt-4 flex gap-2">
          <button className="btn-primary px-3 py-2 text-sm" onClick={confirm}>
            {action.error ? 'Try Again' : 'Confirm'}
          </button>
          <button className="btn-secondary px-3 py-2 text-sm" onClick={() => onCancel(action.id)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

export default function AssistantPage() {
  const queryClient = useQueryClient()
  const isDemoSession = isMayaDemoSession()
  const [conversations, setConversations] = useState<StoredConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string>(() => crypto.randomUUID())
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [model, setModel] = useState<AssistantChatModel>('gpt-4o-mini')
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null)
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const skipNextPersistRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const {
    isListening,
    isDictationSupported,
    dictationError,
    toggleDictation,
  } = useDictatedText({ text: draft, setText: setDraft, disabled: isSending })

  useEffect(() => {
    let canceled = false

    const loadConversations = async () => {
      if (isDemoSession) {
        setConversations([])
        setMessages([])
        setIsHistoryLoaded(true)
        return
      }

      try {
        const serverConversations = await aiService.getConversations()
        const localConversations = readStoredConversations()
        const shouldMigrate = localConversations.length > 0 && localStorage.getItem(ASSISTANT_CONVERSATIONS_MIGRATED_KEY) !== 'true'
        const serverIds = new Set(serverConversations.map((conversation) => conversation.id))
        const localOnlyConversations = shouldMigrate
          ? localConversations.filter((conversation) => !serverIds.has(conversation.id))
          : []
        const mergedConversations = [
          ...localOnlyConversations,
          ...serverConversations,
        ].slice(0, MAX_STORED_CONVERSATIONS)

        if (canceled) return
        setConversations(mergedConversations)
        const firstConversation = mergedConversations[0]
        if (firstConversation) {
          skipNextPersistRef.current = true
          setActiveConversationId(firstConversation.id)
          setMessages(firstConversation.messages)
          setModel(firstConversation.model)
        }
        setIsHistoryLoaded(true)

        if (shouldMigrate) {
          await Promise.all(localOnlyConversations.map((conversation) => aiService.saveConversation(conversation)))
          localStorage.setItem(ASSISTANT_CONVERSATIONS_MIGRATED_KEY, 'true')
        }
      } catch {
        const localConversations = readStoredConversations()
        if (canceled) return
        setConversations(localConversations)
        const firstConversation = localConversations[0]
        if (firstConversation) {
          skipNextPersistRef.current = true
          setActiveConversationId(firstConversation.id)
          setMessages(firstConversation.messages)
          setModel(firstConversation.model)
        }
        setIsHistoryLoaded(true)
        toast.error('Could not load saved chats from the server.')
      }
    }

    loadConversations()

    return () => {
      canceled = true
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    }
  }, [isDemoSession])

  useEffect(() => {
    if (!isHistoryLoaded) return
    if (messages.length === 0) return
    setConversations((current) => {
      const existing = current.find((conversation) => conversation.id === activeConversationId)
      const now = new Date().toISOString()
      const nextConversation: StoredConversation = {
        id: activeConversationId,
        title: titleFromMessages(messages),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        model,
        messages,
      }
      return [
        nextConversation,
        ...current.filter((conversation) => conversation.id !== activeConversationId),
      ].slice(0, MAX_STORED_CONVERSATIONS)
    })
  }, [activeConversationId, isHistoryLoaded, messages, model])

  useEffect(() => {
    if (isDemoSession) return
    if (!isHistoryLoaded) return
    if (messages.length === 0) return
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false
      return
    }

    const existing = conversations.find((conversation) => conversation.id === activeConversationId)
    const now = new Date().toISOString()
    const conversation: StoredConversation = {
      id: activeConversationId,
      title: titleFromMessages(messages),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      model,
      messages,
    }

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      aiService.saveConversation(conversation).catch(() => {
        toast.error('Could not save chat history.')
      })
    }, 350)
  }, [activeConversationId, conversations, isDemoSession, isHistoryLoaded, messages, model])

  const apiMessages = useMemo(
    () => messages
      .filter((message) => !message.error)
      .map(({ role, content }) => ({ role, content })),
    [messages]
  )

  const sendMessage = async (
    content: string,
    messageAttachment: ComposerAttachment | null = attachment,
    baseMessages: AssistantChatMessage[] = apiMessages,
    requestModel: AssistantChatModel = model,
    displayContent?: string,
    options: { forceMock?: boolean } = {}
  ) => {
    const trimmed = content.trim()
    if ((!trimmed && !messageAttachment) || isSending) return
    const userContent = trimmed || `Review the attached ${messageAttachment?.kind === 'image' ? 'image' : 'file'}.`

    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent,
      displayContent,
      attachment: messageAttachment ? attachmentMetadata(messageAttachment) : undefined,
    }
    const nextMessages = [...baseMessages, { role: 'user' as const, content: userContent }]

    setMessages((current) => [...current, userMessage])
    setDraft('')
    setAttachment(null)
    setIsSending(true)

    try {
      if (options.forceMock) {
        await new Promise((resolve) => window.setTimeout(resolve, 900))
        setMessages((current) => [...current, mayaDemoAssistantMessage()])
        return
      }

      const requestAttachment = messageAttachment
        ? messageAttachment.kind === 'image'
          ? {
              kind: 'image' as const,
              name: messageAttachment.name,
              mimeType: messageAttachment.mimeType,
              data: messageAttachment.data,
            }
          : messageAttachment
        : undefined
      const response = await aiService.chat(nextMessages, requestModel, requestAttachment)
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.message,
          toolEvents: response.toolEvents,
          pendingActions: response.pendingActions,
        },
      ])
    } catch (error: any) {
      const message = error.response?.data?.error ?? 'Assistant unavailable'
      toast.error(message)
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: message,
          error: true,
        },
      ])
    } finally {
      setIsSending(false)
      inputRef.current?.focus()
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    sendMessage(draft)
  }

  useEffect(() => {
    window.__healthyFlowDemo = {
      ...(window.__healthyFlowDemo ?? {}),
      setTalkDraft: (value: string) => {
        setDraft(value)
        inputRef.current?.focus()
      },
      submitTalk: () => sendMessage(draft, null, apiMessages, model, undefined, { forceMock: true }),
    }

    return () => {
      if (!window.__healthyFlowDemo) return
      delete window.__healthyFlowDemo.setTalkDraft
      delete window.__healthyFlowDemo.submitTalk
    }
  }, [apiMessages, draft, model])

  const [searchParams, setSearchParams] = useSearchParams()
  const kickoffFiredRef = useRef(false)

  useEffect(() => {
    const kickoff = searchParams.get('kickoff')
    if (!kickoff || kickoffFiredRef.current) return
    if (!['morning', 'midday', 'weekly'].includes(kickoff)) return
    kickoffFiredRef.current = true
    // Clear the param so a refresh doesn't re-fire the kickoff.
    const next = new URLSearchParams(searchParams)
    next.delete('kickoff')
    setSearchParams(next, { replace: true })

    ;(async () => {
      try {
        const seed = await pushService.getKickoff(kickoff as 'morning' | 'midday' | 'weekly')
        const kickoffModel: AssistantChatModel = 'gpt-4o-mini'
        setActiveConversationId(crypto.randomUUID())
        setMessages([])
        setDraft('')
        setAttachment(null)
        setModel(kickoffModel)
        await sendMessage(seed, null, [], kickoffModel, kickoffDisplayLabel(kickoff as 'morning' | 'midday' | 'weekly'))
      } catch {
        toast.error('Could not start your planning session.')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAttachmentChange = async (file: File | undefined) => {
    if (!file) return
    try {
      setAttachment(await attachmentFromFile(file))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not attach file')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const startNewChat = () => {
    skipNextPersistRef.current = false
    setActiveConversationId(crypto.randomUUID())
    setMessages([])
    setDraft('')
    setAttachment(null)
    setModel('gpt-4o-mini')
    inputRef.current?.focus()
  }

  const openConversation = (conversation: StoredConversation) => {
    if (isSending) return
    skipNextPersistRef.current = true
    setActiveConversationId(conversation.id)
    setMessages(conversation.messages)
    setModel(conversation.model)
    setDraft('')
    setAttachment(null)
  }

  const confirmAction = async (actionId: string, args?: Record<string, unknown>) => {
    try {
      const hasOtherPendingActions = messages.some((message) =>
        message.pendingActions?.some((action) =>
          action.id !== actionId && action.status !== 'confirmed' && action.status !== 'canceled'
        )
      )
      const response = await aiService.confirmChatAction(actionId, args)
      if (['add_task', 'add_habit', 'update_item', 'delete_item'].includes(response.action.capability)) {
        queryClient.invalidateQueries({ queryKey: ['tasks'] })
      }
      if (['add_calorie_entry', 'add_calorie_entries'].includes(response.action.capability)) {
        queryClient.invalidateQueries({ queryKey: ['calories'] })
        queryClient.invalidateQueries({ queryKey: ['calorie-items'] })
      }
      toast.success('Action confirmed')
      setMessages((current) => current.map((message) =>
        message.pendingActions?.some((action) => action.id === actionId)
          ? {
              ...message,
              pendingActions: message.pendingActions.map((action) =>
                action.id === actionId
                  ? {
                      ...response.action,
                      status: 'confirmed',
                      result: response.result,
                      completedAt: new Date().toISOString(),
                    }
                  : action
              ),
            }
          : message
      ))
      if (!hasOtherPendingActions) {
        const hiddenContinuation: ConversationMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: continuationPrompt(response.action, response.result),
          displayContent: 'Confirmed',
          hidden: true,
        }
        const nextMessages = [...apiMessages, { role: 'user' as const, content: hiddenContinuation.content }]
        setMessages((current) => [...current, hiddenContinuation])
        setIsSending(true)

        try {
          const nextResponse = await aiService.chat(nextMessages, model)
          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: nextResponse.message,
              toolEvents: nextResponse.toolEvents,
              pendingActions: nextResponse.pendingActions,
            },
          ])
        } catch (error: any) {
          const message = error.response?.data?.error ?? 'Assistant unavailable'
          toast.error(message)
          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: message,
              error: true,
            },
          ])
        } finally {
          setIsSending(false)
          inputRef.current?.focus()
        }
      }
    } catch (error: any) {
      const message = error.response?.data?.error ?? 'Could not confirm action'
      toast.error(message)
      setMessages((current) => current.map((item) =>
        item.pendingActions?.some((action) => action.id === actionId)
          ? {
              ...item,
              pendingActions: item.pendingActions.map((action) =>
                action.id === actionId ? { ...action, error: message } : action
              ),
            }
          : item
      ))
    }
  }

  const cancelAction = async (actionId: string) => {
    try {
      const canceled = await aiService.cancelChatAction(actionId)
      toast.success('Action canceled')
      setMessages((current) => current.map((message) =>
        message.pendingActions?.some((action) => action.id === actionId)
          ? {
              ...message,
              pendingActions: message.pendingActions.map((action) =>
                action.id === actionId
                  ? {
                      ...canceled,
                      status: 'canceled',
                      completedAt: new Date().toISOString(),
                    }
                  : action
              ),
            }
          : message
      ))
    } catch (error: any) {
      toast.error(error.response?.data?.error ?? 'Could not cancel action')
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl gap-4 overflow-hidden md:h-[calc(100vh-7rem)]">
      <aside className="hidden w-72 flex-none flex-col overflow-hidden rounded-lg border border-card bg-sunken/70 md:flex">
        <div className="border-b border-card p-3">
          <button
            type="button"
            onClick={startNewChat}
            disabled={isSending}
            className="btn-primary flex w-full items-center justify-center gap-2 rounded-lg disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-card p-4 text-sm text-gray-500">
              Your saved chats will appear here.
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => openConversation(conversation)}
                  disabled={isSending}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    conversation.id === activeConversationId
                      ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-100'
                      : 'border-card bg-page/70 text-ink-soft hover:border-cyan-500/40 hover:text-cyan-100'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <MessageSquare className="mt-0.5 h-4 w-4 flex-none" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{conversation.title}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatConversationTime(conversation.updatedAt)} · {conversation.messages.length} messages
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-card bg-sunken/70">
      <div className="flex items-center justify-between gap-3 border-b border-card px-3 py-2.5 md:px-4 md:py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-ink">Talk to your day</h1>
            {conversations.length > 0 ? (
              <select
                value={activeConversationId}
                onChange={(event) => {
                  const conversation = conversations.find((item) => item.id === event.target.value)
                  if (conversation) openConversation(conversation)
                }}
                disabled={isSending}
                className="mt-1 block w-full truncate rounded-md border border-card bg-page px-2 py-1 text-xs text-ink outline-none transition-colors focus:border-cyan-500 disabled:opacity-60 md:hidden"
                aria-label="Chat history"
              >
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-gray-500 md:hidden">{conversations.length} saved chats</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={startNewChat}
            disabled={isSending}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-card bg-page text-ink-soft transition-colors hover:border-cyan-500/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60 md:hidden"
            aria-label="New Chat"
          >
            <Plus className="h-4 w-4" />
          </button>
          {isSending && <span className="text-sm text-cyan-300">Thinking</span>}
        </div>
      </div>

      <div className="assistant-messages-scroll flex-1 space-y-4 overflow-y-auto px-4 pt-5 md:pb-5">
        {messages.length === 0 ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                className="rounded-lg border border-card bg-page/80 px-3 py-3 text-left text-sm text-ink-soft transition-colors hover:border-cyan-500/50 hover:text-cyan-200"
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : (
          messages.filter((message) => !message.hidden).map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div className={`max-w-[78%] ${message.role === 'user' ? 'order-first' : ''}`}>
                <div
                  className={`rounded-lg px-4 py-3 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'bg-cyan-500 text-gray-950'
                      : message.error
                        ? 'border border-red-500/40 bg-red-950/40 text-red-100'
                        : 'border border-card bg-page text-ink'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <MarkdownMessage content={message.content} />
                  ) : (
                    message.displayContent ?? message.content
                  )}
                  {message.attachment && (
                    <div className={`mt-2 inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-xs ${
                      message.role === 'user' ? 'bg-sunken/15 text-gray-900' : 'bg-sunken text-ink-soft'
                    }`}>
                      {message.attachment.kind === 'image' ? <ImageIcon className="h-3.5 w-3.5 flex-none" /> : <Paperclip className="h-3.5 w-3.5 flex-none" />}
                      <span className="truncate">{message.attachment.name}</span>
                    </div>
                  )}
                </div>
                {message.toolEvents && message.toolEvents.length > 0 && (
                  <AssistantReasoningStages events={message.toolEvents} />
                )}
                {message.pendingActions?.map((action) => (
                  <PendingActionCard key={action.id} action={action} onConfirm={confirmAction} onCancel={cancelAction} />
                ))}
              </div>
              {message.role === 'user' && (
                <div className="mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-card text-ink-soft">
                  <UserRound className="h-4 w-4" />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <form onSubmit={submit} className="assistant-composer-form fixed left-0 right-0 z-20 border-t border-card bg-sunken/95 px-2.5 pt-2.5 backdrop-blur-xl md:static md:bg-transparent md:p-3 md:backdrop-blur-none">
        {attachment && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-card bg-sunken px-3 py-2">
            <div className="flex min-w-0 items-center gap-3">
              {attachment.kind === 'image' ? (
                <img src={attachment.previewUrl} alt="" className="h-10 w-10 flex-none rounded-md border border-line object-cover" />
              ) : (
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-md border border-line bg-page text-ink-soft">
                  <Paperclip className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{attachment.name}</p>
                <p className="text-xs text-gray-500">{attachment.mimeType}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-line text-ink-muted hover:border-red-500/60 hover:text-red-300"
              aria-label="Remove attachment"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {dictationError && <p className="mb-2 text-xs text-red-300">{dictationError}</p>}
        <div className="assistant-composer rounded-[1.5rem] border border-line-strong bg-raised/70 px-3 py-2.5 shadow-inner shadow-black/20 transition-colors focus-within:border-cyan-500/70 focus-within:bg-raised sm:rounded-[1.75rem] sm:p-3">
          <div className="min-w-0">
            <textarea
              ref={inputRef}
              data-demo-id="talk-input"
              className="max-h-28 min-h-8 w-full resize-none bg-transparent px-1 py-1 text-base leading-6 text-ink outline-none placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-60 sm:max-h-36"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  sendMessage(draft)
                }
              }}
              placeholder="Add anything..."
              disabled={isSending}
              rows={1}
            />
          </div>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-sunken text-ink-soft transition-colors hover:bg-card hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={attachment ? 'Replace attachment' : 'Attach file'}
            >
              <Paperclip size={20} className="flex-none" />
            </button>
            <select
              value={model}
              onChange={(event) => setModel(event.target.value as AssistantChatModel)}
              disabled={isSending}
              className="h-8 min-w-0 max-w-[9.5rem] rounded-full border border-transparent bg-sunken px-3 text-xs font-medium text-ink outline-none transition-colors hover:bg-card focus:border-cyan-500 disabled:opacity-60 sm:h-11 sm:max-w-56 sm:px-4 sm:text-base"
              aria-label="Assistant model"
            >
              {assistantModels.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="min-w-0 flex-1" />
            <button
              type="button"
              onClick={toggleDictation}
              disabled={isSending || !isDictationSupported}
              className={`flex h-11 w-11 flex-none items-center justify-center rounded-full bg-sunken text-ink-soft transition-colors hover:bg-card hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 ${isListening ? 'bg-cyan-500/20 text-cyan-200' : ''}`}
              aria-label={isListening ? 'Stop dictation' : 'Start dictation'}
            >
              <Mic size={20} className="flex-none" />
            </button>
            <button
              type="submit"
              data-demo-id="talk-send-button"
              disabled={isSending || (!draft.trim() && !attachment)}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 transition-all hover:from-cyan-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send"
            >
              <Send size={20} className="flex-none" />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,text/plain,text/markdown,.txt,.md"
            onChange={(event) => void handleAttachmentChange(event.target.files?.[0])}
          />
        </div>
        <div className="mt-2 hidden text-right sm:block">
          <Link to="/add" className="text-xs text-gray-500 hover:text-ink-soft">
            Add manually
          </Link>
        </div>
      </form>
      </div>
    </div>
  )
}
