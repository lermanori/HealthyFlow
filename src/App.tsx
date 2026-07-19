import { ReactNode, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import TodayPage from './pages/TodayPage'
import AddItemPage from './pages/AddItemPage'
import WeekViewPage from './pages/WeekViewPage'
import SettingsPage from './pages/SettingsPage'
import TokenManagerPage from './pages/TokenManagerPage'
import CaloriesPage from './pages/CaloriesPage'
import MealParserLabPage from './pages/MealParserLabPage'
import AchievementsPage from './pages/AchievementsPage'
import WorkoutsPage from './pages/WorkoutsPage'
import AssistantPage from './pages/AssistantPage'
import LoginPage from './pages/LoginPage'
import DemoPage from './pages/DemoPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsOfServicePage from './pages/TermsOfServicePage'
import LoadingSpinner from './components/LoadingSpinner'
import OfflineNotification from './components/OfflineNotification'
import { ModuleAvailability, OptionalModule, useSettings } from './hooks/useSettings'

export interface ModuleNoticeState {
  moduleNotice: {
    module: OptionalModule
    label: string
    message: string
  }
}

function ModuleGate({ availability, label, children, retry }: {
  availability: ModuleAvailability
  label: string
  children: ReactNode
  retry: () => unknown
}) {
  if (availability === 'enabled') return <>{children}</>
  if (availability === 'disabled') {
    const module = label.toLowerCase() as OptionalModule
    return (
      <Navigate
        to="/"
        replace
        state={{ moduleNotice: { module, label, message: `${label} is disabled for this account.` } } satisfies ModuleNoticeState}
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

function App() {
  const { user, loading } = useAuth()
  const { modules, retry } = useSettings(!!user)

  // Handle app visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // App became visible again, refresh data if needed
        console.log('App is visible again')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  return (
    <>
      <OfflineNotification />
      <Layout>
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/add" element={<AddItemPage />} />
          <Route path="/week" element={<WeekViewPage />} />
          <Route path="/talk" element={<AssistantPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/assistant" element={<AssistantRedirect />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/token-manager" element={user.role === 'admin' ? <TokenManagerPage /> : <Navigate to="/" replace />} />
          <Route path="/meal-ocr-lab" element={user.role === 'admin' ? <MealParserLabPage /> : <Navigate to="/" replace />} />
          <Route path="/calories" element={<ModuleGate availability={modules.calories} label="Calories" retry={retry}><CaloriesPage /></ModuleGate>} />
          <Route path="/achievements" element={<ModuleGate availability={modules.achievements} label="Achievements" retry={retry}><AchievementsPage /></ModuleGate>} />
          <Route path="/workouts" element={<ModuleGate availability={modules.workouts} label="Workouts" retry={retry}><WorkoutsPage /></ModuleGate>} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </>
  )
}

export default App
