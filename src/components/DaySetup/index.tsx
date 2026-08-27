import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { useSettings } from '../../hooks/useSettings'
import { goalService, settingsService, taskService, GOALS_QUERY_KEY, DAY_SUMMARY_QUERY_KEY } from '../../services/api'
import { analytics } from '../../lib/analytics'
import {
  DAY_SETUP_STEPS,
  answersFromSettings,
  commitDaySetup,
  daySetupCompletion,
  mapAnswersToWrites,
  type DaySetupAnswers,
} from '../../interview'
import { DayContextStep, GoalsStep, HabitsStep, ModulesStep, NameStep, TalkStyleStep, WindowStep } from './steps'

const today = () => new Date().toLocaleDateString('en-CA')

export function DaySetup() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { settings, resolution } = useSettings()
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<DaySetupAnswers | null>(null)
  const [saving, setSaving] = useState(false)

  const current = useMemo(
    () => answers ?? (settings ? answersFromSettings(settings) : null),
    [answers, settings],
  )

  if (resolution === 'error') {
    return <p className="p-6 text-sm text-state-danger">Your settings could not be read, so day setup cannot start. Try again.</p>
  }
  if (!settings || !current) return <p className="p-6 text-sm text-ink-muted">Loading…</p>

  const step = DAY_SETUP_STEPS[index]
  const patch = (value: Partial<DaySetupAnswers>) => setAnswers({ ...current, ...value })
  const atFinishLine = step.id === 'talk_style'

  const abandon = () => {
    analytics.capture('day_setup_abandoned', { step_id: step.id })
    navigate('/')
  }

  const finish = async () => {
    setSaving(true)
    const writes = mapAnswersToWrites(current, settings)
    const result = await commitDaySetup(writes, {
      updateSettings: (settingsPatch) => settingsService.updateSettings(settingsPatch),
      createGoal: (goal) => goalService.createGoal({ module: goal.module, statement: goal.statement }),
      addHabit: (habit) => taskService.addTask({
        title: habit.title,
        type: 'habit',
        category: 'personal',
        repeat: 'daily',
        startTime: habit.startTime,
        scheduledDate: today(),
      } as Parameters<typeof taskService.addTask>[0]),
    })
    setSaving(false)

    if (!result.ok) {
      // No silent fallbacks: say what did not land, and leave the offer open so
      // re-running — prefilled — is the recovery path.
      toast.error(`Saved ${result.applied.join(' and ') || 'nothing'}. Failed: ${result.failures.map((failure) => failure.stage).join(', ')}.`)
      return
    }

    const report = daySetupCompletion({
      previousStatus: settings.onboardingStatus,
      writes,
      stepsAnswered: index + 1,
      completedAt: new Date().toISOString(),
    })
    analytics.capture('day_setup_completed', report.event)
    if (report.isFirstCompletion) {
      analytics.capture('onboarding_completed')
      analytics.setUserProperties({ onboarding_status: 'completed' }, report.setOnce ?? undefined)
    }

    if (settings.onboardingStatus !== 'completed') {
      await settingsService.updateSettings({ onboardingStatus: 'completed' })
    }
    await queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY })
    await queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY })
    toast.success("That's your day set up.")
    navigate('/')
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 p-4">
      <header className="grid gap-1">
        <p className="text-xs uppercase tracking-wide text-ink-muted">
          {step.part === 'day' ? 'Your day' : 'Your direction'} · {index + 1} of {DAY_SETUP_STEPS.length}
        </p>
        <h1 className="text-xl font-semibold text-ink">{step.question}</h1>
      </header>

      <div className="flex-1">
        {step.id === 'name' && <NameStep value={current.preferredName} onChange={(value) => patch({ preferredName: value })} />}
        {step.id === 'window' && (
          <WindowStep startTime={current.startTime} endTime={current.endTime} onChange={(next) => patch(next)} />
        )}
        {step.id === 'modules' && <ModulesStep value={current.modules} onChange={(value) => patch({ modules: value })} />}
        {step.id === 'talk_style' && <TalkStyleStep value={current.talkStyle} onChange={(value) => patch({ talkStyle: value })} />}
        {step.id === 'habits' && <HabitsStep value={current.habits} onChange={(value) => patch({ habits: value })} />}
        {step.id === 'goals' && <GoalsStep value={current.goals} onChange={(value) => patch({ goals: value })} />}
        {step.id === 'day_context' && <DayContextStep value={current.dayContext} onChange={(value) => patch({ dayContext: value })} />}
      </div>

      <footer className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => (index === 0 ? abandon() : setIndex(index - 1))}
            className="min-h-11 px-3 text-sm text-ink-muted hover:text-ink"
          >
            {index === 0 ? 'Not now' : 'Back'}
          </button>

          {index < DAY_SETUP_STEPS.length - 1 && (
            <button
              type="button"
              onClick={() => setIndex(index + 1)}
              disabled={step.id === 'window' && current.startTime >= current.endTime}
              className="btn-primary min-h-11 px-5 disabled:opacity-50"
            >
              {atFinishLine ? 'Keep going' : 'Next'}
            </button>
          )}
        </div>

        {(atFinishLine || index === DAY_SETUP_STEPS.length - 1) && (
          <button
            type="button"
            onClick={finish}
            disabled={saving}
            className={atFinishLine ? 'min-h-11 text-sm text-ink-soft underline' : 'btn-primary min-h-11'}
          >
            {saving ? 'Saving…' : atFinishLine ? "That's enough — save my day" : 'Finish'}
          </button>
        )}
      </footer>
    </div>
  )
}

export default DaySetup
