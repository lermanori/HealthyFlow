import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { analytics } from './index'

/** Sends a manual $pageview on every route change (SPA, so autocapture is off). */
export default function PageViewTracker() {
  const location = useLocation()

  useEffect(() => {
    analytics.page(location.pathname)
  }, [location.pathname])

  return null
}
