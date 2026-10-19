import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { captureProbeTurn, runHandsFreeProbe, runHandsFreeTaskFlow, type ProbeAudio, type VoiceTalkHandler } from './handsFreeProbe'

function fixture() {
  let transcript: (text: string) => void = () => undefined
  let failure: (message: string) => void = () => undefined
  let released = false
  let cancelled = false
  let stopCount = 0
  let text = 'Call Maya tomorrow'
  const said: string[] = []
  const audio: ProbeAudio = {
    async check() {},
    async speak(value) { said.push(value) },
    async start() {},
    async stop() { stopCount++; return text },
    async cancel() { cancelled = true },
    async subscribe(onText, onError) {
      transcript = onText; failure = onError
      return async () => { released = true }
    },
  }
  return { audio, said, send(value: string) { text = value; transcript(value) }, fail: (message: string) => failure(message),
    get released() { return released }, get cancelled() { return cancelled }, get stopCount() { return stopCount } }
}
const timing = { silenceMs: 10, noSpeechMs: 30, maximumMs: 100 }
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('hands-free entry probe (no write capability)', () => {
  it('finalizes after a pause and returns the native final transcript', async () => {
    const f = fixture()
    const turn = captureProbeTurn(f.audio, 'en-US', new AbortController().signal, () => undefined, timing)
    await tick(); f.send('Call Maya tomorrow')
    assert.equal(await turn, 'Call Maya tomorrow')
    assert.equal(f.stopCount, 1); assert.equal(f.released, true)
  })
  it('does not turn silence into an empty successful capture', async () => {
    const f = fixture()
    await assert.rejects(captureProbeTurn(f.audio, 'en-US', new AbortController().signal, () => undefined, timing), /No speech/)
    assert.equal(f.stopCount, 0); assert.equal(f.released, true)
  })
  it('background cancellation does not finalize or adopt a late transcript', async () => {
    const f = fixture(); const controller = new AbortController()
    const turn = captureProbeTurn(f.audio, 'en-US', controller.signal, () => undefined, timing)
    const rejected = assert.rejects(turn, /stopped/)
    await tick(); controller.abort(); f.send('Late words')
    await rejected
    assert.equal(f.stopCount, 0); assert.equal(f.released, true)
  })
  it('surfaces a native error emitted during start instead of waiting for silence', async () => {
    const f = fixture()
    f.audio.start = async () => { f.fail('Microphone interrupted') }
    await assert.rejects(captureProbeTurn(f.audio, 'he-IL', new AbortController().signal, () => undefined, timing), /Microphone interrupted/)
    assert.equal(f.released, true)
  })
  it('does not claim ready or listen when setup fails, and releases audio', async () => {
    const f = fixture()
    f.audio.check = async () => { throw new Error('Hebrew model unavailable') }
    f.audio.start = async () => { assert.fail('must not start') }
    await assert.rejects(runHandsFreeProbe(f.audio, 'he-IL', new AbortController().signal, () => undefined), /Hebrew model/)
    assert.deepEqual(f.said, []); assert.equal(f.cancelled, true)
  })
  it('automatically captures and reads back two real turns, then releases audio', async () => {
    const f = fixture(); let starts = 0
    f.audio.start = async () => {
      starts++
      f.send(starts === 1 ? 'Call Maya tomorrow' : 'Actually call her Friday')
    }
    await runHandsFreeProbe(f.audio, 'en-US', new AbortController().signal, () => undefined, timing)
    assert.equal(starts, 2); assert.equal(f.stopCount, 2)
    assert.ok(f.said.includes('I heard: Call Maya tomorrow'))
    assert.ok(f.said.includes('I heard: Actually call her Friday'))
    assert.equal(f.said.at(-1), 'Voice test complete. No Tasks were saved.')
    assert.equal(f.cancelled, true)
  })
  it('a spoken stop ends the probe without starting a second capture', async () => {
    const f = fixture(); let starts = 0
    f.audio.start = async () => { starts++; f.send('עצור') }
    await runHandsFreeProbe(f.audio, 'he-IL', new AbortController().signal, () => undefined, timing)
    assert.equal(starts, 1)
    assert.ok(f.said.every((text) => !text.startsWith('שמעתי:')))
    assert.equal(f.cancelled, true)
  })
})

describe('hands-free single Task confirmation', () => {
  const actionId = 'fb60bde7-bcc2-4da8-885a-0cb22166e10e'
  const proposal = {
    message: 'I prepared the Task.',
    pendingActions: [{
      id: actionId, capability: 'add_task', expiresAt: '2026-10-15T10:00:00Z',
      args: { title: 'Call Maya', duration: 15, scheduledDate: '2026-10-15', startTime: null },
    }],
  }
  function session(utterances: string[], response = proposal) {
    const f = fixture()
    const confirmed: string[] = []
    const canceled: string[] = []
    const requests: string[] = []
    let next = 0
    f.audio.start = async () => { f.send(utterances[next++]) }
    const talk: VoiceTalkHandler = {
      async request(text) { requests.push(text); return response },
      async confirm(id) { confirmed.push(id) },
      async cancel(id) { canceled.push(id) },
    }
    const run = () => runHandsFreeTaskFlow(f.audio, talk, 'en-US', new AbortController().signal, () => undefined, timing)
    return { ...f, confirmed, canceled, requests, run }
  }

  it('reads the server proposal and saves only after an exact spoken yes', async () => {
    const f = session(['Call Maya tomorrow', 'yes'])
    await f.run()
    assert.deepEqual(f.requests, ['Call Maya tomorrow'])
    assert.deepEqual(f.confirmed, [actionId])
    assert.deepEqual(f.canceled, [])
    assert.ok(f.said.some((text) => text.includes('Call Maya') && text.includes('15 minutes')))
    assert.equal(f.said.at(-1), 'Task saved.')
  })

  it('cancels on spoken no and never confirms', async () => {
    const f = session(['Call Maya tomorrow', 'no'])
    await f.run()
    assert.deepEqual(f.canceled, [actionId])
    assert.deepEqual(f.confirmed, [])
  })

  it('leaves an ambiguous answer pending without a write', async () => {
    const f = session(['Call Maya tomorrow', 'maybe', 'I guess'])
    await f.run()
    assert.deepEqual(f.confirmed, [])
    assert.deepEqual(f.canceled, [])
    assert.match(f.said.at(-1) ?? '', /remains in Talk/)
  })

  it('does not confirm a non-Task or multi-action proposal', async () => {
    const f = session(['Plan my day'], {
      message: 'I prepared a change.',
      pendingActions: [{ ...proposal.pendingActions[0], capability: 'add_habit' }],
    })
    await f.run()
    assert.deepEqual(f.confirmed, [])
    assert.match(f.said.at(-1) ?? '', /on-screen review/)
  })

  it('does not speak success when confirmation fails', async () => {
    const f = session(['Call Maya tomorrow', 'yes'])
    const audio = f.audio
    let next = 0
    audio.start = async () => { f.send(['Call Maya tomorrow', 'yes'][next++]) }
    await assert.rejects(runHandsFreeTaskFlow(audio, {
      async request() { return proposal },
      async confirm() { throw new Error('Proposal expired') },
      async cancel() { assert.fail('must not cancel') },
    }, 'en-US', new AbortController().signal, () => undefined, timing), /expired/)
    assert.ok(!f.said.includes('Task saved.'))
  })

  it('keeps a multi-action response on screen without a voice write', async () => {
    const f = session(['Call Maya and Sam'], {
      message: 'I prepared two Tasks.',
      pendingActions: [proposal.pendingActions[0], {
        ...proposal.pendingActions[0], id: 'a4b9f837-b176-4c9b-b9ae-61581409ed44',
      }],
    })
    await f.run()
    assert.deepEqual(f.confirmed, [])
    assert.deepEqual(f.canceled, [])
    assert.match(f.said.at(-1) ?? '', /on-screen review/)
  })

  it('allows one spoken clarification before a single Task proposal', async () => {
    const f = fixture()
    const utterances = ['Call Maya', 'Tomorrow at ten', 'yes']
    let index = 0
    const requests: string[] = []
    const confirmed: string[] = []
    f.audio.start = async () => { f.send(utterances[index++]) }
    await runHandsFreeTaskFlow(f.audio, {
      async request(text) {
        requests.push(text)
        return requests.length === 1
          ? { message: 'When should I call Maya?', pendingActions: [] }
          : proposal
      },
      async confirm(id) { confirmed.push(id) },
      async cancel() { assert.fail('must not cancel') },
    }, 'en-US', new AbortController().signal, () => undefined, timing)
    assert.deepEqual(requests, ['Call Maya', 'Tomorrow at ten'])
    assert.deepEqual(confirmed, [actionId])
  })
})
