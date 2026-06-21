/**
 * Tests for /api/projects routes (issue #40).
 *
 * Behaviors tested:
 *   GET  /api/projects       → returns only caller's projects (not other users')
 *   POST /api/projects       → persists and returns camelCase Project shape
 *   PUT  /api/projects/:id   → updates and returns Project
 *   DELETE /api/projects/:id → 204
 *   PATCH /api/projects/:id/archive → flips isArchived
 *   Cross-user: cannot read/mutate another user's project
 *   Auth: unauthenticated → 401
 */

import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../src/index'
import { db } from '../src/supabase-client'

// ponytail: mock db so tests are hermetic — no real Supabase calls
jest.mock('../src/supabase-client', () => ({
  db: {
    // existing methods needed by other routes (keep them present so the import doesn't explode)
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
    // project methods
    getProjectsByUserId: jest.fn(),
    createProject: jest.fn(),
    getProjectById: jest.fn(),
    updateProject: jest.fn(),
    deleteProject: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

const makeToken = (userId: string) =>
  `Bearer ${jwt.sign({ userId }, process.env.JWT_SECRET!)}`

const USER_A = 'user-aaa'
const USER_B = 'user-bbb'
const TOKEN_A = makeToken(USER_A)
const TOKEN_B = makeToken(USER_B)

const PROJECT_A = {
  id: 'proj-1',
  user_id: USER_A,
  name: 'Health Goals',
  description: null,
  color: '#3B82F6',
  is_archived: false,
  created_at: '2026-06-21T00:00:00.000Z',
}

// camelCase shape the route should return
const PROJECT_A_CAMEL = {
  id: 'proj-1',
  userId: USER_A,
  name: 'Health Goals',
  description: null,
  color: '#3B82F6',
  isArchived: false,
  createdAt: '2026-06-21T00:00:00.000Z',
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/projects', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/projects')
    expect(res.status).toBe(401)
  })

  it("returns only the caller's projects in camelCase", async () => {
    mockDb.getProjectsByUserId.mockResolvedValue([PROJECT_A])

    const res = await request(app).get('/api/projects').set('Authorization', TOKEN_A)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([PROJECT_A_CAMEL])
    expect(mockDb.getProjectsByUserId).toHaveBeenCalledWith(USER_A)
  })

  it('returns empty array when user has no projects', async () => {
    mockDb.getProjectsByUserId.mockResolvedValue([])

    const res = await request(app).get('/api/projects').set('Authorization', TOKEN_A)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

describe('POST /api/projects', () => {
  it('creates a project and returns camelCase shape', async () => {
    const created = { ...PROJECT_A, id: 'proj-new' }
    mockDb.createProject.mockResolvedValue(created)

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', TOKEN_A)
      .send({ name: 'Health Goals', color: '#3B82F6', isArchived: false })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Health Goals')
    expect(res.body.color).toBe('#3B82F6')
    expect(res.body.isArchived).toBe(false)
    expect(res.body.userId).toBe(USER_A)
    // id assigned (uuid from db mock)
    expect(res.body.id).toBeDefined()
  })

  it('400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', TOKEN_A)
      .send({ color: '#3B82F6' })

    expect(res.status).toBe(400)
    expect(mockDb.createProject).not.toHaveBeenCalled()
  })

  it('400 when color is missing', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', TOKEN_A)
      .send({ name: 'Foo' })

    expect(res.status).toBe(400)
    expect(mockDb.createProject).not.toHaveBeenCalled()
  })
})

describe('PUT /api/projects/:id', () => {
  it('updates and returns the project (owned by caller)', async () => {
    const updated = { ...PROJECT_A, name: 'Renamed' }
    mockDb.getProjectById.mockResolvedValue(PROJECT_A)
    mockDb.updateProject.mockResolvedValue(updated)

    const res = await request(app)
      .put('/api/projects/proj-1')
      .set('Authorization', TOKEN_A)
      .send({ name: 'Renamed' })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Renamed')
  })

  it('403 when caller does not own the project', async () => {
    mockDb.getProjectById.mockResolvedValue(PROJECT_A) // owned by USER_A

    const res = await request(app)
      .put('/api/projects/proj-1')
      .set('Authorization', TOKEN_B) // USER_B trying to update
      .send({ name: 'Hacked' })

    expect(res.status).toBe(403)
    expect(mockDb.updateProject).not.toHaveBeenCalled()
  })

  it('404 when project does not exist', async () => {
    mockDb.getProjectById.mockResolvedValue(null)

    const res = await request(app)
      .put('/api/projects/no-such-id')
      .set('Authorization', TOKEN_A)
      .send({ name: 'X' })

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/projects/:id', () => {
  it('deletes and returns 204 (owned by caller)', async () => {
    mockDb.getProjectById.mockResolvedValue(PROJECT_A)
    mockDb.deleteProject.mockResolvedValue(undefined)

    const res = await request(app)
      .delete('/api/projects/proj-1')
      .set('Authorization', TOKEN_A)

    expect(res.status).toBe(204)
    expect(mockDb.deleteProject).toHaveBeenCalledWith('proj-1')
  })

  it('403 when caller does not own the project', async () => {
    mockDb.getProjectById.mockResolvedValue(PROJECT_A) // owned by USER_A

    const res = await request(app)
      .delete('/api/projects/proj-1')
      .set('Authorization', TOKEN_B)

    expect(res.status).toBe(403)
    expect(mockDb.deleteProject).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/projects/:id/archive', () => {
  it('flips isArchived to true and returns the project', async () => {
    const archived = { ...PROJECT_A, is_archived: true }
    mockDb.getProjectById.mockResolvedValue(PROJECT_A)
    mockDb.updateProject.mockResolvedValue(archived)

    const res = await request(app)
      .patch('/api/projects/proj-1/archive')
      .set('Authorization', TOKEN_A)

    expect(res.status).toBe(200)
    expect(res.body.isArchived).toBe(true)
    expect(mockDb.updateProject).toHaveBeenCalledWith('proj-1', { is_archived: true })
  })

  it('403 when caller does not own the project', async () => {
    mockDb.getProjectById.mockResolvedValue(PROJECT_A) // owned by USER_A

    const res = await request(app)
      .patch('/api/projects/proj-1/archive')
      .set('Authorization', TOKEN_B)

    expect(res.status).toBe(403)
  })
})
