import { pushService } from '../services/api'

// VAPID public key must be URL-safe-base64 → Uint8Array for PushManager.subscribe.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/**
 * Verify-on-open: iOS silently expires push subscriptions, so on every app open we
 * check for a live subscription and (re)subscribe, then sync it to the server.
 * Safe to call unconditionally; it no-ops when unsupported or permission isn't granted.
 */
export async function ensurePushSubscription(): Promise<void> {
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
  if (!('Notification' in window)) return false
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (permission !== 'granted') return false
  await ensurePushSubscription()
  return true
}
