import { z } from 'zod'

// #317 native audio and one-Task voice flow. Talk owns AI and persistence.
export const ProbeEntrySchema = z.object({ entry: z.object({ id: z.string().uuid() }).nullable() })
export const ProbeLocaleSchema = z.enum(['en-US', 'he-IL'])
export type ProbeLocale = z.infer<typeof ProbeLocaleSchema>
export const ProbeStateSchema = z.object({
  phase: z.enum(['checking', 'speaking', 'listening', 'finished']),
  message: z.string(),
  transcript: z.string().default(''),
})
export type ProbeState = z.infer<typeof ProbeStateSchema>

export interface ProbeAudio {
  check(locale: ProbeLocale): Promise<void>
  speak(text: string, locale: ProbeLocale): Promise<void>
  start(locale: ProbeLocale): Promise<void>
  stop(): Promise<string>
  cancel(): Promise<void>
  subscribe(transcript: (text: string) => void, error: (message: string) => void): Promise<() => Promise<void>>
}

export const VoiceTaskActionSchema = z.object({
  id: z.string().uuid(),
  capability: z.string(),
  args: z.record(z.string(), z.unknown()),
  expiresAt: z.string(),
})
export const VoiceTalkResponseSchema = z.object({
  message: z.string(),
  pendingActions: z.array(VoiceTaskActionSchema),
})
export type VoiceTalkResponse = z.infer<typeof VoiceTalkResponseSchema>

const VoiceTaskArgsSchema = z.object({
  title: z.string().trim().min(1),
  duration: z.number().int().positive(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
})

export interface VoiceTalkHandler {
  request(text: string, signal: AbortSignal): Promise<VoiceTalkResponse>
  confirm(actionId: string): Promise<void>
  cancel(actionId: string): Promise<void>
}

let talkHandler: VoiceTalkHandler | null = null
const handlerReady = new Set<() => void>()

export function registerVoiceTalkHandler(handler: VoiceTalkHandler): () => void {
  talkHandler = handler
  for (const ready of handlerReady) ready()
  return () => { if (talkHandler === handler) talkHandler = null }
}

export async function waitForVoiceTalkHandler(signal: AbortSignal): Promise<VoiceTalkHandler> {
  if (talkHandler) return talkHandler
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', aborted)
      handlerReady.delete(ready)
    }
    const aborted = () => { cleanup(); reject(new Error('Voice session stopped.')) }
    const ready = () => {
      if (!talkHandler) return
      const current = talkHandler
      cleanup()
      resolve(current)
    }
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Talk did not become ready. Open HealthyFlow and try Siri again.'))
    }, 10000)
    signal.addEventListener('abort', aborted, { once: true })
    handlerReady.add(ready)
    if (signal.aborted) aborted()
    else ready()
  })
}

function checkActive(signal: AbortSignal) {
  if (signal.aborted) throw new Error('Voice test stopped. Invoke Siri again to restart.')
}

/** Silence is an endpoint for this probe, never approval of a write. */
export async function captureProbeTurn(
  audio: ProbeAudio,
  locale: ProbeLocale,
  signal: AbortSignal,
  onText: (text: string) => void,
  timing = { silenceMs: 3500, noSpeechMs: 20000, maximumMs: 60000 },
): Promise<string> {
  checkActive(signal)
  let quiet: ReturnType<typeof setTimeout> | undefined
  let noSpeech: ReturnType<typeof setTimeout> | undefined
  let maximum: ReturnType<typeof setTimeout> | undefined
  let previous = ''
  let complete!: () => void
  let fail!: (reason: Error) => void
  const ended = new Promise<void>((resolve, reject) => { complete = resolve; fail = reject })
  // A native failure can arrive during start(), before ended is awaited.
  void ended.catch(() => undefined)
  const abort = () => fail(new Error('Voice test stopped. Invoke Siri again to restart.'))
  signal.addEventListener('abort', abort, { once: true })
  let unsubscribe: (() => Promise<void>) | undefined
  try {
    unsubscribe = await audio.subscribe((text) => {
      if (signal.aborted || !text.trim() || text === previous) return
      previous = text
      onText(text)
      clearTimeout(noSpeech)
      clearTimeout(quiet)
      quiet = setTimeout(complete, timing.silenceMs)
    }, (message) => fail(new Error(message)))
    checkActive(signal)
    await audio.start(locale)
    checkActive(signal)
    if (!previous) noSpeech = setTimeout(() => fail(new Error('No speech was captured. Nothing was saved.')), timing.noSpeechMs)
    maximum = setTimeout(complete, timing.maximumMs)
    await ended
    checkActive(signal)
    const text = (await audio.stop()).trim()
    checkActive(signal)
    if (!text) throw new Error('No final transcript was returned. Nothing was saved.')
    return text
  } finally {
    clearTimeout(quiet); clearTimeout(noSpeech); clearTimeout(maximum)
    signal.removeEventListener('abort', abort)
    await unsubscribe?.()
  }
}

export async function runHandsFreeProbe(
  audio: ProbeAudio,
  locale: ProbeLocale,
  signal: AbortSignal,
  report: (state: ProbeState) => void,
  timing?: Parameters<typeof captureProbeTurn>[4],
) {
  const hebrew = locale === 'he-IL'
  const say = async (text: string, transcript = '') => {
    checkActive(signal)
    report({ phase: 'speaking', message: text, transcript })
    await audio.speak(text, locale)
    checkActive(signal)
  }
  try {
    report({ phase: 'checking', message: 'Checking voice-test setup…', transcript: '' })
    await audio.check(locale)
    await say(hebrew
      ? 'זו בדיקת קול בלבד. שום משימה לא תישמר. אחרי הצליל, אפשר לדבר.'
      : 'This is a voice test. No Tasks will be saved. Speak after the tone.')
    for (let turn = 0; turn < 2; turn++) {
      report({ phase: 'listening', message: 'Wait for the tone, then speak. Pause to finish; say “stop” to end.', transcript: '' })
      const text = await captureProbeTurn(audio, locale, signal, (transcript) => {
        report({ phase: 'listening', message: 'Listening. Pause to finish.', transcript })
      }, timing)
      if (/^(stop|cancel|עצור|עצרי|ביטול)[.!?\s]*$/iu.test(text)) break
      await say(hebrew ? `שמעתי: ${text}` : `I heard: ${text}`, text)
      if (turn === 0) await say(hebrew ? 'אפשר לומר עוד משהו אחרי הצליל, או לומר עצור.' : 'Say one more thing after the tone, or say stop.')
    }
    await say(hebrew ? 'בדיקת הקול הסתיימה. שום משימה לא נשמרה.' : 'Voice test complete. No Tasks were saved.')
    report({ phase: 'finished', message: 'Voice test complete. No Tasks saved. Invoke Siri to test again.', transcript: '' })
  } finally {
    await audio.cancel()
  }
}

function voiceDecision(text: string): 'yes' | 'no' | 'stop' | 'unclear' {
  const normalized = text.trim().toLocaleLowerCase().replace(/[.!?,؟。]/gu, '').trim()
  if (/^(yes|confirm|save|כן|אישור|אשר|תשמור|שמור)$/u.test(normalized)) return 'yes'
  if (/^(no|cancel|don't save|do not save|לא|בטל|ביטול|אל תשמור)$/u.test(normalized)) return 'no'
  if (/^(stop|עצור|עצרי)$/u.test(normalized)) return 'stop'
  return 'unclear'
}

export function taskSummary(action: z.infer<typeof VoiceTaskActionSchema>, locale: ProbeLocale): string {
  const args = VoiceTaskArgsSchema.parse(action.args)
  const date = args.scheduledDate
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(`${args.scheduledDate}T12:00:00`))
    : null
  if (locale === 'he-IL') {
    return `הכנתי משימה: ${args.title}. ${date ? `בתאריך ${date}.` : 'ללא תאריך.'} ${args.startTime ? `בשעה ${args.startTime}.` : ''} משך ${args.duration} דקות. לשמור? אמרו כן או לא.`
  }
  return `I prepared one Task: ${args.title}. ${date ? `On ${date}.` : 'No date.'} ${args.startTime ? `At ${args.startTime}.` : ''} ${args.duration} minutes. Save it? Say yes or no.`
}

/** One Task at a time; only the server's pending-action id can be confirmed. */
export async function runHandsFreeTaskFlow(
  audio: ProbeAudio,
  talk: VoiceTalkHandler,
  locale: ProbeLocale,
  signal: AbortSignal,
  report: (state: ProbeState) => void,
  timing?: Parameters<typeof captureProbeTurn>[4],
) {
  const hebrew = locale === 'he-IL'
  const say = async (message: string, transcript = '') => {
    checkActive(signal)
    report({ phase: 'speaking', message, transcript })
    await audio.speak(message, locale)
    checkActive(signal)
  }
  const hear = async () => {
    report({ phase: 'listening', message: hebrew ? 'אחרי הצליל, אפשר לדבר.' : 'Speak after the tone.', transcript: '' })
    return captureProbeTurn(audio, locale, signal, (transcript) => {
      report({ phase: 'listening', message: hebrew ? 'מקשיב. עצרו לרגע לסיום.' : 'Listening. Pause to finish.', transcript })
    }, timing)
  }
  try {
    report({ phase: 'checking', message: 'Checking Talk and microphone…', transcript: '' })
    await audio.check(locale)
    await say(hebrew
      ? 'אפשר לומר משימה אחת. אקריא אותה לפני שאשמור. אמרו עצור כדי לסיים.'
      : 'Tell me one Task. I will read it back before saving. Say stop to end.')
    for (let turn = 0; turn < 2; turn++) {
      const request = await hear()
      if (voiceDecision(request) === 'stop') {
        await say(hebrew ? 'הפסקתי. שום משימה לא נשמרה.' : 'Stopped. No Task was saved.')
        return
      }
      report({ phase: 'checking', message: hebrew ? 'טוק מכין הצעה…' : 'Talk is preparing a proposal…', transcript: request })
      const response = VoiceTalkResponseSchema.parse(await talk.request(request, signal))
      if (response.pendingActions.length === 0) {
        if (!response.message.trim()) throw new Error('Talk returned no reply or Task proposal.')
        await say(response.message)
        if (turn === 0) {
          await say(hebrew ? 'אפשר להוסיף פרטים אחרי הצליל.' : 'You can add the missing detail after the tone.')
          continue
        }
        return
      }
      if (response.pendingActions.length !== 1 || response.pendingActions[0].capability !== 'add_task') {
        await say(hebrew
          ? 'הוכנה הצעה שדורשת סקירה במסך. שום דבר לא נשמר בקול.'
          : 'Talk prepared a proposal that needs on-screen review. Nothing was saved by voice.')
        return
      }
      const action = response.pendingActions[0]
      await say(taskSummary(action, locale), request)
      for (let attempt = 0; attempt < 2; attempt++) {
        const decision = voiceDecision(await hear())
        if (decision === 'yes') {
          checkActive(signal)
          await talk.confirm(action.id)
          await say(hebrew ? 'המשימה נשמרה.' : 'Task saved.')
          return
        }
        if (decision === 'no') {
          await talk.cancel(action.id)
          await say(hebrew ? 'ביטלתי את ההצעה. שום משימה לא נשמרה.' : 'Canceled. No Task was saved.')
          return
        }
        if (decision === 'stop') {
          await say(hebrew ? 'ההצעה עדיין ממתינה במסך. שום משימה לא נשמרה.' : 'The proposal remains in Talk. Nothing was saved.')
          return
        }
        if (attempt === 0) await say(hebrew ? 'לא הבנתי. אמרו כן לשמירה, או לא לביטול.' : 'I did not understand. Say yes to save, or no to cancel.')
      }
      await say(hebrew ? 'ההצעה עדיין ממתינה במסך. שום משימה לא נשמרה.' : 'The proposal remains in Talk. Nothing was saved.')
      return
    }
  } finally {
    await audio.cancel()
    report({ phase: 'finished', message: 'Voice session ended. Review Talk for any pending proposal.', transcript: '' })
  }
}
