import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

jest.mock('../src/supabase-client', () => ({
  db: {
    getTaskById: jest.fn(),
    createHabitInstance: jest.fn(),
    createHabitProgressEntry: jest.fn(),
    getHabitProgressEntries: jest.fn(),
    updateTask: jest.fn(),
  },
}))

jest.mock('../src/calendar', () => ({
  deleteGoogleCalendarEvent: jest.fn(),
  isGoogleCalendarNotConnectedError: jest.fn(() => false),
  syncTaskToGoogleCalendar: jest.fn(),
}))

const mockDb = db as jest.Mocked<typeof db>
const USER_ID = 'user-1'
const HABIT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const INSTANCE_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'
const DATE = '2026-07-16'
const TOKEN = `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET!)}`

const parent = {
  id: HABIT_ID,
  user_id: USER_ID,
  title: '45-minute workout',
  type: 'habit',
  category: 'fitness',
  repeat_type: 'daily',
  scheduled_date: null,
  original_habit_id: null,
  habit_target_value: 45,
  habit_target_unit: 'minutes',
}

const instance = {
  ...parent,
  id: INSTANCE_ID,
  scheduled_date: DATE,
  original_habit_id: HABIT_ID,
  completed: false,
  completed_at: null,
  habit_outcome: 'pending',
  created_at: '2026-07-16T08:00:00.000Z',
}

describe('Habit progress API', () => {
  beforeEach(() => jest.clearAllMocks())

  it('records progress against a virtual target Habit and returns a partial day', async () => {
    mockDb.getTaskById.mockResolvedValue(parent as any)
    mockDb.createHabitInstance.mockResolvedValue(instance as any)
    mockDb.createHabitProgressEntry.mockResolvedValue({
      id: 'entry-1', habit_instance_id: INSTANCE_ID, user_id: USER_ID, amount: 20,
      note: 'Run', created_at: '2026-07-16T08:30:00.000Z', updated_at: '2026-07-16T08:30:00.000Z',
    } as any)
    mockDb.getHabitProgressEntries.mockResolvedValue([{ id: 'entry-1', amount: 20, note: 'Run', created_at: '2026-07-16T08:30:00.000Z', updated_at: '2026-07-16T08:30:00.000Z' }] as any)
    mockDb.updateTask.mockResolvedValue({ ...instance, habit_outcome: 'partial' } as any)

    const response = await request(app)
      .post(`/api/tasks/${HABIT_ID}-${DATE}/habit-progress`)
      .set('Authorization', TOKEN)
      .send({ amount: 20, note: 'Run' })

    expect(response.status).toBe(201)
    expect(response.body.habit.habitInfo).toEqual({
      target: { value: 45, unit: 'minutes' },
      outcome: 'partial',
      progressTotal: 20,
    })
    expect(response.body.entries).toEqual([
      expect.objectContaining({ id: 'entry-1', amount: 20, note: 'Run' }),
    ])
  })

  it('automatically completes a target Habit when accumulated chunks reach the target', async () => {
    mockDb.getTaskById.mockResolvedValue({ ...instance, habit_outcome: 'partial' } as any)
    mockDb.createHabitProgressEntry.mockResolvedValue({ id: 'entry-2', amount: 25 } as any)
    mockDb.getHabitProgressEntries.mockResolvedValue([
      { id: 'entry-1', amount: 20, note: 'Run', created_at: '2026-07-16T08:30:00.000Z', updated_at: '2026-07-16T08:30:00.000Z' },
      { id: 'entry-2', amount: 25, note: null, created_at: '2026-07-16T09:00:00.000Z', updated_at: '2026-07-16T09:00:00.000Z' },
    ] as any)
    mockDb.updateTask.mockImplementation(async (_id, updates) => ({ ...instance, ...updates }) as any)

    const response = await request(app)
      .post(`/api/tasks/${INSTANCE_ID}/habit-progress`)
      .set('Authorization', TOKEN)
      .send({ amount: 25 })

    expect(response.status).toBe(201)
    expect(response.body.habit.completed).toBe(true)
    expect(response.body.habit.habitInfo).toEqual({
      target: { value: 45, unit: 'minutes' },
      outcome: 'completed',
      progressTotal: 45,
    })
  })

  it('marks a partial target Habit not done without deleting its progress', async () => {
    mockDb.getTaskById.mockResolvedValue({ ...instance, habit_outcome: 'partial' } as any)
    mockDb.getHabitProgressEntries.mockResolvedValue([
      { id: 'entry-1', amount: 20, note: 'Run', created_at: '2026-07-16T08:30:00.000Z', updated_at: '2026-07-16T08:30:00.000Z' },
    ] as any)
    mockDb.updateTask.mockImplementation(async (_id, updates) => ({ ...instance, ...updates }) as any)

    const response = await request(app)
      .put(`/api/tasks/${INSTANCE_ID}/habit-outcome`)
      .set('Authorization', TOKEN)
      .send({ outcome: 'failed' })

    expect(response.status).toBe(200)
    expect(response.body.habit.habitInfo).toEqual({
      target: { value: 45, unit: 'minutes' }, outcome: 'failed', progressTotal: 20,
    })
    expect(response.body.entries).toHaveLength(1)
  })

  it('applies a whole-Habit target change to the selected materialized day and the parent', async () => {
    const binaryInstance = {
      ...instance,
      habit_target_value: null,
      habit_target_unit: null,
    }
    let storedInstance = binaryInstance
    mockDb.getTaskById.mockImplementation(async id => (id === INSTANCE_ID ? storedInstance : parent) as any)
    mockDb.getHabitProgressEntries.mockResolvedValue([] as any)
    mockDb.updateTask.mockImplementation(async (id, updates) => {
      const updated = { ...(id === HABIT_ID ? parent : storedInstance), id, ...updates }
      if (id === INSTANCE_ID) storedInstance = updated as typeof storedInstance
      return updated as any
    })

    const response = await request(app)
      .put(`/api/tasks/${INSTANCE_ID}`)
      .set('Authorization', TOKEN)
      .send({ editScope: 'habit', habitTarget: { value: 45, unit: 'minutes' } })

    expect(response.status).toBe(200)
    expect(mockDb.updateTask).toHaveBeenCalledWith(HABIT_ID, expect.objectContaining({
      habit_target_value: 45,
      habit_target_unit: 'minutes',
    }))
    expect(mockDb.updateTask).toHaveBeenCalledWith(INSTANCE_ID, expect.objectContaining({
      habit_target_value: 45,
      habit_target_unit: 'minutes',
    }))
    expect(response.body.habitInfo.target).toEqual({ value: 45, unit: 'minutes' })
  })
})
