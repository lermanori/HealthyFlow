import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    createContactMessage: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const authHeader = () => `Bearer ${jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET!)}`

beforeEach(() => {
  jest.clearAllMocks()
})

describe('contact messages API', () => {
  it('creates an in-app contact message for the authenticated user', async () => {
    mockDb.createContactMessage.mockResolvedValue({
      id: 'message-1',
      user_id: 'user-1',
      kind: 'subscribe',
      message: 'Hi Ori, I want to subscribe.',
      status: 'pending',
      handled_at: null,
      handled_by: null,
      created_at: '2026-07-02T00:00:00.000Z',
      updated_at: '2026-07-02T00:00:00.000Z',
    })

    const res = await request(app)
      .post('/api/contact-messages')
      .set('Authorization', authHeader())
      .send({ kind: 'subscribe', message: 'Hi Ori, I want to subscribe.' })

    expect(res.status).toBe(201)
    expect(res.body.status).toBe('pending')
    expect(mockDb.createContactMessage).toHaveBeenCalledWith({
      user_id: 'user-1',
      kind: 'subscribe',
      message: 'Hi Ori, I want to subscribe.',
    })
  })

  it('rejects invalid message kinds', async () => {
    const res = await request(app)
      .post('/api/contact-messages')
      .set('Authorization', authHeader())
      .send({ kind: 'email', message: 'hi' })

    expect(res.status).toBe(400)
    expect(mockDb.createContactMessage).not.toHaveBeenCalled()
  })
})
