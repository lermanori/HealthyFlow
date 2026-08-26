import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'
import { DEFAULT_ASSISTANT_PROFILE, DEFAULT_PLANNING_WINDOW } from '../src/settings-schema'

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
      achievementTracker: true,
      workoutTracker: true,
      weekStartsOn: 1,
      planningWindow: DEFAULT_PLANNING_WINDOW,
      assistantProfile: DEFAULT_ASSISTANT_PROFILE,
      onboardingStatus: 'completed',
      theme: 'midnight',
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

  it('PATCH persists a validated personal assistant profile', async () => {
    const assistantProfile = {
      preferredName: 'Ori',
      responseStyle: 'concise',
      planningStyle: 'one_step_at_a_time',
      followUpMode: 'ask_about_outcomes',
    }
    mockDb.upsertUserSettings.mockResolvedValue({ assistantProfile })

    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', TOKEN)
      .send({ assistantProfile })

    expect(res.status).toBe(200)
    expect(mockDb.upsertUserSettings).toHaveBeenCalledWith(USER_ID, { assistantProfile })
    expect(res.body.assistantProfile).toEqual(assistantProfile)
  })

  it('PATCH rejects an invalid assistant response style', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', TOKEN)
      .send({
        assistantProfile: {
          ...DEFAULT_ASSISTANT_PROFILE,
          responseStyle: 'chatty',
        },
      })

    expect(res.status).toBe(400)
    expect(mockDb.upsertUserSettings).not.toHaveBeenCalled()
  })

  it('PATCH refuses retired priority fields instead of silently dropping them', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', TOKEN)
      .send({
        assistantProfile: {
          ...DEFAULT_ASSISTANT_PROFILE,
          priorities: ['Launch HealthyFlow'],
        },
      })

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

  it('defaults achievementTracker to true and preserves an explicit opt-out', async () => {
    mockDb.getUserSettings.mockResolvedValue({})
    mockDb.upsertUserSettings.mockResolvedValue({ achievementTracker: false })

    const getRes = await request(app)
      .get('/api/settings')
      .set('Authorization', TOKEN)

    expect(getRes.body.achievementTracker).toBe(true)

    const patchRes = await request(app)
      .patch('/api/settings')
      .set('Authorization', TOKEN)
      .send({ achievementTracker: false })

    expect(patchRes.status).toBe(200)
    expect(mockDb.upsertUserSettings).toHaveBeenCalledWith(USER_ID, { achievementTracker: false })
    expect(patchRes.body.achievementTracker).toBe(false)
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

  it('defaults to the standard planning window and accepts an explicit one', async () => {
    const planningWindow = {
      startTime: '09:30',
      endTime: '19:00',
      transitionBufferMinutes: 5,
    }
    mockDb.getUserSettings.mockResolvedValue({})
    mockDb.upsertUserSettings.mockResolvedValue({ planningWindow })

    const getRes = await request(app)
      .get('/api/settings')
      .set('Authorization', TOKEN)

    // Stored settings with no planningWindow resolve to the default rather than
    // null, so Capacity computes for a new account instead of being hidden.
    expect(getRes.body.planningWindow).toEqual(DEFAULT_PLANNING_WINDOW)

    const patchRes = await request(app)
      .patch('/api/settings')
      .set('Authorization', TOKEN)
      .send({ planningWindow })

    expect(patchRes.status).toBe(200)
    expect(mockDb.upsertUserSettings).toHaveBeenCalledWith(USER_ID, { planningWindow })
    expect(patchRes.body.planningWindow).toEqual(planningWindow)
  })

  it('rejects an overnight or inverted planning window', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', TOKEN)
      .send({
        planningWindow: {
          startTime: '18:00',
          endTime: '08:00',
          transitionBufferMinutes: 15,
        },
      })

    expect(res.status).toBe(400)
    expect(mockDb.upsertUserSettings).not.toHaveBeenCalled()
  })
})
