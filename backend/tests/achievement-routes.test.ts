import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    getAchievementDefinitions: jest.fn(),
    createAchievementDefinition: jest.fn(),
    getAchievementDefinitionById: jest.fn(),
    updateAchievementDefinition: jest.fn(),
    deleteAchievementDefinition: jest.fn(),
    getAchievementEntries: jest.fn(),
    getAchievementEntryByDay: jest.fn(),
    createAchievementEntry: jest.fn(),
    getAchievementEntryById: jest.fn(),
    updateAchievementEntry: jest.fn(),
    deleteAchievementEntry: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

const USER_ID = 'user-1'
const OTHER_USER_ID = 'user-2'
const TOKEN = `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`

function definition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'achievement-1',
    user_id: USER_ID,
    name: 'Pushups',
    category: 'fitness',
    metric_type: 'reps',
    unit: 'reps',
    better_direction: 'higher',
    target_value: 60,
    archived_at: null,
    created_at: '2026-06-20T00:00:00.000Z',
    updated_at: '2026-06-20T00:00:00.000Z',
    ...overrides,
  }
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    achievement_id: 'achievement-1',
    user_id: USER_ID,
    date: '2026-06-20',
    value: 40,
    supporting_value: null,
    supporting_unit: null,
    notes: null,
    created_at: '2026-06-20T00:00:00.000Z',
    updated_at: '2026-06-20T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('achievement API', () => {
  it('lists achievements with summary fields', async () => {
    mockDb.getAchievementDefinitions.mockResolvedValue([definition()])
    mockDb.getAchievementEntries.mockResolvedValue([
      entry({ id: 'e2', date: '2026-06-24', value: 45 }),
      entry({ id: 'e1', date: '2026-06-20', value: 40 }),
    ])

    const res = await request(app)
      .get('/api/achievements')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(200)
    expect(mockDb.getAchievementDefinitions).toHaveBeenCalledWith(USER_ID, false)
    expect(res.body[0].definition.name).toBe('Pushups')
    expect(res.body[0].latest.value).toBe(45)
    expect(res.body[0].personalBest.value).toBe(45)
    expect(res.body[0].trend.delta).toBe(5)
  })

  it('creates an achievement definition', async () => {
    mockDb.createAchievementDefinition.mockResolvedValue(definition({ name: 'Pullups' }))

    const res = await request(app)
      .post('/api/achievements')
      .set('Authorization', TOKEN)
      .send({
        name: 'Pullups',
        category: 'calisthenics',
        metricType: 'reps',
        unit: 'reps',
        betterDirection: 'higher',
        targetValue: 20,
      })

    expect(res.status).toBe(201)
    expect(mockDb.createAchievementDefinition).toHaveBeenCalledWith(expect.objectContaining({
      user_id: USER_ID,
      name: 'Pullups',
      metric_type: 'reps',
      better_direction: 'higher',
    }))
    expect(res.body.name).toBe('Pullups')
  })

  it('rejects invalid definition metrics', async () => {
    const res = await request(app)
      .post('/api/achievements')
      .set('Authorization', TOKEN)
      .send({
        name: 'Pushups',
        metricType: 'speed',
        unit: 'reps',
        betterDirection: 'higher',
      })

    expect(res.status).toBe(400)
    expect(mockDb.createAchievementDefinition).not.toHaveBeenCalled()
  })

  it('updates an achievement target it owns', async () => {
    mockDb.getAchievementDefinitionById.mockResolvedValue(definition())
    mockDb.updateAchievementDefinition.mockResolvedValue(definition({ target_value: 75 }))

    const res = await request(app)
      .patch('/api/achievements/achievement-1')
      .set('Authorization', TOKEN)
      .send({ targetValue: 75 })

    expect(res.status).toBe(200)
    expect(mockDb.updateAchievementDefinition).toHaveBeenCalledWith('achievement-1', expect.objectContaining({
      target_value: 75,
    }))
    expect(res.body.targetValue).toBe(75)
  })

  it('adds a weighted achievement entry with supporting reps', async () => {
    mockDb.getAchievementDefinitionById.mockResolvedValue(definition({ metric_type: 'weight', unit: 'kg' }))
    mockDb.getAchievementEntryByDay.mockResolvedValue(null)
    mockDb.createAchievementEntry.mockResolvedValue(entry({
      value: 80,
      supporting_value: 5,
      supporting_unit: 'reps',
    }))

    const res = await request(app)
      .post('/api/achievements/achievement-1/entries')
      .set('Authorization', TOKEN)
      .send({ date: '2026-06-20', value: 80, supportingValue: 5, supportingUnit: 'reps' })

    expect(res.status).toBe(201)
    expect(res.body.supportingValue).toBe(5)
    expect(mockDb.createAchievementEntry).toHaveBeenCalledWith(expect.objectContaining({
      supporting_value: 5,
      supporting_unit: 'reps',
    }))
  })

  it('rejects duplicate entries for the same day', async () => {
    mockDb.getAchievementDefinitionById.mockResolvedValue(definition())
    mockDb.getAchievementEntryByDay.mockResolvedValue(entry())

    const res = await request(app)
      .post('/api/achievements/achievement-1/entries')
      .set('Authorization', TOKEN)
      .send({ date: '2026-06-20', value: 41 })

    expect(res.status).toBe(409)
    expect(mockDb.createAchievementEntry).not.toHaveBeenCalled()
  })

  it('returns 403 when adding an entry to another user achievement', async () => {
    mockDb.getAchievementDefinitionById.mockResolvedValue(definition({ user_id: OTHER_USER_ID }))

    const res = await request(app)
      .post('/api/achievements/achievement-1/entries')
      .set('Authorization', TOKEN)
      .send({ date: '2026-06-20', value: 41 })

    expect(res.status).toBe(403)
    expect(mockDb.createAchievementEntry).not.toHaveBeenCalled()
  })
})
