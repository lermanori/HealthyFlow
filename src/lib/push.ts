import {
  PushNotifications,
  type ActionPerformed,
  type Token,
} from '@capacitor/push-notifications'
import {
  isNativeApp,
  navigateNativeUrl,
} from './native'
import { pushService } from '../services/api'
import { readSessionToken } from './session'

const NATIVE_APP_ID = 'app.healthyflow.mobile' as const
const NATIVE_PUSH_TOKEN_KEY = 'healthyflow-native-push-token'
const NATIVE_REGISTRATION_TIMEOUT_MS = 10_000

let nativeListenersReady: Promise<void> | null = null
const nativeRegistrationWaiters = new Set<(registered: boolean) => void>()

export type PushPermissionState = 'granted' | 'denied' | 'prompt'

function normalizeNativePermission(receive: string): PushPermissionState {
  if (receive === 'granted') return 'granted'
  if (receive === 'denied') return 'denied'
  return 'prompt'
}

export async function checkPushPermission(): Promise<PushPermissionState> {
  if (isNativeApp) {
    const permission = await PushNotifications.checkPermissions()
    return normalizeNativePermission(permission.receive)
  }
  if (!('Notification' in window)) return 'denied'
  return Notification.permission === 'default' ? 'prompt' : Notification.permission
}

export async function requestPushPermission(): Promise<PushPermissionState> {
  const current = await checkPushPermission()
  if (current !== 'prompt') return current
  if (isNativeApp) {
    const permission = await PushNotifications.requestPermissions()
    return normalizeNativePermission(permission.receive)
  }
  const permission = await Notification.requestPermission()
  return permission === 'default' ? 'prompt' : permission
}

// VAPID public key must be URL-safe-base64 → Uint8Array for PushManager.subscribe.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

function nativeNotificationUrl(action: ActionPerformed) {
  const target = action.notification.data?.url
  if (typeof target !== 'string' || !target) return null
  if (target.startsWith('healthyflow:') || target.startsWith('https://')) return target
  return `https://healthyflow.app${target.startsWith('/') ? target : `/${target}`}`
}

async function persistNativeRegistration(token: Token) {
  localStorage.setItem(NATIVE_PUSH_TOKEN_KEY, token.value)
  if (!readSessionToken()) return false
  await pushService.registerNative({
    platform: 'ios',
    deviceToken: token.value,
    appId: NATIVE_APP_ID,
  })
  return true
}

function settleNativeRegistration(registered: boolean) {
  nativeRegistrationWaiters.forEach((resolve) => resolve(registered))
  nativeRegistrationWaiters.clear()
}

async function ensureNativePushListeners() {
  if (!isNativeApp) return
  if (nativeListenersReady) return nativeListenersReady

  nativeListenersReady = (async () => {
    await PushNotifications.addListener('registration', (token) => {
      void persistNativeRegistration(token)
        .then((registered) => settleNativeRegistration(registered))
        .catch((error) => {
          console.error('[push] native registration sync failed:', error)
          settleNativeRegistration(false)
        })
    })
    await PushNotifications.addListener('registrationError', (error) => {
      console.error('[push] APNs registration failed:', error)
      settleNativeRegistration(false)
    })
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const target = nativeNotificationUrl(action)
      if (target) navigateNativeUrl(target)
    })
  })()

  return nativeListenersReady
}

async function registerNativePush() {
  if (!readSessionToken()) return false
  await ensureNativePushListeners()

  return new Promise<boolean>((resolve) => {
    let resolved = false
    const finish = (registered: boolean) => {
      if (resolved) return
      resolved = true
      window.clearTimeout(timeout)
      nativeRegistrationWaiters.delete(finish)
      resolve(registered)
    }
    const timeout = window.setTimeout(
      () => finish(false),
      NATIVE_REGISTRATION_TIMEOUT_MS,
    )
    nativeRegistrationWaiters.add(finish)
    void PushNotifications.register().catch((error) => {
      console.error('[push] native registration request failed:', error)
      finish(false)
    })
  })
}

export async function syncNativePushToken() {
  if (!isNativeApp || !readSessionToken()) return
  const deviceToken = localStorage.getItem(NATIVE_PUSH_TOKEN_KEY)
  if (!deviceToken) return
  await pushService.registerNative({
    platform: 'ios',
    deviceToken,
    appId: NATIVE_APP_ID,
  })
}

export async function detachNativePushToken(authToken?: string | null) {
  if (!isNativeApp) return
  const deviceToken = localStorage.getItem(NATIVE_PUSH_TOKEN_KEY)
  if (!deviceToken) return
  await pushService.unregisterNative({
    platform: 'ios',
    deviceToken,
    appId: NATIVE_APP_ID,
  }, authToken ?? undefined)
}

/**
 * Verify-on-open: iOS silently expires push subscriptions, so on every app open we
 * check for a live subscription and (re)subscribe, then sync it to the server.
 * Safe to call unconditionally; it no-ops when unsupported or permission isn't granted.
 */
export async function ensurePushSubscription(): Promise<void> {
  if (isNativeApp) {
    if (!readSessionToken()) return
    await ensureNativePushListeners()
    const permission = await PushNotifications.checkPermissions()
    if (permission.receive === 'granted') {
      await registerNativePush()
    }
    return
  }

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) return
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (Notification.permission !== 'granted') return

  try {
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
    }
    await pushService.subscribe(subscription.toJSON())
  } catch (err) {
    console.error('[push] ensureSubscription failed:', err)
  }
}

/** Request permission then subscribe. Returns true if a live subscription now exists. */
export async function enablePush(): Promise<boolean> {
  if (isNativeApp) {
    const permission = await requestPushPermission()
    if (permission !== 'granted') return false
    return registerNativePush()
  }

  const permission = await requestPushPermission()
  if (permission !== 'granted') return false
  await ensurePushSubscription()
  return true
}
