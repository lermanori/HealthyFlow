import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * The device this app runs on, for Admin to tell accounts apart (#308,
 * ADR-0027). On the iPhone it is a random ID the app keeps in the Keychain as a
 * this-device-only item, so it survives deleting and reinstalling the app and is
 * never synced or restored to another phone. In a browser it is one per browser.
 * It is not the advertising identifier and is not read by any grant.
 */
interface DeviceIdentityPlugin {
  get(): Promise<{ id: string }>
}

const STORAGE_KEY = 'healthyflow-device-id-v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Dependencies = {
  isNative: boolean
  nativeGet: () => Promise<{ id: string }>
  storage: Pick<Storage, 'getItem' | 'setItem'>
  randomUUID: () => string
}

export function createDeviceIdentity(dependencies: Dependencies) {
  let known: Promise<string | null> | null = null

  async function read(): Promise<string | null> {
    if (dependencies.isNative) {
      const { id } = await dependencies.nativeGet()
      if (!UUID.test(id)) throw new Error('The Keychain returned something that is not a device ID')
      return id.toLowerCase()
    }
    const stored = dependencies.storage.getItem(STORAGE_KEY)
    if (stored && UUID.test(stored)) return stored.toLowerCase()
    const created = dependencies.randomUUID().toLowerCase()
    dependencies.storage.setItem(STORAGE_KEY, created)
    return created
  }

  return function deviceId(): Promise<string | null> {
    known ??= read().catch((error) => {
      // Labels accounts in Admin and nothing else, so a request goes out
      // without it rather than failing; the next request tries again.
      console.warn('Device ID unavailable:', error)
      known = null
      return null
    })
    return known
  }
}

const DeviceIdentity = registerPlugin<DeviceIdentityPlugin>('DeviceIdentity')

export const deviceId = createDeviceIdentity({
  isNative: Capacitor.isNativePlatform(),
  nativeGet: () => DeviceIdentity.get(),
  storage: {
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  },
  randomUUID: () => crypto.randomUUID(),
})
