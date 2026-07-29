import jwt from 'jsonwebtoken'
import request from 'supertest'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import {
  AdminUserControlError,
  applyAdminUserAction,
  deleteManagedTestUsers,
  listAdminUserAudit,
  listManagedUsers,
  previewAdminUserDeletion,
} from '../../src/account-data'

jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
  },
}))

jest.mock('../../src/account-data', () => {
  const actual = jest.requireActual('../../src/account-data')
  return {
    ...actual,
    applyAdminUserAction: jest.fn(),
    deleteManagedTestUsers: jest.fn(),
    listAdminUserAudit: jest.fn(),
    listManagedUsers: jest.fn(),
    previewAdminUserDeletion: jest.fn(),
  }
})

const mockDb = db as jest.Mocked<typeof db>
const mockApplyAction = applyAdminUserAction as jest.MockedFunction<typeof applyAdminUserAction>
const mockDeleteUsers = deleteManagedTestUsers as jest.MockedFunction<typeof deleteManagedTestUsers>
const mockListAudit = listAdminUserAudit as jest.MockedFunction<typeof listAdminUserAudit>
const mockListUsers = listManagedUsers as jest.MockedFunction<typeof listManagedUsers>
const mockPreviewDeletion = previewAdminUserDeletion as jest.MockedFunction<typeof previewAdminUserDeletion>

const authHeader = (userId = 'admin-1') =>
  `Bearer ${jwt.sign({ userId }, process.env.JWT_SECRET!)}`

beforeAll(() => {
  process.env.HF_TEST_ENFORCE_USER_ACCESS = '1'
})

afterAll(() => {
  delete process.env.HF_TEST_ENFORCE_USER_ACCESS
})

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserById.mockResolvedValue({
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin',
    role: 'admin',
    disabled_at: null,
  })
})

describe('admin user-management routes', () => {
  it('lists safe user summaries for an administrator', async () => {
    mockListUsers.mockResolvedValue([{
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'user',
      signupMethod: 'password',
      createdAt: '2026-07-01T00:00:00.000Z',
      lastLoginAt: null,
      disabledAt: null,
      isTest: true,
      balance: 25,
      subscriptionActive: false,
      protection: null,
    }])

    const response = await request(app)
      .get('/api/admin/users')
      .set('Authorization', authHeader())

    expect(response.status).toBe(200)
    expect(response.body[0]).toEqual(expect.objectContaining({
      email: 'test@example.com',
      isTest: true,
    }))
    expect(mockListUsers).toHaveBeenCalledWith('admin-1')
  })

  it('blocks the whole admin surface for disabled administrators', async () => {
    mockDb.getUserById.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      disabled_at: '2026-07-29T00:00:00.000Z',
    })

    const response = await request(app)
      .get('/api/admin/users')
      .set('Authorization', authHeader())

    expect(response.status).toBe(403)
    expect(response.body.reason).toBe('account_disabled')
    expect(mockListUsers).not.toHaveBeenCalled()
  })

  it('rejects a deleted account token as unavailable instead of returning a server error', async () => {
    mockDb.getUserById.mockRejectedValue(Object.assign(new Error('No rows'), { code: 'PGRST116' }))

    const response = await request(app)
      .get('/api/admin/users')
      .set('Authorization', authHeader())

    expect(response.status).toBe(403)
    expect(response.body.reason).toBe('account_unavailable')
  })

  it('applies an explicit batch action', async () => {
    mockApplyAction.mockResolvedValue({ updatedUserIds: ['user-1', 'user-2'] })

    const response = await request(app)
      .patch('/api/admin/users')
      .set('Authorization', authHeader())
      .send({ userIds: ['user-1', 'user-2'], action: 'mark_test' })

    expect(response.status).toBe(200)
    expect(mockApplyAction).toHaveBeenCalledWith('admin-1', {
      userIds: ['user-1', 'user-2'],
      action: 'mark_test',
    })
  })

  it('surfaces protected-account errors without applying a partial batch', async () => {
    mockApplyAction.mockRejectedValue(new AdminUserControlError(
      403,
      'protected_account',
      'admin@example.com is protected.',
    ))

    const response = await request(app)
      .patch('/api/admin/users')
      .set('Authorization', authHeader())
      .send({ userIds: ['admin-1', 'user-1'], action: 'disable' })

    expect(response.status).toBe(403)
    expect(response.body.reason).toBe('protected_account')
  })

  it('returns the server-generated deletion preview', async () => {
    mockPreviewDeletion.mockResolvedValue({
      canDelete: true,
      confirmationPhrase: 'DELETE 1 TEST USER',
      totalRecords: 13,
      users: [{
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        isTest: true,
        subscriptionActive: false,
        protection: null,
        blockers: [],
        counts: {
          items: 5,
          health: 2,
          calendar: 1,
          assistant: 2,
          billing: 1,
          account: 1,
          waitlist: 1,
          total: 13,
        },
        releasesPublicSignupSeat: true,
      }],
    })

    const response = await request(app)
      .post('/api/admin/users/deletion-preview')
      .set('Authorization', authHeader())
      .send({ userIds: ['user-1'] })

    expect(response.status).toBe(200)
    expect(response.body.confirmationPhrase).toBe('DELETE 1 TEST USER')
    expect(response.body.totalRecords).toBe(13)
  })

  it('passes the exact confirmation to the destructive service', async () => {
    mockDeleteUsers.mockResolvedValue({
      deleted: [{
        id: 'user-1',
        email: 'test@example.com',
        warnings: [],
        waitlistEntriesDeleted: 1,
        publicSignupSeatsReleased: 1,
      }],
      failures: [],
    })

    const response = await request(app)
      .delete('/api/admin/users')
      .set('Authorization', authHeader())
      .send({ userIds: ['user-1'], confirmation: 'DELETE 1 TEST USER' })

    expect(response.status).toBe(200)
    expect(mockDeleteUsers).toHaveBeenCalledWith('admin-1', {
      userIds: ['user-1'],
      confirmation: 'DELETE 1 TEST USER',
    })
  })

  it('returns recent audit entries without exposing database column names', async () => {
    mockListAudit.mockResolvedValue([{
      id: 'audit-1',
      actorEmail: 'admin@example.com',
      targetEmail: 'test@example.com',
      action: 'marked_test',
      details: {},
      createdAt: '2026-07-29T00:00:00.000Z',
    }])

    const response = await request(app)
      .get('/api/admin/users/audit')
      .set('Authorization', authHeader())

    expect(response.status).toBe(200)
    expect(response.body[0]).toEqual(expect.objectContaining({
      actorEmail: 'admin@example.com',
      action: 'marked_test',
    }))
    expect(response.body[0].actor_email).toBeUndefined()
  })
})
