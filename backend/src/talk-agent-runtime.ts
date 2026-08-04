import { Agent, Runner, tool } from '@openai/agents'
import { z } from 'zod'
import { aiCapabilityTools, type AiCapabilityContext } from './ai-capabilities'
import type { TokenUsage } from './openai'

export const TALK_RUNTIME_VERSION = 'agents-sdk-0.14.2/phase-5-v2'
export const TALK_AGENT_MAX_TOKENS = 1800
export const TALK_AGENT_MAX_TURNS = 8

export const TalkWorkflowStageSchema = z.enum([
  'interpreting',
  'clarifying',
  'gathering_context',
  'awaiting_confirmation',
  'applied',
  'declined',
  'stale',
  'failed',
])
export type TalkWorkflowStage = z.infer<typeof TalkWorkflowStageSchema>

export const TalkFocusMeaningSchema = z.enum(['focused_minutes', 'elapsed_window', 'both'])
export type TalkFocusMeaning = z.infer<typeof TalkFocusMeaningSchema>

// A single root object keeps the OpenAI Structured Outputs contract strict.
// Fields irrelevant to the selected kind are explicitly null/empty instead of
// optional, which also makes persisted decisions predictable across resumes.
export const TalkAgentDecisionSchema = z.object({
  kind: z.enum(['ask', 'proposal', 'blocked']),
  message: z.string().trim().min(1).max(1200),
  question: z.string().trim().min(1).max(500).nullable(),
  focusMeaning: TalkFocusMeaningSchema.nullable(),
  projectId: z.string().uuid().nullable(),
  taskIds: z.array(z.string().uuid()).max(20),
  scheduledDate: z.string().date().nullable(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  plannedMinutes: z.number().int().positive().max(1440).nullable(),
  intendedOutcome: z.string().trim().min(1).max(500).nullable(),
  intendedEvidence: z.string().trim().min(1).max(500).nullable(),
  transitionMinutes: z.number().int().min(0).max(180).nullable(),
  breakMinutes: z.number().int().min(0).max(180).nullable(),
  reasonCodes: z.array(z.string().trim().min(1).max(120)).max(12),
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'ask' && !value.question) {
    ctx.addIssue({ code: 'custom', path: ['question'], message: 'An ask decision requires one question' })
  }
  if (value.kind === 'proposal') {
    const required = [
      'focusMeaning', 'projectId', 'scheduledDate', 'startTime',
      'plannedMinutes', 'intendedOutcome', 'intendedEvidence',
    ] as const
    for (const key of required) {
      if (value[key] === null) {
        ctx.addIssue({ code: 'custom', path: [key], message: `A proposal requires ${key}` })
      }
    }
    if (value.taskIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['taskIds'], message: 'A Project Focus block requires at least one Task' })
    }
  }
})
export type TalkAgentDecision = z.infer<typeof TalkAgentDecisionSchema>

export type TalkInstructionPack = {
  name: string
  version: string
  instructions: string
}

const BASE_PACK: TalkInstructionPack = {
  name: 'healthyflow-talk',
  version: '1.0.0',
  instructions: `You are the bounded HealthyFlow Talk planner. Use HealthyFlow vocabulary exactly: Project, Task, Focus block, Daily Plan.
The app, not you, owns dates, arithmetic, validation, confirmation, and database writes. Never claim a Focus block was created. Answer in the language of the latest user message.`,
}

const FOCUSED_WORK_PACK: TalkInstructionPack = {
  name: 'plan-focused-work',
  version: '1.0.2',
  instructions: `Plan exactly one startable Focus block against a Project target.
Use only the tools provided for this stage. Read the anchored Daily Plan and Work scope before proposing. Prefer open Tasks related by Direct progress, Unblocking, or Maintenance; do not select Unrelated or Optional polish work.
Always call list_work_projects before asking which Project to use. Resolve a user-provided Project name against that result, then call get_work_scope with the matched id. If exactly one active Project is a clear match, proceed without asking. Never ask the user to provide an internal Project or Task id.
"Focused minutes" means time doing the work. "Elapsed window" includes transitions and breaks. If the user's meaning materially changes feasibility and is not clear, return kind=ask with one concise question only.
Before returning kind=proposal, call validate_daily_plan with the exact date, timezone, start time, planned minutes, and transition minutes. Return a proposal only when its tool result is valid.
Calendar connection is optional. Capacity that is partial only because of Calendar reason codes is not blocked: continue to validate_daily_plan. If validation returns valid with calendar_not_connected, calendar_unavailable, or another Calendar reason code, proceed with the proposal and explain briefly that the time was checked against HealthyFlow records only.
Never calculate calendar availability yourself. Never invent Project or Task ids.`,
}

const CONFIRMATION_PACK: TalkInstructionPack = {
  name: 'proposal-confirmation-safety',
  version: '1.0.0',
  instructions: `A proposal is only a draft. The app will show an editable preview and will re-read authoritative records after confirmation. Do not call a write tool and do not phrase a proposal as completed work.
If required context is missing, a tool fails, the Daily Plan is indeterminate, no Project exists, no open aligned Task exists, time is insufficient, or placement conflicts, return kind=blocked and explain the concrete reason.`,
}

const RESUME_PACK: TalkInstructionPack = {
  name: 'durable-workflow-resume',
  version: '1.0.0',
  instructions: `This is a resumed persisted workflow. Treat persisted structured state as the workflow checkpoint, but re-read live app records with tools before a new proposal. Do not rely on old ids or old availability merely because they appear in chat text.`,
}

const ONE_QUESTION_PACK: TalkInstructionPack = {
  name: 'one-useful-question',
  version: '1.0.0',
  instructions: `When clarification is necessary, ask the single question with the highest impact on a safe proposal. Do not bundle Project, duration, date, and preference questions together.`,
}

export function selectTalkInstructionPacks(
  stage: TalkWorkflowStage,
  resumed: boolean,
): TalkInstructionPack[] {
  const packs = [BASE_PACK, FOCUSED_WORK_PACK, CONFIRMATION_PACK]
  if (stage === 'interpreting' || stage === 'clarifying') packs.push(ONE_QUESTION_PACK)
  if (resumed) packs.push(RESUME_PACK)
  return packs
}

export const FOCUSED_WORK_TOOL_NAMES = [
  'get_daily_plan',
  'compute_daily_availability',
  'validate_daily_plan',
  'list_work_projects',
  'get_work_scope',
  'review_task_alignment',
] as const

export type TalkRuntimeMessage = { role: 'user' | 'assistant'; content: string }
export type TalkRuntimeToolEvent = { name: string; args: unknown; result: unknown }

export type TalkAgentRunInput = {
  userId: string
  conversationId: string
  model: string
  stage: TalkWorkflowStage
  anchorDate: string
  timeZone: string
  focusMeaning: TalkFocusMeaning | null
  selectedProjectId: string | null
  selectedTaskIds: string[]
  messages: TalkRuntimeMessage[]
  resumed: boolean
}

export type TalkAgentRunResult = {
  decision: TalkAgentDecision
  toolEvents: TalkRuntimeToolEvent[]
  usage: TokenUsage
  runtimeVersion: string
  instructionVersions: string[]
  toolNames: string[]
}

export interface TalkAgentRuntime {
  run(input: TalkAgentRunInput): Promise<TalkAgentRunResult>
}

export type TalkCapabilityLoader = () => ReturnType<typeof aiCapabilityTools>

function boundedTranscript(messages: TalkRuntimeMessage[]) {
  return messages.slice(-12).map((message) => ({
    role: message.role,
    content: message.content.slice(0, 4000),
  }))
}

function localTimeInZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const hour = parts.find((part) => part.type === 'hour')?.value
  const minute = parts.find((part) => part.type === 'minute')?.value
  if (!hour || !minute) throw new Error(`Could not determine local time for timezone: ${timeZone}`)
  return `${hour}:${minute}`
}

export function buildTalkRuntimeInput(input: TalkAgentRunInput, now = new Date()) {
  return JSON.stringify({
    anchor: {
      date: input.anchorDate,
      timeZone: input.timeZone,
      time: localTimeInZone(now, input.timeZone),
    },
    checkpoint: {
      stage: input.stage,
      focusMeaning: input.focusMeaning,
      selectedProjectId: input.selectedProjectId,
      selectedTaskIds: input.selectedTaskIds,
    },
    transcript: boundedTranscript(input.messages),
  })
}

export class OpenAiAgentsTalkRuntime implements TalkAgentRuntime {
  constructor(
    private readonly loadCapabilities: TalkCapabilityLoader = () => aiCapabilityTools({
      includeRegistered: true,
      allowedNames: FOCUSED_WORK_TOOL_NAMES,
    }),
  ) {}

  async run(input: TalkAgentRunInput): Promise<TalkAgentRunResult> {
    const packs = selectTalkInstructionPacks(input.stage, input.resumed)
    const capabilityContext: AiCapabilityContext = {
      userId: input.userId,
      caller: 'internal',
      model: input.model,
    }
    const toolEvents: TalkRuntimeToolEvent[] = []
    const capabilities = this.loadCapabilities()
      .filter((capability) => FOCUSED_WORK_TOOL_NAMES.includes(capability.name as typeof FOCUSED_WORK_TOOL_NAMES[number]))
    const availableNames = new Set(capabilities.map((capability) => capability.name))
    const missing = FOCUSED_WORK_TOOL_NAMES.filter((name) => !availableNames.has(name))
    if (missing.length > 0) throw new Error(`Talk runtime capabilities missing: ${missing.join(', ')}`)

    const tools = capabilities.map((capability) => tool({
      name: capability.name,
      description: capability.description,
      parameters: capability.inputSchema as z.ZodObject<z.ZodRawShape>,
      execute: async (args: unknown) => {
        const result = await capability.execute(capabilityContext, args)
        toolEvents.push({ name: capability.name, args, result })
        return result
      },
    }))

    const agent = new Agent({
      name: 'HealthyFlow Focused Work Planner',
      model: input.model,
      instructions: packs.map((pack) => `[${pack.name}@${pack.version}]\n${pack.instructions}`).join('\n\n'),
      tools,
      outputType: TalkAgentDecisionSchema,
      modelSettings: {
        maxTokens: TALK_AGENT_MAX_TOKENS,
        parallelToolCalls: false,
        store: false,
        ...(input.model.startsWith('gpt-5')
          ? { reasoning: { effort: 'low' as const } }
          : {}),
      },
    })
    const runner = new Runner({
      tracingDisabled: process.env.OPENAI_AGENTS_TRACING_DISABLED === 'true',
      traceIncludeSensitiveData: false,
      workflowName: 'HealthyFlow Phase 5 Talk',
      groupId: input.conversationId,
      traceMetadata: {
        stage: input.stage,
        runtime: TALK_RUNTIME_VERSION,
      },
    })
    const result = await runner.run(agent, buildTalkRuntimeInput(input), {
      maxTurns: TALK_AGENT_MAX_TURNS,
    })
    if (!result.finalOutput) throw new Error('Talk agent returned no structured decision')
    const decision = TalkAgentDecisionSchema.parse(result.finalOutput)
    const usage = result.state.usage

    return {
      decision,
      toolEvents,
      usage: {
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      },
      runtimeVersion: TALK_RUNTIME_VERSION,
      instructionVersions: packs.map((pack) => `${pack.name}@${pack.version}`),
      toolNames: capabilities.map((capability) => capability.name),
    }
  }
}

export const defaultTalkAgentRuntime = new OpenAiAgentsTalkRuntime()
