import { AssistantProfileSchema, AssistantProfilePatchSchema, SettingsSchema } from '../src/settings-schema'
import { buildChatSystemPrompt } from '../src/routes/ai'

describe('assistantProfile.dayContext', () => {
  it('defaults to null and round-trips through the settings schema', () => {
    expect(AssistantProfileSchema.parse({}).dayContext).toBeNull()

    const settings = SettingsSchema.parse({
      assistantProfile: { dayContext: '  I train at 6am and cook Sundays.  ' },
    })
    expect(settings.assistantProfile.dayContext).toBe('I train at 6am and cook Sundays.')
  })

  it('accepts a cleared value and rejects one over 2000 characters', () => {
    expect(AssistantProfilePatchSchema.parse({ dayContext: null }).dayContext).toBeNull()
    expect(() => AssistantProfilePatchSchema.parse({ dayContext: 'x'.repeat(2001) })).toThrow()
  })

  it('renders into the Talk system prompt, and says so when absent', () => {
    const context = {
      ownerName: null,
      profile: AssistantProfileSchema.parse({ dayContext: 'Kids on Tuesdays.' }),
      goals: { status: 'unavailable' as const },
      habitHistory: { status: 'unavailable' as const },
    }
    expect(buildChatSystemPrompt('UTC', new Date('2026-08-27T09:00:00Z'), context))
      .toContain('"Kids on Tuesdays."')

    const empty = { ...context, profile: AssistantProfileSchema.parse({}) }
    expect(buildChatSystemPrompt('UTC', new Date('2026-08-27T09:00:00Z'), empty))
      .toContain('About their day: (not specified)')
  })
})
