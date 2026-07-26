import request from 'supertest'
import { app } from '../../src/index'
import { Waitlist } from '../../src/waitlist'

jest.mock('../../src/waitlist', () => {
  const actual = jest.requireActual('../../src/waitlist')
  return {
    // Keep the real Zod schema so validation is genuinely exercised.
    WaitlistJoinSchema: actual.WaitlistJoinSchema,
    Waitlist: {
      join: jest.fn(),
      getSignupStatus: jest.fn(),
      authorizeSignup: jest.fn(),
      completeInviteSignup: jest.fn(),
      createInviteFor: jest.fn(),
    },
  }
})

const mockWaitlist = Waitlist as jest.Mocked<typeof Waitlist>

beforeEach(() => jest.clearAllMocks())

describe('POST /api/waitlist', () => {
  it('accepts a new email → 200', async () => {
    mockWaitlist.join.mockResolvedValue({ entry: { id: 'w1' }, alreadyJoined: false } as never)

    const res = await request(app)
      .post('/api/waitlist')
      .send({ email: 'a@b.com', name: 'Alice' })
      .set('X-Forwarded-For', '20.0.0.1')

    expect(res.status).toBe(200)
    expect(res.body.joined).toBe(true)
  })

  it('returns 200 (not 409) for a duplicate email, so membership cannot be probed', async () => {
    mockWaitlist.join.mockResolvedValue({ entry: { id: 'w1' }, alreadyJoined: true } as never)

    const res = await request(app)
      .post('/api/waitlist')
      .send({ email: 'a@b.com' })
      .set('X-Forwarded-For', '20.0.0.2')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ joined: true })
  })

  it('rejects an invalid email → 400', async () => {
    const res = await request(app)
      .post('/api/waitlist')
      .send({ email: 'nope' })
      .set('X-Forwarded-For', '20.0.0.3')

    expect(res.status).toBe(400)
    expect(mockWaitlist.join).not.toHaveBeenCalled()
  })

  it('passes UTM fields through to the service', async () => {
    mockWaitlist.join.mockResolvedValue({ entry: { id: 'w1' }, alreadyJoined: false } as never)

    await request(app)
      .post('/api/waitlist')
      .send({ email: 'a@b.com', utmSource: 'instagram', utmCampaign: 'launch-1' })
      .set('X-Forwarded-For', '20.0.0.4')

    expect(mockWaitlist.join).toHaveBeenCalledWith(
      expect.objectContaining({ utmSource: 'instagram', utmCampaign: 'launch-1' })
    )
  })
})

describe('admin waitlist routes require authentication', () => {
  it('rejects unauthenticated access to the entry list', async () => {
    const res = await request(app).get('/api/waitlist/admin/entries')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated slot changes', async () => {
    const res = await request(app).patch('/api/waitlist/admin/slots').send({ publicSlotsOpen: 25 })
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated invite creation', async () => {
    const res = await request(app).post('/api/waitlist/admin/entries/w1/invite')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated removal', async () => {
    const res = await request(app).delete('/api/waitlist/admin/entries/w1')
    expect(res.status).toBe(401)
  })
})
