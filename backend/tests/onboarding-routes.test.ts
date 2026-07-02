import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'
import { Onboarding } from '../src/onboarding'

jest.mock('../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
  },
}))

jest.mock('../src/onboarding', () => ({
  Onboarding: {
    complete: jest.fn(),
    skip: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const mockOnboarding = Onboarding as jest.Mocked<typeof Onboarding>
const authHeader = () => `Bearer ${jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET!)}`

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserById.mockResolvedValue({
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    role: 'user',
  })
})

describe('onboarding API', () => {
  it('completes onboarding for the authenticated user', async () => {
    mockOnboarding.complete.mockResolvedValue({
      status: 'completed',
      achievement: null,
    })

    const res = await request(app)
      .post('/api/onboarding/complete')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('completed')
    expect(mockOnboarding.complete).toHaveBeenCalledWith('user-1')
  })

  it('skips onboarding for the authenticated user', async () => {
    mockOnboarding.skip.mockResolvedValue({ status: 'skipped' })

    const res = await request(app)
      .post('/api/onboarding/skip')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'skipped' })
    expect(mockOnboarding.skip).toHaveBeenCalledWith('user-1')
  })
})
