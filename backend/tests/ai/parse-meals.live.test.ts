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
}))

const DEFAULT_MULLER_PHOTO_PATH =
  '/tmp/codex-remote-attachments/019ef9de-2f62-7600-8d06-06e7140522fe/11DB9EA2-23A5-4931-9A3D-ABE86F29A70F/1-Photo-1.jpg'

const authHeader = () => {
  const token = jwt.sign({ userId: 'test-user-id' }, process.env.JWT_SECRET!)
  return `Bearer ${token}`
}

const runLivePhotoTest =
  process.env.RUN_OPENAI_MEAL_PHOTO_E2E === '1' &&
  process.env.OPENAI_API_KEY &&
  process.env.OPENAI_API_KEY !== 'test-openai-key'

const describeLive = runLivePhotoTest ? describe : describe.skip

describeLive('POST /api/ai/parse-meals — live photo extraction', () => {
  jest.setTimeout(45_000)

  it('extracts the Müller 350ml bottle label and normalizes per-100ml values', async () => {
    const photoPath = process.env.MULLER_LABEL_PHOTO_PATH ?? DEFAULT_MULLER_PHOTO_PATH
    expect(fs.existsSync(photoPath)).toBe(true)

    const photoData = fs.readFileSync(photoPath).toString('base64')
    const res = await request(app)
      .post('/api/ai/parse-meals')
      .set('Authorization', authHeader())
      .send({
        photo: {
          mimeType: 'image/jpeg',
          data: photoData,
        },
      })

    expect(res.status).toBe(200)
    expect(res.body.meals).toHaveLength(1)

    const meal = res.body.meals[0]
    expect(meal.name).toMatch(/m[uü]ller/i)
    expect(meal.name).toMatch(/קפה/)
    expect(meal.name).not.toMatch(/^חלב\s*0\s*%/)
    expect(meal.quantity).toMatch(/350/)
    expect(meal.calories).toBeGreaterThanOrEqual(155)
    expect(meal.calories).toBeLessThanOrEqual(160)
    expect(meal.protein).toBeGreaterThanOrEqual(24)
    expect(meal.protein).toBeLessThanOrEqual(26)
    expect(meal.carbs).toBeGreaterThanOrEqual(14)
    expect(meal.carbs).toBeLessThanOrEqual(15.5)
    expect(meal.fat).toBeGreaterThanOrEqual(0)
    expect(meal.fat).toBeLessThanOrEqual(0.5)
    expect(meal.labelEvidence).toBeUndefined()
  })
})
