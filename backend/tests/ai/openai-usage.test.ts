/**
 * Tests that Openai.callStructured surfaces OpenAI's `usage` block on the
 * result (issue #43, Slice A) — needed so credits.ts can settle the actual
 * token cost after a call.
 */

import nock from 'nock'
import { Openai } from '../../src/openai'

describe('Openai.callStructured — usage threading', () => {
  afterEach(() => {
    nock.cleanAll()
  })

  it('surfaces prompt/completion/total tokens from the OpenAI response', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
        usage: { prompt_tokens: 42, completion_tokens: 8, total_tokens: 50 },
      })

    const result = await Openai.callStructured({
      model: 'gpt-4o-mini',
      systemPrompt: 'sys',
      userPrompt: 'user',
      schemaName: 'test_schema',
      jsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
      parser: (v) => v as { ok: boolean },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.usage).toEqual({
        promptTokens: 42,
        completionTokens: 8,
        totalTokens: 50,
      })
    }
  })
})
