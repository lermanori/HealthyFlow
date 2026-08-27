import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import SettingsContracts from '../../backend/src/settings-schema'
import { DAY_SETUP_STEPS, TALK_STYLE_PRESETS, answersFromSettings } from '../interview'

const { SettingsSchema } = SettingsContracts

describe('day setup steps', () => {
  it('declares part one before part two, with unique ids', () => {
    const ids = DAY_SETUP_STEPS.map((step) => step.id)
    assert.deepEqual(ids, ['name', 'window', 'modules', 'talk_style', 'habits', 'goals', 'day_context'])
    assert.equal(new Set(ids).size, ids.length)

    const parts = DAY_SETUP_STEPS.map((step) => step.part)
    assert.deepEqual(parts, ['day', 'day', 'day', 'day', 'direction', 'direction', 'direction'])
  })

  it('makes every step skippable, because day setup never gates', () => {
    assert.ok(DAY_SETUP_STEPS.every((step) => step.skippable))
  })

  it('maps each talk-style preset onto all three assistant enums', () => {
    assert.deepEqual(TALK_STYLE_PRESETS.map((preset) => preset.id), ['tell_me', 'walk_me', 'explain'])
    assert.deepEqual(TALK_STYLE_PRESETS[0].profile, {
      responseStyle: 'concise',
      planningStyle: 'direct',
      followUpMode: 'only_when_asked',
    })
    assert.deepEqual(TALK_STYLE_PRESETS[1].profile, {
      responseStyle: 'balanced',
      planningStyle: 'one_step_at_a_time',
      followUpMode: 'ask_about_outcomes',
    })
    assert.deepEqual(TALK_STYLE_PRESETS[2].profile, {
      responseStyle: 'detailed',
      planningStyle: 'guided',
      followUpMode: 'ask_about_outcomes',
    })
  })
})

describe('answersFromSettings', () => {
  it('opens run two holding the values already stored', () => {
    const settings = SettingsSchema.parse({
      calorieIntake: false,
      workoutTracker: true,
      achievementTracker: false,
      planningWindow: { startTime: '06:30', endTime: '21:00', transitionBufferMinutes: 15 },
      assistantProfile: {
        preferredName: 'Ori',
        responseStyle: 'detailed',
        planningStyle: 'guided',
        followUpMode: 'ask_about_outcomes',
        dayContext: 'Kids on Tuesdays.',
      },
    })

    assert.deepEqual(answersFromSettings(settings), {
      preferredName: 'Ori',
      startTime: '06:30',
      endTime: '21:00',
      modules: { calorieIntake: false, workoutTracker: true, achievementTracker: false },
      talkStyle: 'explain',
      habits: [],
      goals: [],
      dayContext: 'Kids on Tuesdays.',
    })
  })

  it('falls back to the declared default window when Capacity is switched off', () => {
    const settings = SettingsSchema.parse({ planningWindow: null })
    const answers = answersFromSettings(settings)
    assert.equal(answers.startTime, '08:00')
    assert.equal(answers.endTime, '18:00')
  })

  it('picks the nearest preset when stored enums match no preset exactly', () => {
    const settings = SettingsSchema.parse({
      assistantProfile: { responseStyle: 'concise', planningStyle: 'guided', followUpMode: 'only_when_asked' },
    })
    assert.equal(answersFromSettings(settings).talkStyle, null)
  })
})
