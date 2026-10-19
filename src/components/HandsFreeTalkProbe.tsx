import { useEffect, useRef, useState } from 'react'
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { NativeSpeech } from '../lib/nativeSpeech'
import { ProbeEntrySchema, ProbeLocaleSchema, runHandsFreeTaskFlow, taskSummary, waitForVoiceTalkHandler, VoiceTalkResponseSchema, type ProbeAudio, type ProbeLocale, type ProbeState, type VoiceTalkHandler } from '../lib/handsFreeProbe'

const VoiceListSchema = z.object({ voices: z.array(z.object({
  id: z.string().min(1), name: z.string().min(1), quality: z.enum(['standard', 'enhanced', 'premium', 'unknown']),
})) })
const AudioDiagnosticSchema = z.object({ diagnostic: z.object({
  status: z.enum(['running', 'finished', 'failed']),
  message: z.string().min(1),
  at: z.number(),
}).nullable() })
const LockedTaskDiagnosticSchema = z.object({ diagnostic: z.object({
  stage: z.string().min(1), detail: z.string().min(1), at: z.number(),
}).nullable() })
const LockedTaskDraftEventSchema = z.object({ id: z.string().uuid(), idea: z.string().trim().min(1), turn: z.enum(['1', '2']) })
const LockedTaskDecisionEventSchema = z.object({ id: z.string().uuid(), decision: z.enum(['save', 'cancel']) })

const Probe = registerPlugin<{
  takeEntry(): Promise<unknown>
  getLastAudioDiagnostic(): Promise<unknown>
  getLastLockedTaskDiagnostic(): Promise<unknown>
  ackLockedBridgeProbe(input: { id: string }): Promise<void>
  replyLockedTaskDraft(input: { id: string; summary?: string; question?: string; error?: string }): Promise<void>
  replyLockedTaskDecision(input: { id: string; completed?: boolean; error?: string }): Promise<void>
  getVoices(input: { locale: ProbeLocale }): Promise<unknown>
  speak(input: { text: string; locale: ProbeLocale; voiceId?: string }): Promise<void>
  stop(): Promise<void>
  addListener(event: 'entryAvailable', callback: () => void): Promise<PluginListenerHandle>
  addListener(event: 'lockedBridgeProbe', callback: (event: { id: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'lockedTaskDraft', callback: (event: unknown) => void): Promise<PluginListenerHandle>
  addListener(event: 'lockedTaskDecision', callback: (event: unknown) => void): Promise<PluginListenerHandle>
}>('HandsFreeTalkProbe')

const audio: ProbeAudio = {
  async check(locale) {
    const result = await NativeSpeech.getAvailability({ locale })
    if (!result.available) throw new Error(result.reason ?? 'On-device speech is unavailable for this language.')
    if (result.permission !== 'granted' || result.modelStatus !== 'installed') {
      throw new Error('Open Talk and use “Prepare microphone” once before the Siri test. Permission and the language model must be ready.')
    }
  },
  async speak(text, locale) {
    const voiceId = localStorage.getItem(`healthyflow-probe-voice-${locale}`) ?? undefined
    await Probe.speak({ text, locale, voiceId })
  },
  async start(locale) { await NativeSpeech.start({ locale, readyCue: true }) },
  async stop() { return (await NativeSpeech.stop()).text },
  async cancel() {
    // Release playback before recording; never leave capture running because TTS cleanup failed.
    const results = await Promise.allSettled([Probe.stop(), NativeSpeech.cancel()])
    const failed = results.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  },
  async subscribe(onText, onError) {
    const transcript = await NativeSpeech.addListener('transcript', (event) => onText(event.text))
    try {
      const state = await NativeSpeech.addListener('stateChanged', (event) => {
        if (event.state === 'error') onError(event.message ?? 'Native transcription failed.')
      })
      return async () => { await Promise.all([transcript.remove(), state.remove()]) }
    } catch (error) { await transcript.remove(); throw error }
  },
}

/** Visible only in a native build explicitly compiled with HANDSFREE_PROBE. */
export default function HandsFreeTalkProbe({ owner }: { owner: string }) {
  const enabled = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('HandsFreeTalkProbe')
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const [locale, setLocale] = useState<ProbeLocale>(() => ProbeLocaleSchema.parse(
    localStorage.getItem('healthyflow-probe-locale') === 'he-IL' ? 'he-IL' : 'en-US',
  ))
  const localeRef = useRef(locale)
  const [state, setState] = useState<ProbeState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [audioDiagnostic, setAudioDiagnostic] = useState<z.infer<typeof AudioDiagnosticSchema>['diagnostic']>(null)
  const [nativeTaskDiagnostic, setNativeTaskDiagnostic] = useState<z.infer<typeof LockedTaskDiagnosticSchema>['diagnostic']>(null)
  const [voices, setVoices] = useState<z.infer<typeof VoiceListSchema>['voices']>([])
  const [voiceId, setVoiceId] = useState('')
  const [busy, setBusy] = useState(false)
  const [minimized, setMinimized] = useState(true)
  const [lockedTaskDiagnostic, setLockedTaskDiagnostic] = useState<string | null>(null)
  const running = useRef<AbortController | null>(null)
  const lockedTask = useRef<{ id: string; actionId: string; talk: VoiceTalkHandler } | null>(null)
  const draftInFlight = useRef<string | null>(null)
  const decisionInFlight = useRef<string | null>(null)
  const lastDraftId = useRef<string | null>(null)
  const lastDecisionId = useRef<string | null>(null)
  const mounted = useRef(false)
  const stop = () => {
    running.current?.abort()
    void audio.cancel().catch((reason: unknown) => {
      if (mounted.current) setError(String(reason))
    })
  }

  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let draftListener: PluginListenerHandle | undefined
    let decisionListener: PluginListenerHandle | undefined
    const onDraft = async (raw: unknown) => {
      const startedAt = performance.now()
      const parsed = LockedTaskDraftEventSchema.safeParse(raw)
      if (!parsed.success) { setError('Siri sent an invalid Task request. Nothing was saved.'); return }
      const { id, idea, turn } = parsed.data
      const draftKey = `${id}:${turn}`
      if (lastDraftId.current === draftKey || draftInFlight.current === draftKey || lockedTask.current?.id === id) return
      if (draftInFlight.current || lockedTask.current) {
        await Probe.replyLockedTaskDraft({ id, error: 'Another voice Task is waiting for approval.' })
          .catch((reason: unknown) => { if (!disposed) setError(String(reason)) })
        return
      }
      lastDraftId.current = draftKey
      draftInFlight.current = draftKey
      if (!disposed) {
        setError(null)
        setLockedTaskDiagnostic('Siri heard the idea; Talk is preparing one Task proposal.')
      }
      let summary: string
      try {
        navigateRef.current('/talk')
        const controller = new AbortController()
        const talk = await waitForVoiceTalkHandler(controller.signal)
        const response = VoiceTalkResponseSchema.parse(await talk.request(idea, controller.signal))
        if (turn === '1' && response.pendingActions.length === 0 && response.message.trim()) {
          draftInFlight.current = null
          try {
            await Probe.replyLockedTaskDraft({ id, question: response.message })
            if (!disposed) setLockedTaskDiagnostic(`Talk asked a spoken follow-up after ${((performance.now() - startedAt) / 1000).toFixed(1)} seconds; no Task has been proposed or saved.`)
          } catch (replyError) {
            if (!disposed) setError(`Could not return Talk's follow-up to Siri: ${String(replyError)}`)
          }
          return
        }
        if (response.pendingActions.length !== 1 || response.pendingActions[0].capability !== 'add_task') {
          throw new Error(response.pendingActions.length === 0 && response.message.trim()
            ? `Talk needs another turn: ${response.message}`
            : 'Talk prepared a plan that needs on-screen review.')
        }
        const action = response.pendingActions[0]
        lockedTask.current = { id, actionId: action.id, talk }
        summary = taskSummary(action, localeRef.current)
      } catch (reason) {
        if (lockedTask.current?.id === id) lockedTask.current = null
        const message = reason instanceof Error ? reason.message : String(reason)
        if (!disposed) setLockedTaskDiagnostic(`Talk could not prepare a voice Task after ${((performance.now() - startedAt) / 1000).toFixed(1)} seconds: ${message}`)
        await Probe.replyLockedTaskDraft({ id, error: message }).catch((replyError: unknown) => {
          if (!disposed) setError(`Could not return the Task error to Siri: ${String(replyError)}`)
        })
        draftInFlight.current = null
        return
      }
      draftInFlight.current = null
      try {
        await Probe.replyLockedTaskDraft({ id, summary })
        if (!disposed) setLockedTaskDiagnostic(`Proposal reached Siri in ${((performance.now() - startedAt) / 1000).toFixed(1)} seconds; waiting for spoken confirmation.`)
      } catch (replyError) {
        const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1)
        const pending = lockedTask.current
        if (pending?.id === id) {
          try {
            await pending.talk.cancel(pending.actionId)
            if (!disposed) setLockedTaskDiagnostic(`Talk prepared the proposal in ${elapsed} seconds, after Siri stopped waiting. The pending proposal was canceled; no Task was saved.`)
          } catch (cancelError) {
            if (!disposed) setError(`Siri stopped waiting after ${elapsed} seconds, and Talk could not cancel the pending proposal: ${String(cancelError)} Review Talk before trying again.`)
          } finally {
            if (lockedTask.current?.id === id) lockedTask.current = null
          }
        } else if (!disposed) {
          setError(`Could not return the Task proposal to Siri after ${elapsed} seconds: ${String(replyError)}`)
        }
      }
    }
    const onDecision = async (raw: unknown) => {
      const parsed = LockedTaskDecisionEventSchema.safeParse(raw)
      if (!parsed.success) { setError('Siri sent an invalid Task decision. Nothing was saved.'); return }
      const { id, decision } = parsed.data
      if (lastDecisionId.current === id || decisionInFlight.current === id) return
      lastDecisionId.current = id
      decisionInFlight.current = id
      const pending = lockedTask.current
      if (!pending || pending.id !== id) {
        await Probe.replyLockedTaskDecision({ id, error: 'The proposed Task is no longer active. Review Talk before trying again.' })
          .catch((reason: unknown) => { if (!disposed) setError(String(reason)) })
        decisionInFlight.current = null
        return
      }
      try {
        if (decision === 'save') await pending.talk.confirm(pending.actionId)
        else await pending.talk.cancel(pending.actionId)
      } catch (reason) {
        await Probe.replyLockedTaskDecision({ id, error: reason instanceof Error ? reason.message : String(reason) })
          .catch((replyError: unknown) => {
            if (!disposed) setError(`Could not return the Task result to Siri: ${String(replyError)}`)
          })
        lockedTask.current = null
        decisionInFlight.current = null
        return
      }
      lockedTask.current = null
      decisionInFlight.current = null
      await Probe.replyLockedTaskDecision({ id, completed: true }).catch((replyError: unknown) => {
        if (!disposed) setError(`Could not return the Task result to Siri: ${String(replyError)}`)
      })
    }
    void Promise.all([
      Probe.addListener('lockedTaskDraft', (event) => { void onDraft(event) }),
      Probe.addListener('lockedTaskDecision', (event) => { void onDecision(event) }),
    ]).then(([draft, decision]) => {
      if (disposed) { void draft.remove(); void decision.remove() }
      else { draftListener = draft; decisionListener = decision }
    }).catch((reason: unknown) => {
      if (!disposed) setError(`Could not prepare the locked Task bridge: ${String(reason)}`)
    })
    return () => {
      disposed = true
      lockedTask.current = null
      draftInFlight.current = null
      decisionInFlight.current = null
      void draftListener?.remove()
      void decisionListener?.remove()
    }
  }, [enabled, owner])

  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let listener: PluginListenerHandle | undefined
    void Probe.addListener('lockedBridgeProbe', ({ id }) => {
      if (disposed) return
      void Probe.ackLockedBridgeProbe({ id }).catch((reason: unknown) => {
        if (!disposed) setError(`The locked Local-day bridge check failed: ${String(reason)}`)
      })
    }).then((handle) => {
      if (disposed) void handle.remove()
      else listener = handle
    }).catch((reason: unknown) => {
      if (!disposed) setError(`Could not prepare the locked Local-day bridge check: ${String(reason)}`)
    })
    return () => { disposed = true; void listener?.remove() }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    let disposed = false
    const refresh = () => {
      void Probe.getLastAudioDiagnostic().then((result) => {
        if (!disposed) setAudioDiagnostic(AudioDiagnosticSchema.parse(result).diagnostic)
      }).catch((reason: unknown) => {
        if (!disposed) setError(`Could not read the last locked-audio test: ${String(reason)}`)
      })
      void Probe.getLastLockedTaskDiagnostic().then((result) => {
        if (!disposed) setNativeTaskDiagnostic(LockedTaskDiagnosticSchema.parse(result).diagnostic)
      }).catch((reason: unknown) => {
        if (!disposed) setError(`Could not read the last Siri follow-up diagnostic: ${String(reason)}`)
      })
    }
    const onAppState = (event: Event) => {
      if ((event as CustomEvent<{ isActive: boolean }>).detail.isActive) refresh()
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    window.addEventListener('healthyflow:app-state', onAppState)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      window.removeEventListener('healthyflow:app-state', onAppState)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    let disposed = false
    setVoices([])
    void Probe.getVoices({ locale }).then((result) => {
      if (disposed) return
      const { voices: installed } = VoiceListSchema.parse(result)
      if (!installed.length) throw new Error(`No installed playback voice supports ${locale}.`)
      setVoices(installed)
      const saved = localStorage.getItem(`healthyflow-probe-voice-${locale}`)
      if (saved && installed.some((voice) => voice.id === saved)) setVoiceId(saved)
      else {
        setVoiceId(installed[0]?.id ?? '')
        if (saved) {
          localStorage.removeItem(`healthyflow-probe-voice-${locale}`)
          setError('The previously selected playback voice is no longer installed. Choose an available voice.')
        }
      }
    }).catch((reason: unknown) => { if (!disposed) setError(String(reason)) })
    return () => { disposed = true }
  }, [enabled, locale])

  useEffect(() => {
    if (!enabled) return
    mounted.current = true
    let disposed = false
    let entryListener: PluginListenerHandle | undefined
    let taking = false
    const start = async () => {
      if (disposed || taking || running.current || document.visibilityState === 'hidden') return
      taking = true
      try {
        const result = ProbeEntrySchema.parse(await Probe.takeEntry())
        if (disposed || !result.entry) return
        const controller = new AbortController()
        running.current = controller
        setBusy(true); setError(null)
        navigateRef.current('/talk')
        const talk = await waitForVoiceTalkHandler(controller.signal)
        await runHandsFreeTaskFlow(audio, talk, localeRef.current, controller.signal, (next) => {
          if (!disposed && !controller.signal.aborted) setState(next)
        })
      } catch (reason) {
        if (!disposed) {
          const message = reason instanceof Error ? reason.message : String(reason)
          setError(message)
          if (!running.current?.signal.aborted && document.visibilityState === 'visible') {
            try {
              await audio.cancel()
              await audio.speak(message, localeRef.current)
            } catch (speechError) {
              setError(`${message} Voice error: ${String(speechError)}`)
            }
          }
        }
      } finally {
        taking = false
        if (!disposed) { running.current = null; setBusy(false) }
      }
    }
    const visibility = () => {
      if (document.visibilityState === 'hidden') stop()
      else void start()
    }
    const appState = (event: Event) => {
      if ((event as CustomEvent<{ isActive: boolean }>).detail.isActive) void start()
      else stop()
    }
    void Probe.addListener('entryAvailable', () => void start()).then((listener) => {
      if (disposed) void listener.remove()
      else { entryListener = listener; void start() }
    }).catch((reason: unknown) => { if (!disposed) setError(String(reason)) })
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('healthyflow:app-state', appState)
    return () => {
      disposed = true; mounted.current = false
      running.current?.abort()
      running.current = null
      void audio.cancel().catch((reason: unknown) => console.error('Voice-test cleanup failed', reason))
      void entryListener?.remove()
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('healthyflow:app-state', appState)
    }
  }, [enabled, owner])

  if (!enabled) return null
  const prepare = async () => {
    if (running.current) return
    const controller = new AbortController()
    running.current = controller
    setBusy(true); setError(null)
    try {
      await NativeSpeech.start({ locale })
      await NativeSpeech.cancel()
      const availability = await NativeSpeech.getAvailability({ locale })
      if (!availability.available || availability.modelStatus !== 'installed') {
        throw new Error(availability.reason ?? 'The on-device language model is not ready.')
      }
      if (!controller.signal.aborted && mounted.current) {
        const engine = availability.engine === 'dictationTranscriber' ? 'Apple on-device dictation' : 'Apple on-device transcription'
        setState({ phase: 'finished', message: `${engine} ready for ${locale === 'he-IL' ? 'Hebrew' : 'English'}. Say: “Siri, start Talk in HealthyFlow.”`, transcript: '' })
      }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (running.current === controller) running.current = null
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <section
      className={`fixed bottom-24 left-4 right-4 z-50 rounded-xl border border-accent bg-page shadow-xl ${minimized ? 'p-2' : 'overflow-y-auto p-4'}`}
      style={minimized ? undefined : { maxHeight: 'min(65vh, 34rem)' }}
      aria-label="Hands-free entry test"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate font-semibold">Hands-free Talk · Test build{minimized && error ? ' · Issue' : ''}</p>
        <button
          type="button"
          className="btn-secondary shrink-0 px-3 py-1 text-sm"
          aria-controls="hands-free-debug-details"
          aria-expanded={!minimized}
          onClick={() => setMinimized((value) => !value)}
        >{minimized ? 'Expand' : 'Minimize'}</button>
      </div>
      {!minimized && <div id="hands-free-debug-details">
      <p className="mt-1 text-sm" role="status">{state?.message ?? 'One-time setup, then say “Siri, start Talk in HealthyFlow.”'}</p>
      {state?.transcript && <p className="mt-2 text-sm" dir="auto">{state.transcript}</p>}
      {error && <p className="mt-2 text-sm text-state-warning" role="alert">{error}</p>}
      {lockedTaskDiagnostic && <p className="mt-2 text-sm" role="status">Last voice Task · {lockedTaskDiagnostic}</p>}
      {nativeTaskDiagnostic && <p className="mt-2 text-sm" role="status">
        Last Siri stage · {nativeTaskDiagnostic.stage} · {new Date(nativeTaskDiagnostic.at * 1000).toLocaleTimeString()}<br />
        {nativeTaskDiagnostic.detail}
      </p>}
      {audioDiagnostic && <p className="mt-2 text-sm" role="status">
        Last locked-audio test · {audioDiagnostic.status} · {new Date(audioDiagnostic.at * 1000).toLocaleTimeString()}<br />
        {audioDiagnostic.message}
      </p>}
      <div className="mt-3 flex gap-3">
        <select aria-label="Voice test language" value={locale} disabled={busy} onChange={(event) => {
          const value = ProbeLocaleSchema.parse(event.target.value)
          localeRef.current = value; setLocale(value)
          localStorage.setItem('healthyflow-probe-locale', value)
        }} className="rounded border bg-page p-2">
          <option value="en-US">English</option><option value="he-IL">עברית</option>
        </select>
        <button className="btn-secondary px-3" disabled={busy} onClick={() => void prepare()}>Prepare microphone</button>
        <button className="btn-secondary px-3" disabled={!busy} onClick={stop}>Stop test</button>
      </div>
      {voices.length > 0 && <label className="mt-3 block text-sm">Playback voice
        <select aria-label="Playback voice" value={voiceId} disabled={busy} onChange={(event) => {
          setVoiceId(event.target.value)
          localStorage.setItem(`healthyflow-probe-voice-${locale}`, event.target.value)
        }} className="mt-1 w-full rounded border bg-page p-2">
          {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.quality}</option>)}
        </select>
      </label>}
      </div>}
    </section>
  )
}
