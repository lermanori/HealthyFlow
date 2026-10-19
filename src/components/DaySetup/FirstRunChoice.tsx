import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Mic, SlidersHorizontal } from 'lucide-react'
import { settingsService } from '../../services/api'
import { analytics } from '../../lib/analytics'

export function FirstRunChoice() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const enterApp = async (destination: string, path: 'talk' | 'today') => {
    analytics.capture('onboarding_skipped')
    analytics.capture('first_run_path_selected', { path })
    analytics.setUserProperties({ onboarding_status: 'skipped', first_run_path: path })
    await settingsService.updateSettings({ onboardingStatus: 'skipped' })
    // The '/' route gates on the ['settings'] cache, not this component's own
    // state, so the write above is invisible to it until this cache reflects
    // it too — otherwise navigating home would render this same screen again.
    await queryClient.invalidateQueries({ queryKey: ['settings'] })
    navigate(destination, { replace: true })
  }

  return (
    <div className="mx-auto grid min-h-dvh max-w-lg content-center gap-8 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="grid gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">HealthyFlow</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Say it. See your whole day.</h1>
        <p className="text-sm leading-6 text-ink-muted">
          Talk or type everything in any order. Review what HealthyFlow understood,
          then see it on Today with the time you actually have left.
        </p>
      </div>
      <div className="grid gap-3">
        <button
          type="button"
          onClick={() => void enterApp('/talk?firstRun=1', 'talk')}
          className="btn-primary flex min-h-12 items-center justify-center gap-2"
        >
          <Mic className="h-5 w-5" aria-hidden="true" />
          Say your day
        </button>
        <button type="button" onClick={() => navigate('/day-setup')} className="btn-secondary flex min-h-12 items-center justify-center gap-2">
          <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          Set up your honest clock
        </button>
        <button
          type="button"
          onClick={() => void enterApp('/', 'today')}
          className="flex min-h-11 items-center justify-center gap-2 text-sm text-ink-muted hover:text-ink"
        >
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          Go straight to Today
        </button>
      </div>
    </div>
  )
}

export default FirstRunChoice
