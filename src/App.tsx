import { Routes, Route, Navigate } from 'react-router-dom'
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
import LoadingSpinner from './components/LoadingSpinner'
import OfflineNotification from './components/OfflineNotification'
import { useEffect } from 'react'
import { useSettings } from './hooks/useSettings'

function App() {
  const { user, loading } = useAuth()
  const { settings } = useSettings(!!user)

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
    return <LoginPage />
  }

  return (
    <>
      <OfflineNotification />
      <Layout>
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/add" element={<AddItemPage />} />
          <Route path="/week" element={<WeekViewPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/token-manager" element={user.role === 'admin' ? <TokenManagerPage /> : <Navigate to="/" replace />} />
          <Route path="/meal-ocr-lab" element={user.role === 'admin' ? <MealParserLabPage /> : <Navigate to="/" replace />} />
          <Route path="/calories" element={settings?.calorieIntake ? <CaloriesPage /> : <Navigate to="/" replace />} />
          <Route path="/achievements" element={settings?.achievementTracker ? <AchievementsPage /> : <Navigate to="/" replace />} />
          <Route path="/workouts" element={<WorkoutsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </>
  )
}

export default App
