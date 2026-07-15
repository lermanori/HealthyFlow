import fs from 'fs'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'

jest.mock('../../src/credits', () => ({
  Credits: {
    reserve: jest.fn().mockResolvedValue(true),
    estimateReserve: jest.fn().mockReturnValue(10),
    settleReserved: jest.fn().mockResolvedValue({ ok: true, chargeTokens: 6, adjustmentTokens: 4 }),
    refundReserve: jest.fn().mockResolvedValue(undefined),
    grant: jest.fn().mockResolvedValue(undefined),
    getBalance: jest.fn(),
  },
  FREE_SIGNUP_CREDITS: 50,
  UnpricedModelError: class UnpricedModelError extends Error {},
}))

jest.mock('../../src/supabase-client', () => ({
  db: {
    getCalorieItemByNormalizedName: jest.fn().mockResolvedValue(null),
    getRecentCalorieItems: jest.fn().mockResolvedValue([]),
    getMostUsedCalorieItems: jest.fn().mockResolvedValue([]),
    getCalorieEntriesByDay: jest.fn().mockResolvedValue([]),
    createAiPendingAction: jest.fn().mockImplementation(async (row) => ({
      id: '11111111-1111-4111-8111-111111111111',
      capability: row.capability,
      preview: row.preview,
      expires_at: row.expires_at,
    })),
  },
}))

const DEFAULT_MULLER_PHOTO_PATH =
  '/tmp/codex-remote-attachments/019f6592-a01e-7de1-858c-6da9c75c6f70/CEDD7F7B-2FB8-42C8-88BA-7379D6BBA619/1-Photo-1.jpg'

const runLiveTalkPhotoTest =
  process.env.RUN_OPENAI_TALK_PHOTO_E2E === '1' &&
  process.env.OPENAI_API_KEY &&
  process.env.OPENAI_API_KEY !== 'test-openai-key'

const describeLive = runLiveTalkPhotoTest ? describe : describe.skip

describeLive('POST /api/ai/chat — live nutrition-label photo', () => {
  jest.setTimeout(60_000)

  it('uses AI Meal Entry values for the exact Müller photo before preparing a Talk preview', async () => {
    const photoPath = process.env.MULLER_LABEL_PHOTO_PATH ?? DEFAULT_MULLER_PHOTO_PATH
    expect(fs.existsSync(photoPath)).toBe(true)

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${jwt.sign({ userId: 'live-talk-photo-user' }, process.env.JWT_SECRET!)}`)
      .send({
        messages: [{
          role: 'user',
          content: 'Log this entire drink from its nutrition label. Prepare a Calorie entry preview.',
        }],
        attachment: {
          kind: 'image',
          name: 'muller.jpg',
          mimeType: 'image/jpeg',
          data: fs.readFileSync(photoPath).toString('base64'),
        },
      })

    expect(res.status).toBe(200)
    const toolNames = res.body.toolEvents.map((event: any) => event.name)
    expect(toolNames).toContain('parse_meal_entries')
    expect(toolNames).toContain('add_calorie_entry')
    expect(toolNames.indexOf('parse_meal_entries')).toBeLessThan(toolNames.indexOf('add_calorie_entry'))
    const entry = res.body.pendingActions[0]?.preview?.willCreate?.entry
    expect(res.body.pendingActions).toEqual([expect.objectContaining({
      capability: 'add_calorie_entry',
      preview: {
        action: 'add_calorie_entry',
        willCreate: {
          entry: expect.objectContaining({
            name: expect.stringMatching(/m[uü]ller/i),
            quantity: expect.stringMatching(/350/),
          }),
        },
      },
    })])
    expect(entry.calories).toBeGreaterThanOrEqual(157)
    expect(entry.calories).toBeLessThanOrEqual(158)
    expect(entry.protein).toBeCloseTo(25, 0)
    expect(entry.carbs).toBeCloseTo(14.7, 1)
    expect(entry.fat).toBeCloseTo(0, 1)
  })
})
