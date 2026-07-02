import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    getWorkoutSessionsByDay: jest.fn(),
    getWorkoutSessionById: jest.fn(),
    createWorkoutSession: jest.fn(),
    updateWorkoutSession: jest.fn(),
    deleteWorkoutSession: jest.fn(),
    getWorkoutSessionExercises: jest.fn(),
    getWorkoutSessionExerciseById: jest.fn(),
    createWorkoutSessionExercise: jest.fn(),
    createWorkoutSessionExercises: jest.fn(),
    updateWorkoutSessionExercise: jest.fn(),
    deleteWorkoutSessionExercise: jest.fn(),
    upsertWorkoutExerciseItem: jest.fn(),
    getMostUsedWorkoutExerciseItems: jest.fn(),
    getRecentWorkoutExerciseItems: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

const USER_ID = 'user-1'
const OTHER_USER_ID = 'user-2'
const TOKEN = `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    user_id: USER_ID,
    date: '2026-07-01',
    title: 'Push day',
    notes: null,
    created_at: '2026-07-01T08:00:00.000Z',
    updated_at: '2026-07-01T08:00:00.000Z',
    ...overrides,
  }
}

function exerciseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exercise-1',
    session_id: 'session-1',
    name: 'Bench Press',
    sets: 3,
    reps: 8,
    weight_kg: 70,
    duration_minutes: null,
    distance_km: null,
    notes: null,
    position: 0,
    ...overrides,
  }
}

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    user_id: USER_ID,
    name: 'Bench Press',
    normalized_name: 'bench press',
    usage_count: 3,
    last_used_at: '2026-07-01T08:00:00.000Z',
    created_at: '2026-06-28T08:00:00.000Z',
    updated_at: '2026-07-01T08:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('workout API', () => {
  it('creates a session with mixed-metric exercises and bumps exercise-item usage', async () => {
    mockDb.createWorkoutSession.mockResolvedValue(sessionRow())
    mockDb.upsertWorkoutExerciseItem.mockResolvedValue(itemRow())
    mockDb.createWorkoutSessionExercises.mockResolvedValue([
      exerciseRow(),
      exerciseRow({
        id: 'exercise-2',
        name: 'Mobility flow',
        sets: null,
        reps: null,
        weight_kg: null,
        duration_minutes: 20,
        position: 1,
      }),
    ])

    const res = await request(app)
      .post('/api/workouts')
      .set('Authorization', TOKEN)
      .send({
        date: '2026-07-01',
        title: 'Mixed session',
        exercises: [
          { name: 'Bench Press', sets: 3, reps: 8, weightKg: 70 },
          { name: 'Mobility flow', durationMinutes: 20 },
        ],
      })

    expect(res.status).toBe(201)
    expect(mockDb.upsertWorkoutExerciseItem).toHaveBeenCalledWith(USER_ID, 'Bench Press')
    expect(mockDb.upsertWorkoutExerciseItem).toHaveBeenCalledWith(USER_ID, 'Mobility flow')
    expect(mockDb.createWorkoutSessionExercises).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Bench Press', sets: 3, reps: 8, weight_kg: 70, position: 0 }),
      expect.objectContaining({ name: 'Mobility flow', duration_minutes: 20, position: 1 }),
    ])
    expect(res.body.exercises).toEqual([
      expect.objectContaining({ name: 'Bench Press', weightKg: 70 }),
      expect.objectContaining({ name: 'Mobility flow', durationMinutes: 20 }),
    ])
  })

  it('lists sessions for a date with exercises in client shape', async () => {
    mockDb.getWorkoutSessionsByDay.mockResolvedValue([sessionRow()])
    mockDb.getWorkoutSessionExercises.mockResolvedValue([exerciseRow()])

    const res = await request(app)
      .get('/api/workouts?date=2026-07-01')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(200)
    expect(mockDb.getWorkoutSessionsByDay).toHaveBeenCalledWith(USER_ID, '2026-07-01')
    expect(res.body[0]).toEqual(expect.objectContaining({
      id: 'session-1',
      userId: USER_ID,
      title: 'Push day',
      exercises: [expect.objectContaining({ name: 'Bench Press', reps: 8, weightKg: 70 })],
    }))
  })

  it('rejects listing without a date', async () => {
    const res = await request(app)
      .get('/api/workouts')
      .set('Authorization', TOKEN)

    expect(res.status).toBe(400)
    expect(mockDb.getWorkoutSessionsByDay).not.toHaveBeenCalled()
  })

  it('lists recent and most-used exercise items', async () => {
    mockDb.getRecentWorkoutExerciseItems.mockResolvedValue([itemRow()])
    mockDb.getMostUsedWorkoutExerciseItems.mockResolvedValue([itemRow({ usage_count: 9 })])

    const recent = await request(app)
      .get('/api/workouts/exercises?sort=recent&limit=3')
      .set('Authorization', TOKEN)

    expect(recent.status).toBe(200)
    expect(mockDb.getRecentWorkoutExerciseItems).toHaveBeenCalledWith(USER_ID, 3)
    expect(recent.body[0]).toEqual(expect.objectContaining({ name: 'Bench Press', usageCount: 3 }))

    const mostUsed = await request(app)
      .get('/api/workouts/exercises?sort=most-used')
      .set('Authorization', TOKEN)

    expect(mostUsed.status).toBe(200)
    expect(mockDb.getMostUsedWorkoutExerciseItems).toHaveBeenCalledWith(USER_ID, 10)
    expect(mostUsed.body[0].usageCount).toBe(9)
  })

  it('updates a session it owns', async () => {
    mockDb.getWorkoutSessionById.mockResolvedValue(sessionRow())
    mockDb.updateWorkoutSession.mockResolvedValue(sessionRow({ title: 'Updated' }))
    mockDb.getWorkoutSessionExercises.mockResolvedValue([exerciseRow()])

    const res = await request(app)
      .patch('/api/workouts/session-1')
      .set('Authorization', TOKEN)
      .send({ title: 'Updated' })

    expect(res.status).toBe(200)
    expect(mockDb.updateWorkoutSession).toHaveBeenCalledWith('session-1', expect.objectContaining({ title: 'Updated' }))
    expect(res.body.title).toBe('Updated')
  })

  it('returns 403 updating another user session', async () => {
    mockDb.getWorkoutSessionById.mockResolvedValue(sessionRow({ user_id: OTHER_USER_ID }))

    const res = await request(app)
      .patch('/api/workouts/session-1')
      .set('Authorization', TOKEN)
      .send({ title: 'Nope' })

    expect(res.status).toBe(403)
    expect(mockDb.updateWorkoutSession).not.toHaveBeenCalled()
  })

  it('updates and deletes owned exercises through their parent session', async () => {
    mockDb.getWorkoutSessionExerciseById.mockResolvedValue(exerciseRow())
    mockDb.getWorkoutSessionById.mockResolvedValue(sessionRow())
    mockDb.upsertWorkoutExerciseItem.mockResolvedValue(itemRow({ name: 'Pull Up' }))
    mockDb.updateWorkoutSessionExercise.mockResolvedValue(exerciseRow({ name: 'Pull Up', weight_kg: null }))
    mockDb.deleteWorkoutSessionExercise.mockResolvedValue(undefined)

    const update = await request(app)
      .patch('/api/workouts/exercises/exercise-1')
      .set('Authorization', TOKEN)
      .send({ name: 'Pull Up', reps: 10, weightKg: null })

    expect(update.status).toBe(200)
    expect(mockDb.upsertWorkoutExerciseItem).toHaveBeenCalledWith(USER_ID, 'Pull Up')
    expect(mockDb.updateWorkoutSessionExercise).toHaveBeenCalledWith('exercise-1', expect.objectContaining({
      name: 'Pull Up',
      reps: 10,
      weight_kg: null,
    }))

    const remove = await request(app)
      .delete('/api/workouts/exercises/exercise-1')
      .set('Authorization', TOKEN)

    expect(remove.status).toBe(204)
    expect(mockDb.deleteWorkoutSessionExercise).toHaveBeenCalledWith('exercise-1')
  })
})
