import { z } from 'zod'
import { db } from './supabase-client'

export const AI_CONSENT_VERSION = '2026-09-28.openai.v1'

export const AiConsentDecisionSchema = z.enum(['accepted', 'declined', 'withdrawn'])
export type AiConsentDecision = z.infer<typeof AiConsentDecisionSchema>

const StoredAiConsentDecisionSchema = z.object({
  decision: AiConsentDecisionSchema,
  disclosure_version: z.string().min(1),
  created_at: z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString()),
})

export const AiConsentSubmissionSchema = z.object({
  version: z.string().min(1),
  decision: AiConsentDecisionSchema,
}).strict()

export const AI_CONSENT_DISCLOSURE = {
  version: AI_CONSENT_VERSION,
  title: 'Use AI features',
  providers: ['OpenAI'],
  introduction: 'HealthyFlow uses third-party AI providers to process AI requests. The current provider is OpenAI.',
  dataCategories: [
    'What you type or dictate',
    'Photos or text files you attach',
    'Recent Talk messages',
    'Relevant information from your profile, Goals, planning and calendar, habits, food, weight, and workouts',
  ],
  processing: 'OpenAI processes this information to generate responses and proposed changes.',
  storage: 'HealthyFlow stores your Talk history on its servers.',
  optionalUse: 'You can continue using manual planning and tracking without enabling AI.',
  futureProviders: 'If HealthyFlow begins sharing data with another AI provider, we will identify that provider and ask for your permission again.',
} as const

export type AiConsentStatus = {
  state: 'required' | AiConsentDecision
  decidedAt: string | null
  disclosure: typeof AI_CONSENT_DISCLOSURE
}

export class AiConsentVersionError extends Error {
  readonly code = 'ai_consent_version_changed'

  constructor() {
    super('The AI disclosure changed. Review the current information before choosing again.')
  }
}

export const AiConsent = {
  async getStatus(userId: string): Promise<AiConsentStatus> {
    const raw = await db.getLatestAiConsentDecision(userId, AI_CONSENT_VERSION)
    if (!raw) {
      return { state: 'required', decidedAt: null, disclosure: AI_CONSENT_DISCLOSURE }
    }
    const row = StoredAiConsentDecisionSchema.parse(raw)
    return {
      state: row.decision,
      decidedAt: row.created_at,
      disclosure: AI_CONSENT_DISCLOSURE,
    }
  },

  async decide(userId: string, version: string, decision: AiConsentDecision): Promise<AiConsentStatus> {
    if (version !== AI_CONSENT_VERSION) throw new AiConsentVersionError()
    const row = StoredAiConsentDecisionSchema.parse(
      await db.recordAiConsentDecision({
        userId,
        disclosureVersion: version,
        decision,
      }),
    )
    return {
      state: row.decision,
      decidedAt: row.created_at,
      disclosure: AI_CONSENT_DISCLOSURE,
    }
  },
}
