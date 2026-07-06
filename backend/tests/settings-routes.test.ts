import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    getUserSettings: jest.fn(),
    upsertUserSettings: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

const USER_ID = 'user-1'
const TOKEN = `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`

beforeEach(() => {
  jest.clearAllMocks()
})

describe('settings API', () => {
  it('GET returns defaults merged with stored partial settings', async () => {
    mockDb.getUserSettings.mockResolvedValue({ aiSuggestions: false })

    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      notifications: true,
      dailyReminders: true,
      weeklyReports: true,
      aiSuggestions: false,
      smartReminders: true,
      completionSounds: true,
      calorieIntake: true,
      achievementTracker: false,
      workoutTracker: true,
      weekStartsOn: 1,
      onboardingStatus: 'completed',
    })
  })

  it('PATCH validates, persists, and returns merged settings', async () => {
    mockDb.getUserSettings.mockResolvedValue({})
    mockDb.upsertUserSettings.mockResolvedValue({ calorieIntake: true })

    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', TOKEN)
      .send({ calorieIntake: true })

    expect(res.status).toBe(200)
    expect(mockDb.upsertUserSettings).toHaveBeenCalledWith(USER_ID, { calorieIntake: true })
    expect(res.body.calorieIntake).toBe(true)
  })

  it('PATCH rejects unknown keys', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', TOKEN)
      .send({ notARealSetting: true })

    expect(res.status).toBe(400)
    expect(mockDb.upsertUserSettings).not.toHaveBeenCalled()
  })

  it('PATCH rejects garbage values for known keys', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', TOKEN)
      .send({ aiSuggestions: 'yes' })

    expect(res.status).toBe(400)
    expect(mockDb.upsertUserSettings).not.toHaveBeenCalled()
  })

  it('defaults calorieIntake to true when nothing is stored', async () => {
    mockDb.getUserSettings.mockResolvedValue({})

    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', TOKEN)

    expect(res.body.calorieIntake).toBe(true)
  })

  it('respects an explicit opt-out of calorieIntake', async () => {
    mockDb.getUserSettings.mockResolvedValue({ calorieIntake: false })

    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', TOKEN)

    expect(res.body.calorieIntake).toBe(false)
  })

  it('defaults achievementTracker to false and allows enabling it', async () => {
    mockDb.getUserSettings.mockResolvedValue({})
    mockDb.upsertUserSettings.mockResolvedValue({ achievementTracker: true })

    const getRes = await request(app)
      .get('/api/settings')
      .set('Authorization', TOKEN)

    expect(getRes.body.achievementTracker).toBe(false)

    const patchRes = await request(app)
      .patch('/api/settings')
      .set('Authorization', TOKEN)
      .send({ achievementTracker: true })

    expect(patchRes.status).toBe(200)
    expect(mockDb.upsertUserSettings).toHaveBeenCalledWith(USER_ID, { achievementTracker: true })
    expect(patchRes.body.achievementTracker).toBe(true)
  })

  it('defaults workoutTracker to true and allows disabling it', async () => {
    mockDb.getUserSettings.mockResolvedValue({})
    mockDb.upsertUserSettings.mockResolvedValue({ workoutTracker: false })

    const getRes = await request(app)
      .get('/api/settings')
      .set('Authorization', TOKEN)

    expect(getRes.body.workoutTracker).toBe(true)

    const patchRes = await request(app)
      .patch('/api/settings')
      .set('Authorization', TOKEN)
      .send({ workoutTracker: false })

    expect(patchRes.status).toBe(200)
    expect(mockDb.upsertUserSettings).toHaveBeenCalledWith(USER_ID, { workoutTracker: false })
    expect(patchRes.body.workoutTracker).toBe(false)
  })

  it('defaults weekStartsOn to Monday and allows Sunday start', async () => {
    mockDb.getUserSettings.mockResolvedValue({})
    mockDb.upsertUserSettings.mockResolvedValue({ weekStartsOn: 0 })

    const getRes = await request(app)
      .get('/api/settings')
      .set('Authorization', TOKEN)

    expect(getRes.body.weekStartsOn).toBe(1)

    const patchRes = await request(app)
      .patch('/api/settings')
      .set('Authorization', TOKEN)
      .send({ weekStartsOn: 0 })

    expect(patchRes.status).toBe(200)
    expect(mockDb.upsertUserSettings).toHaveBeenCalledWith(USER_ID, { weekStartsOn: 0 })
    expect(patchRes.body.weekStartsOn).toBe(0)
  })
})
