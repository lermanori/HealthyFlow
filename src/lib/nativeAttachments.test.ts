import assert from 'node:assert/strict'
import { it } from 'node:test'

// Exercise the real Capacitor bridge adapter with native responses, without
// opening a device picker or calling any hosted service.
let nativeResult: unknown
Object.assign(globalThis, {
  CapacitorCustomPlatform: { name: 'ios' },
  Capacitor: {
    PluginHeaders: [{ name: 'TalkAttachments', methods: [{ name: 'choose', rtype: 'promise' }] }],
    nativePromise: async (plugin: string, method: string) => {
      assert.equal(plugin, 'TalkAttachments')
      assert.equal(method, 'choose')
      if (nativeResult instanceof Error) throw nativeResult
      return nativeResult
    },
  },
})
const { chooseNativeTalkAttachment } = await import('./native')

it('returns no replacement attachment when the native picker is cancelled', async () => {
  nativeResult = { status: 'cancelled' }
  assert.equal(await chooseNativeTalkAttachment(), null)
})

it('preserves selected image bytes and metadata across the native bridge', async () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x80])
  nativeResult = { status: 'selected', name: 'photo.jpg', mimeType: 'image/jpeg', data: bytes.toString('base64') }
  const file = await chooseNativeTalkAttachment()
  assert.ok(file)
  assert.equal(file.name, 'photo.jpg')
  assert.equal(file.type, 'image/jpeg')
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes)
})

it('preserves Unicode text from a selected file', async () => {
  nativeResult = { status: 'selected', name: 'notes.md', mimeType: 'text/markdown', data: Buffer.from('Plan café ☕').toString('base64') }
  assert.equal(await (await chooseNativeTalkAttachment())?.text(), 'Plan café ☕')
})

it('surfaces native failures rather than treating them as cancellation', async () => {
  nativeResult = new Error('Could not open Settings.')
  await assert.rejects(chooseNativeTalkAttachment(), /Could not open Settings/)
})

it('rejects malformed native results instead of constructing a guessed attachment', async () => {
  nativeResult = { status: 'selected', name: 'missing-photo.jpg' }
  await assert.rejects(chooseNativeTalkAttachment())
})
