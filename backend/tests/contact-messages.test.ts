import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    createContactMessage: jest.fn(),
    getUserById: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const authHeader = () => `Bearer ${jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET!)}`

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserById.mockResolvedValue({
    id: 'user-1',
    email: 'person@example.com',
    name: 'Person',
    role: 'user',
    signup_method: 'password',
  })
})

describe('contact messages API', () => {
  it('lets a claimed account send Founders Club feedback without repeating its email', async () => {
    mockDb.createContactMessage.mockResolvedValue({
      id: 'message-1',
      user_id: 'user-1',
      kind: 'feedback',
      message: 'The morning flow feels great.',
      reply_to: null,
      status: 'pending',
      handled_at: null,
      handled_by: null,
      created_at: '2026-07-02T00:00:00.000Z',
      updated_at: '2026-07-02T00:00:00.000Z',
    })

    const res = await request(app)
      .post('/api/contact-messages')
      .set('Authorization', authHeader())
      .send({ kind: 'feedback', message: 'The morning flow feels great.' })

    expect(res.status).toBe(201)
    expect(res.body.status).toBe('pending')
    expect(mockDb.createContactMessage).toHaveBeenCalledWith({
      user_id: 'user-1',
      kind: 'feedback',
      message: 'The morning flow feels great.',
      reply_to: null,
    })
  })

  it('requires a reply-to address from a Guest', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'guest-1',
      email: null,
      name: 'Guest',
      role: 'user',
      signup_method: 'guest',
    })

    const res = await request(app)
      .post('/api/contact-messages')
      .set('Authorization', authHeader())
      .send({ kind: 'more_actions', message: 'Please add more actions.' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/reply-to email/i)
    expect(mockDb.createContactMessage).not.toHaveBeenCalled()
  })

  it('rejects an invalid Guest reply-to address', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'guest-1',
      email: null,
      name: 'Guest',
      role: 'user',
      signup_method: 'guest',
    })

    const res = await request(app)
      .post('/api/contact-messages')
      .set('Authorization', authHeader())
      .send({ kind: 'feedback', message: 'A useful note.', replyTo: 'not-an-email' })

    expect(res.status).toBe(400)
    expect(mockDb.createContactMessage).not.toHaveBeenCalled()
  })

  it('lets a claimed account request more actions without repeating its email', async () => {
    mockDb.createContactMessage.mockResolvedValue({
      id: 'message-2',
      user_id: 'user-1',
      kind: 'more_actions',
      message: 'Please add more actions.',
      reply_to: null,
      status: 'pending',
      handled_at: null,
      handled_by: null,
      created_at: '2026-09-07T00:00:00.000Z',
      updated_at: '2026-09-07T00:00:00.000Z',
    })

    const res = await request(app)
      .post('/api/contact-messages')
      .set('Authorization', authHeader())
      .send({ kind: 'more_actions', message: 'Please add more actions.' })

    expect(res.status).toBe(201)
    expect(mockDb.createContactMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'more_actions',
      reply_to: null,
    }))
  })

  it('stores a Guest reply-to address with a request for more actions', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'guest-1',
      email: null,
      name: 'Guest',
      role: 'user',
      signup_method: 'guest',
    })
    mockDb.createContactMessage.mockResolvedValue({
      id: 'message-2',
      user_id: 'user-1',
      kind: 'more_actions',
      message: 'Please add more actions.',
      reply_to: 'guest@example.com',
      status: 'pending',
      handled_at: null,
      handled_by: null,
      created_at: '2026-09-07T00:00:00.000Z',
      updated_at: '2026-09-07T00:00:00.000Z',
    })

    const res = await request(app)
      .post('/api/contact-messages')
      .set('Authorization', authHeader())
      .send({
        kind: 'more_actions',
        message: 'Please add more actions.',
        replyTo: 'guest@example.com',
      })

    expect(res.status).toBe(201)
    expect(mockDb.createContactMessage).toHaveBeenCalledWith({
      user_id: 'user-1',
      kind: 'more_actions',
      message: 'Please add more actions.',
      reply_to: 'guest@example.com',
    })
  })

  it('rejects invalid message kinds', async () => {
    const res = await request(app)
      .post('/api/contact-messages')
      .set('Authorization', authHeader())
      .send({ kind: 'subscribe', message: 'old purchase request' })

    expect(res.status).toBe(400)
    expect(mockDb.createContactMessage).not.toHaveBeenCalled()
  })

  it('surfaces an identity read failure without writing a message', async () => {
    mockDb.getUserById.mockRejectedValue(new Error('read failed'))

    const res = await request(app)
      .post('/api/contact-messages')
      .set('Authorization', authHeader())
      .send({ kind: 'feedback', message: 'A useful note.' })

    expect(res.status).toBe(500)
    expect(mockDb.createContactMessage).not.toHaveBeenCalled()
  })

  it('surfaces a message write failure', async () => {
    mockDb.createContactMessage.mockRejectedValue(new Error('write failed'))

    const res = await request(app)
      .post('/api/contact-messages')
      .set('Authorization', authHeader())
      .send({ kind: 'feedback', message: 'A useful note.' })

    expect(res.status).toBe(500)
  })
})
