import request from 'supertest'
import jwt from 'jsonwebtoken'

const mockBuildAccountExport = jest.fn()
const mockGetAccountCredentials = jest.fn()
const mockDeleteUser = jest.fn()
const mockRevokeGoogleAuthorization = jest.fn()
const mockCompare = jest.fn()
const mockDeleteSupabaseAuthUser = jest.fn()

jest.mock('../src/account-data', () => ({
  DURABLE_E2E_USER_EMAIL: 'e2e@test.healthyflow.local',
  buildAccountExport: (...args: unknown[]) => mockBuildAccountExport(...args),
  getAccountCredentials: (...args: unknown[]) => mockGetAccountCredentials(...args),
}))
jest.mock('../src/supabase-client', () => ({
  supabase: {
    auth: {
      admin: {
        deleteUser: (...args: unknown[]) => mockDeleteSupabaseAuthUser(...args),
      },
    },
  },
  db: {
    getUserById: jest.fn(),
    getUserByEmail: jest.fn(),
    deleteUserWithSignupCleanup: (...args: unknown[]) => mockDeleteUser(...args),
  },
}))
jest.mock('../src/calendar', () => {
  const actual = jest.requireActual('../src/calendar')
  return { ...actual, revokeGoogleAuthorization: (...args: unknown[]) => mockRevokeGoogleAuthorization(...args) }
})
jest.mock('bcryptjs', () => ({ compare: (...args: unknown[]) => mockCompare(...args) }))

import { app } from '../src/index'

const tokenFor = (userId: string) => jwt.sign({ userId }, process.env.JWT_SECRET!)

beforeEach(() => {
  jest.clearAllMocks()
  mockBuildAccountExport.mockResolvedValue({ version: 1, exportedAt: new Date().toISOString(), account: { id: 'user-export' } })
  mockGetAccountCredentials.mockImplementation(async (userId: string) => ({
    id: userId,
    email: `${userId}@example.com`,
    name: 'User',
    role: 'user',
    password_hash: 'hash',
    google_auth_subject: null,
    apple_auth_subject: null,
    signup_method: 'password',
  }))
  mockCompare.mockResolvedValue(true)
  mockRevokeGoogleAuthorization.mockResolvedValue(undefined)
  mockDeleteUser.mockResolvedValue(undefined)
  mockDeleteSupabaseAuthUser.mockResolvedValue({ error: null })
})

test('exports a no-store, dated JSON attachment for the authenticated owner', async () => {
  const response = await request(app)
    .get('/api/account/export')
    .set('Authorization', `Bearer ${tokenFor('user-export')}`)

  expect(response.status).toBe(200)
  expect(response.headers['cache-control']).toBe('no-store')
  expect(response.headers['content-disposition']).toMatch(/^attachment; filename="healthyflow-export-\d{4}-\d{2}-\d{2}\.json"$/)
  expect(mockBuildAccountExport).toHaveBeenCalledWith('user-export')
  expect(response.body.version).toBe(1)
})

test('does not return a partial export when archive creation fails', async () => {
  mockBuildAccountExport.mockRejectedValueOnce(new Error('page failed'))
  const response = await request(app)
    .get('/api/account/export')
    .set('Authorization', `Bearer ${tokenFor('user-export-failure')}`)
  expect(response.status).toBe(500)
  expect(response.body).toEqual({ error: 'Could not create account export' })
})

test('requires the exact confirmation phrase', async () => {
  const response = await request(app)
    .delete('/api/account')
    .set('Authorization', `Bearer ${tokenFor('user-phrase')}`)
    .send({ password: 'correct', confirmation: 'delete' })
  expect(response.status).toBe(400)
  expect(mockDeleteUser).not.toHaveBeenCalled()
})

test('rejects a wrong current password', async () => {
  mockCompare.mockResolvedValueOnce(false)
  const response = await request(app)
    .delete('/api/account')
    .set('Authorization', `Bearer ${tokenFor('user-password')}`)
    .send({ password: 'wrong', confirmation: 'DELETE' })
  expect(response.status).toBe(401)
  expect(mockDeleteUser).not.toHaveBeenCalled()
})

test.each([
  ['admin-user', 'admin', 'admin@example.com'],
  ['demo-user', 'user', 'demo-maya@healthyflow.local'],
  ['e2e-user', 'user', 'e2e@test.healthyflow.local'],
])('blocks ineligible account %s', async (userId, role, email) => {
  mockGetAccountCredentials.mockResolvedValueOnce({ id: userId, role, email, password_hash: 'hash' })
  const response = await request(app)
    .delete('/api/account')
    .set('Authorization', `Bearer ${tokenFor(userId)}`)
    .send({ password: 'correct', confirmation: 'DELETE' })
  expect(response.status).toBe(403)
  expect(mockCompare).not.toHaveBeenCalled()
  expect(mockDeleteUser).not.toHaveBeenCalled()
})

test('deletes after verification and returns no warnings when revocation succeeds', async () => {
  const response = await request(app)
    .delete('/api/account')
    .set('Authorization', `Bearer ${tokenFor('user-delete')}`)
    .send({ password: 'correct', confirmation: 'DELETE' })
  expect(response.status).toBe(200)
  expect(response.body).toEqual({ deleted: true, warnings: [] })
  expect(mockRevokeGoogleAuthorization).toHaveBeenCalledWith('user-delete')
  expect(mockDeleteUser).toHaveBeenCalledWith('user-delete')
})

test('deletes a Google-created account without asking for a password and removes its auth identity', async () => {
  mockGetAccountCredentials.mockResolvedValueOnce({
    id: 'google-user',
    role: 'user',
    email: 'google@example.com',
    password_hash: 'random-unusable-hash',
    google_auth_subject: 'google-subject',
    signup_method: 'google',
  })

  const response = await request(app)
    .delete('/api/account')
    .set('Authorization', `Bearer ${tokenFor('google-user')}`)
    .send({ confirmation: 'DELETE' })

  expect(response.status).toBe(200)
  expect(response.body).toEqual({ deleted: true, warnings: [] })
  expect(mockCompare).not.toHaveBeenCalled()
  expect(mockDeleteUser).toHaveBeenCalledWith('google-user')
  expect(mockDeleteSupabaseAuthUser).toHaveBeenCalledWith('google-subject')
})

test('deletes an Apple-created account without asking for a password and removes its auth identity', async () => {
  mockGetAccountCredentials.mockResolvedValueOnce({
    id: 'apple-user',
    role: 'user',
    email: 'apple@example.com',
    password_hash: 'random-unusable-hash',
    google_auth_subject: null,
    apple_auth_subject: 'apple-subject',
    signup_method: 'apple',
  })

  const response = await request(app)
    .delete('/api/account')
    .set('Authorization', `Bearer ${tokenFor('apple-user')}`)
    .send({ confirmation: 'DELETE' })

  expect(response.status).toBe(200)
  expect(response.body).toEqual({ deleted: true, warnings: [] })
  expect(mockCompare).not.toHaveBeenCalled()
  expect(mockDeleteUser).toHaveBeenCalledWith('apple-user')
  expect(mockDeleteSupabaseAuthUser).toHaveBeenCalledWith('apple-subject')
})

test('continues deletion and reports a Google revocation warning', async () => {
  mockRevokeGoogleAuthorization.mockRejectedValueOnce(new Error('Google unavailable'))
  const response = await request(app)
    .delete('/api/account')
    .set('Authorization', `Bearer ${tokenFor('user-warning')}`)
    .send({ password: 'correct', confirmation: 'DELETE' })
  expect(response.status).toBe(200)
  expect(response.body).toEqual({ deleted: true, warnings: ['google-revocation-failed'] })
  expect(mockDeleteUser).toHaveBeenCalledWith('user-warning')
})

test('rate-limits password verification after five attempts per account', async () => {
  mockCompare.mockResolvedValue(false)
  const token = tokenFor('user-rate-limit')
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request(app)
      .delete('/api/account')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'wrong', confirmation: 'DELETE' })
    expect(response.status).toBe(401)
  }
  const limited = await request(app)
    .delete('/api/account')
    .set('Authorization', `Bearer ${token}`)
    .send({ password: 'wrong', confirmation: 'DELETE' })
  expect(limited.status).toBe(429)
})
