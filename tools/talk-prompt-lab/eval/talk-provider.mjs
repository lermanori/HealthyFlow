import { loadScenarios, openAiTurn } from '../talk-prompt-lab.mjs'

export default class HealthyFlowTalkProvider {
  constructor(options = {}) {
    this.config = options.config ?? {}
  }

  id() {
    return `healthyflow-talk:${this.config.model ?? 'gpt-4o-mini'}`
  }

  async callApi(systemPrompt, context = {}) {
    const scenarioId = context.vars?.scenarioId
    const scenario = loadScenarios().find((candidate) => candidate.id === scenarioId)
    if (!scenario) {
      return { error: `Unknown Talk evaluation scenario: ${scenarioId ?? '(missing)'}` }
    }

    const result = await openAiTurn({
      model: this.config.model ?? 'gpt-4o-mini',
      systemPrompt,
      scenario,
    })
    const pendingActions = result.toolEvents
      .map((event) => event.result?.pendingAction)
      .filter(Boolean)

    return {
      output: JSON.stringify({
        reply: result.output,
        toolEvents: result.toolEvents,
        pendingActions,
        finalFixtureState: scenario.fixtureState ?? null,
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
