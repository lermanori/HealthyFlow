import { Agent, Runner, tool } from '@openai/agents'
import { z } from 'zod'
import { aiCapabilityTools, type AiCapabilityContext } from './ai-capabilities'
import type { TokenUsage } from './openai'
import { getTalkWorkflowDefinition, type TalkWorkflowName } from './talk-workflow-definitions'
import { TargetRelationSchema } from './work-contracts'

export const TALK_RUNTIME_VERSION = 'agents-sdk-0.14.2/phase-6-v1'
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

export const TalkTaskProposalSchema = z.object({
  title: z.string().trim().min(1).max(280),
  relation: TargetRelationSchema.exclude(['Optional polish', 'Unrelated']),
  duration: z.number().int().positive().max(1440).nullable(),
  scheduledDate: z.string().date().nullable(),
}).strict()
export type TalkTaskProposal = z.infer<typeof TalkTaskProposalSchema>

// A single root object keeps the OpenAI Structured Outputs contract strict.
// Fields irrelevant to the selected kind are explicitly null/empty instead of
// optional, which also makes persisted decisions predictable across resumes.
export const TalkAgentDecisionSchema = z.object({
  kind: z.enum(['ask', 'task_proposal', 'proposal', 'blocked']),
  message: z.string().trim().min(1).max(1200),
  question: z.string().trim().min(1).max(500).nullable(),
  focusMeaning: TalkFocusMeaningSchema.nullable(),
  projectId: z.string().uuid().nullable(),
  taskIds: z.array(z.string().uuid()).max(20),
  taskProposal: TalkTaskProposalSchema.nullable(),
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
  if (value.kind === 'task_proposal') {
    if (!value.projectId) {
      ctx.addIssue({ code: 'custom', path: ['projectId'], message: 'A Task proposal requires a Project' })
    }
    if (!value.taskProposal) {
      ctx.addIssue({ code: 'custom', path: ['taskProposal'], message: 'A Task proposal requires exactly one Task' })
    }
    if (value.taskIds.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['taskIds'], message: 'A Task proposal cannot select an existing Task' })
    }
  } else if (value.taskProposal) {
    ctx.addIssue({ code: 'custom', path: ['taskProposal'], message: 'Only a Task proposal can include a proposed Task' })
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
  version: '1.1.0',
  instructions: `You are the bounded HealthyFlow Talk planner. Use HealthyFlow vocabulary exactly: Project, Task, Focus block, Daily Plan.
The app, not you, owns dates, arithmetic, validation, confirmation, and database writes. Never claim a Task or Focus block was created. Answer in the language of the latest user message.`,
}

const FOCUSED_WORK_PACK: TalkInstructionPack = {
  name: 'plan-focused-work',
  version: '1.1.0',
  instructions: `Plan exactly one startable Focus block against a Project target.
Use only the tools provided for this stage. Read the anchored Daily Plan and Work scope before proposing. Prefer open Tasks related by Direct progress, Unblocking, or Maintenance; do not select Unrelated or Optional polish work.
Always call list_work_projects before asking which Project to use. Resolve a user-provided Project name against that result, then call get_work_scope with the matched id. If exactly one active Project is a clear match, proceed without asking. Never ask the user to provide an internal Project or Task id.
"Focused minutes" means time doing the work. "Elapsed window" includes transitions and breaks. If the user's meaning materially changes feasibility and is not clear, return kind=ask with one concise question only.
Before returning kind=proposal, call validate_daily_plan with the exact date, timezone, start time, planned minutes, and transition minutes. Return a proposal only when its tool result is valid.
Calendar connection is optional, and a Calendar the user has not connected does not make Capacity partial — their HealthyFlow records are the whole picture, so treat that answer as exact. Capacity that is partial only because of Calendar reason codes is not blocked: continue to validate_daily_plan. If validation returns valid with calendar_unavailable or another Calendar reason code, proceed with the proposal and explain briefly that the time was checked against HealthyFlow records only.
Never calculate calendar availability yourself. Never invent Project or Task ids.`,
}

const CONFIRMATION_PACK: TalkInstructionPack = {
  name: 'proposal-confirmation-safety',
  version: '1.1.0',
  instructions: `A proposal is only a draft. The app will show an editable preview and will re-read authoritative records after confirmation. Do not call a write tool and do not phrase a proposal as completed work.
If the selected Project has no open Tasks, inspect its target, milestone, context summary, and next step. When those records provide enough direction, return kind=task_proposal with exactly one concrete, startable Task related by Direct progress, Unblocking, or Maintenance. Include a realistic duration and include today's anchored date only when the Task belongs on today's Daily Plan. After the user confirms it, the app will resume this workflow and you must plan the Focus block from the newly created Task.
If the Project records do not provide enough direction to form a responsible Task, return kind=ask with one concise question only. If required context is missing for another reason, a tool fails, the Daily Plan is indeterminate, no Project exists, open Tasks exist but none is aligned, time is insufficient, or placement conflicts, return kind=blocked and explain the concrete reason.`,
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

const TASK_DRAFTING_PACK: TalkInstructionPack = {
  name: 'draft-work-task',
  version: '1.0.0',
  instructions: `Draft exactly one concrete, startable Task that advances this Project.
You have been given one verified Project scope and the anchor date. You have no tools at this stage: decide from the Project target, milestone, definition of done, context summary, and next valuable step you were given.
Relate the Task by Direct progress, Unblocking, or Maintenance. Include a realistic duration. Include the anchored date only when the Task belongs on that day's Daily Plan.
Do not plan a Focus block, do not choose a start time, and do not reason about Daily Plan capacity — a later stage does that from the Task the user confirms.
If the Project records do not provide enough direction to form a responsible Task, return kind=ask with one concise question. If something else prevents a responsible draft, return kind=blocked with concrete reason codes.`,
}

const TASK_ALIGNMENT_PACK: TalkInstructionPack = {
  name: 'review-task-alignment',
  version: '1.0.0',
  instructions: `Decide which of this Project's open Tasks genuinely serve its active target.
Use review_task_alignment on the candidate Tasks. Select only Tasks related by Direct progress, Unblocking, or Maintenance, and explain the judgment briefly.
Never select an Unrelated or Optional polish Task silently. If a responsible selection needs the user's input, return kind=ask with one concise question.
Do not draft a new Task and do not plan a Focus block.`,
}

const STAGE_FOCUSED_WORK_PACK: TalkInstructionPack = {
  name: 'plan-focus-block',
  version: '1.0.0',
  instructions: `Plan exactly one startable Focus block from the verified Project and Task ids you were given.
Those ids are already verified as open and aligned. Do not re-select Tasks, do not draft a new Task, and never invent an id.
"Focused minutes" means time doing the work. "Elapsed window" includes transitions and breaks. If the user's meaning materially changes feasibility and is not clear, return kind=ask with one concise question.
Before returning kind=focus_draft, call validate_daily_plan with the exact date, timezone, start time, planned minutes, and transition minutes. Return a draft only when its tool result is valid.
Calendar connection is optional, and a Calendar the user has not connected does not make Capacity partial — their HealthyFlow records are the whole picture, so treat that answer as exact. Capacity that is partial only because of Calendar reason codes is not blocked: continue to validate_daily_plan. If validation returns valid with calendar_unavailable or another Calendar reason code, proceed and explain briefly that the time was checked against HealthyFlow records only.
Never calculate calendar availability yourself. The app owns confirmation and the write; do not phrase a draft as completed work.`,
}

/** Packs addressable by the `instructionPacks` ids in a stage activity profile. */
const TALK_STAGE_PACKS: Readonly<Record<string, TalkInstructionPack>> = {
  base: BASE_PACK,
  task_drafting: TASK_DRAFTING_PACK,
  task_alignment: TASK_ALIGNMENT_PACK,
  focused_work: STAGE_FOCUSED_WORK_PACK,
  one_question: ONE_QUESTION_PACK,
  resume: RESUME_PACK,
}

/** @deprecated Phase 5 combined selection. Removed when Slice 5 rewires the caller. */
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
      workflowName: 'HealthyFlow Phase 6 Talk',
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

// ===========================================================================
// Phase 6 stage-scoped runtime (ADR-0009, Slice 4)
// ===========================================================================
//
// One agent run performs one bounded stage activity. Instructions, tools, output
// contract, and turn budget all come from the stage's activity profile in the
// workflow registry. This module maps a profile onto an Agent/Runner; it never
// decides which workflow or stage runs next.

/** plan_work.task_draft — cannot express a Focus block or a Daily Plan placement. */
export const TalkTaskDraftOutputSchema = z.object({
  kind: z.enum(['task_draft', 'ask', 'blocked']),
  message: z.string().trim().min(1).max(1200),
  question: z.string().trim().min(1).max(500).nullable(),
  task: TalkTaskProposalSchema.nullable(),
  reasonCodes: z.array(z.string().trim().min(1).max(120)).max(12),
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'task_draft' && !value.task) {
    ctx.addIssue({ code: 'custom', path: ['task'], message: 'A Task draft requires exactly one Task' })
  }
  if (value.kind !== 'task_draft' && value.task) {
    ctx.addIssue({ code: 'custom', path: ['task'], message: 'Only a Task draft may include a Task' })
  }
  if (value.kind === 'ask' && !value.question) {
    ctx.addIssue({ code: 'custom', path: ['question'], message: 'An ask requires one question' })
  }
  if (value.kind === 'blocked' && value.reasonCodes.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['reasonCodes'], message: 'A blocked result requires reason codes' })
  }
})
export type TalkTaskDraftOutput = z.infer<typeof TalkTaskDraftOutputSchema>

/**
 * plan_work.focus_draft — deliberately omits projectId, taskIds, and
 * scheduledDate. Those are already verified in workflow state, so the model
 * cannot re-select work, invent an id, or drift off the anchor date, and it has
 * no field in which to return a Task draft.
 */
export const TalkFocusDraftOutputSchema = z.object({
  kind: z.enum(['focus_draft', 'ask', 'blocked']),
  message: z.string().trim().min(1).max(1200),
  question: z.string().trim().min(1).max(500).nullable(),
  focusMeaning: TalkFocusMeaningSchema.nullable(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  plannedMinutes: z.number().int().positive().max(1440).nullable(),
  intendedOutcome: z.string().trim().min(1).max(500).nullable(),
  intendedEvidence: z.string().trim().min(1).max(500).nullable(),
  transitionMinutes: z.number().int().min(0).max(180).nullable(),
  breakMinutes: z.number().int().min(0).max(180).nullable(),
  reasonCodes: z.array(z.string().trim().min(1).max(120)).max(12),
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'focus_draft') {
    for (const key of ['focusMeaning', 'startTime', 'plannedMinutes', 'intendedOutcome', 'intendedEvidence'] as const) {
      if (value[key] === null) {
        ctx.addIssue({ code: 'custom', path: [key], message: `A Focus draft requires ${key}` })
      }
    }
  }
  if (value.kind === 'ask' && !value.question) {
    ctx.addIssue({ code: 'custom', path: ['question'], message: 'An ask requires one question' })
  }
  if (value.kind === 'blocked' && value.reasonCodes.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['reasonCodes'], message: 'A blocked result requires reason codes' })
  }
})
export type TalkFocusDraftOutput = z.infer<typeof TalkFocusDraftOutputSchema>

/** plan_work.alignment_decision — selects among existing Tasks only. */
export const TalkAlignmentOutputSchema = z.object({
  kind: z.enum(['alignment', 'ask', 'blocked']),
  message: z.string().trim().min(1).max(1200),
  question: z.string().trim().min(1).max(500).nullable(),
  taskIds: z.array(z.string().uuid()).max(20),
  reasonCodes: z.array(z.string().trim().min(1).max(120)).max(12),
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'alignment' && value.taskIds.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['taskIds'], message: 'An alignment decision requires at least one Task' })
  }
  if (value.kind === 'ask' && !value.question) {
    ctx.addIssue({ code: 'custom', path: ['question'], message: 'An ask requires one question' })
  }
})
export type TalkAlignmentOutput = z.infer<typeof TalkAlignmentOutputSchema>

export const TALK_STAGE_OUTPUT_CONTRACTS: Readonly<Record<string, z.ZodTypeAny>> = {
  'plan_work.task_draft': TalkTaskDraftOutputSchema,
  'plan_work.focus_draft': TalkFocusDraftOutputSchema,
  'plan_work.alignment_decision': TalkAlignmentOutputSchema,
}

export type TalkStageRunInput = {
  userId: string
  conversationId: string
  model: string
  workflowName: TalkWorkflowName
  definitionVersion: number
  stage: string
  anchorDate: string
  timeZone: string
  /** Verified, bounded context assembled by the application for this stage only. */
  stageContext: Record<string, unknown>
  messages: TalkRuntimeMessage[]
  resumed: boolean
}

export type TalkStagePlan = {
  traceLabel: string
  instructions: string
  instructionVersions: string[]
  toolNames: string[]
  outputContract: string
  outputSchema: z.ZodTypeAny
  maxTurns: number
  traceMetadata: Record<string, string>
}

export class TalkStageProfileError extends Error {
  readonly code = 'talk_stage_profile_invalid'
}

/**
 * Typed runtime failure that keeps the tool calls completed before the failure.
 * The Phase 5 path discarded them, which is why the eight-call trace in ADR-0009
 * had to be reconstructed by hand.
 */
export class TalkStageRunError extends Error {
  readonly code = 'talk_stage_run_failed'
  constructor(
    message: string,
    readonly detail: {
      workflowName: TalkWorkflowName
      stage: string
      toolEvents: TalkRuntimeToolEvent[]
      cause?: unknown
    },
  ) {
    super(message)
  }

  /** The actual tool sequence, for the max-turn regression assertion. */
  get toolSequence() {
    return this.detail.toolEvents.map((event) => event.name)
  }
}

/**
 * Resolves everything one stage run needs. Pure, so the contract tests can prove
 * what a stage may and may not do without constructing an Agent.
 */
export function buildTalkStagePlan(input: {
  workflowName: TalkWorkflowName
  stage: string
  resumed: boolean
}): TalkStagePlan {
  const definition = getTalkWorkflowDefinition(input.workflowName)
  const profile = definition.activity[input.stage]
  if (!profile) {
    throw new TalkStageProfileError(`${input.workflowName} has no stage named ${input.stage}`)
  }
  if (profile.kind !== 'agent') {
    throw new TalkStageProfileError(
      `${input.workflowName}.${input.stage} is a ${profile.kind} activity and must not run a model.`,
    )
  }

  const packIds = [...profile.instructionPacks, ...(input.resumed ? ['resume'] : [])]
  const packs = packIds.map((id) => {
    const pack = TALK_STAGE_PACKS[id]
    if (!pack) throw new TalkStageProfileError(`Unknown Talk instruction pack: ${id}`)
    return pack
  })

  const outputSchema = TALK_STAGE_OUTPUT_CONTRACTS[profile.outputContract]
  if (!outputSchema) {
    throw new TalkStageProfileError(`Unknown Talk output contract: ${profile.outputContract}`)
  }

  const traceLabel = definition.traceLabel(input.stage)
  return {
    traceLabel,
    instructions: packs.map((pack) => `[${pack.name}@${pack.version}]\n${pack.instructions}`).join('\n\n'),
    instructionVersions: packs.map((pack) => `${pack.name}@${pack.version}`),
    toolNames: [...profile.tools],
    outputContract: profile.outputContract,
    outputSchema,
    maxTurns: profile.maxTurns,
    traceMetadata: {
      workflow: definition.name,
      definitionVersion: String(definition.version),
      stage: input.stage,
      runtime: TALK_RUNTIME_VERSION,
    },
  }
}

export function buildTalkStageRuntimeInput(input: TalkStageRunInput, now = new Date()) {
  return JSON.stringify({
    anchor: {
      date: input.anchorDate,
      timeZone: input.timeZone,
      time: localTimeInZone(now, input.timeZone),
    },
    // Only what this stage needs. There is no shared checkpoint blob carrying
    // another stage's ids or another workflow's context.
    stage: { workflow: input.workflowName, name: input.stage, context: input.stageContext },
    transcript: boundedTranscript(input.messages),
  })
}

export type TalkStageRunResult = {
  output: unknown
  outputContract: string
  toolEvents: TalkRuntimeToolEvent[]
  usage: TokenUsage
  runtimeVersion: string
  instructionVersions: string[]
  toolNames: string[]
}

export interface TalkStageRuntime {
  run(input: TalkStageRunInput): Promise<TalkStageRunResult>
}

/** Injectable so tests can drive the loop without the SDK or OpenAI. */
export type TalkStageAgentRunner = (
  agent: Agent<unknown, any>,
  prompt: string,
  options: { maxTurns: number },
) => Promise<{ finalOutput?: unknown; state: { usage: { inputTokens: number; outputTokens: number; totalTokens: number } } }>

export class OpenAiTalkStageRuntime implements TalkStageRuntime {
  constructor(
    private readonly loadCapabilities: TalkCapabilityLoader = () => aiCapabilityTools({ includeRegistered: true }),
    private readonly runAgent?: TalkStageAgentRunner,
  ) {}

  async run(input: TalkStageRunInput): Promise<TalkStageRunResult> {
    const plan = buildTalkStagePlan(input)
    const capabilityContext: AiCapabilityContext = {
      userId: input.userId,
      caller: 'internal',
      model: input.model,
    }
    const toolEvents: TalkRuntimeToolEvent[] = []

    // The stage's allowlist is the only tool surface. A stage with no tools gets
    // no tools — it cannot reach Daily Plan validation at all.
    const capabilities = plan.toolNames.length === 0
      ? []
      : this.loadCapabilities().filter((capability) => plan.toolNames.includes(capability.name))
    const available = new Set(capabilities.map((capability) => capability.name))
    const missing = plan.toolNames.filter((name) => !available.has(name))
    if (missing.length > 0) {
      throw new TalkStageProfileError(
        `${input.workflowName}.${input.stage} capabilities missing: ${missing.join(', ')}`,
      )
    }

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
      name: plan.traceLabel,
      model: input.model,
      instructions: plan.instructions,
      tools,
      outputType: plan.outputSchema as any,
      modelSettings: {
        maxTokens: TALK_AGENT_MAX_TOKENS,
        parallelToolCalls: false,
        store: false,
        ...(input.model.startsWith('gpt-5') ? { reasoning: { effort: 'low' as const } } : {}),
      },
    })

    const run = this.runAgent ?? ((agentToRun, prompt, options) => new Runner({
      tracingDisabled: process.env.OPENAI_AGENTS_TRACING_DISABLED === 'true',
      traceIncludeSensitiveData: false,
      // Trace names identify the workflow and stage, not only "Phase 6 Talk".
      workflowName: plan.traceLabel,
      groupId: input.conversationId,
      traceMetadata: plan.traceMetadata,
    }).run(agentToRun, prompt, options))

    let result: Awaited<ReturnType<TalkStageAgentRunner>>
    try {
      result = await run(agent as Agent<unknown, any>, buildTalkStageRuntimeInput(input), {
        maxTurns: plan.maxTurns,
      })
    } catch (error) {
      // Preserve the tool sequence completed before the throw.
      throw new TalkStageRunError(
        error instanceof Error ? error.message : 'Talk stage run failed',
        { workflowName: input.workflowName, stage: input.stage, toolEvents, cause: error },
      )
    }

    if (!result.finalOutput) {
      throw new TalkStageRunError(
        `${plan.traceLabel} returned no structured output`,
        { workflowName: input.workflowName, stage: input.stage, toolEvents },
      )
    }

    const parsed = plan.outputSchema.safeParse(result.finalOutput)
    if (!parsed.success) {
      throw new TalkStageRunError(
        `${plan.traceLabel} violated ${plan.outputContract}`,
        { workflowName: input.workflowName, stage: input.stage, toolEvents, cause: parsed.error },
      )
    }

    return {
      output: parsed.data,
      outputContract: plan.outputContract,
      toolEvents,
      usage: {
        promptTokens: result.state.usage.inputTokens,
        completionTokens: result.state.usage.outputTokens,
        totalTokens: result.state.usage.totalTokens,
      },
      runtimeVersion: TALK_RUNTIME_VERSION,
      instructionVersions: plan.instructionVersions,
      toolNames: plan.toolNames,
    }
  }
}

export const defaultTalkStageRuntime = new OpenAiTalkStageRuntime()
