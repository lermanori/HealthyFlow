import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { settingsService } from '../../services/api'
import { analytics } from '../../lib/analytics'

export function FirstRunChoice() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const takeMeIn = async () => {
    analytics.capture('onboarding_skipped')
    analytics.setUserProperties({ onboarding_status: 'skipped' })
    await settingsService.updateSettings({ onboardingStatus: 'skipped' })
    // The '/' route gates on the ['settings'] cache, not this component's own
    // state, so the write above is invisible to it until this cache reflects
    // it too — otherwise navigating home would render this same screen again.
    await queryClient.invalidateQueries({ queryKey: ['settings'] })
    navigate('/', { replace: true })
  }

  return (
    <div className="mx-auto grid min-h-dvh max-w-lg content-center gap-6 p-6">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold text-ink">Set up your day?</h1>
        <p className="text-sm text-ink-muted">
          Four questions about how your day actually runs, so the clock measures
          against your day rather than a default. Takes about a minute, and you can
          change any of it later.
        </p>
      </div>
      <div className="grid gap-2">
        <button type="button" onClick={() => navigate('/day-setup')} className="btn-primary min-h-11">
          Set up your day
        </button>
        <button type="button" onClick={takeMeIn} className="min-h-11 text-sm text-ink-muted hover:text-ink">
          Just take me in
        </button>
      </div>
    </div>
  )
}

export default FirstRunChoice
