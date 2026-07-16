import request from 'supertest'
import jwt from 'jsonwebtoken'
import nock from 'nock'
import { app } from '../src/index'
import { Credits } from '../src/credits'
import { db } from '../src/supabase-client'

jest.mock('../src/credits', () => ({
  Credits: {
    estimateReserve: jest.fn(),
    reserve: jest.fn(),
    settleReserved: jest.fn(),
    refundReserve: jest.fn(),
  },
  UnpricedModelError: class UnpricedModelError extends Error {},
}))

jest.mock('../src/supabase-client', () => ({
  db: {
    getWorkoutSessionsByDay: jest.fn(),
    getWorkoutPlans: jest.fn(),
    getWorkoutPlanById: jest.fn(),
    createWorkoutPlan: jest.fn(),
    updateWorkoutPlan: jest.fn(),
    deleteWorkoutPlan: jest.fn(),
    getWorkoutPlanExercises: jest.fn(),
    createWorkoutPlanExercises: jest.fn(),
    deleteWorkoutPlanExercises: jest.fn(),
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
const mockCredits = Credits as jest.Mocked<typeof Credits>

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
    sets: 3,
    reps: 8,
    weight_kg: 70,
    duration_minutes: null,
    distance_km: null,
    notes: 'Controlled tempo',
    usage_count: 3,
    last_used_at: '2026-07-01T08:00:00.000Z',
    created_at: '2026-06-28T08:00:00.000Z',
    updated_at: '2026-07-01T08:00:00.000Z',
    ...overrides,
  }
}

function planRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    user_id: USER_ID,
    name: 'Full body',
    color: '#22d3ee',
    note: 'Keep it steady',
    position: 0,
    created_at: '2026-07-15T08:00:00.000Z',
    updated_at: '2026-07-15T08:00:00.000Z',
    ...overrides,
  }
}

function planExerciseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-exercise-1',
    plan_id: 'plan-1',
    name: 'Squat',
    sets: 3,
    reps: 8,
    weight_kg: 60,
    duration_minutes: null,
    distance_km: null,
    notes: null,
    position: 0,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  nock.cleanAll()
  mockCredits.estimateReserve.mockResolvedValue(100)
  mockCredits.reserve.mockResolvedValue(true)
  mockCredits.settleReserved.mockResolvedValue({ ok: true, chargeTokens: 20, adjustmentTokens: 80 })
  mockCredits.refundReserve.mockResolvedValue(undefined)
})

describe('workout API', () => {
  it('generates a schema-validated editable workout-plan draft across training styles', async () => {
    let observedSystemPrompt = ''
    nock('https://api.openai.com')
      .post('/v1/chat/completions', (body) => {
        const requestBody = body as { messages?: Array<{ role?: string; content?: string }> }
        observedSystemPrompt = requestBody.messages?.find((message) => message.role === 'system')?.content ?? ''
        return true
      })
      .reply(200, {
        choices: [{
          message: {
            content: JSON.stringify({
              name: '20-minute mobility',
              color: '#8b5cf6',
              note: 'Move comfortably and breathe steadily.',
              exercises: [
                { name: 'Cat-cow', sets: null, reps: 8, weightKg: null, durationMinutes: null, distanceKm: null, notes: null },
                { name: 'Hip mobility flow', sets: null, reps: null, weightKg: null, durationMinutes: 12, distanceKm: null, notes: 'Easy range of motion' },
              ],
            }),
          },
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      })

    const res = await request(app)
      .post('/api/workouts/plans/generate')
      .set('Authorization', TOKEN)
      .send({ intent: 'Build a gentle 20-minute yoga and mobility session' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(expect.objectContaining({
      name: '20-minute mobility',
      exercises: [
        expect.objectContaining({ name: 'Cat-cow', reps: 8, weightKg: null }),
        expect.objectContaining({ name: 'Hip mobility flow', durationMinutes: 12 }),
      ],
    }))
    expect(observedSystemPrompt).toMatch(/strength, calisthenics, running.*yoga, mobility/i)
    expect(mockCredits.settleReserved).toHaveBeenCalledWith(USER_ID, 100, {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    }, expect.objectContaining({ endpoint: 'workout-plan-generate', model: 'gpt-4o-mini' }))
    expect(mockDb.createWorkoutPlan).not.toHaveBeenCalled()
  })

  it('surfaces invalid AI workout-plan output without a fallback', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [{ message: { content: JSON.stringify({ name: 'Broken', exercises: [{ name: 'Run' }] }) } }],
      })

    const res = await request(app)
      .post('/api/workouts/plans/generate')
      .set('Authorization', TOKEN)
      .send({ intent: '5K running plan' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Could not generate workout plan', code: 'ai_generation_failed' })
    expect(mockCredits.refundReserve).toHaveBeenCalledWith(USER_ID, 100, 'refund_failed_call')
    expect(mockDb.createWorkoutPlan).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('returns 402 when workout-plan generation has insufficient credits', async () => {
    mockCredits.reserve.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/workouts/plans/generate')
      .set('Authorization', TOKEN)
      .send({ intent: 'Bodyweight strength plan' })

    expect(res.status).toBe(402)
    expect(res.body).toEqual({ error: 'Insufficient AI tokens', code: 'insufficient_credits' })
    expect(mockDb.createWorkoutPlan).not.toHaveBeenCalled()
  })

  it('creates and lists an ordered training-agnostic workout plan', async () => {
    mockDb.getWorkoutPlans
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([planRow()])
    mockDb.createWorkoutPlan.mockResolvedValue(planRow())
    mockDb.createWorkoutPlanExercises.mockResolvedValue([
      planExerciseRow(),
      planExerciseRow({
        id: 'plan-exercise-2',
        name: 'Mobility flow',
        sets: null,
        reps: null,
        weight_kg: null,
        duration_minutes: 20,
        position: 1,
      }),
    ])
    mockDb.getWorkoutPlanExercises.mockResolvedValue([
      planExerciseRow(),
      planExerciseRow({ id: 'plan-exercise-2', name: 'Mobility flow', duration_minutes: 20, position: 1 }),
    ])

    const create = await request(app)
      .post('/api/workouts/plans')
      .set('Authorization', TOKEN)
      .send({
        name: 'Full body',
        color: '#22d3ee',
        note: 'Keep it steady',
        exercises: [
          { name: 'Squat', sets: 3, reps: 8, weightKg: 60 },
          { name: 'Mobility flow', durationMinutes: 20 },
        ],
      })

    expect(create.status).toBe(201)
    expect(mockDb.createWorkoutPlan).toHaveBeenCalledWith(expect.objectContaining({
      user_id: USER_ID,
      name: 'Full body',
      position: 0,
    }))
    expect(mockDb.createWorkoutPlanExercises).toHaveBeenCalledWith([
      expect.objectContaining({ plan_id: 'plan-1', name: 'Squat', position: 0, weight_kg: 60 }),
      expect.objectContaining({ plan_id: 'plan-1', name: 'Mobility flow', position: 1, duration_minutes: 20 }),
    ])
    expect(create.body.exercises).toEqual([
      expect.objectContaining({ name: 'Squat', weightKg: 60, position: 0 }),
      expect.objectContaining({ name: 'Mobility flow', durationMinutes: 20, position: 1 }),
    ])

    const list = await request(app)
      .get('/api/workouts/plans')
      .set('Authorization', TOKEN)

    expect(list.status).toBe(200)
    expect(list.body[0]).toEqual(expect.objectContaining({
      name: 'Full body',
      color: '#22d3ee',
      exercises: [
        expect.objectContaining({ name: 'Squat' }),
        expect.objectContaining({ name: 'Mobility flow' }),
      ],
    }))
  })

  it('replaces plan exercises on edit and deletes an owned plan', async () => {
    mockDb.getWorkoutPlanById.mockResolvedValue(planRow())
    mockDb.updateWorkoutPlan.mockResolvedValue(planRow({ name: 'Easy run' }))
    mockDb.deleteWorkoutPlanExercises.mockResolvedValue(undefined)
    mockDb.createWorkoutPlanExercises.mockResolvedValue([
      planExerciseRow({ name: 'Easy run', sets: null, reps: null, weight_kg: null, duration_minutes: 30 }),
    ])
    mockDb.deleteWorkoutPlan.mockResolvedValue(undefined)

    const update = await request(app)
      .patch('/api/workouts/plans/plan-1')
      .set('Authorization', TOKEN)
      .send({
        name: 'Easy run',
        exercises: [{ name: 'Easy run', durationMinutes: 30 }],
      })

    expect(update.status).toBe(200)
    expect(mockDb.deleteWorkoutPlanExercises).toHaveBeenCalledWith('plan-1')
    expect(mockDb.createWorkoutPlanExercises).toHaveBeenCalledWith([
      expect.objectContaining({ plan_id: 'plan-1', name: 'Easy run', duration_minutes: 30, position: 0 }),
    ])

    const remove = await request(app)
      .delete('/api/workouts/plans/plan-1')
      .set('Authorization', TOKEN)

    expect(remove.status).toBe(204)
    expect(mockDb.deleteWorkoutPlan).toHaveBeenCalledWith('plan-1')
  })

  it('rejects plan mutation for another user', async () => {
    mockDb.getWorkoutPlanById.mockResolvedValue(planRow({ user_id: OTHER_USER_ID }))

    const update = await request(app)
      .patch('/api/workouts/plans/plan-1')
      .set('Authorization', TOKEN)
      .send({ name: 'Nope' })

    expect(update.status).toBe(403)
    expect(mockDb.updateWorkoutPlan).not.toHaveBeenCalled()
  })

  it('rejects a workout plan without exercises', async () => {
    const create = await request(app)
      .post('/api/workouts/plans')
      .set('Authorization', TOKEN)
      .send({ name: 'Empty', exercises: [] })

    expect(create.status).toBe(400)
    expect(mockDb.createWorkoutPlan).not.toHaveBeenCalled()
  })

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
    expect(mockDb.upsertWorkoutExerciseItem).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ name: 'Bench Press', sets: 3, reps: 8, weightKg: 70 }))
    expect(mockDb.upsertWorkoutExerciseItem).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ name: 'Mobility flow', durationMinutes: 20 }))
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
    expect(recent.body[0]).toEqual(expect.objectContaining({
      name: 'Bench Press',
      usageCount: 3,
      sets: 3,
      reps: 8,
      weightKg: 70,
      notes: 'Controlled tempo',
    }))

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
    expect(mockDb.upsertWorkoutExerciseItem).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ name: 'Pull Up' }))
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
