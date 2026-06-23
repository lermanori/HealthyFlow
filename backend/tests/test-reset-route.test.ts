/**
 * TDD guard for POST /test/reset.
 * - 404 when HF_TEST_MODE is not set
 * - 200 when HF_TEST_MODE=1 (test-mode guard only; db side-effects are mocked)
 */

import request from 'supertest'

// ponytail: mock db so we never hit Supabase
jest.mock('../src/supabase-client', () => ({
  supabase: {},
  db: {
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
    getTasksByUserId: jest.fn(),
    getTasksWithRecurringHabits: jest.fn(),
    createTask: jest.fn(),
    getTaskById: jest.fn(),
    updateTask: jest.fn(),
    deleteTask: jest.fn(),
    deleteTasksByUserId: jest.fn(),
    getNextPosition: jest.fn(),
    reorderTasks: jest.fn(),
    getWeeklyTasks: jest.fn(),
    getMonthlyCategoryStats: jest.fn(),
    getTodayProgress: jest.fn(),
    getProductivityAnalytics: jest.fn(),
    getHabitStreaks: jest.fn(),
    getTimeDistribution: jest.fn(),
    createRecommendation: jest.fn(),
    getRecommendationsByUserId: jest.fn(),
    createMultipleRecommendations: jest.fn(),
    deleteRecommendationsByUserId: jest.fn(),
    getUserById: jest.fn(),
    getAllUsers: jest.fn(),
    deleteUser: jest.fn(),
    updateUserPassword: jest.fn(),
    createHabitInstance: jest.fn(),
    getProjectsByUserId: jest.fn(),
    createProject: jest.fn(),
    getProjectById: jest.fn(),
    updateProject: jest.fn(),
    deleteProject: jest.fn(),
    resetTestUser: jest.fn().mockResolvedValue(undefined),
  },
}))

describe('POST /test/reset — HF_TEST_MODE guard', () => {
  const OLD_ENV = process.env.HF_TEST_MODE

  afterEach(() => {
    process.env.HF_TEST_MODE = OLD_ENV
    jest.resetModules()
  })

  it('returns 404 when HF_TEST_MODE is not set', async () => {
    delete process.env.HF_TEST_MODE
    // Re-import app AFTER clearing the env var so the route conditional is evaluated fresh
    const { app } = await import('../src/index')
    const res = await request(app).post('/test/reset')
    expect(res.status).toBe(404)
  })

  it('returns 200 when HF_TEST_MODE=1', async () => {
    process.env.HF_TEST_MODE = '1'
    const { app } = await import('../src/index')
    const res = await request(app).post('/test/reset')
    expect(res.status).toBe(200)
  })
})
