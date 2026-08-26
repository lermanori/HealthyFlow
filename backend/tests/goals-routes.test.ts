import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    getGoalsByUserId: jest.fn(),
    getGoalById: jest.fn(),
    createGoal: jest.fn(),
    updateGoal: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>
const USER_ID = 'goal-user'
const TOKEN = `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`
const GOAL_ID = '11111111-1111-4111-8111-111111111111'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: GOAL_ID,
    user_id: USER_ID,
    module: 'whole_day',
    statement: 'Launch HealthyFlow without sacrificing training consistency.',
    context: 'The launch date is flexible, but training three times a week is not.',
    created_at: '2026-08-26T08:00:00.000Z',
    updated_at: '2026-08-26T08:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

beforeEach(() => jest.clearAllMocks())

describe('Goals API', () => {
  it('lists the authenticated user’s active Goals by default', async () => {
    mockDb.getGoalsByUserId.mockResolvedValue([row()] as never)

    const response = await request(app).get('/api/goals').set('Authorization', TOKEN)

    expect(response.status).toBe(200)
    expect(mockDb.getGoalsByUserId).toHaveBeenCalledWith(USER_ID, false)
    expect(response.body).toEqual([expect.objectContaining({
      id: GOAL_ID,
      module: 'whole_day',
      statement: 'Launch HealthyFlow without sacrificing training consistency.',
      context: 'The launch date is flexible, but training three times a week is not.',
      archivedAt: null,
    })])
  })

  it('includes archived Goals only when explicitly requested', async () => {
    mockDb.getGoalsByUserId.mockResolvedValue([])

    const response = await request(app)
      .get('/api/goals?includeArchived=true')
      .set('Authorization', TOKEN)

    expect(response.status).toBe(200)
    expect(mockDb.getGoalsByUserId).toHaveBeenCalledWith(USER_ID, true)
  })

  it('creates a free-speech Goal assigned to an existing module', async () => {
    mockDb.createGoal.mockImplementation(async (input: any) => input)

    const response = await request(app)
      .post('/api/goals')
      .set('Authorization', TOKEN)
      .send({
        module: 'workouts',
        statement: 'Build training consistency through launch.',
        context: 'Three sessions per week is the personal floor during launch.',
      })

    expect(response.status).toBe(201)
    expect(mockDb.createGoal).toHaveBeenCalledWith(expect.objectContaining({
      user_id: USER_ID,
      module: 'workouts',
      statement: 'Build training consistency through launch.',
      context: 'Three sessions per week is the personal floor during launch.',
      deleted_at: null,
    }))
    expect(response.body).not.toHaveProperty('dueDate')
    expect(response.body).not.toHaveProperty('completed')
    expect(response.body).not.toHaveProperty('progress')
  })

  it('rejects a Goal for an unknown module', async () => {
    const response = await request(app)
      .post('/api/goals')
      .set('Authorization', TOKEN)
      .send({ module: 'projects', statement: 'Make a second task system.' })

    expect(response.status).toBe(400)
    expect(mockDb.createGoal).not.toHaveBeenCalled()
  })

  it('archives an owned Goal without deleting it', async () => {
    mockDb.getGoalById.mockResolvedValue(row() as never)
    mockDb.updateGoal.mockImplementation(async (_goalId, _userId, updates) => row(updates as never) as never)

    const response = await request(app)
      .patch(`/api/goals/${GOAL_ID}`)
      .set('Authorization', TOKEN)
      .send({ archived: true })

    expect(response.status).toBe(200)
    expect(mockDb.updateGoal).toHaveBeenCalledWith(
      GOAL_ID,
      USER_ID,
      expect.objectContaining({ deleted_at: expect.any(String) }),
    )
    expect(response.body.archivedAt).toEqual(expect.any(String))
  })

  it('updates supporting context without changing the Goal statement', async () => {
    mockDb.getGoalById.mockResolvedValue(row() as never)
    mockDb.updateGoal.mockImplementation(async (_goalId, _userId, updates) => row(updates as never) as never)

    const response = await request(app)
      .patch(`/api/goals/${GOAL_ID}`)
      .set('Authorization', TOKEN)
      .send({ context: 'Launch can move; health commitments cannot.' })

    expect(response.status).toBe(200)
    expect(mockDb.updateGoal).toHaveBeenCalledWith(
      GOAL_ID,
      USER_ID,
      expect.objectContaining({ context: 'Launch can move; health commitments cannot.' }),
    )
    expect(response.body.statement).toBe('Launch HealthyFlow without sacrificing training consistency.')
    expect(response.body.context).toBe('Launch can move; health commitments cannot.')
  })

  it('does not update another user’s Goal', async () => {
    mockDb.getGoalById.mockResolvedValue(row({ user_id: 'someone-else' }) as never)

    const response = await request(app)
      .patch(`/api/goals/${GOAL_ID}`)
      .set('Authorization', TOKEN)
      .send({ statement: 'Changed' })

    expect(response.status).toBe(404)
    expect(mockDb.updateGoal).not.toHaveBeenCalled()
  })
})
