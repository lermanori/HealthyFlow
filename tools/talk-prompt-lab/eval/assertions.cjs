function result(pass, reason) {
  return { pass, score: pass ? 1 : 0, reason }
}

function parseOutput(output) {
  try {
    return typeof output === 'string' ? JSON.parse(output) : output
  } catch (error) {
    throw new Error(`Provider output was not valid JSON: ${error.message}`)
  }
}

function includesIgnoreCase(value, expected) {
  return String(value ?? '').toLocaleLowerCase().includes(String(expected).toLocaleLowerCase())
}

function evaluateOne(run, config, label = 'run') {
  const calledTools = (run.toolEvents ?? []).map((event) => event.name)
  const pendingCapabilities = (run.pendingActions ?? []).map((action) => action.capability)
  const components = []

  for (const tool of config.requiredTools ?? []) {
    components.push(result(calledTools.includes(tool), `${label}: required tool ${tool}${calledTools.includes(tool) ? ' was called' : ' was not called'}.`))
  }

  for (const tool of config.forbiddenTools ?? []) {
    components.push(result(!calledTools.includes(tool), `${label}: forbidden tool ${tool}${calledTools.includes(tool) ? ' was called' : ' was not called'}.`))
  }

  for (const capability of config.requiredPendingCapabilities ?? []) {
    const found = pendingCapabilities.includes(capability)
    components.push(result(found, `${label}: ${capability} preview${found ? ' exists' : ' is missing'}.`))
  }

  for (const text of config.replyIncludes ?? []) {
    const found = includesIgnoreCase(run.reply, text)
    components.push(result(found, `${label}: reply${found ? ' included' : ' did not include'} “${text}”.`))
  }

  for (const group of config.replyIncludesOneOf ?? []) {
    const found = group.some((text) => includesIgnoreCase(run.reply, text))
    components.push(result(found, `${label}: reply${found ? ' included' : ' did not include'} one of: ${group.join(', ')}.`))
  }

  for (const text of config.replyExcludes ?? []) {
    const absent = !includesIgnoreCase(run.reply, text)
    components.push(result(absent, `${label}: reply${absent ? ' omitted' : ' included'} forbidden text “${text}”.`))
  }

  if (config.requireNoPendingActions) {
    const clean = (run.pendingActions ?? []).length === 0
    components.push(result(clean, `${label}: ${clean ? 'no write preview was created' : 'a write preview was created'}.`))
  }

  if (config.requireNoToolErrors) {
    const errors = (run.toolEvents ?? []).filter((event) => event.result?.error)
    components.push(result(errors.length === 0, `${label}: ${errors.length} tool error(s).`))
  }

  return components
}

module.exports.validateTalkBehavior = (output, context) => {
  const run = parseOutput(output)
  const config = context.config ?? {}
  const components = evaluateOne(run, config)
  for (const check of config.turnChecks ?? []) {
    const turn = run.turns?.[check.turn]
    if (!turn) {
      components.push(result(false, `Turn ${check.turn + 1} is missing.`))
      continue
    }
    components.push(...evaluateOne(turn, check, `turn ${check.turn + 1}`))
  }

  const passed = components.filter((component) => component.pass).length
  return {
    pass: passed === components.length,
    score: components.length ? passed / components.length : 1,
    reason: passed === components.length
      ? `All ${components.length} deterministic checks passed.`
      : `${components.length - passed} of ${components.length} deterministic checks failed.`,
    componentResults: components,
  }
}
