import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import SettingsContracts from '../../backend/src/settings-schema'
import {
  DAY_SETUP_STEPS,
  TALK_STYLE_PRESETS,
  answersFromSettings,
  commitDaySetup,
  daySetupCompletion,
  mapAnswersToWrites,
} from '../interview'

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
    // The whole profile is sent, not just the changed keys — settings merge
    // shallowly, so a partial patch would reset the rest to their defaults.
    assert.deepEqual(mapAnswersToWrites(answers, baseline).settingsPatch.assistantProfile, {
      preferredName: null,
      responseStyle: 'concise',
      planningStyle: 'direct',
      followUpMode: 'only_when_asked',
      dayContext: null,
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
      responseStyle: 'concise',
      planningStyle: 'one_step_at_a_time',
      followUpMode: 'ask_about_outcomes',
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

const writesFixture = {
  settingsPatch: { calorieIntake: false },
  goals: [{ module: 'nutrition' as const, statement: 'Eat enough protein' }],
  habits: [{ title: 'Walk', startTime: '07:00' }],
  changedWindow: true,
}

function recordingDeps(failing?: 'settings' | 'goals' | 'habits') {
  const calls: string[] = []
  return {
    calls,
    deps: {
      updateSettings: async () => {
        calls.push('settings')
        if (failing === 'settings') throw new Error('settings write failed')
      },
      createGoal: async () => {
        calls.push('goals')
        if (failing === 'goals') throw new Error('goal write failed')
      },
      addHabit: async () => {
        calls.push('habits')
        if (failing === 'habits') throw new Error('habit write failed')
      },
    },
  }
}

describe('commitDaySetup', () => {
  it('writes settings first, then Goals, then Habits', async () => {
    const { calls, deps } = recordingDeps()
    const result = await commitDaySetup(writesFixture, deps)

    assert.deepEqual(calls, ['settings', 'goals', 'habits'])
    assert.equal(result.ok, true)
    assert.deepEqual(result.failures, [])
  })

  it('reports a failure instead of claiming success', async () => {
    const { deps } = recordingDeps('habits')
    const result = await commitDaySetup(writesFixture, deps)

    assert.equal(result.ok, false)
    assert.deepEqual(result.applied, ['settings', 'goals'])
    assert.equal(result.failures.length, 1)
    assert.equal(result.failures[0].stage, 'habits')
    assert.match(result.failures[0].message, /habit write failed/)
  })

  it('still writes Habits when a Goal fails, because the stages are independent', async () => {
    const { calls, deps } = recordingDeps('goals')
    const result = await commitDaySetup(writesFixture, deps)

    assert.deepEqual(calls, ['settings', 'goals', 'habits'])
    assert.deepEqual(result.applied, ['settings', 'habits'])
    assert.equal(result.ok, false)
  })

  it('skips a stage with nothing to write', async () => {
    const { calls, deps } = recordingDeps()
    const result = await commitDaySetup(
      { settingsPatch: {}, goals: [], habits: [], changedWindow: false },
      deps,
    )

    assert.deepEqual(calls, [])
    assert.equal(result.ok, true)
  })
})

describe('daySetupCompletion', () => {
  it('reports the first ever completion once, with a set-once stamp', () => {
    const report = daySetupCompletion({
      previousStatus: 'active',
      writes: writesFixture,
      stepsAnswered: 5,
      completedAt: '2026-08-27T09:00:00.000Z',
    })

    assert.equal(report.isFirstCompletion, true)
    assert.deepEqual(report.setOnce, { day_setup_first_completed_at: '2026-08-27T09:00:00.000Z' })
    assert.deepEqual(report.event, {
      run: 'first',
      steps_answered: 5,
      wrote_goals: true,
      wrote_habits: true,
      changed_window: true,
    })
  })

  it('reports a re-run as a repeat and stamps nothing', () => {
    const report = daySetupCompletion({
      previousStatus: 'completed',
      writes: { settingsPatch: {}, goals: [], habits: [], changedWindow: false },
      stepsAnswered: 2,
      completedAt: '2026-08-28T09:00:00.000Z',
    })

    assert.equal(report.isFirstCompletion, false)
    assert.equal(report.setOnce, null)
    assert.equal(report.event.run, 'repeat')
    assert.equal(report.event.wrote_goals, false)
  })

  it('counts a completion after skipping the first-run offer as the first', () => {
    const report = daySetupCompletion({
      previousStatus: 'skipped',
      writes: writesFixture,
      stepsAnswered: 7,
      completedAt: '2026-08-27T09:00:00.000Z',
    })
    assert.equal(report.isFirstCompletion, true)
  })
})

describe('mapAnswersToWrites — assistantProfile is patched whole', () => {
  // Settings merge shallowly (`{ ...settings, ...patch }` in src/lib/local/day.ts),
  // so a partial assistantProfile REPLACES the stored one and SettingsSchema then
  // refills every absent key with its default. Changing one profile field must
  // therefore carry the other four, or it silently resets them.
  it('carries every profile field when only one of them changed', () => {
    const stored = SettingsSchema.parse({
      assistantProfile: {
        preferredName: 'Boss',
        responseStyle: 'concise',
        planningStyle: 'direct',
        followUpMode: 'only_when_asked',
        dayContext: null,
      },
    })
    const answers = { ...answersFromSettings(stored), dayContext: 'Gym Mon/Wed/Fri.' }

    assert.deepEqual(mapAnswersToWrites(answers, stored).settingsPatch.assistantProfile, {
      preferredName: 'Boss',
      responseStyle: 'concise',
      planningStyle: 'direct',
      followUpMode: 'only_when_asked',
      dayContext: 'Gym Mon/Wed/Fri.',
    })
  })

  it('still writes nothing when no profile field changed', () => {
    const stored = SettingsSchema.parse({ assistantProfile: { preferredName: 'Boss' } })
    const writes = mapAnswersToWrites(answersFromSettings(stored), stored)
    assert.equal(writes.settingsPatch.assistantProfile, undefined)
  })
})
