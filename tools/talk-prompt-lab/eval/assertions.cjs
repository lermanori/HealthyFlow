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

module.exports.validateTalkBehavior = (output, context) => {
  const run = parseOutput(output)
  const config = context.config ?? {}
  const calledTools = (run.toolEvents ?? []).map((event) => event.name)
  const components = []

  for (const tool of config.requiredTools ?? []) {
    components.push(result(calledTools.includes(tool), `Required tool ${tool}${calledTools.includes(tool) ? ' was called' : ' was not called'}.`))
  }

  for (const tool of config.forbiddenTools ?? []) {
    components.push(result(!calledTools.includes(tool), `Forbidden tool ${tool}${calledTools.includes(tool) ? ' was called' : ' was not called'}.`))
  }

  for (const text of config.replyIncludes ?? []) {
    const found = includesIgnoreCase(run.reply, text)
    components.push(result(found, `Reply${found ? ' included' : ' did not include'} “${text}”.`))
  }

  for (const group of config.replyIncludesOneOf ?? []) {
    const found = group.some((text) => includesIgnoreCase(run.reply, text))
    components.push(result(found, `Reply${found ? ' included' : ' did not include'} one of: ${group.join(', ')}.`))
  }

  for (const text of config.replyExcludes ?? []) {
    const absent = !includesIgnoreCase(run.reply, text)
    components.push(result(absent, `Reply${absent ? ' omitted' : ' included'} forbidden text “${text}”.`))
  }

  if (config.requireNoPendingActions) {
    const clean = (run.pendingActions ?? []).length === 0
    components.push(result(clean, clean ? 'No write preview was created.' : 'A write preview was created.'))
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
