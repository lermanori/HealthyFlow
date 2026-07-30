const HEALTHYFLOW_WEB_HOSTS = new Set(['healthyflow.app', 'www.healthyflow.app'])

function stripAppPrefix(pathname: string) {
  if (pathname === '/app') return '/'
  if (pathname.startsWith('/app/')) return pathname.slice('/app'.length)
  return pathname
}

/**
 * Convert an app URL or a healthyflow.app universal link into the route shape
 * consumed by the native BrowserRouter. Unknown HTTPS hosts are deliberately
 * rejected so another site cannot steer an authenticated WebView.
 */
export function nativeRouteFromUrl(rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  let pathname: string
  if (url.protocol === 'healthyflow:') {
    const hostPrefix = url.hostname ? `/${url.hostname}` : ''
    pathname = `${hostPrefix}${url.pathname}` || '/'
  } else if (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    HEALTHYFLOW_WEB_HOSTS.has(url.hostname)
  ) {
    pathname = url.pathname
  } else {
    return null
  }

  pathname = stripAppPrefix(pathname)
  const params = new URLSearchParams(url.search)
  if (pathname === '/oauth/callback') {
    pathname = '/'
    params.set('oauth', 'callback')
  }

  const search = params.toString()
  return `${pathname}${search ? `?${search}` : ''}${url.hash}`
}
