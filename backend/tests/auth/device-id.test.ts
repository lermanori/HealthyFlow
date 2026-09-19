import request from 'supertest'
import jwt from 'jsonwebtoken'

// The device an account uses is recorded from the X-HF-Device-Id header (#308):
// on Guest creation, sign-in and session restore. It labels accounts in Admin
// only; a missing or malformed header is ignored and never fails a request.

jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    createUser: jest.fn(),
    reserveGuestGrantIp: jest.fn(),
    recordUserLogin: jest.fn(),
    recordUserDevice: jest.fn(),
  },
  supabase: { auth: { getUser: jest.fn(), admin: { deleteUser: jest.fn() } } },
}))

import { app } from '../../src/index'
import { db } from '../../src/supabase-client'

const mockDb = db as jest.Mocked<typeof db>
const DEVICE = '3f1c6a2e-8b4d-4e0f-9a7b-1c2d3e4f5a6b'
const guestRow = { id: 'guest-1', email: null, name: 'Guest', role: 'user', signup_method: 'guest' }

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.createUser.mockResolvedValue(guestRow as never)
  mockDb.reserveGuestGrantIp.mockResolvedValue(true)
  mockDb.recordUserLogin.mockResolvedValue(undefined)
  mockDb.recordUserDevice.mockResolvedValue(undefined)
  mockDb.getUserById.mockResolvedValue(guestRow as never)
})

describe('recording the device', () => {
  it('a new Guest is recorded against the device that started it', async () => {
    const res = await request(app).post('/api/auth/guest').set('X-HF-Device-Id', DEVICE).set('X-Forwarded-For', '40.0.0.1')

    expect(res.status).toBe(200)
    expect(mockDb.recordUserLogin).toHaveBeenCalledWith('guest-1', DEVICE)
  })

  it('a malformed device header is ignored, and the Guest is still created', async () => {
    const res = await request(app).post('/api/auth/guest').set('X-HF-Device-Id', 'not-a-uuid').set('X-Forwarded-For', '40.0.0.2')

    expect(res.status).toBe(200)
    expect(mockDb.recordUserLogin).toHaveBeenCalledWith('guest-1', null)
  })

  it('restoring a session records the device, so existing Guests pick it up on their next open', async () => {
    const token = jwt.sign({ userId: 'guest-1' }, process.env.JWT_SECRET!)

    const res = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${token}`).set('X-HF-Device-Id', DEVICE)

    expect(res.status).toBe(200)
    expect(mockDb.recordUserDevice).toHaveBeenCalledWith('guest-1', DEVICE)
  })

  it('a failed device write never fails the session', async () => {
    mockDb.recordUserDevice.mockRejectedValue(new Error('connection reset'))
    const token = jwt.sign({ userId: 'guest-1' }, process.env.JWT_SECRET!)

    const res = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${token}`).set('X-HF-Device-Id', DEVICE)

    expect(res.status).toBe(200)
  })

  it('a session restored without the header records nothing', async () => {
    const token = jwt.sign({ userId: 'guest-1' }, process.env.JWT_SECRET!)

    await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${token}`)

    expect(mockDb.recordUserDevice).not.toHaveBeenCalled()
  })
})
