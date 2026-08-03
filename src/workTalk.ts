import type { FocusBlock, TaskRecord, WorkProject } from './services/api'

/**
 * The Work → Talk handoff.
 *
 * Work owns the records, so Work composes the prompt: it is the only surface
 * that holds the Project's target, bounded context and Task relationships
 * together. Talk receives a finished, editable prompt and never reaches back
 * into Work's data to reassemble one.
 *
 * The prompt travels in router state rather than the query string: it carries
 * the user's own recorded context, which has no business sitting in a URL.
 */
export interface WorkTalkContext {
  label: string
  prompt: string
}

const MAX_LABEL = 120
const MAX_PROMPT = 4000

/** Router state key. Kept distinct from the Daily Signal handoff's key. */
export const WORK_TALK_STATE_KEY = 'workTalkContext'

export function workTalkContext(value: unknown): WorkTalkContext | null {
  if (!value || typeof value !== 'object') return null
  const candidate = (value as Record<string, unknown>)[WORK_TALK_STATE_KEY]
  if (!candidate || typeof candidate !== 'object') return null
  const record = candidate as Record<string, unknown>
  if (typeof record.label !== 'string' || typeof record.prompt !== 'string') return null
  const prompt = record.prompt.trim()
  if (!prompt) return null
  return {
    label: record.label.slice(0, MAX_LABEL),
    prompt: prompt.slice(0, MAX_PROMPT),
  }
}

export function workTalkState(context: WorkTalkContext) {
  return { [WORK_TALK_STATE_KEY]: context }
}

const lines = (parts: Array<string | null | false>) => parts.filter(Boolean).join('\n\n')

// "Not recorded yet" rather than silence: the model should be able to tell the
// difference between a Project with no target and a target it simply wasn't given.
const orUnrecorded = (value: string | null) => value?.trim() || 'Not recorded yet'

function targetBlock(project: WorkProject) {
  return lines([
    `Project: ${project.name}`,
    `Target: ${orUnrecorded(project.target)}`,
    `Current milestone: ${orUnrecorded(project.milestone)}`,
    project.deadline ? `Deadline: ${project.deadline}` : null,
  ])
}

function contextBlock(project: WorkProject) {
  const { context } = project
  return lines([
    context.summary ? `Context: ${context.summary}` : null,
    context.blockers.length ? `Blockers:\n${context.blockers.map(b => `- ${b}`).join('\n')}` : null,
    context.constraints.length ? `Constraints:\n${context.constraints.map(c => `- ${c}`).join('\n')}` : null,
    context.nonGoals.length ? `Non-goals:\n${context.nonGoals.map(n => `- ${n}`).join('\n')}` : null,
  ])
}

/** "Plan in Talk" — planning against the target, not a general chat. */
export function planInTalkContext(project: WorkProject, tasks: TaskRecord[] = []): WorkTalkContext {
  const open = tasks.filter(task => task.status === 'open')
  const openList = open.length
    ? open.map(task => `- ${task.title}${task.relation ? ` (${task.relation})` : ''}`).join('\n')
    : '- None recorded'

  return {
    label: `${project.name} · planning`,
    prompt: lines([
      `Help me plan focused work on ${project.name}.`,
      targetBlock(project),
      contextBlock(project),
      `Open Tasks:\n${openList}`,
      'Check alignment against the target first, then propose one startable Focus block with observable evidence. Do not schedule an ordinary Task instead.',
    ]),
  }
}

/** "Discuss in Talk" on a single Task record. */
export function discussTaskContext(project: WorkProject, task: TaskRecord): WorkTalkContext {
  return {
    label: `${project.name} · ${task.title}`,
    prompt: lines([
      `Help me decide how to work on this Task in ${project.name}: ${task.title}`,
      targetBlock(project),
      task.relation ? `Recorded relationship to the target: ${task.relation}` : null,
      'Check whether it still serves the target. If it does, help me shape a startable Focus block with observable evidence. If it does not, say so plainly.',
    ]),
  }
}

/** "Start in Talk" — the prepared Focus block handoff. */
export function startFocusBlockContext(project: WorkProject, block: FocusBlock | null): WorkTalkContext | null {
  if (!block) return null

  return {
    label: `${project.name} · Focus block`,
    prompt: lines([
      `Start the planned Focus block for ${project.name}.`,
      `Intended outcome: ${block.intendedOutcome}`,
      targetBlock(project),
      `Intended evidence: ${block.intendedEvidence}`,
      `Duration: ${block.plannedMinutes} focused minutes`,
      'Keep the target visible, capture blockers without expanding the block, and require a short review before I record a Work session. Starting this block does not complete the Task.',
    ]),
  }
}

/** "Review context in Talk" — checking the record, not rewriting it. */
export function reviewContextContext(project: WorkProject): WorkTalkContext {
  return {
    label: `${project.name} · context review`,
    prompt: lines([
      `Review the recorded context for ${project.name} with me.`,
      targetBlock(project),
      contextBlock(project),
      project.context.nextStep ? `Recorded next valuable step: ${project.context.nextStep}` : null,
      'Tell me what is stale, missing, or no longer true. Do not change my records without asking.',
    ]),
  }
}
