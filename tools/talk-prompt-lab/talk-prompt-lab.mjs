#!/usr/bin/env node

/**
 * PROTOTYPE QUESTION
 *
 * Which system-prompt framing makes regular Talk behave most like HealthyFlow's
 * target without weakening confirmation safety? This TUI varies only the
 * prompt; scenarios and preview-only tools stay fixed.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'
import { initialState, MODELS, reduceLabState } from './lab-state.mjs'

const LAB_DIR = dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = resolve(LAB_DIR, '../..')
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const MAX_TOOL_ITERATIONS = 4
const bold = '\u001b[1m'
const dim = '\u001b[2m'
const cyan = '\u001b[36m'
const yellow = '\u001b[33m'
const red = '\u001b[31m'
const reset = '\u001b[0m'

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function variantLabel(filename) {
  return filename.replace(/\.md$/, '').replace(/^\d+-/, '').replaceAll('-', ' ')
}

function loadVariants() {
  return readdirSync(join(LAB_DIR, 'prompts'))
    .filter((filename) => filename.endsWith('.md'))
    .sort()
    .map((filename) => ({
      id: filename.replace(/\.md$/, ''),
      label: variantLabel(filename),
      filename,
      template: readFileSync(join(LAB_DIR, 'prompts', filename), 'utf8').trim(),
    }))
}

function weekdayDate(date) {
  const instant = new Date(`${date}T12:00:00.000Z`)
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(instant)
  return `${weekday}, ${date}`
}

function offsetDate(date, offset) {
  const instant = new Date(`${date}T12:00:00.000Z`)
  instant.setUTCDate(instant.getUTCDate() + offset)
  return instant.toISOString().slice(0, 10)
}

function dateContext(anchor) {
  const nextSeven = Array.from({ length: 7 }, (_, index) => `- ${weekdayDate(offsetDate(anchor.date, index))}`).join('\n')
  return `Date context:
- Client time zone: ${anchor.timeZone}
- Current local date: ${weekdayDate(anchor.date)}
- Current local time: ${anchor.time}
- Yesterday: ${weekdayDate(offsetDate(anchor.date, -1))}
- Tomorrow: ${weekdayDate(offsetDate(anchor.date, 1))}

Next 7 days (counting today):
${nextSeven}

Named weekday resolution:
- A bare weekday name means the NEXT occurrence, counting today if it matches.
- Hebrew weekday names: ראשון=Sunday, שני=Monday, שלישי=Tuesday, רביעי=Wednesday, חמישי=Thursday, שישי=Friday, שבת=Saturday.
- The Israeli week starts on Sunday.
- Never compute a weekday from a date yourself; use the dated list above.`
}

function renderSystemPrompt(variant, scenario) {
  const context = dateContext(scenario.anchor)
  return variant.template.includes('{{DATE_CONTEXT}}')
    ? variant.template.replaceAll('{{DATE_CONTEXT}}', context)
    : `${variant.template}\n\n${context}`
}

function primaryWorktreeRoot() {
  const dotGitPath = join(REPOSITORY_ROOT, '.git')
  if (!existsSync(dotGitPath)) return null
  if (statSync(dotGitPath).isDirectory()) return REPOSITORY_ROOT
  const dotGit = readFileSync(dotGitPath, 'utf8').trim()
  if (!dotGit.startsWith('gitdir: ')) return REPOSITORY_ROOT
  const gitDir = resolve(REPOSITORY_ROOT, dotGit.slice('gitdir: '.length))
  return dirname(dirname(dirname(gitDir)))
}

function loadEnvFile(path) {
  if (!path || !existsSync(path)) return
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const equals = line.indexOf('=')
    if (equals < 1) continue
    const key = line.slice(0, equals).trim()
    if (process.env[key] !== undefined) continue
    let value = line.slice(equals + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function ensureApiKey() {
  if (process.env.OPENAI_API_KEY) return true
  const primary = primaryWorktreeRoot()
  loadEnvFile(primary ? join(primary, '.env') : null)
  return Boolean(process.env.OPENAI_API_KEY)
}

function objectSchema(properties, required = []) {
  return { type: 'object', properties, required, additionalProperties: false }
}

function nullable(type) {
  return { type: [type, 'null'] }
}

const DATE = { type: 'string', description: 'YYYY-MM-DD' }
const TIME = { type: ['string', 'null'], description: 'HH:MM local time or null' }
const CATEGORY = { type: 'string', enum: ['health', 'work', 'personal', 'fitness', 'grocery', 'nutrition'] }

const TOOL_DEFINITIONS = [
  ['get_today', "Return a bounded overview of today's HealthyFlow Tasks, Habit instances, calories, weight, achievements, and workout sessions.", objectSchema({})],
  ['list_tasks', 'List bounded HealthyFlow Items for a date so current Item ids can be verified.', objectSchema({ date: DATE, limit: { type: 'integer', minimum: 1, maximum: 50 } })],
  ['list_calorie_entries', 'List Calorie entries for a date.', objectSchema({ date: DATE })],
  ['search_calorie_history', 'Search the user’s previous Calorie entries by food name before using an estimate.', objectSchema({ query: { type: 'string' } }, ['query'])],
  ['lookup_food_nutrition', 'Look up one branded or structured food when user history is missing.', objectSchema({ query: { type: 'string' } }, ['query'])],
  ['parse_meal_entries', 'Parse a vague or composite meal into grounded Calorie entry candidates.', objectSchema({ text: { type: 'string' } }, ['text'])],
  ['list_weight_summary', 'Return recent Weight entries.', objectSchema({ limit: { type: 'integer', minimum: 1, maximum: 100 } })],
  ['list_achievements', 'Return recent Progress records.', objectSchema({ limit: { type: 'integer', minimum: 1, maximum: 100 } })],
  ['list_workout_sessions', 'Return Workout sessions for a date.', objectSchema({ date: DATE })],
  ['add_task', 'Preview then add a one-shot Task. This fake tool never executes the write.', objectSchema({ title: { type: 'string' }, category: CATEGORY, duration: { type: 'integer', minimum: 1 }, startTime: TIME, scheduledDate: DATE }, ['title'])],
  ['add_habit', 'Preview then add a recurring Habit. This fake tool never executes the write.', objectSchema({ title: { type: 'string' }, category: CATEGORY, duration: { type: 'integer', minimum: 1 }, startTime: TIME, repeat: { type: 'string', enum: ['daily', 'weekly'] } }, ['title'])],
  ['add_calorie_entry', 'Preview then add one Calorie entry. This fake tool never executes the write.', objectSchema({ date: DATE, time: TIME, name: { type: 'string' }, calories: { type: 'integer', minimum: 0 }, protein: nullable('number'), carbs: nullable('number'), fat: nullable('number'), quantity: nullable('string') }, ['name', 'calories'])],
  ['add_weight_entry', 'Preview then add one Weight entry. This fake tool never executes the write.', objectSchema({ date: DATE, weightKg: { type: 'number', exclusiveMinimum: 0 } }, ['weightKg'])],
  ['add_workout_session', 'Preview then add one completed Workout session. This fake tool never executes the write.', objectSchema({ date: DATE, title: { type: 'string' }, duration: { type: 'integer', minimum: 1 }, notes: nullable('string') }, ['title', 'duration'])],
  ['update_item', 'Preview an Item update. The id must come from get_today or list_tasks in this turn.', objectSchema({ itemId: { type: 'string' }, title: { type: 'string' }, category: CATEGORY, duration: { type: 'integer', minimum: 1 }, startTime: TIME, scheduledDate: DATE }, ['itemId'])],
  ['complete_task', 'Preview Task completion. The id must come from get_today or list_tasks in this turn.', objectSchema({ itemId: { type: 'string' } }, ['itemId'])],
  ['delete_item', 'Preview Item deletion. The id must come from get_today or list_tasks in this turn.', objectSchema({ itemId: { type: 'string' } }, ['itemId'])],
].map(([name, description, parameters]) => ({ type: 'function', function: { name, description, parameters } }))

const WRITE_TOOLS = new Set([
  'add_task', 'add_habit', 'add_calorie_entry', 'add_weight_entry',
  'add_workout_session', 'update_item', 'complete_task', 'delete_item',
])

function fakeToolResult(scenario, name, args) {
  if (WRITE_TOOLS.has(name)) {
    const effectiveArgs = { ...args }
    if ((name === 'add_task' || name === 'add_habit') && effectiveArgs.duration === undefined) effectiveArgs.duration = 15
    if ((name === 'add_task' || name === 'add_habit') && effectiveArgs.category === undefined) effectiveArgs.category = name === 'add_habit' ? 'health' : 'personal'
    return {
      pendingAction: {
        id: `prototype-${name}`,
        capability: name,
        status: 'preview_only',
        args: effectiveArgs,
        notice: 'PROTOTYPE: no write can be confirmed or executed',
      },
    }
  }
  if (Object.hasOwn(scenario.toolResults, name)) return scenario.toolResults[name]
  return {
    error: {
      code: 'fixture_unavailable',
      message: `${name} has no result in this synthetic scenario; do not treat this as empty.`,
    },
  }
}

function generationParams(model) {
  return model.startsWith('gpt-5') || model.startsWith('o')
    ? { max_completion_tokens: 1400 }
    : { temperature: 0.2, max_tokens: 1400 }
}

async function openAiTurn({ model, systemPrompt, scenario }) {
  if (!ensureApiKey()) throw new Error('OPENAI_API_KEY is missing from the shell and the primary HealthyFlow .env')

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: scenario.user },
  ]
  const toolEvents = []
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  const startedAt = Date.now()

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
        parallel_tool_calls: false,
        ...generationParams(model),
      }),
    })

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(body?.error?.message || `OpenAI returned HTTP ${response.status}`)
    }

    usage.promptTokens += body.usage?.prompt_tokens ?? 0
    usage.completionTokens += body.usage?.completion_tokens ?? 0
    usage.totalTokens += body.usage?.total_tokens ?? 0

    const assistant = body.choices?.[0]?.message
    if (!assistant) throw new Error('OpenAI returned no assistant message')
    messages.push(assistant)

    if (!assistant.tool_calls?.length) {
      return {
        output: assistant.content || '(No final message returned.)',
        toolEvents,
        usage,
        elapsedMs: Date.now() - startedAt,
      }
    }

    for (const call of assistant.tool_calls) {
      let args
      try {
        args = JSON.parse(call.function.arguments || '{}')
      } catch {
        args = { invalidJson: call.function.arguments }
      }
      const result = fakeToolResult(scenario, call.function.name, args)
      toolEvents.push({ name: call.function.name, args, result })
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }

  return {
    output: 'The model exhausted the four-iteration prototype tool budget without returning a final answer.',
    toolEvents,
    usage,
    elapsedMs: Date.now() - startedAt,
  }
}

function clip(value, limit) {
  const text = String(value ?? '')
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function compactOneLine(value, limit = 220) {
  return clip(String(value ?? '').replace(/\s+/g, ' ').trim(), limit)
}

function renderRun(run, index) {
  const toolNames = run.toolEvents.length ? run.toolEvents.map((event) => event.name).join(' → ') : 'none'
  return [
    `${bold}${index + 1}. ${run.variant.label}${reset} ${dim}${run.elapsedMs}ms · ${run.usage.totalTokens} tokens${reset}`,
    `   ${cyan}tools${reset}: ${toolNames}`,
    `   ${cyan}answer${reset}: ${compactOneLine(run.output, 420)}`,
  ].join('\n')
}

function render(state, variants, scenarios) {
  const variant = variants[state.promptIndex]
  const scenario = scenarios[state.scenarioIndex]
  const model = MODELS[state.modelIndex]
  console.clear()
  console.log(`${bold}${yellow}PROTOTYPE — HealthyFlow Talk Prompt Lab${reset}`)
  console.log(`${dim}Synthetic data · preview-only writes · direct OpenAI API billing · nothing is persisted${reset}\n`)
  console.log(`${bold}Prompt${reset}:   ${variant.label} ${dim}(${state.promptIndex + 1}/${variants.length}, ${variant.filename})${reset}`)
  console.log(`${bold}Scenario${reset}: ${scenario.label} ${dim}(${state.scenarioIndex + 1}/${scenarios.length})${reset}`)
  console.log(`${bold}Model${reset}:    ${model}`)
  console.log(`${bold}Status${reset}:   ${state.busy ? yellow : cyan}${state.status}${reset}`)
  console.log(`${bold}User${reset}:     ${compactOneLine(scenario.user, 260)}\n`)

  if (state.view === 'prompt') {
    console.log(`${bold}Rendered system prompt${reset}\n${clip(renderSystemPrompt(variant, scenario), 3200)}`)
  } else if (state.view === 'full') {
    if (!state.runs.length) {
      console.log(`${dim}Run a prompt first, then press v twice to inspect its full result.${reset}`)
    } else {
      console.log(`${bold}Full run detail${reset}`)
      for (const run of state.runs) {
        console.log(`\n${bold}${run.variant.label}${reset}`)
        console.log(`${cyan}Answer${reset}\n${run.output}`)
        console.log(`\n${cyan}Tool calls${reset}`)
        if (!run.toolEvents.length) console.log('none')
        for (const event of run.toolEvents) {
          console.log(`- ${bold}${event.name}${reset}`)
          console.log(`  args: ${clip(JSON.stringify(event.args), 500)}`)
          console.log(`  result: ${clip(JSON.stringify(event.result), 500)}`)
        }
      }
    }
  } else if (state.error) {
    console.log(`${red}${bold}Run failed${reset}\n${state.error}`)
  } else if (state.runs.length) {
    console.log(`${bold}Results${reset}`)
    console.log(state.runs.map(renderRun).join('\n\n'))
  } else {
    console.log(`${dim}No run yet. Press r for this prompt or a for every prompt.${reset}`)
  }

  console.log(`\n${bold}[p]${reset} next prompt  ${bold}[s]${reset} next scenario  ${bold}[m]${reset} next model  ${bold}[r]${reset} run  ${bold}[a]${reset} run all  ${bold}[v]${reset} result/prompt/full  ${bold}[q]${reset} quit`)
}

async function runVariants(selectedVariants, scenario, model, setStatus) {
  const runs = []
  for (let index = 0; index < selectedVariants.length; index += 1) {
    const variant = selectedVariants[index]
    setStatus(`running ${variant.label} (${index + 1}/${selectedVariants.length})`)
    const result = await openAiTurn({
      model,
      systemPrompt: renderSystemPrompt(variant, scenario),
      scenario,
    })
    runs.push({ variant, ...result })
  }
  return runs
}

const variants = loadVariants()
const scenarios = loadJson(join(LAB_DIR, 'scenarios.json'))

if (process.argv.includes('--smoke')) {
  const rendered = renderSystemPrompt(variants[0], scenarios[0])
  const preview = fakeToolResult(scenarios[0], 'add_task', { title: 'Call dentist' })
  if (!rendered.includes('Current local date') || preview.pendingAction.status !== 'preview_only') {
    throw new Error('Prompt Lab smoke check failed')
  }
  console.log(`Prompt Lab ready: ${variants.length} prompts, ${scenarios.length} scenarios, ${TOOL_DEFINITIONS.length} fake tools.`)
  process.exit(0)
}

if (!process.stdin.isTTY) {
  console.error('The Prompt Lab needs an interactive terminal. Run npm run prompt-lab from Terminal.')
  process.exit(1)
}

let state = initialState(variants.length, scenarios.length)
readline.emitKeypressEvents(process.stdin)
process.stdin.setRawMode(true)
process.stdin.resume()
render(state, variants, scenarios)

async function executeRun(all) {
  if (state.busy) return
  const scenario = scenarios[state.scenarioIndex]
  const model = MODELS[state.modelIndex]
  const selected = all ? variants : [variants[state.promptIndex]]
  state = reduceLabState(state, { type: 'run_started', status: `starting ${selected.length} run${selected.length === 1 ? '' : 's'}` })
  render(state, variants, scenarios)
  try {
    const runs = await runVariants(selected, scenario, model, (status) => {
      state = { ...state, status }
      render(state, variants, scenarios)
    })
    state = reduceLabState(state, { type: 'run_finished', runs })
  } catch (error) {
    state = reduceLabState(state, { type: 'run_failed', error: error instanceof Error ? error.message : String(error) })
  }
  render(state, variants, scenarios)
}

process.stdin.on('keypress', (_text, key) => {
  if (key.ctrl && key.name === 'c') key.name = 'q'
  if (key.name === 'q') {
    process.stdin.setRawMode(false)
    process.stdin.pause()
    console.clear()
    console.log('Prompt Lab closed. Nothing was persisted.')
    return
  }
  if (state.busy) return
  if (key.name === 'p') state = reduceLabState(state, { type: 'next_prompt' })
  if (key.name === 's') state = reduceLabState(state, { type: 'next_scenario' })
  if (key.name === 'm') state = reduceLabState(state, { type: 'next_model' })
  if (key.name === 'v') state = reduceLabState(state, { type: 'toggle_view' })
  if (key.name === 'r') return void executeRun(false)
  if (key.name === 'a') return void executeRun(true)
  render(state, variants, scenarios)
})
