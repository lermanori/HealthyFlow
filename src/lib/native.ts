import { App, type URLOpenListenerEvent } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Network } from '@capacitor/network'
import { Share } from '@capacitor/share'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { nativeRouteFromUrl } from '../utils/nativeRouting'

export const isNativeApp = Capacitor.isNativePlatform()
export const appRouterBasename = isNativeApp ? '/' : '/app'
export const nativeOAuthRedirectUrl = 'healthyflow://oauth/callback'

export function navigateNativeUrl(rawUrl: string) {
  const route = nativeRouteFromUrl(rawUrl)
  if (!route) return
  window.history.pushState({}, '', route)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function openNativeRoute(event: URLOpenListenerEvent | { url: string }) {
  void Browser.close().catch(() => undefined)
  navigateNativeUrl(event.url)
}

function preferredStatusBarStyle() {
  return document.documentElement.getAttribute('data-theme') === 'white'
    ? Style.Light
    : Style.Dark
}

export async function initializeNativeApp() {
  if (!isNativeApp) return

  await Promise.allSettled([
    StatusBar.setOverlaysWebView({ overlay: true }),
    StatusBar.setStyle({ style: preferredStatusBarStyle() }),
    SplashScreen.hide(),
  ])

  await App.addListener('appUrlOpen', openNativeRoute)
  const launch = await App.getLaunchUrl()
  if (launch?.url) openNativeRoute(launch)

  await App.addListener('appStateChange', ({ isActive }) => {
    window.dispatchEvent(new CustomEvent('healthyflow:app-state', {
      detail: { isActive },
    }))
  })

  await Network.addListener('networkStatusChange', (status) => {
    window.dispatchEvent(new CustomEvent('healthyflow:network-status', {
      detail: status,
    }))
    window.dispatchEvent(new Event(status.connected ? 'online' : 'offline'))
  })
  const initialNetworkStatus = await Network.getStatus()
  if (!initialNetworkStatus.connected) {
    window.dispatchEvent(new Event('offline'))
  }
}

export async function openNativeBrowser(url: string) {
  if (!isNativeApp) {
    window.location.assign(url)
    return
  }
  await Browser.open({ url, presentationStyle: 'popover' })
}

export async function setNativeStatusBarForTheme(theme: 'midnight' | 'white') {
  if (!isNativeApp) return
  await StatusBar.setStyle({ style: theme === 'white' ? Style.Light : Style.Dark })
}

export async function selectionHaptic() {
  if (!isNativeApp) return
  await Haptics.impact({ style: ImpactStyle.Light })
}

export async function completionHaptic() {
  if (!isNativeApp) return
  await Haptics.notification({ type: NotificationType.Success })
}

export async function shareFromHealthyFlow(options: {
  title: string
  text: string
  url?: string
}) {
  const clipboard = navigator.clipboard
  if (isNativeApp && await Share.canShare().then(({ value }) => value)) {
    await Share.share(options)
    return
  }

  if ('share' in navigator) {
    await navigator.share(options)
    return
  }

  await clipboard.writeText(
    [options.text, options.url].filter(Boolean).join('\n'),
  )
}
