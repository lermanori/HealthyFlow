import request from 'supertest'
import nock from 'nock'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'

const authHeader = () => {
  const token = jwt.sign({ userId: 'test-user-id' }, process.env.JWT_SECRET!)
  return `Bearer ${token}`
}

describe('POST /api/ai/parse-tasks — failure paths', () => {
  afterEach(() => {
    nock.cleanAll()
  })

  it('returns 400 with generic message when text is missing', async () => {
    const res = await request(app)
      .post('/api/ai/parse-tasks')
      .set('Authorization', authHeader())
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
  })

  it('returns 400 when text is whitespace-only', async () => {
    const res = await request(app)
      .post('/api/ai/parse-tasks')
      .set('Authorization', authHeader())
      .send({ text: '   \n  ' })

    expect(res.status).toBe(400)
  })

  it('returns 500 with generic message when OpenAI upstream fails', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(500, { error: 'internal' })

    const res = await request(app)
      .post('/api/ai/parse-tasks')
      .set('Authorization', authHeader())
      .send({ text: 'meditate daily' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Could not parse — try again' })
  })

  it('returns 500 and logs zod error when OpenAI response fails schema validation', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [{ title: 'no other fields' }],
              }),
            },
          },
        ],
      })

    const res = await request(app)
      .post('/api/ai/parse-tasks')
      .set('Authorization', authHeader())
      .send({ text: 'meditate daily' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Could not parse — try again' })

    const loggedZodError = errSpy.mock.calls.some((call) =>
      call.some((arg) => {
        const s = typeof arg === 'string' ? arg : JSON.stringify(arg)
        return /zod|ZodError|invalid_type|Required/i.test(s)
      }),
    )
    expect(loggedZodError).toBe(true)

    errSpy.mockRestore()
  })
})
