import AdminUserContracts from '../../src/admin-user-contracts'

const { AdminUserDeletionResultSchema, AdminUserAuditEntrySchema } = AdminUserContracts

describe('admin user contracts', () => {
  it('accepts a deleted Guest, who has no email', () => {
    const result = AdminUserDeletionResultSchema.parse({
      deleted: [
        { id: 'guest-1', email: null, warnings: [] },
        { id: 'user-2', email: 'test@example.com', warnings: [] },
      ],
      failures: [{ id: 'guest-3', email: null, error: 'insert failed' }],
    })

    expect(result.deleted.map(user => user.email)).toEqual([null, 'test@example.com'])
    expect(result.failures[0].email).toBeNull()
  })

  it('carries the target id so a Guest entry can be named', () => {
    const entry = AdminUserAuditEntrySchema.parse({
      id: 'audit-1',
      actorEmail: 'admin@example.com',
      targetEmail: null,
      targetUserId: 'guest-1',
      action: 'disabled',
      details: {},
      createdAt: '2026-09-18T00:00:00.000Z',
    })

    expect(entry.targetUserId).toBe('guest-1')
  })
})
