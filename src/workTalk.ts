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
    name: 'plan_work'
    /** Verified Project id. The workflow resolves scope from this, not from prompt text. */
    projectId: string
  }
}

/**
 * Accepts the Phase 5 name so router state already in flight keeps working, and
 * normalises it to plan_work. A handoff without a Project id is not a workflow
 * handoff: the whole point is that the Project arrives verified.
 */
function parseWorkflow(value: unknown): WorkTalkContext['workflow'] {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (record.name !== 'plan_work' && record.name !== 'plan_focused_work') return undefined
  if (typeof record.projectId !== 'string' || !record.projectId) return undefined
  return { name: 'plan_work', projectId: record.projectId }
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
    workflow: parseWorkflow(record.workflow),
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
    workflow: { name: 'plan_work', projectId: project.id },
    prompt: lines([
      `Help me plan focused work on ${project.name}.`,
      targetBlock(project),
      contextBlock(project),
      `Open Tasks:\n${openList}`,
      // No architectural commands here. The plan_work workflow definition owns
      // which stage runs and what it may produce; a prompt line ordering "one
      // Focus block, never a Task" is exactly what fought the zero-Task branch
      // in the ADR-0009 regression trace.
      'Plan focused work that genuinely advances the target.',
    ]),
  }
}

/**
 * "Discuss in Talk" — open-ended discussion of the Project.
 *
 * Deliberately carries no `workflow`: this is legacy Talk, not the durable
 * plan_work runtime. Only planInTalkContext routes into a workflow.
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
