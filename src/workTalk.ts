import type { TaskRecord, WorkProject } from './services/api'

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
  workflow?: {
    name: 'plan_focused_work'
  }
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
    workflow: record.workflow
      && typeof record.workflow === 'object'
      && (record.workflow as Record<string, unknown>).name === 'plan_focused_work'
      ? { name: 'plan_focused_work' }
      : undefined,
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
    workflow: { name: 'plan_focused_work' },
    prompt: lines([
      `Help me plan focused work on ${project.name}.`,
      targetBlock(project),
      contextBlock(project),
      `Open Tasks:\n${openList}`,
      'Check alignment against the target first, then propose one startable Focus block with observable evidence. Do not schedule an ordinary Task instead.',
    ]),
  }
}

/**
 * "Discuss in Talk" — open-ended discussion of the Project.
 *
 * Deliberately carries no `workflow`: this is legacy Talk, not the durable
 * plan_focused_work runtime. Only planInTalkContext routes into a workflow.
 */
export function discussProjectContext(project: WorkProject): WorkTalkContext {
  return {
    label: `${project.name} · optional discussion`,
    prompt: lines([
      `Help me think about ${project.name}.`,
      targetBlock(project),
      'Do not change records without asking.',
    ]),
  }
}
