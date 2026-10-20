import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertTalkHandoffPendingActions,
  dailyReviewPrompt,
  reviewDayEvidence,
  talkHandoffContext,
  talkHandoffLabel,
  talkHandoffPrompt,
  talkHandoffState,
  weeklyReviewPrompt,
} from '../talkHandoff'
import type { DaySummary } from '../../backend/src/day-summary-schema'

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

function reviewDay(date: string, options: { completed?: boolean; nutrition?: 'not_logged' | 'unavailable' } = {}): DaySummary {
  return {
    date,
    items: [{ id: 'task-1', title: 'Call Maya', type: 'task', completed: Boolean(options.completed), isHabitInstance: false }],
    calendar: { status: 'connected', events: [{ title: 'Meeting' }] },
    supporting: {
      nutrition: { status: options.nutrition ?? 'not_logged', entries: [], weight: { status: 'not_recorded' } },
      workouts: { status: 'not_logged', sessions: [] },
      progress: { status: 'not_recorded', entries: [] },
    },
  } as unknown as DaySummary
}

describe('Talk reviews', () => {
  it('does not count a plan or Calendar event as an actual outcome', () => {
    const day = reviewDay('2026-10-19')
    assert.equal(reviewDayEvidence(day).hasOutcome, false)
    assert.match(dailyReviewPrompt(day.date), /what actually happened on 2026-10-19/i)
    assert.doesNotMatch(dailyReviewPrompt(day.date), /Call Maya/)
  })

  it('labels failed module reads instead of calling them empty', () => {
    assert.deepEqual(reviewDayEvidence(reviewDay('2026-10-19', { nutrition: 'unavailable' })).evidence.unavailable, ['nutrition'])
  })

  it('keeps a weekly review request short and free of stored day details', () => {
    const prompt = weeklyReviewPrompt(['2026-10-17', '2026-10-18', '2026-10-19'])
    assert.match(prompt, /2026-10-19/)
    assert.doesNotMatch(prompt, /Call Maya/)
  })
})
