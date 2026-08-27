import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import SettingsContracts from '../../backend/src/settings-schema'
import { DAY_SETUP_STEPS, TALK_STYLE_PRESETS, answersFromSettings, mapAnswersToWrites } from '../interview'

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

const baseline = SettingsSchema.parse({})

describe('mapAnswersToWrites', () => {
  it('produces no writes at all when nothing changed', () => {
    const writes = mapAnswersToWrites(answersFromSettings(baseline), baseline)
    assert.deepEqual(writes.settingsPatch, {})
    assert.deepEqual(writes.goals, [])
    assert.deepEqual(writes.habits, [])
    assert.equal(writes.changedWindow, false)
  })

  it('patches only the fields the run actually changed', () => {
    const answers = { ...answersFromSettings(baseline), startTime: '06:30', endTime: '21:00' }
    const writes = mapAnswersToWrites(answers, baseline)

    assert.deepEqual(writes.settingsPatch, {
      planningWindow: { startTime: '06:30', endTime: '21:00', transitionBufferMinutes: 15 },
    })
    assert.equal(writes.changedWindow, true)
  })

  it('keeps the stored transition buffer, which day setup never asks about', () => {
    const stored = SettingsSchema.parse({
      planningWindow: { startTime: '08:00', endTime: '18:00', transitionBufferMinutes: 45 },
    })
    const answers = { ...answersFromSettings(stored), endTime: '19:00' }
    assert.equal(
      mapAnswersToWrites(answers, stored).settingsPatch.planningWindow?.transitionBufferMinutes,
      45,
    )
  })

  it('expands a talk-style preset into all three enums', () => {
    const answers = { ...answersFromSettings(baseline), talkStyle: 'tell_me' as const }
    assert.deepEqual(mapAnswersToWrites(answers, baseline).settingsPatch.assistantProfile, {
      responseStyle: 'concise',
      planningStyle: 'direct',
      followUpMode: 'only_when_asked',
    })
  })

  it('merges name and dayContext into one assistantProfile patch', () => {
    const answers = {
      ...answersFromSettings(baseline),
      preferredName: 'Ori',
      dayContext: 'Kids on Tuesdays.',
    }
    assert.deepEqual(mapAnswersToWrites(answers, baseline).settingsPatch.assistantProfile, {
      preferredName: 'Ori',
      dayContext: 'Kids on Tuesdays.',
    })
  })

  it('never writes a field the user skipped', () => {
    const stored = SettingsSchema.parse({ assistantProfile: { preferredName: 'Ori' } })
    const answers = { ...answersFromSettings(stored), talkStyle: null }
    assert.deepEqual(mapAnswersToWrites(answers, stored).settingsPatch, {})
  })

  it('creates no Habits or Goals on a re-run, because a fresh run adds only what it collects', () => {
    // The duplicate-Habit guard. `answersFromSettings` starts these arrays empty,
    // so a second pass cannot re-create what the first pass wrote. Existing rows
    // are edited on their own surfaces, never re-created here.
    const afterFirstRun = answersFromSettings(baseline)
    assert.deepEqual(afterFirstRun.habits, [])
    assert.deepEqual(afterFirstRun.goals, [])

    const writes = mapAnswersToWrites(afterFirstRun, baseline)
    assert.equal(writes.habits.length, 0)
    assert.equal(writes.goals.length, 0)
  })

  it('drops blank Habits and Goals rather than creating empty rows', () => {
    const answers = {
      ...answersFromSettings(baseline),
      habits: [{ title: '  ', startTime: null }, { title: ' Walk ', startTime: '07:00' }],
      goals: [
        { module: 'habits' as const, statement: '   ' },
        { module: 'nutrition' as const, statement: ' Eat enough protein ' },
      ],
    }
    const writes = mapAnswersToWrites(answers, baseline)

    assert.deepEqual(writes.habits, [{ title: 'Walk', startTime: '07:00' }])
    assert.deepEqual(writes.goals, [{ module: 'nutrition', statement: 'Eat enough protein' }])
  })
})
