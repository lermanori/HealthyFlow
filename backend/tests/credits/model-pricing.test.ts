import { calculateOpenAiCostUsd, loadModelPricing } from '../../src/credits'

// Checked against OpenAI's published standard pricing on 2026-09-19
// (https://developers.openai.com/api/docs/pricing), USD per 1M tokens. If this
// fails, a price moved: confirm it against that page before updating (#297).
const VERIFIED_2026_09_19 = {
  'gpt-5.5': { inputUsdPerMillion: 5.0, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 30.0 },
  'gpt-5.4': { inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 0.25, outputUsdPerMillion: 15.0 },
  'gpt-5.4-mini': { inputUsdPerMillion: 0.75, cachedInputUsdPerMillion: 0.075, outputUsdPerMillion: 4.5 },
  'gpt-5-mini': { inputUsdPerMillion: 0.25, cachedInputUsdPerMillion: 0.025, outputUsdPerMillion: 2.0 },
  'gpt-4o-mini': { inputUsdPerMillion: 0.15, cachedInputUsdPerMillion: 0.075, outputUsdPerMillion: 0.6 },
  // No cached-input price is published: the model does not cache.
  'gpt-3.5-turbo': { inputUsdPerMillion: 0.5, outputUsdPerMillion: 1.5 },
}

describe('model pricing', () => {
  it('matches the verified published prices, cached input included', () => {
    expect(loadModelPricing(undefined)).toEqual(VERIFIED_2026_09_19)
  })

  it('prices cached input tokens at the cached rate', () => {
    const cost = calculateOpenAiCostUsd('gpt-5.4-mini', {
      promptTokens: 1000,
      cachedPromptTokens: 400,
      completionTokens: 200,
    })
    expect(cost).toBeCloseTo((600 * 0.75 + 400 * 0.075 + 200 * 4.5) / 1_000_000, 12)
  })

  it('prices every input token at the input rate when none were cached', () => {
    const cost = calculateOpenAiCostUsd('gpt-4o-mini', { promptTokens: 1000, completionTokens: 200 })
    expect(cost).toBeCloseTo((1000 * 0.15 + 200 * 0.6) / 1_000_000, 12)
  })
})
