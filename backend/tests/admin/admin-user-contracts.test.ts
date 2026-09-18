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

describe('admin overview contract', () => {
  it('accepts a Guest billing account, who has no email', async () => {
    const { AdminOverviewSchema } = (await import('../../src/admin-overview-contracts')).default
    const totals = {
      requestCount: 0, billedTokens: 0, markupTokens: 0, baseTokens: 0,
      openAiCostUsd: 0, promptTokens: 0, completionTokens: 0, totalOpenAiTokens: 0,
    }
    const overview = AdminOverviewSchema.parse({
      users: [{ id: 'guest-1', email: null, name: 'Guest', role: 'user', balance: 10, balance_updated_at: null }],
      settings: { appTokensPerUsd: 1000, markupRate: 0.25, minMarkupTokens: 5 },
      totals: { today: totals, thisWeek: totals, thisMonth: totals },
      activity: [],
    })

    expect(overview.users[0].email).toBeNull()
  })
})
