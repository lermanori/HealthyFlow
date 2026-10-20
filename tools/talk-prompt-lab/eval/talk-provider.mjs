import { loadScenarios } from '../scenario-catalog.mjs'

export default class HealthyFlowTalkProvider {
  constructor(options = {}) {
    this.config = options.config ?? {}
  }

  id() {
    return `healthyflow-talk:${this.config.name ?? this.config.targetModule ?? 'unconfigured'}`
  }

  async callApi(systemPrompt, context = {}) {
    const scenarioId = context.vars?.scenarioId
    const scenario = loadScenarios().find((candidate) => candidate.id === scenarioId)
    if (!scenario) {
      return { error: `Unknown Talk evaluation scenario: ${scenarioId ?? '(missing)'}` }
    }

    if (!this.config.targetModule) {
      return { error: 'Talk evaluation targetModule is required.' }
    }
    const targetUrl = new URL(this.config.targetModule, import.meta.url)
    const target = await import(targetUrl.href)
    if (typeof target.runScenario !== 'function') {
      return { error: `Talk evaluation target ${this.config.targetModule} must export runScenario.` }
    }
    const result = await target.runScenario({
      scenario,
      systemPrompt,
      options: this.config.options ?? {},
    })
    if (!result || typeof result.reply !== 'string' || !Array.isArray(result.turns)
      || !Array.isArray(result.toolEvents) || !Array.isArray(result.pendingActions)
      || !result.usage || typeof result.usage.totalTokens !== 'number'
      || typeof result.elapsedMs !== 'number') {
      return { error: `Talk evaluation target ${this.config.targetModule} returned an invalid trace.` }
    }
    return {
      output: JSON.stringify({
        reply: result.reply,
        turns: result.turns,
        toolEvents: result.toolEvents,
        pendingActions: result.pendingActions,
        finalFixtureState: result.finalState,
        usage: result.usage,
        latencyMs: result.elapsedMs,
      }),
      tokenUsage: {
        prompt: result.usage.promptTokens,
        completion: result.usage.completionTokens,
        total: result.usage.totalTokens,
      },
      metadata: { scenarioId },
    }
  }
}
