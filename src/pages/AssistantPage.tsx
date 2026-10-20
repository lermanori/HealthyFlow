import { ClipboardEvent as ReactClipboardEvent, FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, History, Image as ImageIcon, MessageCircle, Mic, Paperclip, Pause, Play, Send, Square, Trash2, Volume2, Wrench, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { aiConsentService, aiService, AssistantChatAttachment, AssistantChatAttachmentMetadata, AssistantChatMessage, AssistantChatModel, AssistantContext, AssistantConversation, AssistantPendingAction, AssistantStoredMessage, AssistantToolEvent, calendarService, creditsService, daySummaryService, GOALS_QUERY_KEY, HABIT_HISTORY_QUERY_KEY, goalService, taskService, type AiConsentStatus, type Goal } from '../services/api'
import { GoalCreateInputSchema, GoalUpdateInputSchema } from '../../backend/src/goals-schema'
import { useDictatedText } from '../hooks/useDictatedText'
import { PendingActionDeck, type PendingActionView } from '../components/PendingActionCard'
import { invalidatePendingActionQueries } from '../utils/pendingActionInvalidation'
import { workTalkContext, type WorkTalkContext } from '../workTalk'
import { useTTS } from '../hooks/useTTS'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../hooks/useSettings'
import { useGoals } from '../hooks/useGoals'
import { analytics } from '../lib/analytics'
import { chooseNativeTalkAttachment, isNativeIOS } from '../lib/native'
import { applyConfirmedTalkActionToLocalDay, verifyConfirmedTalkTaskOnDevice } from '../lib/local/services'
import {
  assertTalkHandoffPendingActions,
  dailyReviewPrompt,
  reviewDayEvidence,
  talkHandoffContext,
  talkHandoffLabel,
  talkHandoffPrompt,
  weeklyReviewPrompt,
  type TalkHandoffContext,
} from '../talkHandoff'
import { IsoDateSchema } from '../../backend/src/day-summary-schema'
import type { WorkoutPlanTalkHandoff } from '../../backend/src/talk-handoff-schema'
import { actionExhaustionView } from '../utils/actionExhaustion'
import AiConsentDialog from '../components/AiConsentDialog'
import { registerVoiceTalkHandler, type VoiceTalkHandler, VoiceTalkResponseSchema } from '../lib/handsFreeProbe'
import { buildPlannedTalkEvidence, buildTalkCalendarContext } from '../lib/talkCalendarContext'
import { TalkContextPlanSchema, type TalkContextPlan, type TalkReviewContext } from '../../backend/src/settings-schema'

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
  talkMemory?: string
  handoff?: WorkoutPlanTalkHandoff
  review?: TalkReviewContext
  forceMock: boolean
}

type TalkRecovery = {
  kind: 'canceled' | 'failed'
  request: TalkRequest
  errorMessageId?: string
}

type TalkEntryPoint = 'talk' | 'first_run' | 'today' | 'add' | 'nutrition' | 'workouts' | 'work' | 'daily_signal' | 'kickoff'
type TalkMode = 'chat' | 'voice'

type DailySignalTalkContext = {
  date: string
  type?: string
  summary?: string
  rationale?: string
}

const ASSISTANT_CONVERSATIONS_KEY = 'healthyflow-assistant-conversations-v1'
const ASSISTANT_CONVERSATIONS_MIGRATED_KEY = 'healthyflow-assistant-conversations-v1-migrated'
const TALK_MEMORY_KEY = 'healthyflow-talk-memory-v1:'
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

function ConfirmedProposalReceipt({ actions }: { actions: ConversationPendingAction[] }) {
  const finished = actions.every((action) => action.status === 'confirmed' || action.status === 'canceled')
  const confirmedCount = actions.filter((action) => action.status === 'confirmed').length
  if (!finished || confirmedCount === 0) return null

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/10 p-3" role="status">
      <span className="text-sm text-ink">
        {confirmedCount === 1 ? '1 change is on Today.' : `${confirmedCount} changes are on Today.`}
      </span>
      <Link to="/" className="btn-primary inline-flex min-h-11 items-center justify-center px-4 py-2 text-sm">
        View Today
      </Link>
    </div>
  )
}

const MIN_TALK_MODEL: AssistantChatModel = 'gpt-5.4-mini'

function availableTalkModel(model: AssistantChatModel): AssistantChatModel {
  return model === 'gpt-4o-mini' || model === 'gpt-5-mini' ? MIN_TALK_MODEL : model
}

const assistantModels: Array<{ value: AssistantChatModel; label: string }> = [
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
    createdAt: new Date().toISOString(),
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

function conversationUpdatedAt(conversation: StoredConversation) {
  const timestamp = new Date(conversation.updatedAt).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function nextConversationUpdatedAt(conversation: StoredConversation) {
  return new Date(Math.max(Date.now(), (conversationUpdatedAt(conversation) ?? 0) + 1)).toISOString()
}

function mergeConversationSnapshots(
  serverConversations: StoredConversation[],
  localConversations: StoredConversation[],
) {
  const conversationsById = new Map(
    serverConversations.map((conversation) => [conversation.id, conversation]),
  )
  const localConversationsToSync: StoredConversation[] = []

  for (const localConversation of localConversations) {
    const serverConversation = conversationsById.get(localConversation.id)
    const localUpdatedAt = conversationUpdatedAt(localConversation)
    const serverUpdatedAt = serverConversation ? conversationUpdatedAt(serverConversation) : null
    const localIsNewer = !serverConversation || (
      localUpdatedAt !== null &&
      (serverUpdatedAt === null || localUpdatedAt > serverUpdatedAt)
    )

    if (!localIsNewer) continue
    conversationsById.set(localConversation.id, localConversation)
    localConversationsToSync.push(localConversation)
  }

  const conversations = [...conversationsById.values()]
    .sort((first, second) => (
      (conversationUpdatedAt(second) ?? 0) - (conversationUpdatedAt(first) ?? 0)
    ))
    .slice(0, MAX_STORED_CONVERSATIONS)

  return { conversations, localConversationsToSync }
}

function titleFromMessages(messages: AssistantStoredMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === 'user')
  const title = (firstUserMessage?.displayContent ?? firstUserMessage?.content ?? '').trim()
  if (!title) return 'New chat'
  return title.length > 48 ? `${title.slice(0, 45)}...` : title
}

async function assistantContextWithCalendar(
  context?: AssistantContext,
  prompt = '',
): Promise<AssistantContext | undefined> {
  if (!context) return undefined
  return {
    ...context,
    calendar: await buildTalkCalendarContext(calendarService.getDaySource, new Date(), prompt),
  }
}

async function chatContextWithCalendar(context: AssistantContext | undefined, messages: AssistantChatMessage[]) {
  const userPrompts = messages.filter((message) => message.role === 'user').map((message) => message.content)
  const prompt = userPrompts.at(-1) ?? ''
  const previousPrompts = userPrompts.slice(0, -1).reverse()
  const calendar = await buildTalkCalendarContext(calendarService.getDaySource, new Date(), prompt, previousPrompts)
  return {
    calendar,
    assistantContext: context ? { ...context, calendar } : undefined,
  }
}

const TALK_LAST_PLAN_KEY = 'healthyflow-talk-last-read-plan-v1:'
const TALK_LAST_PLAN_MAX_AGE_MS = 24 * 60 * 60 * 1000

function previousTalkPlan(conversationId?: string): TalkContextPlan | undefined {
  if (!conversationId) return undefined
  try {
    const stored = localStorage.getItem(`${TALK_LAST_PLAN_KEY}${conversationId}`)
    if (!stored) return undefined
    const value = JSON.parse(stored) as { savedAt?: number; plan?: unknown }
    if (!value.savedAt || Date.now() - value.savedAt > TALK_LAST_PLAN_MAX_AGE_MS) return undefined
    const parsed = TalkContextPlanSchema.safeParse(value.plan)
    return parsed.success && parsed.data.kind === 'ready' ? parsed.data : undefined
  } catch (error) {
    console.warn('Talk could not read its optional previous read scope:', error)
    return undefined
  }
}

function saveTalkPlan(conversationId: string | undefined, plan: TalkContextPlan) {
  if (!conversationId) return
  try {
    const key = `${TALK_LAST_PLAN_KEY}${conversationId}`
    if (plan.sources.length === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), plan }))
  } catch (error) {
    console.warn('Talk could not save its optional read scope:', error)
  }
}

async function sendPlannedTalkChat(
  messages: AssistantChatMessage[],
  model: AssistantChatModel,
  attachment: AssistantChatAttachment | undefined,
  options: Parameters<typeof aiService.chat>[3],
) {
  // The explicit Work workflow has its own durable context and tool boundary.
  if (options?.workflow || options?.handoff) {
    return aiService.chat(messages, model, attachment, {
      ...options,
      ...await chatContextWithCalendar(options.assistantContext, messages),
    })
  }

  if (options?.review) {
    const contextPlan: TalkContextPlan = {
      kind: 'ready', intent: 'other_app_data', dates: [], sources: [], clarification: null,
    }
    return aiService.chat(messages, model, attachment, { ...options, contextPlan })
  }

  const plan = await aiService.planTalkContext(
    messages,
    previousTalkPlan(options?.conversationId),
    options?.signal,
  )
  if (plan.kind === 'clarify') {
    return { message: plan.clarification!, toolEvents: [], pendingActions: [] }
  }
  const evidence = await buildPlannedTalkEvidence(
    plan,
    calendarService.getDaySource,
    daySummaryService.get,
  )
  const response = await aiService.chat(messages, model, attachment, {
    ...options,
    ...evidence,
    contextPlan: plan,
  })
  saveTalkPlan(options?.conversationId, plan)
  return response
}

function renderInlineMarkdown(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(\/[^)]+\))/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
    }
    const internalLink = part.match(/^\[([^\]]+)\]\((\/[^)]+)\)$/)
    if (internalLink) {
      return (
        <Link key={index} className="font-medium text-accent underline underline-offset-2" to={internalLink[2]}>
          {internalLink[1]}
        </Link>
      )
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

function conversationDayLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Earlier'

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfConversationDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDifference = Math.round((startOfToday.getTime() - startOfConversationDay.getTime()) / 86_400_000)

  if (dayDifference === 0) return 'Today'
  if (dayDifference === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

function conversationDayKey(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function ConversationDayDivider({ children }: { children: string }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-3 py-1" aria-label={children}>
      <span className="h-px flex-1 bg-line" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{children}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

function MessageDeleteButton({ onDelete, disabled }: { onDelete: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={disabled}
      aria-label="Delete message"
      title="Delete message"
      className="mt-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-card hover:text-state-danger disabled:opacity-40"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  )
}

function HistoricalMessage({ message, onDelete, deleteDisabled }: {
  message: AssistantStoredMessage
  onDelete: () => void
  deleteDisabled: boolean
}) {
  if (message.hidden) return null
  return (
    <div className={`mx-auto flex w-full max-w-3xl ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[88%] min-w-0">
        <div className={`break-words rounded-[1.5rem] px-4 py-3 text-sm leading-6 ${
        message.role === 'user'
          ? 'rounded-br-md bg-action text-on-action'
          : message.error
            ? 'rounded-tl-md border border-state-danger/40 bg-state-danger/10 text-state-danger'
            : 'rounded-tl-md bg-card text-ink shadow-section'
        }`}>
          {message.role === 'assistant' ? (
            <MarkdownMessage content={message.content} />
          ) : (
            <span className="whitespace-pre-wrap">{message.displayContent ?? message.content}</span>
          )}
          {message.attachment && (
            <div className={`mt-2 inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-xs ${
              message.role === 'user' ? 'bg-black/10 text-on-action' : 'bg-sunken text-ink-soft'
            }`}>
              {message.attachment.kind === 'image' ? <ImageIcon className="h-3.5 w-3.5 flex-none" /> : <Paperclip className="h-3.5 w-3.5 flex-none" />}
              <span className="truncate">{message.attachment.name}</span>
            </div>
          )}
        </div>
        <MessageDeleteButton onDelete={onDelete} disabled={deleteDisabled} />
      </div>
    </div>
  )
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

function measureTextareaContentHeight(input: HTMLTextAreaElement) {
  const clone = input.cloneNode() as HTMLTextAreaElement
  clone.removeAttribute('data-demo-id')
  clone.removeAttribute('id')
  clone.setAttribute('aria-hidden', 'true')
  clone.tabIndex = -1
  clone.value = input.value
  clone.placeholder = ''
  Object.assign(clone.style, {
    position: 'fixed',
    visibility: 'hidden',
    pointerEvents: 'none',
    inset: '0 auto auto 0',
    width: `${input.getBoundingClientRect().width}px`,
    height: '0px',
    minHeight: '0px',
    maxHeight: 'none',
    overflow: 'hidden',
  })
  document.body.appendChild(clone)
  const contentHeight = clone.scrollHeight
  clone.remove()
  return contentHeight
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
        Activity
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
  const [searchParams, setSearchParams] = useSearchParams()
  const isFirstRun = searchParams.get('firstRun') === '1'
  const { user } = useAuth()
  const [talkMemory, setTalkMemory] = useState('')
  const [memoryOwnerId, setMemoryOwnerId] = useState<string | null>(null)
  const [showMemory, setShowMemory] = useState(false)
  const [memoryDraft, setMemoryDraft] = useState('')
  const memoryRef = useRef('')
  useEffect(() => {
    if (!user?.id) return
    try {
      const saved = localStorage.getItem(`${TALK_MEMORY_KEY}${user.id}`) ?? ''
      if (saved.length > 1600) throw new Error('Saved memory exceeds its limit')
      memoryRef.current = saved
      setTalkMemory(saved)
      setMemoryDraft(saved)
      setMemoryOwnerId(user.id)
    } catch {
      toast.error('Talk could not read its memory on this device.')
      setMemoryOwnerId(null)
    }
  }, [user?.id])
  const saveTalkMemory = (value: string, preserveUnsavedDraft = false) => {
    if (!user?.id || memoryOwnerId !== user.id) throw new Error('Talk memory is not ready')
    const memory = value.trim()
    if (memory.length > 1600) throw new Error('Talk memory is too long')
    localStorage.setItem(`${TALK_MEMORY_KEY}${user.id}`, memory)
    const previous = memoryRef.current
    memoryRef.current = memory
    setTalkMemory(memory)
    setMemoryDraft((draft) => preserveUnsavedDraft && draft !== previous ? draft : memory)
  }
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
  const [showEarlierHistory, setShowEarlierHistory] = useState(false)
  const [talkMode, setTalkMode] = useState<TalkMode>('chat')
  const [draft, setDraft] = useState(() => {
    if (workContext) return workContext.prompt
    if (signalContext) return dailySignalTalkPrompt(signalContext)
    return handoffContext ? talkHandoffPrompt(handoffContext) : ''
  })
  const [isSending, setIsSending] = useState(false)
  const [model, setModel] = useState<AssistantChatModel>(MIN_TALK_MODEL)
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null)
  const [isChoosingAttachment, setIsChoosingAttachment] = useState(false)
  const [activeSpeechMessageId, setActiveSpeechMessageId] = useState<string | null>(null)
  const [talkRecovery, setTalkRecovery] = useState<TalkRecovery | null>(null)
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false)
  const [isEditingHistory, setIsEditingHistory] = useState(false)
  const [aiConsentDisclosure, setAiConsentDisclosure] = useState<AiConsentStatus['disclosure'] | null>(null)
  const [aiConsentError, setAiConsentError] = useState<string | null>(null)
  const [isAiConsentChecking, setIsAiConsentChecking] = useState(false)
  const [isAiConsentSaving, setIsAiConsentSaving] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const transcriptScrollStateRef = useRef({ scrollTop: 0, distanceFromBottom: 0 })
  const opensFreshSignalChatRef = useRef(isFirstRun || signalContext !== null || workContext !== null || handoffContext !== null)
  const skipNextPersistRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const pendingConversationSaveRef = useRef<StoredConversation | null>(null)
  const conversationsRef = useRef<StoredConversation[]>([])
  const saveQueuesRef = useRef(new Map<string, Promise<AssistantConversation>>())
  const activeRequestRef = useRef<AbortController | null>(null)
  const voiceHandlerRef = useRef<VoiceTalkHandler | null>(null)
  const voicePendingTaskRef = useRef<string | null>(null)
  const aiConsentCheckRef = useRef(false)
  const pendingAiActionRef = useRef<(() => Promise<void>) | null>(null)
  const shouldRefocusComposerRef = useRef(false)
  const {
    isListening,
    isPreparing,
    isDictationSupported,
    dictationError,
    dictationStatus,
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

    const resizeInput = () => {
      const styles = window.getComputedStyle(input)
      const minHeight = Number.parseFloat(styles.minHeight)
      const maxHeight = Number.parseFloat(styles.maxHeight)
      // A textarea in a flex item's intrinsic-size pass can report the flex
      // allocation as scrollHeight. Measure an off-flow twin at the same width so
      // the composer grows from its content instead of feeding back its container.
      const contentHeight = measureTextareaContentHeight(input)
      const nextHeight = Math.max(
        Number.isFinite(minHeight) ? minHeight : 0,
        Math.min(contentHeight, Number.isFinite(maxHeight) ? maxHeight : contentHeight),
      )
      input.style.height = `${nextHeight}px`
      input.style.overflowY = contentHeight > nextHeight ? 'auto' : 'hidden'

      if (document.activeElement === input && input.selectionStart === input.value.length) {
        input.scrollTop = input.scrollHeight
      }
    }

    let measuredWidth = input.getBoundingClientRect().width
    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width
      if (Math.abs(nextWidth - measuredWidth) < 0.5) return
      measuredWidth = nextWidth
      resizeInput()
    })
    resizeInput()
    resizeObserver.observe(input)
    const frame = window.requestAnimationFrame(resizeInput)
    return () => {
      resizeObserver.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [draft])

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scroll = messagesScrollRef.current
      if (scroll) {
        scroll.scrollTop = scroll.scrollHeight
        transcriptScrollStateRef.current = {
          scrollTop: scroll.scrollTop,
          distanceFromBottom: Math.max(0, scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight),
        }
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [messages])

  useEffect(() => {
    const scroll = messagesScrollRef.current
    if (!scroll) return

    let frame: number | null = null
    const rememberScrollPosition = () => {
      transcriptScrollStateRef.current = {
        scrollTop: scroll.scrollTop,
        distanceFromBottom: Math.max(0, scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight),
      }
    }
    const resizeObserver = new ResizeObserver(() => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      const previous = transcriptScrollStateRef.current
      frame = window.requestAnimationFrame(() => {
        if (previous.distanceFromBottom <= 48) {
          scroll.scrollTop = Math.max(
            0,
            scroll.scrollHeight - scroll.clientHeight - previous.distanceFromBottom,
          )
        } else {
          scroll.scrollTop = previous.scrollTop
        }
        rememberScrollPosition()
      })
    })

    rememberScrollPosition()
    scroll.addEventListener('scroll', rememberScrollPosition, { passive: true })
    resizeObserver.observe(scroll)
    return () => {
      scroll.removeEventListener('scroll', rememberScrollPosition)
      resizeObserver.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [])

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

  const flushPendingConversationSave = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    const pendingConversation = pendingConversationSaveRef.current
    if (!pendingConversation) return
    pendingConversationSaveRef.current = null
    queueConversationSave(pendingConversation).catch(() => {
      toast.error('Chat history is saved on this device, but could not sync to the server.')
    })
  }, [queueConversationSave])

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    if (!isHistoryLoaded || demoSession) return
    try {
      localStorage.setItem(
        ASSISTANT_CONVERSATIONS_KEY,
        JSON.stringify(conversations.slice(0, MAX_STORED_CONVERSATIONS)),
      )
    } catch {
      toast.error('Could not save chat history on this device.')
    }
  }, [conversations, demoSession, isHistoryLoaded])

  useEffect(() => {
    let canceled = false

    const loadConversations = async () => {
      if (demoSession) {
        setConversations([])
        setMessages([])
        setTalkMode('voice')
        setIsHistoryLoaded(true)
        return
      }

      try {
        const serverConversations = await aiService.getConversations()
        const localConversations = readStoredConversations()
        const {
          conversations: mergedConversations,
          localConversationsToSync,
        } = mergeConversationSnapshots(serverConversations, localConversations)

        if (canceled) return
        setConversations(mergedConversations)
        const firstConversation = mergedConversations[0]
        if (firstConversation && !opensFreshSignalChatRef.current) {
          skipNextPersistRef.current = firstConversation.messages.length > 0
          setActiveConversationId(firstConversation.id)
          setMessages(firstConversation.messages)
          setModel(availableTalkModel(firstConversation.model))
          setTalkMode('chat')
        } else {
          setTalkMode('voice')
        }

        if (localConversationsToSync.length > 0) {
          void Promise.all(localConversationsToSync.map(queueConversationSave))
            .then(() => localStorage.setItem(ASSISTANT_CONVERSATIONS_MIGRATED_KEY, 'true'))
            .catch(() => toast.error('Chat history is saved on this device, but could not sync to the server.'))
        }
        setIsHistoryLoaded(true)
      } catch {
        const localConversations = readStoredConversations()
        if (canceled) return
        setConversations(localConversations)
        const firstConversation = localConversations[0]
        if (firstConversation && !opensFreshSignalChatRef.current) {
          skipNextPersistRef.current = firstConversation.messages.length > 0
          setActiveConversationId(firstConversation.id)
          setMessages(firstConversation.messages)
          setModel(availableTalkModel(firstConversation.model))
          setTalkMode('chat')
        } else {
          setTalkMode('voice')
        }
        setIsHistoryLoaded(true)
        toast.error('Could not load saved chats from the server.')
      }
    }

    loadConversations()

    return () => {
      canceled = true
      flushPendingConversationSave()
    }
  }, [demoSession, flushPendingConversationSave, queueConversationSave])

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
    pendingConversationSaveRef.current = conversation
    saveTimerRef.current = window.setTimeout(flushPendingConversationSave, 350)
  }, [activeConversationId, demoSession, flushPendingConversationSave, isHistoryLoaded, messages, model])

  const apiMessages = useMemo(
    () => messages
      .filter((message) => !message.error)
      .map(({ role, content }) => ({ role, content })),
    [messages]
  )
  const earlierConversations = useMemo(
    () => conversations
      .filter((conversation) => conversation.id !== activeConversationId)
      .slice()
      .sort((first, second) => new Date(first.updatedAt).getTime() - new Date(second.updatedAt).getTime()),
    [activeConversationId, conversations],
  )
  const earlierHistoryDays = useMemo(() => {
    const days: Array<{ key: string; label: string; messages: Array<{ conversationId: string; message: AssistantStoredMessage }> }> = []
    earlierConversations.forEach((conversation) => {
      if (conversation.messages.length === 0) return
      const conversationDay = conversation.messages[0]?.createdAt ?? conversation.createdAt
      const key = conversationDayKey(conversationDay)
      const existingDay = days.find((day) => day.key === key)
      const entries = conversation.messages.map((message) => ({ conversationId: conversation.id, message }))
      if (existingDay) {
        existingDay.messages.push(...entries)
      } else {
        days.push({
          key,
          label: conversationDayLabel(conversationDay),
          messages: entries,
        })
      }
    })
    return days
  }, [earlierConversations])
  const activeConversationLabel = conversationDayLabel(
    conversations.find((conversation) => conversation.id === activeConversationId)?.updatedAt
      ?? new Date().toISOString(),
  )

  const runAfterAiConsent = async (
    action: () => Promise<void>,
    bypassConsent = false,
  ) => {
    if (bypassConsent || demoSession) {
      await action()
      return
    }
    if (aiConsentCheckRef.current) return

    aiConsentCheckRef.current = true
    setIsAiConsentChecking(true)
    let mayRun = false
    try {
      const status = await aiConsentService.getStatus()
      if (status.state === 'accepted') {
        mayRun = true
      } else {
        pendingAiActionRef.current = action
        setAiConsentError(null)
        setAiConsentDisclosure(status.disclosure)
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error ?? 'AI permission could not be checked. Nothing was sent.')
    } finally {
      aiConsentCheckRef.current = false
      setIsAiConsentChecking(false)
    }

    if (mayRun) await action()
  }

  const allowAiFeatures = async () => {
    if (!aiConsentDisclosure || isAiConsentSaving) return
    setIsAiConsentSaving(true)
    setAiConsentError(null)
    let pendingAction: (() => Promise<void>) | null = null
    try {
      const status = await aiConsentService.decide(aiConsentDisclosure.version, 'accepted')
      if (status.state !== 'accepted') throw new Error('AI permission was not accepted.')
      pendingAction = pendingAiActionRef.current
      pendingAiActionRef.current = null
      setAiConsentDisclosure(null)
    } catch (error: any) {
      const message = error.response?.data?.error
        ?? (error instanceof Error ? error.message : 'AI permission could not be saved.')
      setAiConsentError(message)
      if (error.response?.status === 409) {
        try {
          const current = await aiConsentService.getStatus()
          setAiConsentDisclosure(current.disclosure)
        } catch {
          // The original explicit error stays visible; a failed refresh is not
          // converted into an invented current disclosure.
        }
      }
    } finally {
      setIsAiConsentSaving(false)
    }

    if (pendingAction) await pendingAction()
  }

  const continueWithoutAi = async () => {
    if (!aiConsentDisclosure || isAiConsentSaving) return
    setIsAiConsentSaving(true)
    setAiConsentError(null)
    try {
      await aiConsentService.decide(aiConsentDisclosure.version, 'declined')
    } catch (error: any) {
      toast.error(error.response?.data?.error ?? 'Nothing was sent, but this choice could not be saved.')
    } finally {
      pendingAiActionRef.current = null
      setAiConsentDisclosure(null)
      setIsAiConsentSaving(false)
      window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    }
  }

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

      const response = await sendPlannedTalkChat(request.messages, request.model, request.attachment, {
        conversationId: request.conversationId,
        workflow: request.workflow,
        assistantContext: request.assistantContext,
        talkMemory: request.talkMemory,
        handoff: request.handoff,
        review: request.review,
        signal: controller.signal,
      })
      assertTalkHandoffPendingActions(request.handoff ?? null, response.pendingActions)
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.message,
          toolEvents: response.toolEvents,
          pendingActions: response.pendingActions,
          createdAt: new Date().toISOString(),
        },
      ])
      // The answer is already visible. Memory is a separate, non-billable
      // internal pass over the user's words only; its failure never erases it.
      const latestUserMessage = request.messages.at(-1)
      if (latestUserMessage?.role === 'user' && memoryOwnerId === user?.id) {
        const before = memoryRef.current
        try {
          const updated = await aiService.updateTalkMemory(latestUserMessage.content, before)
          if (memoryRef.current === before && updated.memory !== before) saveTalkMemory(updated.memory, true)
        } catch {
          toast.error('Talk answered, but could not update its memory. You can retry next time.')
        }
      }
    } catch (error: any) {
      if (controller.signal.aborted || error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') {
        setTalkRecovery({ kind: 'canceled', request })
        return
      }

      const refusalCode = error.response?.data?.code
      let message = error.response?.data?.error
        ?? (error instanceof Error ? error.message : 'Assistant unavailable')
      if (refusalCode === 'insufficient_credits') {
        try {
          const exhaustion = actionExhaustionView(await creditsService.getSummary())
          if (exhaustion?.kind === 'guest' || exhaustion?.kind === 'network') {
            message = `${exhaustion.title}\n\n${exhaustion.detail} [Create a free account](/claim), or [ask the Founders Club for more free actions](/settings/account-billing#founders-club).`
          } else if (exhaustion?.kind === 'email_unverified') {
            // Settings is where the resend button already lives, next to the
            // address itself — so this points there rather than growing a second
            // copy of the same action inside the chat.
            message = `${exhaustion.title}\n\n${exhaustion.detail} [Confirm your email](/settings/account-billing).`
          } else if (exhaustion?.kind === 'monthly') {
            const renewalDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' })
              .format(new Date(exhaustion.nextAvailableAt))
            message = `${exhaustion.title}\n\nYour next 15 free AI actions become available on ${renewalDate}. You can also [ask the Founders Club for more free actions](/settings/account-billing#founders-club).`
          } else {
            message = `${exhaustion?.title ?? 'Action availability is unavailable.'}\n\n${exhaustion?.detail ?? 'HealthyFlow could not read your free-action entitlement.'}`
          }
        } catch {
          message = 'Action availability is unavailable.\n\nHealthyFlow could not read your free-action entitlement.'
        }
      }
      const errorMessageId = crypto.randomUUID()
      if (refusalCode !== 'insufficient_credits') toast.error(message)
      setMessages((current) => [
        ...current,
        {
          id: errorMessageId,
          role: 'assistant',
          content: message,
          error: true,
          createdAt: new Date().toISOString(),
        },
      ])
      setTalkRecovery({ kind: 'failed', request, errorMessageId })
    } finally {
      if (activeRequestRef.current === controller) activeRequestRef.current = null
      shouldRefocusComposerRef.current = true
      setIsSending(false)
    }
  }

  const performSendMessage = async (
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
      review?: TalkReviewContext
    } = {}
  ) => {
    const trimmed = content.trim()
    if ((!trimmed && !messageAttachment) || activeRequestRef.current) return
    const entryPoint: TalkEntryPoint = options.entryPoint
      ?? handoffContext?.source
      ?? (workContext ? 'work' : signalContext ? 'daily_signal' : isFirstRun ? 'first_run' : 'talk')
    const effectiveModel = availableTalkModel(requestModel)
    analytics.capture('ai_question_asked', {
      surface: 'talk',
      entry_point: entryPoint,
      has_attachment: Boolean(messageAttachment),
      model: effectiveModel,
    })
    const userContent = trimmed || `Review the attached ${messageAttachment?.kind === 'image' ? 'image' : 'file'}.`

    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent,
      displayContent,
      attachment: messageAttachment ? attachmentMetadata(messageAttachment) : undefined,
      createdAt: new Date().toISOString(),
    }
    const nextMessages = boundedChatContext([
      ...baseMessages,
      { role: 'user' as const, content: userContent },
    ])

    setMessages((current) => [...current, userMessage])
    setTalkMode('chat')
    setShowEarlierHistory(false)
    setDraft('')
    setAttachment(null)
    if (isFirstRun) {
      const next = new URLSearchParams(searchParams)
      next.delete('firstRun')
      setSearchParams(next, { replace: true })
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
    await runTalkRequest({
      messages: nextMessages,
      model: effectiveModel,
      attachment: requestAttachment,
      conversationId: options.conversationId ?? activeConversationId,
      workflow: options.workflow ?? workContext?.workflow,
      assistantContext,
      talkMemory: memoryOwnerId === user?.id ? memoryRef.current : undefined,
      handoff: handoffContext?.intent === 'draft_workout_plan' ? handoffContext : undefined,
      review: options.review,
      forceMock: Boolean(options.forceMock),
    })
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
      review?: TalkReviewContext
    } = {}
  ) => {
    const trimmed = content.trim()
    if ((!trimmed && !messageAttachment) || activeRequestRef.current || aiConsentCheckRef.current) return
    await runAfterAiConsent(
      () => performSendMessage(
        content,
        messageAttachment,
        baseMessages,
        requestModel,
        displayContent,
        options,
      ),
      Boolean(options.forceMock),
    )
  }

  const cancelTalkRequest = () => {
    activeRequestRef.current?.abort()
  }

  const retryTalkRequest = async () => {
    if (!talkRecovery || activeRequestRef.current) return
    await runAfterAiConsent(async () => {
      if (talkRecovery.errorMessageId) {
        setMessages((current) => current.filter((message) => message.id !== talkRecovery.errorMessageId))
      }
      await runTalkRequest(talkRecovery.request)
    }, talkRecovery.request.forceMock)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    sendMessage(draft)
  }

  const reviewRequestRef = useRef<string | null>(null)

  useEffect(() => {
    const review = searchParams.get('review')
    if (!review) {
      reviewRequestRef.current = null
      return
    }
    const requestKey = searchParams.toString()
    if (
      reviewRequestRef.current === requestKey
      || !isHistoryLoaded
      || isSending
      || isAiConsentChecking
      || isAiConsentSaving
      || assistantSettingsResolution === 'loading'
      || goalsResolution === 'loading'
    ) return
    if (review !== 'daily' && review !== 'weekly') return
    reviewRequestRef.current = requestKey

    ;(async () => {
      try {
        const requestedDate = searchParams.get('date')
        if (requestedDate && !IsoDateSchema.safeParse(requestedDate).success) {
          throw new Error('This review link has an invalid date.')
        }
        const date = requestedDate ?? format(new Date(), 'yyyy-MM-dd')
        const dates = review === 'daily'
          ? [date]
          : Array.from({ length: 7 }, (_, index) => format(subDays(new Date(`${date}T12:00:00`), 6 - index), 'yyyy-MM-dd'))
        const reads = await Promise.allSettled(dates.map((value) => daySummaryService.get(value)))
        const available = reads.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
        const failedDates = dates.filter((_, index) => reads[index].status === 'rejected')
        if (review === 'daily' && failedDates.length > 0) {
          throw new Error('Today’s records could not be read. The review did not start.')
        }
        if (review === 'weekly' && available.length === 0) {
          throw new Error('This week’s records could not be read. The review did not start.')
        }
        const reviewContext: TalkReviewContext = {
          kind: review,
          days: reads.map((result, index) => result.status === 'fulfilled'
            ? reviewDayEvidence(result.value).evidence
            : { date: dates[index], status: 'unavailable', reasonCode: 'day_read_failed' }),
        }
        const prompt = review === 'daily' ? dailyReviewPrompt(date) : weeklyReviewPrompt(dates)
        const next = new URLSearchParams(searchParams)
        next.delete('review')
        next.delete('date')
        setSearchParams(next, { replace: true })
        await sendMessage(
          prompt,
          null,
          apiMessages,
          model,
          review === 'daily' ? 'Review today' : 'Review my week',
          { conversationId: activeConversationId, entryPoint: 'kickoff', review: reviewContext },
        )
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not start the review.')
      }
    })()
    // The review waits for the ongoing Talk conversation and user-owned context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantSettingsResolution, goalsResolution, isAiConsentChecking, isAiConsentSaving, isHistoryLoaded, isSending, searchParams])

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

  const chooseAttachment = async () => {
    if (!isNativeIOS) {
      fileInputRef.current?.click()
      return
    }
    setIsChoosingAttachment(true)
    try {
      const file = await chooseNativeTalkAttachment()
      if (file) await handleAttachmentChange(file)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open the attachment picker')
    } finally {
      setIsChoosingAttachment(false)
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
      await applyConfirmedTalkActionToLocalDay(response.action, response.result)
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
        await runAfterAiConsent(async () => {
          setIsSending(true)
          try {
            const continued = await aiService.continueChatWorkflow(
              activeConversationId,
              model,
              await assistantContextWithCalendar(assistantContext),
            )
            if (continued) {
              setMessages((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: continued.message,
                  toolEvents: continued.toolEvents,
                  pendingActions: continued.pendingActions,
                  createdAt: new Date().toISOString(),
                },
              ])
            }
          } catch (error: any) {
            const message = error.response?.data?.error ?? 'Assistant unavailable'
            toast.error(message)
          } finally {
            setIsSending(false)
          }
        })
      } else if (!hasOtherPendingActions) {
        await runAfterAiConsent(async () => {
          const hiddenContinuation: ConversationMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: continuationPrompt(response.action, response.result),
            displayContent: 'Confirmed',
            hidden: true,
            createdAt: new Date().toISOString(),
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
              talkMemory: memoryOwnerId === user?.id ? memoryRef.current : undefined,
              ...await chatContextWithCalendar(assistantContext, nextMessages),
            })
            setMessages((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: nextResponse.message,
                toolEvents: nextResponse.toolEvents,
                pendingActions: nextResponse.pendingActions,
                createdAt: new Date().toISOString(),
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
                createdAt: new Date().toISOString(),
              },
            ])
          } finally {
            setIsSending(false)
            inputRef.current?.focus()
          }
        })
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

  // The opt-in native Shortcut enters through Layout, but every AI turn and
  // confirmed write still belongs to Talk and uses its existing conversation.
  voiceHandlerRef.current = {
    request: async (text, signal) => {
      if (demoSession) throw new Error('Voice Task creation is unavailable in a demo session.')
      if (activeRequestRef.current || isSending) throw new Error('Talk is already responding. Try again when it finishes.')
      if (messages.some((message) => message.pendingActions?.some((action) =>
        action.status !== 'confirmed' && action.status !== 'canceled'
      ))) throw new Error('Talk has a pending proposal. Review it before starting another voice Task.')

      const consent = await aiConsentService.getStatus()
      if (consent.state !== 'accepted') {
        setAiConsentDisclosure(consent.disclosure)
        throw new Error('Open Talk and allow AI data sharing before using hands-free Tasks. Nothing was sent.')
      }
      if (signal.aborted) throw new Error('Voice session stopped. Nothing was sent.')

      const controller = new AbortController()
      const abort = () => controller.abort()
      signal.addEventListener('abort', abort, { once: true })
      activeRequestRef.current = controller
      setIsSending(true)
      setTalkRecovery(null)
      const userMessage: ConversationMessage = { id: crypto.randomUUID(), role: 'user', content: text, createdAt: new Date().toISOString() }
      const nextMessages = boundedChatContext([...apiMessages, { role: 'user' as const, content: text }])
      setMessages((current) => [...current, userMessage])
      analytics.capture('ai_question_asked', { surface: 'talk', entry_point: 'talk', has_attachment: false, model })
      try {
        const response = await sendPlannedTalkChat(nextMessages, model, undefined, {
          conversationId: activeConversationId,
          assistantContext,
          signal: controller.signal,
        })
        const voiceResponse = VoiceTalkResponseSchema.parse(response)
        voicePendingTaskRef.current = voiceResponse.pendingActions.length === 1
          && voiceResponse.pendingActions[0].capability === 'add_task'
          ? voiceResponse.pendingActions[0].id : null
        setMessages((current) => [...current, {
          id: crypto.randomUUID(), role: 'assistant', content: response.message,
          toolEvents: response.toolEvents, pendingActions: response.pendingActions,
          createdAt: new Date().toISOString(),
        }])
        return voiceResponse
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : 'Talk could not prepare a proposal.'
          setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: message, error: true, createdAt: new Date().toISOString() }])
        }
        throw error
      } finally {
        signal.removeEventListener('abort', abort)
        if (activeRequestRef.current === controller) activeRequestRef.current = null
        setIsSending(false)
      }
    },
    confirm: async (actionId) => {
      if (voicePendingTaskRef.current !== actionId) throw new Error('The spoken Task is no longer the current proposal.')
      const response = await aiService.confirmChatAction(actionId)
      const storedLocally = await applyConfirmedTalkActionToLocalDay(response.action, response.result)
      if (!storedLocally) throw new Error('The confirmed Task was not written to the Local day on this iPhone.')
      await verifyConfirmedTalkTaskOnDevice(response.result)
      await invalidatePendingActionQueries(queryClient, response.action)
      voicePendingTaskRef.current = null
      setMessages((current) => current.map((message) => ({
        ...message,
        pendingActions: message.pendingActions?.map((action) => action.id === actionId
          ? { ...response.action, status: 'confirmed' as const, result: response.result, completedAt: new Date().toISOString() }
          : action),
      })))
    },
    cancel: async (actionId) => {
      if (voicePendingTaskRef.current !== actionId) throw new Error('The spoken Task is no longer the current proposal.')
      const canceled = await aiService.cancelChatAction(actionId)
      voicePendingTaskRef.current = null
      setMessages((current) => current.map((message) => ({
        ...message,
        pendingActions: message.pendingActions?.map((action) => action.id === actionId
          ? { ...canceled, status: 'canceled' as const, completedAt: new Date().toISOString() }
          : action),
      })))
    },
  }

  useEffect(() => registerVoiceTalkHandler({
    request: (text, signal) => voiceHandlerRef.current!.request(text, signal),
    confirm: (actionId) => voiceHandlerRef.current!.confirm(actionId),
    cancel: (actionId) => voiceHandlerRef.current!.cancel(actionId),
  }), [])

  const deleteMessage = (conversationId: string, messageId: string) => {
    if (isEditingHistory || isSending || activeRequestRef.current) return
    const conversation = conversationsRef.current.find((item) => item.id === conversationId)
    const message = conversation?.messages.find((item) => item.id === messageId)
    if (!conversation || !message) return
    if (message.pendingActions?.some((action) => action.status !== 'confirmed' && action.status !== 'canceled')) {
      toast.error('Finish or cancel this proposal before deleting its message.')
      return
    }
    if (!window.confirm('Delete this message from Talk?')) return

    const remaining = conversation.messages.filter((item) => item.id !== messageId)
    const nextConversation: StoredConversation = {
      ...conversation,
      title: titleFromMessages(remaining),
      updatedAt: nextConversationUpdatedAt(conversation),
      messages: remaining,
    }
    const nextConversations = conversationsRef.current.map((item) => item.id === conversationId ? nextConversation : item)
    conversationsRef.current = nextConversations
    setConversations(nextConversations)
    if (conversationId === activeConversationId) {
      if (activeSpeechMessageId === messageId) {
        stopSpeech()
        setActiveSpeechMessageId(null)
      }
      if (talkRecovery?.errorMessageId === messageId) setTalkRecovery(null)
      setMessages(remaining as ConversationMessage[])
    }
    if (!demoSession) {
      void queueConversationSave(nextConversation).catch(() => {
        toast.error('Message deleted on this device, but could not sync to the server.')
      })
    }
  }

  const resetTalkForTesting = async () => {
    if (user?.role !== 'admin' || isEditingHistory || isSending || activeRequestRef.current) return
    if (!window.confirm('Reset Talk conversations and assistant memory on this device, and archive the conversations in your account for testing? Pending proposals in those conversations will no longer appear in Talk.')) return
    setIsEditingHistory(true)
    const archivedIds = new Set<string>()
    let resetError: string | null = null
    try {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      const pending = pendingConversationSaveRef.current
      pendingConversationSaveRef.current = null
      const pendingSave = pending ? queueConversationSave(pending) : null
      await Promise.all([...saveQueuesRef.current.values(), ...(pendingSave ? [pendingSave] : [])])

      let batch = conversationsRef.current
      while (batch.length > 0) {
        for (const conversation of batch) {
          if (!demoSession) await aiService.deleteConversation(conversation.id)
          archivedIds.add(conversation.id)
        }
        if (demoSession) break
        batch = await aiService.getConversations()
        if (batch.some((conversation) => archivedIds.has(conversation.id))) {
          throw new Error('Archived Talk conversations still appear on the server. Try again.')
        }
      }
    } catch (error) {
      resetError = error instanceof Error ? error.message : 'Talk reset could not finish. Try again.'
    }

    try {
      const remaining = conversationsRef.current.filter((conversation) => !archivedIds.has(conversation.id))
      if (!demoSession && archivedIds.size > 0) {
        localStorage.setItem(ASSISTANT_CONVERSATIONS_KEY, JSON.stringify(remaining))
      }
      conversationsRef.current = remaining
      setConversations(remaining)
      if (archivedIds.size > 0) {
        setActiveConversationId(crypto.randomUUID())
        setMessages([])
        setTalkRecovery(null)
        setAttachment(null)
        setDraft('')
        setShowEarlierHistory(false)
        setTalkMode('chat')
        stopSpeech()
      }
      if (!resetError) saveTalkMemory('')
    } catch {
      resetError = 'Talk history was archived, but this device could not clear its copy.'
    } finally {
      setIsEditingHistory(false)
    }
    if (resetError) {
      toast.error(`Talk reset did not finish: ${resetError}`)
    } else {
      toast.success('Talk reset for testing.')
    }
  }

  const isCaptureMode = isHistoryLoaded && talkMode === 'voice' && !showEarlierHistory

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl overflow-hidden lg:h-[calc(100dvh-7rem)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-page lg:rounded-[1.75rem] lg:border lg:border-line lg:shadow-section">
      <div className={`flex items-center justify-between gap-3 px-5 lg:px-6 ${
        isCaptureMode ? 'pb-3 pt-7 lg:pb-4 lg:pt-6' : 'border-b border-line py-3.5 lg:py-4'
      }`}>
        <div className="min-w-0 flex-1">
          <h1 className={`${isCaptureMode ? 'text-[2rem]' : 'text-xl'} font-semibold tracking-tight text-ink`}>Talk</h1>
          <p className={`${isCaptureMode ? 'mt-1 text-sm' : 'truncate text-xs sm:text-sm'} leading-5 text-ink-muted`}>
            {!isHistoryLoaded
              ? 'Loading your conversation…'
              : isCaptureMode
                ? 'Say your day, any order'
                : 'About your day'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isHistoryLoaded && (
            <div className="flex items-center rounded-full border border-line bg-sunken p-1" aria-label="Talk mode">
              <button
                type="button"
                onClick={() => {
                  setTalkMode('chat')
                  setShowEarlierHistory(false)
                }}
                aria-label="Chat mode"
                aria-pressed={talkMode === 'chat'}
                className={`flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors ${
                  talkMode === 'chat' ? 'bg-card text-ink shadow-section' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                <span>Chat</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTalkMode('voice')
                  setShowEarlierHistory(false)
                }}
                aria-label="Voice mode"
                aria-pressed={talkMode === 'voice'}
                className={`flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors ${
                  talkMode === 'voice' ? 'bg-card text-ink shadow-section' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Mic className="h-4 w-4" aria-hidden="true" />
                <span>Voice</span>
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setTalkMode('chat')
              setShowEarlierHistory((visible) => !visible)
            }}
            disabled={!isHistoryLoaded}
            aria-expanded={showEarlierHistory}
            aria-label={showEarlierHistory ? 'Hide earlier conversation history' : 'Show earlier conversation history'}
            className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
              showEarlierHistory ? 'bg-accent/15 text-accent' : 'text-ink-soft hover:bg-card hover:text-accent'
            }`}
          >
            <History className="h-5 w-5" />
          </button>
          {isSending && activeRequestRef.current ? (
            <button
              type="button"
              onClick={cancelTalkRequest}
              className="rounded-full border border-line bg-card px-3 py-2 text-sm font-medium text-accent transition-colors hover:border-accent/50"
              aria-label="Cancel response"
            >
              Cancel
            </button>
          ) : isSending ? <span className="text-sm text-accent">Thinking</span> : null}
        </div>
      </div>

      <div className="border-b border-line px-4 py-2">
        <button
          type="button"
          onClick={() => {
            setMemoryDraft(memoryOwnerId === user?.id ? talkMemory : '')
            setShowMemory((visible) => !visible)
          }}
          aria-expanded={showMemory}
          className="text-xs font-medium text-accent underline underline-offset-2"
        >
          {showMemory ? 'Hide Talk memory' : 'What Talk remembers'}
        </button>
        {showMemory && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-ink-muted">Talk updates these notes from what you say. They shape replies but do not count as verified Calendar or Today records. Saved on this device.</p>
            <label htmlFor="talk-memory" className="sr-only">Talk memory</label>
            <textarea
              id="talk-memory"
              value={memoryOwnerId === user?.id ? memoryDraft : ''}
              onChange={(event) => setMemoryDraft(event.target.value)}
              maxLength={1600}
              rows={4}
              placeholder="Talk has not remembered anything yet."
              className="w-full rounded-xl border border-line bg-card p-3 text-sm text-ink"
            />
            <div className="flex gap-3">
              <button type="button" className="text-sm font-medium text-accent" onClick={() => {
                try { saveTalkMemory(memoryDraft); toast.success('Talk memory saved.') }
                catch { toast.error('Talk could not save its memory on this device.') }
              }}>Save memory</button>
              <button type="button" className="text-sm text-state-danger" onClick={() => {
                try { saveTalkMemory(''); toast.success('Talk memory cleared.') }
                catch { toast.error('Talk could not clear its memory on this device.') }
              }}>Clear memory</button>
            </div>
          </div>
        )}
      </div>

      {apiMessages.length >= MAX_CHAT_CONTEXT_MESSAGES && (
        <p className="border-b border-card bg-page/60 px-4 py-2 text-xs text-ink-muted" role="note">
          Talk uses the latest 30 messages as context; your full chat remains saved.
        </p>
      )}

      {showEarlierHistory && user?.role === 'admin' && (
        <div className="border-b border-line px-4 py-2 text-right">
          <button
            type="button"
            onClick={() => void resetTalkForTesting()}
            disabled={isEditingHistory || isSending || conversations.length === 0}
            className="rounded-md px-2 py-1.5 text-xs font-medium text-state-danger hover:bg-state-danger/10 disabled:opacity-40"
          >
            {isEditingHistory ? 'Resetting Talk…' : 'Reset Talk for testing'}
          </button>
        </div>
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

      <div ref={messagesScrollRef} className={`${isCaptureMode ? 'hidden' : 'assistant-messages-scroll'} min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pt-5 lg:px-6 lg:pb-6`}>
        {!isHistoryLoaded && (
          <div className="flex h-full items-center justify-center" role="status">
            <span className="text-sm text-ink-muted">Loading conversation…</span>
          </div>
        )}
        {showEarlierHistory && earlierHistoryDays.length === 0 && (
          <p className="mx-auto w-fit rounded-full bg-card px-4 py-2 text-xs text-ink-muted" role="status">
            No earlier conversations yet.
          </p>
        )}
        {showEarlierHistory && earlierHistoryDays.map((day) => (
          <section key={day.key} className="space-y-3" aria-label={`${day.label} conversation`}>
            <ConversationDayDivider>{day.label}</ConversationDayDivider>
            {day.messages.map(({ conversationId, message }) => (
              <HistoricalMessage
                key={message.id}
                message={message}
                onDelete={() => deleteMessage(conversationId, message.id)}
                deleteDisabled={isEditingHistory || isSending}
              />
            ))}
          </section>
        ))}
        {showEarlierHistory && earlierHistoryDays.length > 0 && (
          <ConversationDayDivider>{activeConversationLabel}</ConversationDayDivider>
        )}
        {!showEarlierHistory && earlierHistoryDays.length > 0 && (
          <button
            type="button"
            onClick={() => setShowEarlierHistory(true)}
            className="mx-auto flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-xs font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
          >
            <History className="h-3.5 w-3.5" />
            Show earlier days
          </button>
        )}
        {isHistoryLoaded && talkMode === 'chat' && !showEarlierHistory && messages.length === 0 && (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="max-w-xs text-sm leading-6 text-ink-muted">
              Start a conversation, or switch to Voice to say your day aloud.
            </p>
          </div>
        )}
        {messages.length > 0 && (
          messages.filter((message) => !message.hidden).map((message) => (
            <div
              key={message.id}
              className={`mx-auto flex w-full max-w-3xl ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`min-w-0 ${message.role === 'user' ? 'max-w-[88%]' : 'w-full max-w-[92%]'}`}>
                <div
                  className={`break-words rounded-[1.5rem] px-4 py-3 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'whitespace-pre-wrap rounded-br-md bg-action text-on-action'
                      : message.error
                        ? 'rounded-tl-md border border-state-danger/40 bg-state-danger/10 text-state-danger'
                        : 'rounded-tl-md bg-card text-ink shadow-section'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <MarkdownMessage content={message.content} />
                  ) : (
                    message.displayContent ?? message.content
                  )}
                  {message.attachment && (
                    <div className={`mt-2 inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-xs ${
                      message.role === 'user' ? 'bg-black/10 text-on-action' : 'bg-sunken text-ink-soft'
                    }`}>
                      {message.attachment.kind === 'image' ? <ImageIcon className="h-3.5 w-3.5 flex-none" /> : <Paperclip className="h-3.5 w-3.5 flex-none" />}
                      <span className="truncate">{message.attachment.name}</span>
                    </div>
                  )}
                </div>
                <MessageDeleteButton
                  onDelete={() => deleteMessage(activeConversationId, message.id)}
                  disabled={isEditingHistory || isSending}
                />
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
                {message.pendingActions && message.pendingActions.length > 0 && (
                  <>
                    <PendingActionDeck actions={message.pendingActions} onConfirm={confirmAction} onCancel={cancelAction} />
                    <ConfirmedProposalReceipt actions={message.pendingActions} />
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {isHistoryLoaded && (
      <form onSubmit={submit} className={`assistant-composer-form z-20 bg-page/95 backdrop-blur ${
        isCaptureMode
          ? 'assistant-capture-form flex min-h-0 flex-1 flex-col px-5 pb-5 pt-2 lg:px-8 lg:pb-8'
          : 'flex-none border-t border-line px-3 pt-3 lg:px-6 lg:pb-4'
      }`}>
        {talkRecovery && (
          <div className="mb-2 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-state-warning/40 bg-state-warning/10 px-3 py-2 text-sm" role="status">
            <span className="text-ink">
              {talkRecovery.kind === 'canceled' ? 'Response canceled.' : 'Response failed.'}
            </span>
            <button
              type="button"
              onClick={() => void retryTalkRequest()}
              disabled={isSending || isAiConsentChecking || isAiConsentSaving}
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
        {dictationError && <p className="mb-2 text-xs text-state-danger" role="alert">{dictationError}</p>}
        {dictationStatus && !dictationError && (
          <p className="mb-2 text-xs text-ink-muted" role="status">{dictationStatus}</p>
        )}
        <div
          data-testid={isCaptureMode ? 'talk-voice-capture' : undefined}
          className={`assistant-composer mx-auto w-full max-w-3xl border border-line bg-card shadow-section transition-colors focus-within:border-accent/70 ${
          isCaptureMode
            ? 'flex min-h-0 flex-1 flex-col rounded-[2rem] px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-6'
            : 'rounded-[1.55rem] px-3 py-2.5 sm:p-3'
        }`}
        >
          <div className={isCaptureMode ? 'min-h-0 flex-1' : 'min-w-0'}>
            <textarea
              ref={inputRef}
              data-demo-id="talk-input"
              className={`w-full resize-none bg-transparent px-1 py-1 text-ink outline-none placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-60 ${
                isCaptureMode
                  ? 'max-h-[45dvh] min-h-40 text-xl font-medium leading-8 sm:min-h-52 sm:text-2xl sm:leading-9'
                  : 'max-h-28 min-h-8 text-base leading-6 sm:max-h-36'
              }`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={(event) => void handleComposerPaste(event)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  sendMessage(draft)
                }
              }}
              placeholder={isListening ? 'Listening…' : 'Say it or type it…'}
              aria-label="Message Talk"
              disabled={isSending}
              rows={1}
            />
          </div>
          <div className={`${isCaptureMode ? 'mt-4 border-t border-line/70 pt-3' : 'mt-2'} flex min-w-0 items-center gap-2`}>
            <button
              type="button"
              onClick={() => void chooseAttachment()}
              disabled={isSending || isAiConsentChecking || isAiConsentSaving || isChoosingAttachment}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={attachment ? 'Replace attachment' : 'Attach file'}
            >
              <Paperclip size={20} className="flex-none" />
            </button>
            <select
              value={model}
              onChange={(event) => setModel(event.target.value as AssistantChatModel)}
              disabled={isSending || isAiConsentChecking || isAiConsentSaving}
              className="h-9 min-w-0 max-w-[8.5rem] rounded-full border border-transparent bg-sunken px-3 text-xs font-medium text-ink-soft outline-none transition-colors hover:text-ink focus:border-accent disabled:opacity-60 sm:max-w-48"
              aria-label="Assistant model"
            >
              {assistantModels.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {!isCaptureMode && <div className="min-w-0 flex-1" />}
            {!isCaptureMode && (
              <button
                type="button"
                onClick={toggleDictation}
                disabled={isSending || isAiConsentChecking || isAiConsentSaving || !isDictationSupported || isPreparing}
                className={`flex h-11 w-11 flex-none items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 ${isListening || isPreparing ? 'bg-accent/20 text-accent' : ''}`}
                aria-label={isPreparing ? 'Preparing dictation' : isListening ? 'Stop dictation' : 'Start dictation'}
                aria-pressed={isListening}
              >
                {isListening ? <Square size={18} className="flex-none" /> : <Mic size={20} className="flex-none" />}
              </button>
            )}
            {!isCaptureMode && (
              <button
                type="submit"
                data-demo-id="talk-send-button"
                disabled={isSending || isAiConsentChecking || isAiConsentSaving || (!draft.trim() && !attachment)}
                className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-action text-on-action transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send"
              >
                <Send size={20} className="flex-none" />
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,text/plain,text/markdown,.txt,.md"
            onChange={(event) => void handleAttachmentChange(event.target.files?.[0])}
          />
        </div>
        {isCaptureMode && (
          <div className="relative mx-auto mt-5 flex w-full max-w-3xl flex-none items-center justify-center sm:mt-7">
            <button
              type="button"
              onClick={toggleDictation}
              disabled={isSending || isAiConsentChecking || isAiConsentSaving || !isDictationSupported || isPreparing}
              className={`relative flex h-[5.25rem] w-[5.25rem] flex-none items-center justify-center rounded-full bg-action text-on-action shadow-overlay transition-transform hover:bg-action-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                isListening ? 'talk-capture-mic-listening' : ''
              }`}
              aria-label={isPreparing ? 'Preparing dictation' : isListening ? 'Stop dictation' : 'Start dictation'}
              aria-pressed={isListening}
            >
              {isListening ? <Square size={26} className="flex-none" /> : <Mic size={30} className="flex-none" />}
            </button>
            {(draft.trim() || attachment) && (
              <button
                type="submit"
                data-demo-id="talk-send-button"
                disabled={isSending || isAiConsentChecking || isAiConsentSaving}
                className="absolute right-0 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-page shadow-section transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send"
              >
                <Send size={22} className="flex-none" />
              </button>
            )}
          </div>
        )}
        <div className="mt-2 hidden text-right sm:block">
          <Link to="/add" className="text-xs text-ink-muted hover:text-ink-soft">
            Add manually
          </Link>
        </div>
      </form>
      )}
      </div>
      {aiConsentDisclosure && (
        <AiConsentDialog
          disclosure={aiConsentDisclosure}
          error={aiConsentError}
          pending={isAiConsentSaving}
          onAllow={allowAiFeatures}
          onDecline={continueWithoutAi}
        />
      )}
    </div>
  )
}
