import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, ChevronDown, Dumbbell, Flame, Image as ImageIcon, Mic, MessageSquare, Paperclip, Pencil, Plus, Scale, Send, Target, Trash2, UserRound, Wrench, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { aiService, AssistantChatAttachment, AssistantChatAttachmentMetadata, AssistantChatMessage, AssistantChatModel, AssistantPendingAction, AssistantToolEvent } from '../services/api'
import { useDictatedText } from '../hooks/useDictatedText'

type ConversationPendingAction = AssistantPendingAction & {
  status?: 'pending' | 'confirmed' | 'canceled'
  result?: unknown
  error?: string
  completedAt?: string
}

type ConversationMessage = AssistantChatMessage & {
  id: string
  attachment?: AssistantChatAttachmentMetadata
  toolEvents?: AssistantToolEvent[]
  pendingActions?: ConversationPendingAction[]
  error?: boolean
}

type StoredConversation = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  model: AssistantChatModel
  messages: ConversationMessage[]
}

const ASSISTANT_CONVERSATIONS_KEY = 'healthyflow-assistant-conversations-v1'
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

function writeStoredConversations(conversations: StoredConversation[]) {
  localStorage.setItem(ASSISTANT_CONVERSATIONS_KEY, JSON.stringify(conversations.slice(0, MAX_STORED_CONVERSATIONS)))
}

function titleFromMessages(messages: ConversationMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === 'user')?.content.trim()
  if (!firstUserMessage) return 'New chat'
  return firstUserMessage.length > 48 ? `${firstUserMessage.slice(0, 45)}...` : firstUserMessage
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
  return 'h-10 rounded-md border border-gray-700 bg-gray-950 px-3 text-sm text-gray-100 outline-none transition-colors focus:border-cyan-500'
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
    <label className="grid gap-1 text-xs font-medium text-gray-400">
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
    <label className="grid gap-1 text-xs font-medium text-gray-400">
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
        className="inline-flex items-center gap-2 rounded-md border border-gray-800 bg-gray-950 px-2.5 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-200"
        aria-expanded={isOpen}
      >
        <Wrench className="h-3.5 w-3.5" />
        Reasoning stages
        <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-300">{events.length}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="mt-2 space-y-2 rounded-lg border border-gray-800 bg-gray-950/80 p-3">
          {events.map((event, index) => (
            <div key={`${event.name}-${index}`} className="rounded-md border border-gray-800 bg-gray-900/60 p-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-cyan-500/10 text-[11px] font-semibold text-cyan-200">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-gray-100">{compactToolName(event.name)}</span>
                    {summarizeArgs(event.args) && (
                      <span className="truncate text-xs text-gray-500">{summarizeArgs(event.args)}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-gray-300">{summarizeResult(event.result)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedEvent((value) => (value === index ? null : index))}
                  className="flex-none rounded border border-gray-800 px-2 py-1 text-[11px] text-gray-500 transition-colors hover:border-cyan-500/50 hover:text-cyan-200"
                >
                  {expandedEvent === index ? 'Hide' : 'Details'}
                </button>
              </div>
              {expandedEvent === index && (
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-gray-800 bg-gray-950 p-3 text-[11px] leading-5 text-gray-300">
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

  const commonTaskFields = (
    <>
      <TextField label="Title" value={draft.title} onChange={(value) => setField('title', value)} />
      <SelectField label="Category" value={draft.category ?? 'personal'} options={categories} onChange={(value) => setField('category', value)} />
      <TextField label="Duration" value={draft.duration} type="number" onChange={(value) => setField('duration', value)} />
      <TextField label="Start time" value={draft.startTime} type="time" onChange={(value) => setField('startTime', value)} />
    </>
  )

  return (
    <div className={`mt-3 rounded-lg border bg-gray-950 p-4 shadow-lg shadow-black/20 ${
      action.error
        ? 'border-red-500/50'
        : status === 'confirmed'
          ? 'border-emerald-500/50'
          : status === 'canceled'
            ? 'border-gray-700'
            : 'border-amber-500/40'
    }`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className={`flex items-center gap-2 text-sm font-semibold ${
          action.error
            ? 'text-red-100'
            : status === 'confirmed'
              ? 'text-emerald-100'
              : status === 'canceled'
                ? 'text-gray-300'
                : 'text-amber-100'
        }`}>
          <span className={`flex h-8 w-8 items-center justify-center rounded-md ${
            action.error
              ? 'bg-red-500/15 text-red-200'
              : status === 'confirmed'
                ? 'bg-emerald-500/15 text-emerald-200'
                : status === 'canceled'
                  ? 'bg-gray-800 text-gray-300'
                  : 'bg-amber-500/15 text-amber-200'
          }`}>
            {iconForCapability(action.capability)}
          </span>
          {labelForCapability(action.capability)}
        </div>
        {isPending && (
          <button className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:border-cyan-500 hover:text-cyan-200" onClick={() => setIsEditing((value) => !value)}>
            {isEditing ? 'Preview' : 'Edit'}
          </button>
        )}
      </div>

      <div className={`mb-3 rounded-md border px-3 py-2 text-xs ${
        action.error
          ? 'border-red-500/30 bg-red-950/30 text-red-100'
          : status === 'confirmed'
            ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-100'
            : status === 'canceled'
              ? 'border-gray-700 bg-gray-900 text-gray-300'
              : 'border-amber-500/30 bg-amber-950/20 text-amber-100'
      }`}>
        {statusLabel}
      </div>

      {isEditing && isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {action.capability === 'add_task' && (
            <>
              {commonTaskFields}
              <TextField label="Scheduled date" value={draft.scheduledDate} type="date" onChange={(value) => setField('scheduledDate', value)} />
            </>
          )}
          {action.capability === 'add_habit' && (
            <>
              {commonTaskFields}
              <SelectField label="Repeat" value={draft.repeat ?? 'daily'} options={['daily', 'weekly']} onChange={(value) => setField('repeat', value)} />
            </>
          )}
          {action.capability === 'add_calorie_entry' && (
            <>
              <TextField label="Name" value={draft.name} onChange={(value) => setField('name', value)} />
              <TextField label="Calories" value={draft.calories} type="number" onChange={(value) => setField('calories', value)} />
              <TextField label="Protein" value={draft.protein} type="number" onChange={(value) => setField('protein', value)} />
              <TextField label="Carbs" value={draft.carbs} type="number" onChange={(value) => setField('carbs', value)} />
              <TextField label="Fat" value={draft.fat} type="number" onChange={(value) => setField('fat', value)} />
              <TextField label="Quantity" value={draft.quantity} onChange={(value) => setField('quantity', value)} />
              <TextField label="Date" value={draft.date} type="date" onChange={(value) => setField('date', value)} />
              <TextField label="Time" value={draft.time} type="time" onChange={(value) => setField('time', value)} />
            </>
          )}
          {action.capability === 'add_calorie_entries' && (
            <div className="space-y-3 sm:col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-100">Meal items</p>
                <span className="text-xs text-gray-400">{arrayValue(draft.entries).length} entries</span>
              </div>
              {arrayValue(draft.entries).map((entry, index) => (
                <div key={index} className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/15 text-xs font-semibold text-cyan-200">
                      {index + 1}
                    </span>
                    <input
                      className="min-w-0 flex-1 bg-transparent text-sm font-medium text-gray-100 outline-none"
                      value={fieldValue(entry.name)}
                      onChange={(event) => setEntryField(index, 'name', event.target.value)}
                      aria-label={`Meal item ${index + 1} name`}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <TextField label="Calories" value={entry.calories} type="number" onChange={(value) => setEntryField(index, 'calories', value)} />
                    <TextField label="Protein" value={entry.protein} type="number" onChange={(value) => setEntryField(index, 'protein', value)} />
                    <TextField label="Carbs" value={entry.carbs} type="number" onChange={(value) => setEntryField(index, 'carbs', value)} />
                    <TextField label="Fat" value={entry.fat} type="number" onChange={(value) => setEntryField(index, 'fat', value)} />
                    <TextField label="Quantity" value={entry.quantity} onChange={(value) => setEntryField(index, 'quantity', value)} />
                    <TextField label="Date" value={entry.date} type="date" onChange={(value) => setEntryField(index, 'date', value)} />
                    <TextField label="Time" value={entry.time} type="time" onChange={(value) => setEntryField(index, 'time', value)} />
                  </div>
                </div>
              ))}
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
              <label className="grid gap-1 text-xs font-medium text-gray-400 sm:col-span-2">
                <span>Exercises JSON</span>
                <textarea className="min-h-28 rounded-md border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-sm text-gray-100 outline-none transition-colors focus:border-cyan-500" value={fieldValue(draft.exercises)} onChange={(event) => setField('exercises', event.target.value)} />
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
          {action.capability === 'delete_item' && (
            <SelectField label="Delete scope" value={draft.deleteScope ?? 'instance'} options={['instance', 'habit']} onChange={(value) => setField('deleteScope', value)} />
          )}
          {!['add_task', 'add_habit', 'add_calorie_entry', 'add_calorie_entries', 'add_weight_entry', 'add_achievement_entry', 'add_workout_session', 'update_item', 'delete_item'].includes(action.capability) && (
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-gray-800 bg-gray-950 p-3 text-xs text-gray-200 sm:col-span-2">
              {JSON.stringify(action.preview, null, 2)}
            </pre>
          )}
        </div>
      ) : (
        <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-gray-800 bg-gray-950 p-3 text-xs text-gray-200">
          {JSON.stringify(status === 'confirmed' ? { args: action.args, result: action.result } : buildEditedArgs(action, draft), null, 2)}
        </pre>
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
  const [conversations, setConversations] = useState<StoredConversation[]>(() => readStoredConversations())
  const [activeConversationId, setActiveConversationId] = useState(() => readStoredConversations()[0]?.id ?? crypto.randomUUID())
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? null
  const [messages, setMessages] = useState<ConversationMessage[]>(() => activeConversation?.messages ?? [])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [model, setModel] = useState<AssistantChatModel>(() => activeConversation?.model ?? 'gpt-4o-mini')
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const {
    isListening,
    isDictationSupported,
    dictationError,
    toggleDictation,
  } = useDictatedText({ text: draft, setText: setDraft, disabled: isSending })

  useEffect(() => {
    writeStoredConversations(conversations)
  }, [conversations])

  useEffect(() => {
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
  }, [activeConversationId, messages, model])

  const apiMessages = useMemo(
    () => messages
      .filter((message) => !message.error)
      .map(({ role, content }) => ({ role, content })),
    [messages]
  )

  const sendMessage = async (content: string, messageAttachment: ComposerAttachment | null = attachment) => {
    const trimmed = content.trim()
    if ((!trimmed && !messageAttachment) || isSending) return
    const userContent = trimmed || `Review the attached ${messageAttachment?.kind === 'image' ? 'image' : 'file'}.`

    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent,
      attachment: messageAttachment ? attachmentMetadata(messageAttachment) : undefined,
    }
    const nextMessages = [...apiMessages, { role: 'user' as const, content: userContent }]

    setMessages((current) => [...current, userMessage])
    setDraft('')
    setAttachment(null)
    setIsSending(true)

    try {
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
      const response = await aiService.chat(nextMessages, model, requestAttachment)
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
    setActiveConversationId(crypto.randomUUID())
    setMessages([])
    setDraft('')
    setAttachment(null)
    setModel('gpt-4o-mini')
    inputRef.current?.focus()
  }

  const openConversation = (conversation: StoredConversation) => {
    if (isSending) return
    setActiveConversationId(conversation.id)
    setMessages(conversation.messages)
    setModel(conversation.model)
    setDraft('')
    setAttachment(null)
  }

  const confirmAction = async (actionId: string, args?: Record<string, unknown>) => {
    try {
      const response = await aiService.confirmChatAction(actionId, args)
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
    <div className="mx-auto flex h-[calc(100vh-7rem)] w-full max-w-6xl gap-4 overflow-hidden">
      <aside className="hidden w-72 flex-none flex-col overflow-hidden rounded-lg border border-gray-800 bg-gray-950/70 md:flex">
        <div className="border-b border-gray-800 p-3">
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
            <div className="rounded-lg border border-dashed border-gray-800 p-4 text-sm text-gray-500">
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
                      : 'border-gray-800 bg-gray-900/70 text-gray-300 hover:border-cyan-500/40 hover:text-cyan-100'
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

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-800 bg-gray-950/70">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-100">Talk to your day</h1>
            <p className="text-xs text-gray-500 md:hidden">{conversations.length} saved chats</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={startNewChat}
            disabled={isSending}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-800 bg-gray-900 text-gray-200 transition-colors hover:border-cyan-500/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60 md:hidden"
            aria-label="New Chat"
          >
            <Plus className="h-4 w-4" />
          </button>
          <select
            value={model}
            onChange={(event) => setModel(event.target.value as AssistantChatModel)}
            disabled={isSending}
            className="rounded-md border border-gray-800 bg-gray-900 px-2 py-1 text-sm text-gray-100 outline-none transition-colors focus:border-cyan-500 disabled:opacity-60"
            aria-label="Assistant model"
          >
            {assistantModels.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {isSending && <span className="text-sm text-cyan-300">Thinking</span>}
        </div>
      </div>

      {conversations.length > 0 && (
        <div className="border-b border-gray-800 p-3 md:hidden">
          <label className="grid gap-1 text-xs font-medium text-gray-500">
            <span>Chat history</span>
            <select
              value={activeConversationId}
              onChange={(event) => {
                const conversation = conversations.find((item) => item.id === event.target.value)
                if (conversation) openConversation(conversation)
              }}
              disabled={isSending}
              className="rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-cyan-500 disabled:opacity-60"
            >
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.length === 0 ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                className="rounded-lg border border-gray-800 bg-gray-900/80 px-3 py-3 text-left text-sm text-gray-200 transition-colors hover:border-cyan-500/50 hover:text-cyan-200"
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : (
          messages.map((message) => (
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
                        : 'border border-gray-800 bg-gray-900 text-gray-100'
                  }`}
                >
                  {message.content}
                  {message.attachment && (
                    <div className={`mt-2 inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-xs ${
                      message.role === 'user' ? 'bg-gray-950/15 text-gray-900' : 'bg-gray-950 text-gray-300'
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
                <div className="mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gray-800 text-gray-200">
                  <UserRound className="h-4 w-4" />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <form onSubmit={submit} className="border-t border-gray-800 p-3">
        {attachment && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
            <div className="flex min-w-0 items-center gap-3">
              {attachment.kind === 'image' ? (
                <img src={attachment.previewUrl} alt="" className="h-10 w-10 flex-none rounded-md border border-gray-700 object-cover" />
              ) : (
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-md border border-gray-700 bg-gray-900 text-gray-300">
                  <Paperclip className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-100">{attachment.name}</p>
                <p className="text-xs text-gray-500">{attachment.mimeType}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-gray-700 text-gray-400 hover:border-red-500/60 hover:text-red-300"
              aria-label="Remove attachment"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {dictationError && <p className="mb-2 text-xs text-red-300">{dictationError}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending}
            className="btn-secondary flex h-11 w-11 flex-none items-center justify-center rounded-lg !p-0 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={attachment ? 'Replace attachment' : 'Attach file'}
          >
            <Paperclip size={20} className="flex-none text-gray-100" />
          </button>
          <button
            type="button"
            onClick={toggleDictation}
            disabled={isSending || !isDictationSupported}
            className={`btn-secondary flex h-11 w-11 flex-none items-center justify-center rounded-lg !p-0 disabled:cursor-not-allowed disabled:opacity-50 ${isListening ? 'border-cyan-500 text-cyan-200' : ''}`}
            aria-label={isListening ? 'Stop dictation' : 'Start dictation'}
          >
            <Mic size={20} className={`flex-none ${isListening ? 'text-cyan-200' : 'text-gray-100'}`} />
          </button>
          <input
            ref={inputRef}
            className="input-field min-w-0 flex-1"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add anything, or ask anything…"
            disabled={isSending}
          />
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,text/plain,text/markdown,.txt,.md"
            onChange={(event) => void handleAttachmentChange(event.target.files?.[0])}
          />
          <button
            type="submit"
            disabled={isSending || (!draft.trim() && !attachment)}
            className="btn-primary flex h-11 w-11 flex-none items-center justify-center rounded-lg !p-0 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send"
          >
            <Send size={20} className="flex-none text-white" />
          </button>
        </div>
        <div className="mt-2 text-right">
          <Link to="/add" className="text-xs text-gray-500 hover:text-gray-300">
            Add manually
          </Link>
        </div>
      </form>
      </div>
    </div>
  )
}
