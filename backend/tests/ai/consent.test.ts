import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { db } from '../../src/supabase-client'
import { aiRoutes } from '../../src/routes/ai'
import { AI_CONSENT_VERSION } from '../../src/ai-consent'

jest.mock('../../src/supabase-client', () => ({
  db: {
    getLatestAiConsentDecision: jest.fn(),
    recordAiConsentDecision: jest.fn(),
  },
}))

jest.mock('../../src/credits', () => ({
  Credits: {
    authorizeAction: jest.fn(),
    settleAction: jest.fn(),
    refundAction: jest.fn(),
  },
  UnpricedModelError: class UnpricedModelError extends Error {},
}))

const mockDb = db as jest.Mocked<typeof db>
const USER_ID = 'ai-consent-user'
const app = express()
app.use(express.json())
app.use('/api/ai', aiRoutes)

const authHeader = () => `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`

beforeEach(() => {
  jest.clearAllMocks()
})

describe('AI data-sharing consent', () => {
  it('requires a choice when the current disclosure has no decision', async () => {
    mockDb.getLatestAiConsentDecision.mockResolvedValue(null as never)

    const response = await request(app)
      .get('/api/ai/consent')
      .set('Authorization', authHeader())

    expect(response.status).toBe(200)
    expect(response.body.state).toBe('required')
    expect(response.body.decidedAt).toBeNull()
    expect(response.body.disclosure).toEqual(expect.objectContaining({
      version: AI_CONSENT_VERSION,
      providers: ['OpenAI'],
    }))
  })

  it('records affirmative permission against the exact disclosure version', async () => {
    mockDb.recordAiConsentDecision.mockResolvedValue({
      decision: 'accepted',
      disclosure_version: AI_CONSENT_VERSION,
      created_at: '2026-09-28T10:00:00.000Z',
    } as never)

    const response = await request(app)
      .post('/api/ai/consent')
      .set('Authorization', authHeader())
      .send({ version: AI_CONSENT_VERSION, decision: 'accepted' })

    expect(response.status).toBe(200)
    expect(response.body.state).toBe('accepted')
    expect(mockDb.recordAiConsentDecision).toHaveBeenCalledWith({
      userId: USER_ID,
      disclosureVersion: AI_CONSENT_VERSION,
      decision: 'accepted',
    })
  })

  it('restores permission for the same identity and current disclosure', async () => {
    mockDb.getLatestAiConsentDecision.mockResolvedValue({
      decision: 'accepted',
      disclosure_version: AI_CONSENT_VERSION,
      created_at: '2026-09-28T10:00:00.000Z',
    } as never)

    const response = await request(app)
      .get('/api/ai/consent')
      .set('Authorization', authHeader())

    expect(response.status).toBe(200)
    expect(response.body).toEqual(expect.objectContaining({
      state: 'accepted',
      decidedAt: '2026-09-28T10:00:00.000Z',
    }))
    expect(mockDb.getLatestAiConsentDecision).toHaveBeenCalledWith(USER_ID, AI_CONSENT_VERSION)
  })

  it('accepts PostgREST offset timestamps and returns canonical UTC', async () => {
    mockDb.getLatestAiConsentDecision.mockResolvedValue({
      decision: 'accepted',
      disclosure_version: AI_CONSENT_VERSION,
      created_at: '2026-09-28T12:00:00+02:00',
    } as never)

    const response = await request(app)
      .get('/api/ai/consent')
      .set('Authorization', authHeader())

    expect(response.status).toBe(200)
    expect(response.body.decidedAt).toBe('2026-09-28T10:00:00.000Z')
  })

  it('records declining and withdrawing without treating either as acceptance', async () => {
    mockDb.recordAiConsentDecision
      .mockResolvedValueOnce({
        decision: 'declined',
        disclosure_version: AI_CONSENT_VERSION,
        created_at: '2026-09-28T10:00:00.000Z',
      } as never)
      .mockResolvedValueOnce({
        decision: 'withdrawn',
        disclosure_version: AI_CONSENT_VERSION,
        created_at: '2026-09-28T10:01:00.000Z',
      } as never)

    const declined = await request(app)
      .post('/api/ai/consent')
      .set('Authorization', authHeader())
      .send({ version: AI_CONSENT_VERSION, decision: 'declined' })
    const withdrawn = await request(app)
      .post('/api/ai/consent')
      .set('Authorization', authHeader())
      .send({ version: AI_CONSENT_VERSION, decision: 'withdrawn' })

    expect(declined.body.state).toBe('declined')
    expect(withdrawn.body.state).toBe('withdrawn')
  })

  it('rejects a stale disclosure version without recording consent', async () => {
    const response = await request(app)
      .post('/api/ai/consent')
      .set('Authorization', authHeader())
      .send({ version: 'older-version', decision: 'accepted' })

    expect(response.status).toBe(409)
    expect(response.body.code).toBe('ai_consent_version_changed')
    expect(mockDb.recordAiConsentDecision).not.toHaveBeenCalled()
  })

  it('surfaces an unavailable read instead of treating it as no consent', async () => {
    mockDb.getLatestAiConsentDecision.mockRejectedValue(new Error('database unavailable'))

    const response = await request(app)
      .get('/api/ai/consent')
      .set('Authorization', authHeader())

    expect(response.status).toBe(503)
    expect(response.body.code).toBe('ai_consent_unavailable')
  })
})
