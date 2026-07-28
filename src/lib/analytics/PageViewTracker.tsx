import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { analytics } from './index'
import { analyticsIdentityForPath } from '../../modulePresentation'

/** Sends a manual $pageview on every route change (SPA, so autocapture is off). */
export default function PageViewTracker() {
  const location = useLocation()

  useEffect(() => {
    const moduleId = analyticsIdentityForPath(location.pathname)
    analytics.page(location.pathname, moduleId ? { module_id: moduleId } : undefined)
  }, [location.pathname])

  return null
}
