import { FormEvent, useMemo, useRef, useState } from 'react'
import { Bot, Send, UserRound, Wrench } from 'lucide-react'
import toast from 'react-hot-toast'
import { aiService, AssistantChatMessage, AssistantToolEvent } from '../services/api'

type ConversationMessage = AssistantChatMessage & {
  id: string
  toolEvents?: AssistantToolEvent[]
  pendingAction?: {
    id: string
    capability: string
    preview: unknown
    expiresAt: string
  } | null
  error?: boolean
}

const starterPrompts = [
  "What's on my plate today?",
  'How many calories did I log today?',
  'Show my recent achievements.',
]

function compactToolName(name: string) {
  return name.replace(/_/g, ' ')
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const apiMessages = useMemo(
    () => messages
      .filter((message) => !message.error)
      .map(({ role, content }) => ({ role, content })),
    [messages]
  )

  const sendMessage = async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed || isSending) return

    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    }
    const nextMessages = [...apiMessages, { role: 'user' as const, content: trimmed }]

    setMessages((current) => [...current, userMessage])
    setDraft('')
    setIsSending(true)

    try {
      const response = await aiService.chat(nextMessages)
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.message,
          toolEvents: response.toolEvents,
          pendingAction: response.pendingAction,
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

  const confirmAction = async (actionId: string) => {
    try {
      await aiService.confirmChatAction(actionId)
      toast.success('Action confirmed')
      setMessages((current) => current.map((message) =>
        message.pendingAction?.id === actionId
          ? { ...message, pendingAction: null, content: `${message.content}\n\nConfirmed.` }
          : message
      ))
    } catch (error: any) {
      toast.error(error.response?.data?.error ?? 'Could not confirm action')
    }
  }

  const cancelAction = async (actionId: string) => {
    try {
      await aiService.cancelChatAction(actionId)
      toast.success('Action canceled')
      setMessages((current) => current.map((message) =>
        message.pendingAction?.id === actionId
          ? { ...message, pendingAction: null, content: `${message.content}\n\nCanceled.` }
          : message
      ))
    } catch (error: any) {
      toast.error(error.response?.data?.error ?? 'Could not cancel action')
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-gray-800 bg-gray-950/70">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
            <Bot className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold text-gray-100">Assistant</h1>
        </div>
        {isSending && <span className="text-sm text-cyan-300">Thinking</span>}
      </div>

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
                </div>
                {message.toolEvents && message.toolEvents.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.toolEvents.map((event, index) => (
                      <span
                        key={`${event.name}-${index}`}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-800 bg-gray-950 px-2 py-1 text-xs text-gray-400"
                      >
                        <Wrench className="h-3 w-3" />
                        {compactToolName(event.name)}
                      </span>
                    ))}
                  </div>
                )}
                {message.pendingAction && (
                  <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                    <pre className="max-h-44 overflow-auto whitespace-pre-wrap text-xs text-amber-50">
                      {JSON.stringify(message.pendingAction.preview, null, 2)}
                    </pre>
                    <div className="mt-3 flex gap-2">
                      <button className="btn-primary px-3 py-2 text-sm" onClick={() => confirmAction(message.pendingAction!.id)}>
                        Confirm
                      </button>
                      <button className="btn-secondary px-3 py-2 text-sm" onClick={() => cancelAction(message.pendingAction!.id)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
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

      <form onSubmit={submit} className="flex gap-2 border-t border-gray-800 p-3">
        <input
          ref={inputRef}
          className="input-field min-w-0 flex-1"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about today, calories, achievements, or workouts"
          disabled={isSending}
        />
        <button
          type="submit"
          disabled={isSending || !draft.trim()}
          className="btn-primary flex h-11 w-11 flex-none items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  )
}
