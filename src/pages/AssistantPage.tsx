import { ClipboardEvent as ReactClipboardEvent, FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Bot, ChevronDown, Image as ImageIcon, Mic, MessageSquare, Paperclip, Pause, Play, Plus, Send, Square, UserRound, Volume2, Wrench, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { aiService, AssistantChatAttachment, AssistantChatAttachmentMetadata, AssistantChatMessage, AssistantChatModel, AssistantContext, AssistantConversation, AssistantPendingAction, AssistantStoredMessage, AssistantToolEvent, GOALS_QUERY_KEY, HABIT_HISTORY_QUERY_KEY, goalService, pushService, taskService, type Goal } from '../services/api'
import { GoalCreateInputSchema, GoalUpdateInputSchema } from '../../backend/src/goals-schema'
import { useDictatedText } from '../hooks/useDictatedText'
import PendingActionCard, { type PendingActionView } from '../components/PendingActionCard'
import { invalidatePendingActionQueries } from '../utils/pendingActionInvalidation'
import { workTalkContext, type WorkTalkContext } from '../workTalk'
import { useTTS } from '../hooks/useTTS'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../hooks/useSettings'
import { useGoals } from '../hooks/useGoals'
import { isNativeIOS } from '../lib/native'
import { analytics } from '../lib/analytics'
import {
  talkHandoffContext,
  talkHandoffLabel,
  talkHandoffPrompt,
  type TalkHandoffContext,
} from '../talkHandoff'

type ConversationPendingAction = PendingActionView

type ConversationMessage = AssistantStoredMessage & {
  pendingActions?: ConversationPendingAction[]
}

type StoredConversation = AssistantConversation

type TalkRequest = {
  messages: AssistantChatMessage[]
  model: AssistantChatModel
  attachment?: AssistantChatAttachment
  conversationId: string
  workflow?: { name: 'plan_work'; projectId: string; anchorDate?: string }
  assistantContext?: AssistantContext
  forceMock: boolean
}

type TalkRecovery = {
  kind: 'canceled' | 'failed'
  request: TalkRequest
  errorMessageId?: string
}

type TalkEntryPoint = 'talk' | 'today' | 'add' | 'nutrition' | 'workouts' | 'work' | 'daily_signal' | 'kickoff'

type DailySignalTalkContext = {
  date: string
  type?: string
  summary?: string
  rationale?: string
}

const ASSISTANT_CONVERSATIONS_KEY = 'healthyflow-assistant-conversations-v1'
const ASSISTANT_CONVERSATIONS_MIGRATED_KEY = 'healthyflow-assistant-conversations-v1-migrated'
const MAX_STORED_CONVERSATIONS = 20
const MAX_CHAT_CONTEXT_MESSAGES = 30
const MAX_IMAGE_ATTACHMENT_BYTES = 4 * 1024 * 1024
const MAX_TEXT_ATTACHMENT_BYTES = 64 * 1024
const MAX_TEXT_ATTACHMENT_CHARS = 12_000
const IMAGE_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const TEXT_ATTACHMENT_TYPES = ['text/plain', 'text/markdown'] as const
const GOAL_PENDING_CAPABILITIES = ['add_goal', 'update_goal', 'archive_goal'] as const

function isGoalPendingAction(action: AssistantPendingAction | undefined) {
  return Boolean(action && GOAL_PENDING_CAPABILITIES.some((capability) => capability === action.capability))
}

function dailySignalTalkContext(value: unknown): DailySignalTalkContext | null {
  if (!value || typeof value !== 'object') return null
  const candidate = (value as { dailySignalContext?: unknown }).dailySignalContext
  if (!candidate || typeof candidate !== 'object') return null
  const record = candidate as Record<string, unknown>
  if (typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) return null
  return {
    date: record.date,
    type: typeof record.type === 'string' ? record.type.slice(0, 80) : undefined,
    summary: typeof record.summary === 'string' ? record.summary.slice(0, 500) : undefined,
    rationale: typeof record.rationale === 'string' ? record.rationale.slice(0, 800) : undefined,
  }
}

function dailySignalTalkPrompt(context: DailySignalTalkContext) {
  return [
    `Help me work through this Daily Signal for ${context.date}.`,
    context.summary ? `Signal: ${context.summary}` : null,
    context.rationale ? `Why it surfaced: ${context.rationale}` : null,
    'Help me choose one useful next step. Ask a clarifying question if the signal does not contain enough context, and do not assume I want to change the Habit.',
  ].filter(Boolean).join('\n')
}

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

function isDemoSession() {
  return Boolean(localStorage.getItem('demoPersona'))
}

const demoAssistantPlans: Record<string, string[]> = {
  maya: [
    "Here's a stable plan for Maya's day:",
    '',
    '1. Protect the first clear morning block for the rolled-over task. It is the only item that needs a real schedule change.',
    '2. Keep the lower-pressure personal tasks in Anytime so the timeline stays readable.',
    '3. Treat habits as lightweight anchors: complete the realistic ones today, but do not let them crowd the plan.',
    '',
    "I'll move the rolled-over task into the morning next, then you can keep exploring the real workspace.",
  ],
  noam: [
    "Here's a stable reset plan for Noam:",
    '',
    '1. Do the smallest visible step first: open the bill and only read it.',
    '2. Keep the clinic call in view by giving it a short slot, not by rewriting the whole day.',
    '3. Leave the rest in Anytime so unfinished work rolls forward without duplicating pressure.',
    '',
    "I'll schedule one carried-forward task next, then Noam can keep exploring.",
  ],
  lina: [
    "Here's a stable health-tracking readout for Lina:",
    '',
    '1. Today already has habits, Calorie entries with macros, weight trend data, and a Workout session.',
    '2. Quick Insert can repeat the yogurt bowl from history instead of retyping it.',
    '3. Progress shows 5K time as a personal metric with progress over recent entries.',
    '',
    'The next stop is Health, with Nutrition, Workouts, and Progress inside it.',
  ],
  amir: [
    "Here's a stable re-plan for Amir:",
    '',
    '1. Protect school pickup because it is the fixed point in the afternoon.',
    '2. Keep groceries as normal Tasks in Anytime until there is a real window.',
    '3. Move the carried-forward school forms after pickup and leave flexible work visible.',
    '',
    "I'll schedule one rollover item next, then Amir can keep exploring the changed day.",
  ],
}

function demoAssistantMessage(): ConversationMessage {
  const persona = localStorage.getItem('demoPersona') ?? 'maya'
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: (demoAssistantPlans[persona] ?? demoAssistantPlans.maya).join('\n'),
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
          <span className="mt-[0.62rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent/80" />
          <p className="min-w-0">{renderInlineMarkdown(bullet[1])}</p>
        </div>
      )
    }

    const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/)
    if (numbered) {
      return (
        <div key={index} className="flex gap-2">
          <span className="shrink-0 font-semibold text-accent">{numbered[1]}.</span>
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

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(new DOMException('Request canceled', 'AbortError'))
    }, { once: true })
  })
}

function boundedChatContext(messages: AssistantChatMessage[]) {
  return messages.slice(-MAX_CHAT_CONTEXT_MESSAGES)
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

function AssistantReasoningStages({ events }: { events: AssistantToolEvent[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null)

  if (events.length === 0) return null

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-md border border-card bg-sunken px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-accent/50 hover:text-accent"
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
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-accent/10 text-[11px] font-semibold text-accent">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-ink">{compactToolName(event.name)}</span>
                    {summarizeArgs(event.args) && (
                      <span className="truncate text-xs text-ink-muted">{summarizeArgs(event.args)}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-ink-soft">{summarizeResult(event.result)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedEvent((value) => (value === index ? null : index))}
                  className="flex-none rounded border border-card px-2 py-1 text-[11px] text-ink-muted transition-colors hover:border-accent/50 hover:text-accent"
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

export default function AssistantPage() {
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
    settings: assistantSettings,
    resolution: assistantSettingsResolution,
    retry: retryAssistantSettings,
  } = useSettings()
  const {
    goals,
    resolution: goalsResolution,
    retry: retryGoals,
  } = useGoals()
  const habitHistoryDate = format(new Date(), 'yyyy-MM-dd')
  const habitHistoryQuery = useQuery({
    queryKey: [...HABIT_HISTORY_QUERY_KEY, habitHistoryDate],
    queryFn: () => taskService.getHabitHistory(habitHistoryDate, 30),
  })
  const assistantContext = useMemo<AssistantContext | undefined>(() => {
    if (!assistantSettings || goalsResolution === 'loading' || habitHistoryQuery.isLoading) return undefined
    const ownerName = user?.authMethod === 'guest' ? null : user?.name.trim() || null
    return {
      ownerName,
      profile: assistantSettings.assistantProfile,
      goals: goalsResolution === 'ready'
        ? { status: 'ready', records: (goals ?? []).filter((goal) => !goal.archivedAt) }
        : { status: 'unavailable' },
      habitHistory: habitHistoryQuery.data
        ? { status: 'ready', record: habitHistoryQuery.data }
        : { status: 'unavailable' },
    }
  }, [assistantSettings, goals, goalsResolution, habitHistoryQuery.data, habitHistoryQuery.isLoading, user?.authMethod, user?.name])
  const {
    speak,
    pause: pauseSpeech,
    resume: resumeSpeech,
    stop: stopSpeech,
    isSpeaking,
    isPaused,
    error: ttsError,
    isSupported: isTTSSupported,
  } = useTTS()
  const demoSession = isDemoSession()
  const [signalContext, setSignalContext] = useState<DailySignalTalkContext | null>(() => dailySignalTalkContext(location.state))
  // Work hands off a finished, editable prompt. Talk only carries it in —
  // it never reassembles the Project's target or context for itself.
  const [workContext, setWorkContext] = useState<WorkTalkContext | null>(() => workTalkContext(location.state))
  const [handoffContext, setHandoffContext] = useState<TalkHandoffContext | null>(() => talkHandoffContext(location.state))
  const [conversations, setConversations] = useState<StoredConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string>(() => crypto.randomUUID())
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [draft, setDraft] = useState(() => {
    if (workContext) return workContext.prompt
    if (signalContext) return dailySignalTalkPrompt(signalContext)
    return handoffContext ? talkHandoffPrompt(handoffContext) : ''
  })
  const [isSending, setIsSending] = useState(false)
  const [model, setModel] = useState<AssistantChatModel>('gpt-4o-mini')
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null)
  const [activeSpeechMessageId, setActiveSpeechMessageId] = useState<string | null>(null)
  const [talkRecovery, setTalkRecovery] = useState<TalkRecovery | null>(null)
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const opensFreshSignalChatRef = useRef(signalContext !== null || workContext !== null || handoffContext !== null)
  const skipNextPersistRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const conversationsRef = useRef<StoredConversation[]>([])
  const saveQueuesRef = useRef(new Map<string, Promise<AssistantConversation>>())
  const activeRequestRef = useRef<AbortController | null>(null)
  const shouldRefocusComposerRef = useRef(false)
  const {
    isListening,
    isDictationSupported,
    dictationError,
    toggleDictation,
  } = useDictatedText({ text: draft, setText: setDraft, disabled: isSending })

  // Router state is a one-shot handoff. Replace only the current history entry
  // so Back still returns to the source page and refresh cannot replay context.
  useEffect(() => {
    if (!location.state || (!signalContext && !workContext && !handoffContext)) return
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    // Context is intentionally captured once at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!signalContext && !workContext && !handoffContext) return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [handoffContext, signalContext, workContext])

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return

    input.style.height = 'auto'
    const maxHeight = Number.parseFloat(window.getComputedStyle(input).maxHeight)
    const nextHeight = Math.min(input.scrollHeight, Number.isFinite(maxHeight) ? maxHeight : input.scrollHeight)
    input.style.height = `${nextHeight}px`
    input.style.overflowY = input.scrollHeight > nextHeight ? 'auto' : 'hidden'

    if (document.activeElement === input && input.selectionStart === input.value.length) {
      input.scrollTop = input.scrollHeight
    }
  }, [draft])

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scroll = messagesScrollRef.current
      if (scroll) scroll.scrollTop = scroll.scrollHeight
    })
    return () => window.cancelAnimationFrame(frame)
  }, [messages])

  useEffect(() => {
    if (isSending || !shouldRefocusComposerRef.current) return
    shouldRefocusComposerRef.current = false
    inputRef.current?.focus({ preventScroll: true })
  }, [isSending])

  useEffect(() => {
    if (!ttsError) return
    toast.error('Could not play this response. You can still read and continue.')
  }, [ttsError])

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.visibilityState === 'hidden') pauseSpeech()
    }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => {
      document.removeEventListener('visibilitychange', pauseWhenHidden)
      stopSpeech()
    }
  }, [pauseSpeech, stopSpeech])

  useEffect(() => () => activeRequestRef.current?.abort(), [])

  const playResponse = (message: ConversationMessage) => {
    setActiveSpeechMessageId(message.id)
    speak(message.content)
  }

  const queueConversationSave = useCallback((conversation: StoredConversation) => {
    const previousSave = saveQueuesRef.current.get(conversation.id) ?? Promise.resolve()
    const queuedSave = previousSave
      .catch(() => undefined)
      .then(() => aiService.saveConversation(conversation))
    const clearQueue = () => {
      if (saveQueuesRef.current.get(conversation.id) === queuedSave) {
        saveQueuesRef.current.delete(conversation.id)
      }
    }

    saveQueuesRef.current.set(conversation.id, queuedSave)
    void queuedSave.then(clearQueue, clearQueue)
    return queuedSave
  }, [])

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    let canceled = false

    const loadConversations = async () => {
      if (demoSession) {
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
        if (firstConversation && !opensFreshSignalChatRef.current) {
          skipNextPersistRef.current = true
          setActiveConversationId(firstConversation.id)
          setMessages(firstConversation.messages)
          setModel(firstConversation.model)
        }

        if (shouldMigrate) {
          await Promise.all(localOnlyConversations.map(queueConversationSave))
          if (canceled) return
          localStorage.setItem(ASSISTANT_CONVERSATIONS_MIGRATED_KEY, 'true')
        }
        setIsHistoryLoaded(true)
      } catch {
        const localConversations = readStoredConversations()
        if (canceled) return
        setConversations(localConversations)
        const firstConversation = localConversations[0]
        if (firstConversation && !opensFreshSignalChatRef.current) {
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
  }, [demoSession, queueConversationSave])

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
    if (demoSession) return
    if (!isHistoryLoaded) return
    if (messages.length === 0) return
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false
      return
    }

    const existing = conversationsRef.current.find((conversation) => conversation.id === activeConversationId)
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
      queueConversationSave(conversation).catch(() => {
        toast.error('Could not save chat history.')
      })
    }, 350)
  }, [activeConversationId, demoSession, isHistoryLoaded, messages, model, queueConversationSave])

  const apiMessages = useMemo(
    () => messages
      .filter((message) => !message.error)
      .map(({ role, content }) => ({ role, content })),
    [messages]
  )

  const runTalkRequest = async (request: TalkRequest) => {
    if (activeRequestRef.current) return
    const controller = new AbortController()
    activeRequestRef.current = controller
    setTalkRecovery(null)
    setIsSending(true)

    try {
      if (request.forceMock || demoSession) {
        await abortableDelay(900, controller.signal)
        setMessages((current) => [...current, demoAssistantMessage()])
        return
      }

      const response = await aiService.chat(request.messages, request.model, request.attachment, {
        conversationId: request.conversationId,
        workflow: request.workflow,
        assistantContext: request.assistantContext,
        signal: controller.signal,
      })
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
      if (controller.signal.aborted || error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') {
        setTalkRecovery({ kind: 'canceled', request })
        return
      }

      const message = error.response?.data?.error ?? 'Assistant unavailable'
      const errorMessageId = crypto.randomUUID()
      toast.error(message)
      setMessages((current) => [
        ...current,
        {
          id: errorMessageId,
          role: 'assistant',
          content: message,
          error: true,
        },
      ])
      setTalkRecovery({ kind: 'failed', request, errorMessageId })
    } finally {
      if (activeRequestRef.current === controller) activeRequestRef.current = null
      shouldRefocusComposerRef.current = true
      setIsSending(false)
    }
  }

  const sendMessage = async (
    content: string,
    messageAttachment: ComposerAttachment | null = attachment,
    baseMessages: AssistantChatMessage[] = apiMessages,
    requestModel: AssistantChatModel = model,
    displayContent?: string,
    options: {
      forceMock?: boolean
      conversationId?: string
      workflow?: { name: 'plan_work'; projectId: string; anchorDate?: string }
      entryPoint?: TalkEntryPoint
    } = {}
  ) => {
    const trimmed = content.trim()
    if ((!trimmed && !messageAttachment) || activeRequestRef.current) return
    const entryPoint: TalkEntryPoint = options.entryPoint
      ?? handoffContext?.source
      ?? (workContext ? 'work' : signalContext ? 'daily_signal' : 'talk')
    analytics.capture('ai_question_asked', {
      surface: 'talk',
      entry_point: entryPoint,
      has_attachment: Boolean(messageAttachment),
      model: requestModel,
    })
    const userContent = trimmed || `Review the attached ${messageAttachment?.kind === 'image' ? 'image' : 'file'}.`

    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent,
      displayContent,
      attachment: messageAttachment ? attachmentMetadata(messageAttachment) : undefined,
    }
    const nextMessages = boundedChatContext([
      ...baseMessages,
      { role: 'user' as const, content: userContent },
    ])

    setMessages((current) => [...current, userMessage])
    setDraft('')
    setAttachment(null)
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
    await runTalkRequest({
      messages: nextMessages,
      model: requestModel,
      attachment: requestAttachment,
      conversationId: options.conversationId ?? activeConversationId,
      workflow: options.workflow ?? workContext?.workflow,
      assistantContext,
      forceMock: Boolean(options.forceMock),
    })
  }

  const cancelTalkRequest = () => {
    activeRequestRef.current?.abort()
  }

  const retryTalkRequest = async () => {
    if (!talkRecovery || activeRequestRef.current) return
    if (talkRecovery.errorMessageId) {
      setMessages((current) => current.filter((message) => message.id !== talkRecovery.errorMessageId))
    }
    await runTalkRequest(talkRecovery.request)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    sendMessage(draft)
  }

  const [searchParams, setSearchParams] = useSearchParams()
  const kickoffFiredRef = useRef(false)

  useEffect(() => {
    const kickoff = searchParams.get('kickoff')
    if (
      !kickoff
      || kickoffFiredRef.current
      || assistantSettingsResolution === 'loading'
      || goalsResolution === 'loading'
    ) return
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
        const kickoffConversationId = crypto.randomUUID()
        setActiveConversationId(kickoffConversationId)
        setMessages([])
        setDraft('')
        setAttachment(null)
        setModel(kickoffModel)
        await sendMessage(
          seed,
          null,
          [],
          kickoffModel,
          kickoffDisplayLabel(kickoff as 'morning' | 'midday' | 'weekly'),
          { conversationId: kickoffConversationId, entryPoint: 'kickoff' },
        )
      } catch {
        toast.error('Could not start your planning session.')
      }
    })()
    // The kickoff intentionally waits for the user-owned assistant context read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantSettingsResolution, goalsResolution])

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

  const handleComposerPaste = async (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const imageItems = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    if (imageItems.length === 0) return

    event.preventDefault()
    if (imageItems.length > 1) {
      toast.error('Paste one image at a time')
      return
    }

    const file = imageItems[0].getAsFile()
    if (!file) {
      toast.error('Could not read pasted image')
      return
    }
    await handleAttachmentChange(file)
  }

  const startNewChat = () => {
    stopSpeech()
    setActiveSpeechMessageId(null)
    skipNextPersistRef.current = false
    setActiveConversationId(crypto.randomUUID())
    setMessages([])
    setDraft('')
    setSignalContext(null)
    setWorkContext(null)
    setHandoffContext(null)
    setAttachment(null)
    setTalkRecovery(null)
    setModel('gpt-4o-mini')
    inputRef.current?.focus()
  }

  const openConversation = (conversation: StoredConversation) => {
    if (isSending) return
    stopSpeech()
    setActiveSpeechMessageId(null)
    skipNextPersistRef.current = true
    setActiveConversationId(conversation.id)
    setMessages(conversation.messages)
    setModel(conversation.model)
    setDraft('')
    setSignalContext(null)
    setWorkContext(null)
    setHandoffContext(null)
    setAttachment(null)
    setTalkRecovery(null)
  }

  const confirmAction = async (actionId: string, args?: Record<string, unknown>) => {
    const pendingAction = messages
      .flatMap((message) => message.pendingActions ?? [])
      .find((action) => action.id === actionId)

    if (isGoalPendingAction(pendingAction)) {
      try {
        if (new Date(pendingAction!.expiresAt).getTime() <= Date.now()) {
          throw new Error('This Goal change expired. Ask Talk to prepare it again.')
        }

        const editedArgs = { ...(pendingAction!.args ?? {}), ...(args ?? {}) }
        let goal: Goal
        let appliedArgs: Record<string, unknown>

        if (pendingAction!.capability === 'add_goal') {
          const input = GoalCreateInputSchema.parse(editedArgs)
          goal = await goalService.createGoal(input)
          appliedArgs = input
        } else {
          const goalId = typeof editedArgs.goalId === 'string' ? editedArgs.goalId : ''
          if (!goalId) throw new Error('This Goal change is missing its Goal id.')

          if (pendingAction!.capability === 'archive_goal') {
            goal = await goalService.updateGoal(goalId, { archived: true })
            appliedArgs = { goalId }
          } else {
            const updateCandidate = {
              ...(editedArgs.module !== undefined ? { module: editedArgs.module } : {}),
              ...(editedArgs.statement !== undefined ? { statement: editedArgs.statement } : {}),
              ...(editedArgs.context !== undefined ? { context: editedArgs.context } : {}),
            }
            const input = GoalUpdateInputSchema.parse(updateCandidate)
            goal = await goalService.updateGoal(goalId, input)
            appliedArgs = { goalId, ...input }
          }
        }

        queryClient.setQueryData<Goal[]>(GOALS_QUERY_KEY, (current) => {
          if (!current) return current
          return pendingAction!.capability === 'add_goal'
            ? [...current, goal]
            : current.map((record) => record.id === goal.id ? goal : record)
        })
        await queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY })
        setMessages((current) => current.map((message) =>
          message.pendingActions?.some((action) => action.id === actionId)
            ? {
                ...message,
                pendingActions: message.pendingActions.map((action) =>
                  action.id === actionId
                    ? {
                        ...action,
                        args: appliedArgs,
                        status: 'confirmed',
                        result: { goal },
                        error: undefined,
                        completedAt: new Date().toISOString(),
                      }
                    : action
                ),
              }
            : message
        ))
        toast.success('Goal change confirmed')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not confirm Goal change'
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
      return
    }

    try {
      const hasOtherPendingActions = messages.some((message) =>
        message.pendingActions?.some((action) =>
          action.id !== actionId && action.status !== 'confirmed' && action.status !== 'canceled'
        )
      )
      const response = await aiService.confirmChatAction(actionId, args)
      await invalidatePendingActionQueries(queryClient, response.action)
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
      // A Talk workflow continues server-side from a typed application event.
      // Only the legacy assistant loop needs a hidden follow-up message.
      if (!hasOtherPendingActions && response.action.workflowId && activeConversationId) {
        setIsSending(true)
        try {
          const continued = await aiService.continueChatWorkflow(activeConversationId, model, assistantContext)
          if (continued) {
            setMessages((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: continued.message,
                toolEvents: continued.toolEvents,
                pendingActions: continued.pendingActions,
              },
            ])
          }
        } catch (error: any) {
          const message = error.response?.data?.error ?? 'Assistant unavailable'
          toast.error(message)
        } finally {
          setIsSending(false)
        }
      } else if (!hasOtherPendingActions) {
        const hiddenContinuation: ConversationMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: continuationPrompt(response.action, response.result),
          displayContent: 'Confirmed',
          hidden: true,
        }
        const nextMessages = boundedChatContext([
          ...apiMessages,
          { role: 'user' as const, content: hiddenContinuation.content },
        ])
        setMessages((current) => [...current, hiddenContinuation])
        setIsSending(true)

        try {
          const nextResponse = await aiService.chat(nextMessages, model, undefined, {
            conversationId: activeConversationId,
            assistantContext,
          })
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
    const pendingAction = messages
      .flatMap((message) => message.pendingActions ?? [])
      .find((action) => action.id === actionId)
    if (isGoalPendingAction(pendingAction)) {
      setMessages((current) => current.map((message) =>
        message.pendingActions?.some((action) => action.id === actionId)
          ? {
              ...message,
              pendingActions: message.pendingActions.map((action) =>
                action.id === actionId
                  ? {
                      ...action,
                      status: 'canceled',
                      error: undefined,
                      completedAt: new Date().toISOString(),
                    }
                  : action
              ),
            }
          : message
      ))
      toast.success('Goal change canceled')
      return
    }

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
            <div className="rounded-lg border border-dashed border-card p-4 text-sm text-ink-muted">
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
                      ? 'border-accent/60 bg-accent/10 text-accent'
                      : 'border-card bg-page/70 text-ink-soft hover:border-accent/40 hover:text-accent'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <MessageSquare className="mt-0.5 h-4 w-4 flex-none" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{conversation.title}</p>
                      <p className="mt-1 text-xs text-ink-muted">
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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
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
                className="mt-1 block w-full truncate rounded-md border border-card bg-page px-2 py-1 text-xs text-ink outline-none transition-colors focus:border-accent disabled:opacity-60 md:hidden"
                aria-label="Chat history"
              >
                {!conversations.some((conversation) => conversation.id === activeConversationId) && (
                  <option value={activeConversationId}>
                    {signalContext || workContext || handoffContext ? 'New contextual chat' : 'New chat'}
                  </option>
                )}
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-ink-muted md:hidden">{conversations.length} saved chats</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={startNewChat}
            disabled={isSending}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-card bg-page text-ink-soft transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 md:hidden"
            aria-label="New Chat"
          >
            <Plus className="h-4 w-4" />
          </button>
          {isSending && activeRequestRef.current ? (
            <button
              type="button"
              onClick={cancelTalkRequest}
              className="rounded-md border border-card bg-page px-3 py-2 text-sm font-medium text-accent transition-colors hover:border-accent/50"
              aria-label="Cancel response"
            >
              Cancel
            </button>
          ) : isSending ? <span className="text-sm text-accent">Thinking</span> : null}
        </div>
      </div>

      {apiMessages.length >= MAX_CHAT_CONTEXT_MESSAGES && (
        <p className="border-b border-card bg-page/60 px-4 py-2 text-xs text-ink-muted" role="note">
          Talk uses the latest 30 messages as context; your full chat remains saved.
        </p>
      )}

      {assistantSettingsResolution === 'error' && (
        <div className="flex items-center justify-between gap-3 border-b border-state-warning/30 bg-state-warning/10 px-4 py-2 text-xs text-ink-muted" role="alert">
          <span>Personal assistant context is unavailable. Talk can continue without it.</span>
          <button
            type="button"
            onClick={() => void retryAssistantSettings()}
            className="font-medium text-accent underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      {goalsResolution === 'error' && (
        <div className="flex items-center justify-between gap-3 border-b border-state-warning/30 bg-state-warning/10 px-4 py-2 text-xs text-ink-muted" role="alert">
          <span>Goals are unavailable. Talk can continue, but will not treat that failed read as an empty Goal list.</span>
          <button
            type="button"
            onClick={() => void retryGoals()}
            className="font-medium text-accent underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      {habitHistoryQuery.isError && (
        <div className="flex items-center justify-between gap-3 border-b border-state-warning/30 bg-state-warning/10 px-4 py-2 text-xs text-ink-muted" role="alert">
          <span>Habit history is unavailable. Talk can continue, but will not treat the failed read as an empty history.</span>
          <button
            type="button"
            onClick={() => void habitHistoryQuery.refetch()}
            className="font-medium text-accent underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      <div ref={messagesScrollRef} className="assistant-messages-scroll flex-1 space-y-4 overflow-y-auto px-4 pt-5 md:pb-5">
        {messages.length === 0 ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                className="rounded-lg border border-card bg-page/80 px-3 py-3 text-left text-sm text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
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
                <div className="mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div className={`max-w-[78%] ${message.role === 'user' ? 'order-first' : ''}`}>
                <div
                  className={`rounded-lg px-4 py-3 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'bg-action text-on-action'
                      : message.error
                        ? 'border border-state-danger/40 bg-state-danger/40 text-state-danger'
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
                      message.role === 'user' ? 'bg-sunken/15 text-on-accent' : 'bg-sunken text-ink-soft'
                    }`}>
                      {message.attachment.kind === 'image' ? <ImageIcon className="h-3.5 w-3.5 flex-none" /> : <Paperclip className="h-3.5 w-3.5 flex-none" />}
                      <span className="truncate">{message.attachment.name}</span>
                    </div>
                  )}
                </div>
                {message.role === 'assistant' && !message.error && isTTSSupported && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {activeSpeechMessageId === message.id && isSpeaking ? (
                      <button
                        type="button"
                        onClick={pauseSpeech}
                        aria-label="Pause response"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-card bg-page px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-accent/50 hover:text-accent"
                      >
                        <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                        Pause
                      </button>
                    ) : activeSpeechMessageId === message.id && isPaused ? (
                      <button
                        type="button"
                        onClick={resumeSpeech}
                        aria-label="Resume response"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-card bg-page px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-accent/50 hover:text-accent"
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        Resume
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => playResponse(message)}
                        aria-label={activeSpeechMessageId === message.id ? 'Replay response' : 'Speak response'}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-card bg-page px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-accent/50 hover:text-accent"
                      >
                        <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {activeSpeechMessageId === message.id ? 'Replay' : 'Speak'}
                      </button>
                    )}
                    {activeSpeechMessageId === message.id && (isSpeaking || isPaused) && (
                      <button
                        type="button"
                        onClick={stopSpeech}
                        aria-label="Stop response"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-card bg-page px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-accent/50 hover:text-accent"
                      >
                        <Square className="h-3.5 w-3.5" aria-hidden="true" />
                        Stop
                      </button>
                    )}
                  </div>
                )}
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
        {talkRecovery && (
          <div className="mb-2 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-state-warning/40 bg-state-warning/10 px-3 py-2 text-sm" role="status">
            <span className="text-ink">
              {talkRecovery.kind === 'canceled' ? 'Response canceled.' : 'Response failed.'}
            </span>
            <button
              type="button"
              onClick={() => void retryTalkRequest()}
              disabled={isSending}
              className="flex-none font-medium text-accent underline underline-offset-2 disabled:opacity-50"
              aria-label="Retry response"
            >
              Retry
            </button>
          </div>
        )}
        {workContext && (
          <div className="mb-2 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-xs text-accent">
            <span className="min-w-0 truncate">From Work · {workContext.label}</span>
            <button
              type="button"
              onClick={() => setWorkContext(null)}
              aria-label="Remove Work context"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent/15"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {signalContext && (
          <div className="mb-2 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-xs text-accent">
            <span className="min-w-0 truncate">
              From Today · {signalContext.date}{signalContext.type ? ` · ${signalContext.type.replace(/_/g, ' ')}` : ''}
            </span>
            <button
              type="button"
              onClick={() => setSignalContext(null)}
              aria-label="Remove Daily Signal context"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent/15"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {handoffContext && (
          <div className="mb-2 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-xs text-accent">
            <span className="min-w-0 truncate">From {talkHandoffLabel(handoffContext)}</span>
            <button
              type="button"
              onClick={() => setHandoffContext(null)}
              aria-label="Remove module context"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent/15"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
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
                <p className="text-xs text-ink-muted">{attachment.mimeType}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-line text-ink-muted hover:border-state-danger/60 hover:text-state-danger"
              aria-label="Remove attachment"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {dictationError && <p className="mb-2 text-xs text-state-danger">{dictationError}</p>}
        <div className="assistant-composer rounded-[1.5rem] border border-line-strong bg-raised/70 px-3 py-2.5 shadow-inner shadow-black/20 transition-colors focus-within:border-accent/70 focus-within:bg-raised sm:rounded-[1.75rem] sm:p-3">
          <div className="min-w-0">
            <textarea
              ref={inputRef}
              data-demo-id="talk-input"
              className="max-h-28 min-h-8 w-full resize-none bg-transparent px-1 py-1 text-base leading-6 text-ink outline-none placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-60 sm:max-h-36"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={(event) => void handleComposerPaste(event)}
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
              className="h-8 min-w-0 max-w-[9.5rem] rounded-full border border-transparent bg-sunken px-3 text-xs font-medium text-ink outline-none transition-colors hover:bg-card focus:border-accent disabled:opacity-60 sm:h-11 sm:max-w-56 sm:px-4 sm:text-base"
              aria-label="Assistant model"
            >
              {assistantModels.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="min-w-0 flex-1" />
            {!isNativeIOS && (
              <button
                type="button"
                onClick={toggleDictation}
                disabled={isSending || !isDictationSupported}
                className={`flex h-11 w-11 flex-none items-center justify-center rounded-full bg-sunken text-ink-soft transition-colors hover:bg-card hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 ${isListening ? 'bg-accent/20 text-accent' : ''}`}
                aria-label={isListening ? 'Stop dictation' : 'Start dictation'}
              >
                <Mic size={20} className="flex-none" />
              </button>
            )}
            <button
              type="submit"
              data-demo-id="talk-send-button"
              disabled={isSending || (!draft.trim() && !attachment)}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-action text-on-action transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
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
          <Link to="/add" className="text-xs text-ink-muted hover:text-ink-soft">
            Add manually
          </Link>
        </div>
      </form>
      </div>
    </div>
  )
}
