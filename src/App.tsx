import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import AddItemPage from './pages/AddItemPage'
import WeekViewPage from './pages/WeekViewPage'
import SettingsPage from './pages/SettingsPage'
import LoginPage from './pages/LoginPage'
import LoadingSpinner from './components/LoadingSpinner'
import OfflineNotification from './components/OfflineNotification'
import { useEffect } from 'react'

function App() {
  const { user, loading } = useAuth()

  // Register service worker for PWA
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(registration => {
            console.log('Service Worker registered with scope:', registration.scope)
          })
          .catch(error => {
            console.error('Service Worker registration failed:', error)
          })
      })
    }
  }, [])

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
          <Route path="/" element={<DashboardPage />} />
          <Route path="/add" element={<AddItemPage />} />
          <Route path="/week" element={<WeekViewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </>
  )
}

export default App