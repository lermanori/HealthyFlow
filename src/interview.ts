import SettingsContracts, { type Settings as UserSettings } from '../backend/src/settings-schema'
import { type GoalModule } from '../backend/src/goals-schema'

const { DEFAULT_PLANNING_WINDOW } = SettingsContracts

/**
 * Day setup — the deterministic interview.
 *
 * Everything here is pure. It performs no I/O, imports no service and touches no
 * React, so the whole question set and every mapping decision is testable without
 * a running app. `commitDaySetup` takes its writers as arguments for the same
 * reason.
 *
 * Day setup runs offline, costs nothing and needs no credits. That is deliberate:
 * it is offered at first run, where a Guest may have no network and holds no
 * credits, so an AI-conducted interview would be unavailable exactly when it is
 * offered.
 */

export type DaySetupPart = 'day' | 'direction'
export type DaySetupStepId =
  | 'name' | 'window' | 'modules' | 'talk_style'
  | 'habits' | 'goals' | 'day_context'

export type DaySetupStep = {
  id: DaySetupStepId
  part: DaySetupPart
  question: string
  /** Every step is skippable. Day setup offers; it never gates. */
  skippable: true
}

export const DAY_SETUP_STEPS: readonly DaySetupStep[] = [
  { id: 'name', part: 'day', question: 'What should I call you?', skippable: true },
  { id: 'window', part: 'day', question: 'When does your day actually start and end?', skippable: true },
  { id: 'modules', part: 'day', question: 'Which of these do you want to start with?', skippable: true },
  { id: 'talk_style', part: 'day', question: 'How should HealthyFlow talk to you?', skippable: true },
  { id: 'habits', part: 'direction', question: 'Any daily anchors?', skippable: true },
  { id: 'goals', part: 'direction', question: 'What are you trying to get to?', skippable: true },
  { id: 'day_context', part: 'direction', question: 'Anything else about your day?', skippable: true },
]

export type TalkStyleId = 'tell_me' | 'walk_me' | 'explain'

type TalkProfile = Pick<
  UserSettings['assistantProfile'],
  'responseStyle' | 'planningStyle' | 'followUpMode'
>

/**
 * One question sets three settings.
 *
 * The three enums genuinely correlate, so bundling them is compression rather
 * than a lie — and Settings still exposes each one individually.
 */
export const TALK_STYLE_PRESETS: readonly {
  id: TalkStyleId
  label: string
  profile: TalkProfile
}[] = [
  {
    id: 'tell_me',
    label: 'Just tell me',
    profile: { responseStyle: 'concise', planningStyle: 'direct', followUpMode: 'only_when_asked' },
  },
  {
    id: 'walk_me',
    label: 'Walk me through it',
    profile: { responseStyle: 'balanced', planningStyle: 'one_step_at_a_time', followUpMode: 'ask_about_outcomes' },
  },
  {
    id: 'explain',
    label: 'Explain as you go',
    profile: { responseStyle: 'detailed', planningStyle: 'guided', followUpMode: 'ask_about_outcomes' },
  },
]

export type DaySetupHabitAnswer = { title: string; startTime: string | null }
export type DaySetupGoalAnswer = { module: GoalModule; statement: string }

export type DaySetupAnswers = {
  preferredName: string | null
  startTime: string
  endTime: string
  modules: { calorieIntake: boolean; workoutTracker: boolean; achievementTracker: boolean }
  /** `null` when the stored enums match no preset — run two must not silently rewrite them. */
  talkStyle: TalkStyleId | null
  habits: DaySetupHabitAnswer[]
  goals: DaySetupGoalAnswer[]
  dayContext: string | null
}

/**
 * The answers a run starts from.
 *
 * Run two opens holding what is already stored, so a second pass produces a diff
 * rather than resetting anything the user never revisited. Habits and Goals start
 * empty: existing rows are listed by the UI for editing, and this array carries
 * only what the run is adding.
 */
export function answersFromSettings(settings: UserSettings): DaySetupAnswers {
  const window = settings.planningWindow ?? DEFAULT_PLANNING_WINDOW
  const profile = settings.assistantProfile
  const preset = TALK_STYLE_PRESETS.find((candidate) => (
    candidate.profile.responseStyle === profile.responseStyle
    && candidate.profile.planningStyle === profile.planningStyle
    && candidate.profile.followUpMode === profile.followUpMode
  ))

  return {
    preferredName: profile.preferredName,
    startTime: window.startTime,
    endTime: window.endTime,
    modules: {
      calorieIntake: settings.calorieIntake,
      workoutTracker: settings.workoutTracker,
      achievementTracker: settings.achievementTracker,
    },
    talkStyle: preset?.id ?? null,
    habits: [],
    goals: [],
    dayContext: profile.dayContext,
  }
}

export type DaySetupWrites = {
  /** Only the fields this run changed. An untouched field never appears. */
  settingsPatch: Partial<UserSettings>
  goals: DaySetupGoalAnswer[]
  habits: DaySetupHabitAnswer[]
  /** Reported to analytics: the single most valuable thing day setup moves. */
  changedWindow: boolean
}

/**
 * Answers in, writes out.
 *
 * The contract that makes a re-run safe: **only what changed is written.** A
 * field the user skipped, or left as it was, produces no patch entry — so a
 * second pass over unchanged answers is a no-op rather than a reset. Habits and
 * Goals carry only what this run is adding; existing rows are edited in place by
 * their own surfaces, never re-created here.
 */
export function mapAnswersToWrites(
  answers: DaySetupAnswers,
  current: UserSettings,
): DaySetupWrites {
  const settingsPatch: Partial<UserSettings> = {}

  const storedWindow = current.planningWindow ?? DEFAULT_PLANNING_WINDOW
  const changedWindow = answers.startTime !== storedWindow.startTime
    || answers.endTime !== storedWindow.endTime
  if (changedWindow) {
    // The transition buffer is deliberately not asked — nobody answers "how long
    // between things?" honestly — so whatever is stored survives untouched.
    settingsPatch.planningWindow = {
      startTime: answers.startTime,
      endTime: answers.endTime,
      transitionBufferMinutes: storedWindow.transitionBufferMinutes,
    }
  }

  for (const key of ['calorieIntake', 'workoutTracker', 'achievementTracker'] as const) {
    if (answers.modules[key] !== current[key]) settingsPatch[key] = answers.modules[key]
  }

  const profilePatch: Partial<UserSettings['assistantProfile']> = {}
  const name = answers.preferredName?.trim() || null
  if (name !== current.assistantProfile.preferredName) profilePatch.preferredName = name

  const dayContext = answers.dayContext?.trim() || null
  if (dayContext !== current.assistantProfile.dayContext) profilePatch.dayContext = dayContext

  // Compared as a whole preset, not field-by-field: a preset's three enums are
  // one decision, and a stored profile that happens to share one field with the
  // newly chosen preset (e.g. both default to "concise") must not cause that
  // field to be silently dropped from the patch.
  const currentPreset = TALK_STYLE_PRESETS.find((candidate) => (
    candidate.profile.responseStyle === current.assistantProfile.responseStyle
    && candidate.profile.planningStyle === current.assistantProfile.planningStyle
    && candidate.profile.followUpMode === current.assistantProfile.followUpMode
  ))
  const preset = TALK_STYLE_PRESETS.find((candidate) => candidate.id === answers.talkStyle)
  if (preset && preset.id !== currentPreset?.id) {
    profilePatch.responseStyle = preset.profile.responseStyle
    profilePatch.planningStyle = preset.profile.planningStyle
    profilePatch.followUpMode = preset.profile.followUpMode
  }

  if (Object.keys(profilePatch).length > 0) {
    settingsPatch.assistantProfile = profilePatch as UserSettings['assistantProfile']
  }

  return {
    settingsPatch,
    changedWindow,
    habits: answers.habits
      .map((habit) => ({ title: habit.title.trim(), startTime: habit.startTime }))
      .filter((habit) => habit.title.length > 0),
    goals: answers.goals
      .map((goal) => ({ module: goal.module, statement: goal.statement.trim() }))
      .filter((goal) => goal.statement.length > 0),
  }
}
