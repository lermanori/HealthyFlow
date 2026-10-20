import { openAiScenario } from '../../talk-prompt-lab.mjs'

/** Target adapter: owns the model choice and the synthetic Talk harness. */
export async function runScenario({ scenario, systemPrompt, options }) {
  if (!options.model) throw new Error('synthetic-openai target requires options.model')
  const result = await openAiScenario({ model: options.model, systemPrompt, scenario })
  return { ...result, finalState: structuredClone(scenario.fixtureState ?? null) }
}
