import { ReactNode } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import TodayPage from './pages/TodayPage'
import AddItemPage from './pages/AddItemPage'
import WeekViewPage from './pages/WeekViewPage'
import WorkPage from './pages/WorkPage'
import SettingsPage from './pages/SettingsPage'
import TokenManagerPage from './pages/TokenManagerPage'
import CaloriesPage from './pages/CaloriesPage'
import HealthPage from './pages/HealthPage'
import MealParserLabPage from './pages/MealParserLabPage'
import AchievementsPage from './pages/AchievementsPage'
import WorkoutsPage from './pages/WorkoutsPage'
import AssistantPage from './pages/AssistantPage'
import GoalsPage from './pages/GoalsPage'
import ClaimAccountPage from './pages/ClaimAccountPage'
import LoginPage from './pages/LoginPage'
import SignInPage from './pages/SignInPage'
import DemoPage from './pages/DemoPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsOfServicePage from './pages/TermsOfServicePage'
import SupportPage from './pages/SupportPage'
import OAuthConsentPage from './pages/OAuthConsentPage'
import DaySetup from './components/DaySetup'
import FirstRunChoice from './components/DaySetup/FirstRunChoice'
import LoadingSpinner from './components/LoadingSpinner'
import OfflineNotification from './components/OfflineNotification'
import { useSettings } from './hooks/useSettings'
import { useCloudSync } from './hooks/useCloudSync'
import {
  MODULE_PRESENTATIONS,
  resolveHealthAvailability,
  type ModuleAvailability,
  type OptionalModule,
} from './modulePresentation'
import { WEEK_VIEW_ENABLED, WORK_ENABLED } from './featureFlags'

export interface ModuleNoticeState {
  moduleNotice: {
    module: OptionalModule | 'health'
    label: string
    message: string
  }
}

function ModuleGate({ availability, module, label, children, retry, disabledRedirect }: {
  availability: ModuleAvailability
  module: OptionalModule | 'health'
  label: string
  children: ReactNode
  retry: () => unknown
  disabledRedirect: string
}) {
  const location = useLocation()
  if (availability === 'enabled') return <>{children}</>
  if (availability === 'disabled') {
    const date = new URLSearchParams(location.search).get('date')
    const redirect = disabledRedirect === '/health' && date
      ? `/health?date=${encodeURIComponent(date)}`
      : disabledRedirect
    return (
      <Navigate
        to={redirect}
        replace
        state={{ moduleNotice: { module, label, message: `${label} is hidden for this account.` } } satisfies ModuleNoticeState}
      />
    )
  }
  if (availability === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
        <LoadingSpinner size="lg" label={`Checking ${label} availability`} />
      </div>
    )
  }
  return (
    <div className="card mx-auto max-w-lg space-y-4" role="alert">
      <h1 className="text-xl font-semibold text-ink">Could not check {label}</h1>
      <p className="text-ink-muted">Your module settings could not be loaded. This page has not been disabled.</p>
      <button type="button" className="btn-primary px-4 py-2" onClick={() => void retry()}>Retry</button>
    </div>
  )
}

function AssistantRedirect() {
  const location = useLocation()
  return <Navigate to={`/talk${location.search}`} replace />
}

// Conditional render, not a redirect: a first-run user sees the choice screen
// in place at "/", so there is no URL to bounce back from and no loop to
// create. While settings are still loading, `onboardingStatus` reads as
// undefined (not 'active'), so a returning user's Today never flashes the
// choice screen while the fetch is in flight.
function HomeGate() {
  const { settings } = useSettings()
  return settings?.onboardingStatus === 'active' ? <FirstRunChoice /> : <TodayPage />
}

function App() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const { modules, retry } = useSettings(Boolean(user) && location.pathname !== '/demo')
  useCloudSync()
  const healthAvailability = resolveHealthAvailability(modules)
  const modulePages: Record<OptionalModule, ReactNode> = {
    calories: <CaloriesPage />,
    workouts: <WorkoutsPage />,
    achievements: <AchievementsPage />,
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // The picker, value proof, and acquisition ending sit outside the authenticated
  // application shell. Opening a seeded workspace is an optional secondary path.
  if (location.pathname === '/demo') {
    return (
      <Routes>
        <Route path="/demo" element={<DemoPage />} />
      </Routes>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  if (location.pathname === '/oauth/authorize') {
    return <OAuthConsentPage />
  }

  return (
    <>
      <OfflineNotification />
      <Layout>
        <Routes>
          <Route path="/" element={<HomeGate />} />
          <Route path="/day-setup" element={<DaySetup />} />
          <Route path="/add" element={<AddItemPage />} />
          <Route path="/week" element={WEEK_VIEW_ENABLED ? <WeekViewPage /> : <Navigate to="/" replace />} />
          <Route path="/work" element={WORK_ENABLED ? <WorkPage /> : <Navigate to="/" replace />} />
          <Route path="/talk" element={<AssistantPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/assistant" element={<AssistantRedirect />} />
          <Route path="/claim" element={<ClaimAccountPage />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route path="/token-manager" element={user.role === 'admin' ? <TokenManagerPage /> : <Navigate to="/" replace />} />
          <Route path="/meal-ocr-lab" element={user.role === 'admin' ? <MealParserLabPage /> : <Navigate to="/" replace />} />
          <Route
            path="/health"
            element={(
              <ModuleGate
                availability={healthAvailability}
                module="health"
                label="Health"
                retry={retry}
                disabledRedirect="/"
              >
                <HealthPage />
              </ModuleGate>
            )}
          />
          {MODULE_PRESENTATIONS.map((presentation) => (
            <Route
              key={presentation.id}
              path={presentation.route.path}
              element={(
                <ModuleGate
                  availability={modules[presentation.id]}
                  module={presentation.id}
                  label={presentation.label}
                  retry={retry}
                  disabledRedirect={healthAvailability === 'enabled' ? '/health' : '/'}
                >
                  {modulePages[presentation.id]}
                </ModuleGate>
              )}
            />
          ))}
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </>
  )
}

export default App
