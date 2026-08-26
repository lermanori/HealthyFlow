/**
 * Guard tests for ADR-0013.
 *
 * These exist because of a specific failure: the sale unit and the cost meter were
 * the same number, drifted twenty-fold apart, and nothing in the codebase could
 * notice — `sellCreditsPerUsd` was derived from the pack it was meant to justify.
 *
 * Each test below pins one half of that: what a user is charged, and what we are
 * charged. If a change makes any of these fail, the question to ask is not "how do
 * I update the expectation" but "did I just move a price without deciding to".
 */
import {
  ACTION_PRICE,
  APP_TOKENS_PER_USD,
  calculateOpenAiCostUsd,
  classifyAction,
  countImages,
  FREE_DAILY_ACTION_CAP,
  GLOBAL_DAILY_COST_CEILING_USD,
  MAX_IMAGES_PER_REQUEST,
  MAX_PROMPT_CHARS,
  priceAction,
  PromptTooLargeError,
  SUB_PHOTO_MONTHLY_CAP,
  SUB_PREMIUM_MONTHLY_CAP,
  SUB_TEXT_DAILY_CAP,
  TooManyImagesError,
  TOP_UP_CREDITS,
  TOP_UP_PRICE_USD,
  UnpricedModelError,
  assertRequestWithinLimits,
} from '../../src/credits'

const image = { type: 'image_url' as const }
const text = (value: string) => ({ type: 'text' as const, text: value })

describe('the sale unit', () => {
  it('prices a text action at exactly one credit', () => {
    expect(priceAction({
      endpoint: 'parse-tasks',
      model: 'gpt-4o-mini',
      userPrompt: 'gym at 7, dentist tomorrow, weigh in',
    })).toBe(1)
  })

  it('prices a photo action at exactly five credits', () => {
    expect(priceAction({
      endpoint: 'parse-meals',
      model: 'gpt-4o-mini',
      userPrompt: [text('what is in this'), image],
    })).toBe(5)
  })

  it('prices a premium-model action at exactly ten credits', () => {
    expect(priceAction({
      endpoint: 'talk',
      model: 'gpt-5.4',
      userPrompt: 'plan my week',
    })).toBe(10)
  })

  it('charges a photo sent to a premium model once, at the photo price', () => {
    // Charging both weights would double-bill one request. Photo is deliberately
    // the cheaper of the two: the surface we most want used is the one we least
    // want to make expensive.
    expect(priceAction({
      endpoint: 'parse-meals',
      model: 'gpt-5.4',
      userPrompt: [text('label'), image],
    })).toBe(ACTION_PRICE.photo)
  })

  it('does not price a model it cannot cost', () => {
    expect(() => priceAction({
      endpoint: 'parse-tasks',
      model: 'some-model-nobody-budgeted',
      userPrompt: 'hello',
    })).toThrow(UnpricedModelError)
  })
})

describe('price is independent of cost', () => {
  it('charges the same for a one-word prompt and a five-thousand-word one', () => {
    const short = priceAction({ endpoint: 'parse-tasks', model: 'gpt-4o-mini', userPrompt: 'gym' })
    const long = priceAction({
      endpoint: 'parse-tasks',
      model: 'gpt-4o-mini',
      userPrompt: 'gym at seven, then '.repeat(500),
    })
    expect(short).toBe(long)
  })

  it('keeps a text action worth far more than it costs, at every model we call', () => {
    // A realistic text call: ~900 prompt tokens in, ~300 out.
    const usage = { promptTokens: 900, completionTokens: 300, totalTokens: 1200 }
    for (const model of ['gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-5-mini']) {
      const cost = calculateOpenAiCostUsd(model, usage)
      // At the $5/300 pack, one credit sells for about 1.7 cents.
      const price = ACTION_PRICE.text * (TOP_UP_PRICE_USD / TOP_UP_CREDITS)
      expect(cost).toBeLessThan(price)
    }
  })

  it('keeps the pack worth a real number of actions', () => {
    // The failure this replaces: $5 bought about 41 sentences, because the sale
    // unit had quietly become twenty times more expensive than the meter.
    expect(TOP_UP_CREDITS / ACTION_PRICE.text).toBeGreaterThanOrEqual(250)
  })

  it('never derives a price from the cost meter', () => {
    // APP_TOKENS_PER_USD is cost accounting. If a price is ever a multiple of it
    // again, the two units have been reconnected and the drift can recur.
    for (const price of Object.values(ACTION_PRICE)) {
      expect(price).toBeLessThan(APP_TOKENS_PER_USD)
      expect(APP_TOKENS_PER_USD % price === 0 && price > 10).toBe(false)
    }
  })
})

describe('classification', () => {
  it('counts images only in a structured prompt', () => {
    expect(countImages('just text')).toBe(0)
    expect(countImages([text('a'), image, image])).toBe(2)
  })

  it('reads text, photo and premium from the request alone', () => {
    expect(classifyAction({ endpoint: 'e', model: 'gpt-4o-mini', userPrompt: 'x' })).toBe('text')
    expect(classifyAction({ endpoint: 'e', model: 'gpt-4o-mini', userPrompt: [image] })).toBe('photo')
    expect(classifyAction({ endpoint: 'e', model: 'gpt-5.5', userPrompt: 'x' })).toBe('premium')
  })
})

describe('cost guards', () => {
  it('refuses a prompt larger than the ceiling', () => {
    expect(() => assertRequestWithinLimits({
      endpoint: 'parse-tasks',
      model: 'gpt-4o-mini',
      userPrompt: 'x'.repeat(MAX_PROMPT_CHARS + 1),
    })).toThrow(PromptTooLargeError)
  })

  it('counts the system prompt toward that ceiling', () => {
    // Otherwise a long system prompt plus a long paste slips through together.
    expect(() => assertRequestWithinLimits({
      endpoint: 'parse-tasks',
      model: 'gpt-4o-mini',
      systemPrompt: 'y'.repeat(MAX_PROMPT_CHARS - 10),
      userPrompt: 'x'.repeat(100),
    })).toThrow(PromptTooLargeError)
  })

  it('refuses more images than one request may carry', () => {
    expect(() => assertRequestWithinLimits({
      endpoint: 'parse-meals',
      model: 'gpt-4o-mini',
      userPrompt: Array(MAX_IMAGES_PER_REQUEST + 1).fill(image),
    })).toThrow(TooManyImagesError)
  })

  it('allows a request that sits exactly on both limits', () => {
    expect(() => assertRequestWithinLimits({
      endpoint: 'parse-meals',
      model: 'gpt-4o-mini',
      userPrompt: [text('x'.repeat(MAX_PROMPT_CHARS - 1)), ...Array(MAX_IMAGES_PER_REQUEST).fill(image)],
    })).not.toThrow()
  })

  it('bounds a single account below the global ceiling', () => {
    // One runaway account must not be able to spend the whole day's budget. The
    // worst it can do is its daily cap of premium actions.
    const worstAccountDayUsd = FREE_DAILY_ACTION_CAP * 0.0195
    expect(worstAccountDayUsd).toBeLessThan(GLOBAL_DAILY_COST_CEILING_USD)
  })

  it('sets the global ceiling far above honest use and far below a disaster', () => {
    // A thousand subscribers on a typical day cost about $0.20 each.
    expect(GLOBAL_DAILY_COST_CEILING_USD).toBeGreaterThan(10)
    expect(GLOBAL_DAILY_COST_CEILING_USD).toBeLessThan(500)
  })
})

describe('subscription entitlements stay affordable', () => {
  it('costs us less than the subscription price even when every cap is reached', () => {
    const worstCase =
      SUB_TEXT_DAILY_CAP * 30 * 0.00031 +
      SUB_PHOTO_MONTHLY_CAP * 0.00393 +
      SUB_PREMIUM_MONTHLY_CAP * 0.0195
    // The founding price is $9. A subscriber who maxes everything must still leave
    // a real margin, or "unlimited" is a promise we cannot afford to print.
    expect(worstCase).toBeLessThan(9 * 0.4)
  })
})
