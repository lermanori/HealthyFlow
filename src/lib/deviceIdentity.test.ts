import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createDeviceIdentity } from './deviceIdentity'

// The device ID (#308, ADR-0027): the iPhone's Keychain ID, or one per browser.
// A failed read leaves requests without it — it labels accounts in Admin only —
// and a later request tries again.

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    values,
  }
}

const A = '3f1c6a2e-8b4d-4e0f-9a7b-1c2d3e4f5a6b'
const B = '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

describe('device identity', () => {
  it('on the iPhone, is the ID the Keychain holds', async () => {
    const identity = createDeviceIdentity({ isNative: true, nativeGet: async () => ({ id: A.toUpperCase() }), storage: memoryStorage(), randomUUID: () => B })
    assert.equal(await identity(), A)
  })

  it('in a browser, is created once and then kept', async () => {
    const storage = memoryStorage()
    let minted = 0
    const identity = createDeviceIdentity({ isNative: false, nativeGet: async () => ({ id: A }), storage, randomUUID: () => { minted += 1; return B } })

    assert.equal(await identity(), B)
    assert.equal(await createDeviceIdentity({ isNative: false, nativeGet: async () => ({ id: A }), storage, randomUUID: () => A })(), B)
    assert.equal(minted, 1)
  })

  it('replaces a stored value that is not an ID', async () => {
    const storage = memoryStorage({ 'healthyflow-device-id-v1': 'garbage' })
    const identity = createDeviceIdentity({ isNative: false, nativeGet: async () => ({ id: A }), storage, randomUUID: () => B })
    assert.equal(await identity(), B)
    assert.equal(storage.values.get('healthyflow-device-id-v1'), B)
  })

  it('a failed Keychain read sends nothing, and the next request tries again', async () => {
    let calls = 0
    const identity = createDeviceIdentity({
      isNative: true,
      nativeGet: async () => {
        calls += 1
        if (calls === 1) throw new Error('Keychain status -25308')
        return { id: A }
      },
      storage: memoryStorage(),
      randomUUID: () => B,
    })

    assert.equal(await identity(), null)
    assert.equal(await identity(), A)
  })
})
