import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertTalkHandoffPendingActions,
  talkHandoffContext,
  talkHandoffLabel,
  talkHandoffPrompt,
  talkHandoffState,
} from '../talkHandoff'

describe('module → Talk handoff', () => {
  it('round-trips bounded structured context through router state', () => {
    const context = {
      source: 'add' as const,
      intent: 'add_items' as const,
      date: '2026-08-27',
      itemType: 'habit' as const,
    }

    assert.deepEqual(talkHandoffContext(talkHandoffState(context)), context)
    assert.equal(talkHandoffLabel(context), 'Add · 2026-08-27')
    assert.match(talkHandoffPrompt(context), /add a Habit for 2026-08-27/)
  })

  it('derives onboarding copy from a closed demo persona rather than router text', () => {
    const context = {
      source: 'today' as const,
      intent: 'plan_day' as const,
      date: '2026-08-27',
      demoPersona: 'noam' as const,
    }

    assert.match(talkHandoffPrompt(context), /What feels hardest to start right now\?/)
    assert.doesNotMatch(talkHandoffPrompt(context), /undefined/)
  })

  it('rejects arbitrary prompts and invalid dates', () => {
    assert.equal(talkHandoffContext({ talkHandoffContext: { source: 'add', intent: 'add_items', prompt: 'hidden text' } }), null)
    assert.equal(talkHandoffContext({ talkHandoffContext: { source: 'today', intent: 'plan_day', date: 'tomorrow' } }), null)
    assert.equal(talkHandoffContext({ talkHandoffContext: { source: 'today', intent: 'log_nutrition' } }), null)
    assert.equal(talkHandoffContext({ workTalkContext: { label: 'Work', prompt: 'x' } }), null)
  })

  it('makes Nutrition and Workout drafts visible and explicit about review', () => {
    assert.match(talkHandoffPrompt({ source: 'nutrition', intent: 'log_nutrition' }), /attach a photo/)
    assert.match(talkHandoffPrompt({ source: 'nutrition', intent: 'log_nutrition' }), /review and approval/)
    const workoutPrompt = talkHandoffPrompt({ source: 'workouts', intent: 'draft_workout_plan' })
    assert.match(workoutPrompt, /review and edit/i)
    assert.match(workoutPrompt, /approval before saving/i)
    assert.doesNotMatch(workoutPrompt, /manually/i)
  })

  it('rejects a Workout session proposal from a stale backend during a reusable-plan handoff', () => {
    assert.throws(
      () => assertTalkHandoffPendingActions(
        { source: 'workouts', intent: 'draft_workout_plan' },
        [{ capability: 'add_workout_session' }],
      ),
      /Nothing was saved/,
    )
    assert.doesNotThrow(() => assertTalkHandoffPendingActions(
      { source: 'workouts', intent: 'draft_workout_plan' },
      [{ capability: 'add_workout_plan' }],
    ))
  })
})
