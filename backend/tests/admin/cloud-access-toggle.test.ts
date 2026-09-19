/**
 * Granting and revoking Cloud from People (#268, #300).
 *
 * v1 sells no Cloud; this switch is the operator path for the legacy founder
 * exception, and it reflects whichever account it is on for. Each change is one
 * database call that writes the entitlement and its audit entry together, and a
 * Guest — who can never hold Cloud — is refused rather than given a row that
 * could never take effect.
 */
import fs from 'fs'
import path from 'path'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'

jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    adminSetCloudAccess: jest.fn(),
  },
  supabase: { from: jest.fn() },
}))

const mockDb = db as jest.Mocked<typeof db>
const ADMIN = `Bearer ${jwt.sign({ userId: 'admin-1' }, process.env.JWT_SECRET!)}`
const PERSON = `Bearer ${jwt.sign({ userId: 'person-1' }, process.env.JWT_SECRET!)}`

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserById.mockImplementation(async (id: string) => ({
    id,
    email: `${id}@example.com`,
    role: id === 'admin-1' ? 'admin' : 'user',
  }) as never)
})

describe('PATCH /api/admin/users/:userId/cloud', () => {
  it('grants Cloud as the calling administrator', async () => {
    mockDb.adminSetCloudAccess.mockResolvedValue({ status: 'granted', active: true })

    const response = await request(app)
      .patch('/api/admin/users/person-1/cloud')
      .set('Authorization', ADMIN)
      .send({ active: true })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ userId: 'person-1', active: true })
    expect(mockDb.adminSetCloudAccess).toHaveBeenCalledWith({ userId: 'person-1', active: true, actorId: 'admin-1' })
  })

  it('revokes Cloud', async () => {
    mockDb.adminSetCloudAccess.mockResolvedValue({ status: 'revoked', active: false })

    const response = await request(app)
      .patch('/api/admin/users/person-1/cloud')
      .set('Authorization', ADMIN)
      .send({ active: false })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ userId: 'person-1', active: false })
  })

  it('refuses a Guest, who can never hold Cloud, and writes nothing', async () => {
    mockDb.adminSetCloudAccess.mockResolvedValue({ status: 'guest', active: false })

    const response = await request(app)
      .patch('/api/admin/users/guest-1/cloud')
      .set('Authorization', ADMIN)
      .send({ active: true })

    expect(response.status).toBe(400)
    expect(response.body.reason).toBe('guest_cannot_hold_cloud')
  })

  it('reports an account that no longer exists', async () => {
    mockDb.adminSetCloudAccess.mockResolvedValue({ status: 'not_found', active: false })

    const response = await request(app)
      .patch('/api/admin/users/gone-1/cloud')
      .set('Authorization', ADMIN)
      .send({ active: true })

    expect(response.status).toBe(404)
  })

  it('refuses a caller who is not an admin', async () => {
    const response = await request(app)
      .patch('/api/admin/users/person-1/cloud')
      .set('Authorization', PERSON)
      .send({ active: true })

    expect(response.status).toBe(403)
    expect(mockDb.adminSetCloudAccess).not.toHaveBeenCalled()
  })

  it('refuses a body that does not say which way', async () => {
    const response = await request(app)
      .patch('/api/admin/users/person-1/cloud')
      .set('Authorization', ADMIN)
      .send({})

    expect(response.status).toBe(400)
    expect(mockDb.adminSetCloudAccess).not.toHaveBeenCalled()
  })
})

describe('the Cloud access migration', () => {
  const dir = path.join(__dirname, '../../../supabase/migrations')
  const sql = fs.readdirSync(dir)
    .filter(name => name.endsWith('_admin_set_cloud_access.sql'))
    .map(name => fs.readFileSync(path.join(dir, name), 'utf8'))
    .join('\n')

  it('writes the entitlement and its audit entry in one call, and refuses a Guest', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION admin_set_cloud_access\(/)
    expect(sql).toMatch(/'guest'/)
    expect(sql).toMatch(/'cloud_granted'/)
    expect(sql).toMatch(/'cloud_revoked'/)
    expect(sql).toMatch(/'regular'/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION admin_set_cloud_access\(UUID, BOOLEAN, UUID\) TO service_role/)
  })
})
