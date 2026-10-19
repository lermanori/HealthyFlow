import { AssistantConversationSnapshot } from '../../src/routes/ai'

describe('assistant conversation snapshots', () => {
  it('accepts UTC timestamps returned by Postgres as offsets', () => {
    const result = AssistantConversationSnapshot.safeParse({
      id: 'b0a3a724-ffac-4408-96d4-996ce4ebcdfa',
      title: 'Tomorrow',
      model: 'gpt-4o-mini',
      createdAt: '2026-10-15T11:25:10.171+00:00',
      updatedAt: '2026-10-18T15:28:57.138Z',
      messages: [{
        id: '15599dae-7760-41f2-8517-6bb3d3d2deaa',
        role: 'user',
        content: 'What is on my calendar tomorrow?',
        createdAt: '2026-10-15T11:25:14.263+00:00',
      }],
    })

    expect(result.success).toBe(true)
  })
})
