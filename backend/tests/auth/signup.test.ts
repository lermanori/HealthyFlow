import request from 'supertest'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'

// ponytail: mock db so tests are hermetic — no real Supabase calls
jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/auth/signup', () => {
  it('new email signs up → 200 with JWT', async () => {
    mockDb.getUserByEmail.mockResolvedValue(null)
    mockDb.createUser.mockResolvedValue({ id: 'user-1', email: 'new@example.com', name: 'Alice' })

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'new@example.com', password: 'password1', name: 'Alice' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.user.email).toBe('new@example.com')
  })

  it('duplicate email → 409', async () => {
    mockDb.getUserByEmail.mockResolvedValue({ id: 'existing', email: 'taken@example.com', name: 'Bob', password_hash: 'x' })

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'taken@example.com', password: 'password1', name: 'Bob' })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already/i)
  })

  it('password < 8 chars → 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'new@example.com', password: 'short', name: 'Alice' })

    expect(res.status).toBe(400)
    expect(mockDb.createUser).not.toHaveBeenCalled()
  })

  it('invalid email format → 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'not-an-email', password: 'password1', name: 'Alice' })

    expect(res.status).toBe(400)
    expect(mockDb.createUser).not.toHaveBeenCalled()
  })

  it('rate limit: 6th rapid request → 429', async () => {
    mockDb.getUserByEmail.mockResolvedValue(null)
    mockDb.createUser.mockResolvedValue({ id: 'u', email: 'x@x.com', name: 'X' })

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/signup')
        .send({ email: `user${i}@example.com`, password: 'password1', name: 'X' })
        .set('X-Forwarded-For', '1.2.3.4')
    }

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'user6@example.com', password: 'password1', name: 'X' })
      .set('X-Forwarded-For', '1.2.3.4')

    expect(res.status).toBe(429)
  })
})

describe('POST /api/auth/register (admin-only, regression guard)', () => {
  it('still requires ADMIN_TOKEN', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'hacker@example.com', password: 'password1', name: 'Hacker' })

    expect(res.status).toBe(403)
  })

  it('works with correct ADMIN_TOKEN', async () => {
    mockDb.getUserByEmail.mockResolvedValue(null)
    mockDb.createUser.mockResolvedValue({ id: 'u2', email: 'admin@example.com', name: 'Admin' })

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'admin@example.com', password: 'password1', name: 'Admin', adminToken: process.env.ADMIN_TOKEN || 'test-admin-token' })

    // Original /register returns user without JWT (existing behavior)
    expect(res.status).toBe(200)
    expect(res.body.user).toBeDefined()
  })
})
