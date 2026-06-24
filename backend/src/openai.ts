const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

export type OpenAIErrorCode = 'no_key' | 'upstream' | 'invalid_response'

export type TokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type OpenAIResult<T> =
  | { ok: true; value: T; usage?: TokenUsage }
  | { ok: false; code: OpenAIErrorCode; message: string }

type CallOpts = {
  model: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
}

async function rawCall(
  opts: CallOpts & { responseFormat?: any }
): Promise<OpenAIResult<string>> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { ok: false, code: 'no_key', message: 'Missing OPENAI_API_KEY' }
  }

  const body: any = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.2,
  }
  if (opts.maxTokens) body.max_tokens = opts.maxTokens
  if (opts.responseFormat) body.response_format = opts.responseFormat

  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.error('OpenAI upstream error:', res.status, res.statusText)
      return { ok: false, code: 'upstream', message: `Upstream ${res.status}` }
    }
    const data = (await res.json()) as any
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      console.error('OpenAI response missing content:', data)
      return { ok: false, code: 'invalid_response', message: 'Missing content' }
    }
    const rawUsage = data.usage
    const usage: TokenUsage | undefined = rawUsage
      ? {
          promptTokens: rawUsage.prompt_tokens,
          completionTokens: rawUsage.completion_tokens,
          totalTokens: rawUsage.total_tokens,
        }
      : undefined
    return { ok: true, value: String(content), usage }
  } catch (e) {
    console.error('OpenAI call threw:', e)
    return { ok: false, code: 'upstream', message: 'Network error' }
  }
}

export const Openai = {
  async callText(opts: CallOpts): Promise<OpenAIResult<string>> {
    const result = await rawCall(opts)
    if (!result.ok) return result
    return { ok: true, value: result.value.trim(), usage: result.usage }
  },

  async callStructured<T>(
    opts: CallOpts & {
      schemaName: string
      jsonSchema: any
      parser: (v: unknown) => T
    }
  ): Promise<OpenAIResult<T>> {
    const result = await rawCall({
      ...opts,
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: opts.schemaName,
          schema: opts.jsonSchema,
          strict: true,
        },
      },
    })
    if (!result.ok) return result
    try {
      const parsed = opts.parser(JSON.parse(result.value))
      return { ok: true, value: parsed, usage: result.usage }
    } catch (e) {
      console.error('OpenAI structured parse failed:', e)
      return { ok: false, code: 'invalid_response', message: 'Schema validation failed' }
    }
  },
}
