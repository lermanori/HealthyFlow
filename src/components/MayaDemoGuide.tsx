import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ACTIONS, EVENTS, Joyride, STATUS, type EventData, type Step, type TooltipRenderProps } from 'react-joyride'
import { demoPersonaById, type DemoPersonaId } from '../demoPersonas'

type DemoAction = 'spotlight' | 'type' | 'submit-talk' | 'drag' | 'open-menu' | 'wait'

type DemoScriptStep = {
  id: string
  scene: number
  route: string
  target: string
  action: DemoAction
  payload?: Record<string, unknown>
  narration: string
  placement?: Step['placement']
}

declare global {
  interface Window {
    __healthyFlowDemo?: {
      setTalkDraft?: (value: string) => void
      submitTalk?: () => Promise<void> | void
      moveRolloverTaskToToday?: (startTime: string) => Promise<void> | void
      openAccountMenu?: () => void
      closeAccountMenu?: () => void
    }
  }
}

const mayaScript: DemoScriptStep[] = [
  {
    id: 'today-week-strip',
    scene: 0,
    route: '/',
    target: 'week-tab',
    action: 'spotlight',
    narration: "Maya opens HealthyFlow in the morning. The week strip tells her today's load at a glance: what is done, what is still open, and whether the day is already getting heavy.",
    placement: 'bottom',
  },
  {
    id: 'morning-planning',
    scene: 0,
    route: '/',
    target: 'morning-planning-card',
    action: 'spotlight',
    narration: "HealthyFlow notices this is a planning moment. Instead of making Maya hunt for a feature, it offers the right workflow: shape the day before the timeline fills up.",
    placement: 'bottom',
  },
  {
    id: 'now-next',
    scene: 0,
    route: '/',
    target: 'now-next-card',
    action: 'spotlight',
    narration: "The Now and Next card turns a messy list into a simple decision. Maya can see what she is doing now and what deserves attention next.",
    placement: 'bottom',
  },
  {
    id: 'schedule-section',
    scene: 1,
    route: '/',
    target: 'schedule-section',
    action: 'spotlight',
    narration: "Scheduled is the clock plan. Meetings, timed tasks, and habits with a time live here, so Maya can judge whether the day has enough room.",
    placement: 'top',
  },
  {
    id: 'anytime-backlog',
    scene: 1,
    route: '/',
    target: 'anytime-backlog',
    action: 'spotlight',
    narration: "Anytime is the pressure valve. Tasks can exist without pretending they already have a time, which keeps the calendar honest.",
    placement: 'top',
  },
  {
    id: 'talk-input',
    scene: 2,
    route: '/talk',
    target: 'talk-input',
    action: 'type',
    payload: {
      text: 'Help me rebalance today. I need to protect focus time, move the rolled-over task into the morning, and keep my habits realistic.',
    },
    narration: "When the tradeoff is fuzzy, Maya uses Talk. She says what she needs in plain language: protect focus time, handle the rollover, and keep habits realistic.",
    placement: 'top',
  },
  {
    id: 'talk-submit',
    scene: 2,
    route: '/talk',
    target: 'talk-send-button',
    action: 'submit-talk',
    narration: "Talk gives a stable plan: protect the morning, leave low-pressure work in Anytime, and make one concrete schedule change.",
    placement: 'top',
  },
  {
    id: 'drag-rollover',
    scene: 3,
    route: '/',
    target: 'rollover-task',
    action: 'drag',
    payload: { dropTarget: 'schedule-slot-09:00', startTime: '09:00' },
    narration: "Now the plan becomes real. Maya takes the rolled-over task out of the backlog and gives it a morning slot, so it stops floating around as guilt.",
    placement: 'top',
  },
  {
    id: 'week-momentum',
    scene: 4,
    route: '/week',
    target: 'week-day-column',
    action: 'spotlight',
    narration: "Finally, Maya zooms out. Week view shows whether today's choices support the larger week, not just whether one day looks tidy.",
    placement: 'bottom',
  },
  {
    id: 'open-account-menu',
    scene: 5,
    route: '/',
    target: 'account-menu',
    action: 'spotlight',
    narration: "Maya is only the demo workspace. To leave the demo, open the account menu from here.",
    placement: 'bottom',
  },
  {
    id: 'logout-signup',
    scene: 5,
    route: '/',
    target: 'logout-button',
    action: 'open-menu',
    narration: "Tap Logout to return to the login screen. From there, choose Create account to start your own empty HealthyFlow workspace.",
    placement: 'bottom',
  },
  {
    id: 'explore',
    scene: 6,
    route: '/',
    target: 'add-task-button',
    action: 'spotlight',
    narration: "Now you can explore Maya's demo freely: add an item, open Talk, move tasks around, or log out and create your own account when you're ready.",
    placement: 'bottom',
  },
]

const noamScript: DemoScriptStep[] = [
  {
    id: 'noam-today',
    scene: 0,
    route: '/',
    target: 'now-next-card',
    action: 'spotlight',
    narration: 'Noam opens Today with a small, realistic plan. HealthyFlow keeps the next choice visible instead of asking him to organize everything at once.',
    placement: 'bottom',
  },
  {
    id: 'noam-anytime',
    scene: 1,
    route: '/',
    target: 'anytime-backlog',
    action: 'spotlight',
    narration: 'Anytime holds the low-pressure backlog: tiny tasks, a reset habit, and one item carried forward from yesterday without duplicating it.',
    placement: 'top',
  },
  {
    id: 'noam-talk-input',
    scene: 2,
    route: '/talk',
    target: 'talk-input',
    action: 'type',
    payload: { text: 'I feel stuck. Read my day back to me and pick the smallest next step.' },
    narration: 'Noam uses Talk as a low-friction capture surface. The input can be typed or spoken by the browser, and the request is plain language.',
    placement: 'top',
  },
  {
    id: 'noam-talk-submit',
    scene: 2,
    route: '/talk',
    target: 'talk-send-button',
    action: 'submit-talk',
    narration: 'The demo response stays stable: choose one tiny action, leave the rest visible, and let the day stay handleable.',
    placement: 'top',
  },
  {
    id: 'noam-drag-rollover',
    scene: 3,
    route: '/',
    target: 'rollover-task',
    action: 'drag',
    payload: { dropTarget: 'schedule-slot-10:00', startTime: '10:00' },
    narration: 'Noam gives the rolled-over clinic call a small time slot. One concrete move is enough progress for this walkthrough.',
    placement: 'top',
  },
  {
    id: 'noam-explore',
    scene: 4,
    route: '/',
    target: 'account-menu',
    action: 'spotlight',
    narration: 'The guided part is done. Noam can keep exploring, ask Talk another question, or open the account menu to leave the demo.',
    placement: 'bottom',
  },
]

const linaScript: DemoScriptStep[] = [
  {
    id: 'lina-habits',
    scene: 0,
    route: '/',
    target: 'schedule-section',
    action: 'spotlight',
    narration: 'Lina starts with health habits and a workout on Today. The same planning surface can hold water, walks, stretching, and training.',
    placement: 'top',
  },
  {
    id: 'lina-calories',
    scene: 1,
    route: '/calories',
    target: 'calorie-entries',
    action: 'spotlight',
    narration: 'Calories is a real tracker, not a mock module. Breakfast and lunch are logged with calories, macros, quantities, and times.',
    placement: 'top',
  },
  {
    id: 'lina-weight',
    scene: 1,
    route: '/calories',
    target: 'weight-card',
    action: 'spotlight',
    narration: 'Weight entries show the latest value, the previous delta, and a trend over recorded days.',
    placement: 'bottom',
  },
  {
    id: 'lina-quick-insert',
    scene: 1,
    route: '/calories',
    target: 'calorie-quick-insert-trigger',
    action: 'spotlight',
    narration: 'Quick Insert can repeat common meals from history, so everyday logging gets faster after the first entry.',
    placement: 'bottom',
  },
  {
    id: 'lina-workouts',
    scene: 2,
    route: '/workouts',
    target: 'workout-history',
    action: 'spotlight',
    narration: 'Workouts stores completed sessions with exercises, sets, reps, weight, time, and distance.',
    placement: 'top',
  },
  {
    id: 'lina-achievements',
    scene: 3,
    route: '/achievements',
    target: 'achievement-detail',
    action: 'spotlight',
    narration: 'Achievements tracks personal metrics like 5K time. Lina can see latest progress and trend without turning it into another task list.',
    placement: 'top',
  },
  {
    id: 'lina-explore',
    scene: 4,
    route: '/',
    target: 'talk-button',
    action: 'spotlight',
    narration: 'Now Lina can explore the seeded health workspace freely, including Today, Talk, Calories, Workouts, and Achievements.',
    placement: 'bottom',
  },
]

const amirScript: DemoScriptStep[] = [
  {
    id: 'amir-schedule',
    scene: 0,
    route: '/',
    target: 'schedule-section',
    action: 'spotlight',
    narration: 'Amir has scheduled work blocks and a fixed school pickup. HealthyFlow keeps the clock plan visible when real life changes.',
    placement: 'top',
  },
  {
    id: 'amir-anytime',
    scene: 1,
    route: '/',
    target: 'anytime-backlog',
    action: 'spotlight',
    narration: 'Groceries are represented as ordinary Tasks for now, alongside home calls and a workout Habit that can wait.',
    placement: 'top',
  },
  {
    id: 'amir-talk-input',
    scene: 2,
    route: '/talk',
    target: 'talk-input',
    action: 'type',
    payload: { text: 'School pickup moved earlier. Help me re-plan the rest of today without dropping groceries.' },
    narration: 'When the day changes, Amir asks Talk to re-plan around the immovable family commitment.',
    placement: 'top',
  },
  {
    id: 'amir-talk-submit',
    scene: 2,
    route: '/talk',
    target: 'talk-send-button',
    action: 'submit-talk',
    narration: 'Talk recommends protecting pickup, moving flexible work later, and keeping groceries in Anytime until there is a clear window.',
    placement: 'top',
  },
  {
    id: 'amir-drag-rollover',
    scene: 3,
    route: '/',
    target: 'rollover-task',
    action: 'drag',
    payload: { dropTarget: 'schedule-slot-16:00', startTime: '16:00' },
    narration: 'Amir schedules the carried-forward school forms after pickup, while flexible tasks stay in the backlog.',
    placement: 'top',
  },
  {
    id: 'amir-week',
    scene: 4,
    route: '/week',
    target: 'week-day-column',
    action: 'spotlight',
    narration: 'Week view shows tomorrow alongside today, so rollover and fresh habits are visible without pretending everything fit today.',
    placement: 'bottom',
  },
  {
    id: 'amir-explore',
    scene: 5,
    route: '/',
    target: 'account-menu',
    action: 'spotlight',
    narration: 'The guided part is done. Amir can keep moving tasks, ask Talk again, or open the account menu to leave the demo.',
    placement: 'bottom',
  },
]

const scripts: Record<DemoPersonaId, DemoScriptStep[]> = {
  maya: mayaScript,
  noam: noamScript,
  lina: linaScript,
  amir: amirScript,
}

const audioManifest: Record<string, { file: string; duration: number }> = {
  'talk-input': { file: '/demo-audio/talk-input.mp3', duration: 7.34 },
  'talk-submit': { file: '/demo-audio/talk-submit.mp3', duration: 4.96 },
  'week-momentum': { file: '/demo-audio/week-momentum.mp3', duration: 4.86 },
  'drag-rollover': { file: '/demo-audio/drag-rollover.mp3', duration: 4.26 },
  explore: { file: '/demo-audio/explore.mp3', duration: 10.21 },
}

function targetSelector(target: string) {
  return `[data-demo-id="${target}"]`
}

function resolveTarget(target: string): HTMLElement | null {
  const el = document.querySelector(targetSelector(target)) as HTMLElement | null
  if (!el) console.warn(`[demo] Missing target: ${target}`)
  return el
}

function scrollTargetIntoDemoView(target: HTMLElement, isMobile: boolean) {
  target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })

  if (!isMobile) return

  const centerTargetInMobileViewport = () => {
    const rect = target.getBoundingClientRect()
    const topSafe = 104
    const bottomSheetSpace = Math.min(330, window.innerHeight * 0.42)
    const bottomSafe = window.innerHeight - bottomSheetSpace - 18
    const visibleCenter = topSafe + ((bottomSafe - topSafe) / 2)
    const targetCenter = rect.top + (rect.height / 2)
    const delta = targetCenter - visibleCenter

    if (Math.abs(delta) > 12) {
      window.scrollBy({ top: delta, behavior: 'smooth' })
    }
  }

  window.setTimeout(centerTargetInMobileViewport, 220)
  window.setTimeout(centerTargetInMobileViewport, 520)
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted || ms <= 0) {
      resolve()
      return
    }
    const timeout = window.setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timeout)
      resolve()
    }, { once: true })
  })
}

function playStepAudio(
  step: DemoScriptStep,
  signal: AbortSignal,
  audioRef: MutableRefObject<HTMLAudioElement | null>
) {
  const audio = audioManifest[step.id]
  if (!audio) return

  const player = new Audio(audio.file)
  audioRef.current?.pause()
  audioRef.current = player
  const stop = () => {
    player.pause()
    if (audioRef.current === player) audioRef.current = null
    signal.removeEventListener('abort', stop)
  }
  signal.addEventListener('abort', stop, { once: true })
  player.play().catch(stop)
}

function DemoCaption({ step }: { step: DemoScriptStep }) {
  return (
    <div className="text-left">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
        Scene {step.scene + 1}
      </div>
      <p className="text-base font-medium leading-6 text-ink">
        {step.narration}
      </p>
    </div>
  )
}

function useIsMobileDemo() {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window === 'undefined' ? false : window.innerWidth < 640
  ))

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640)
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return isMobile
}

function MayaTooltip({
  backProps,
  closeProps,
  index,
  isLastStep,
  primaryProps,
  size,
  step,
  tooltipProps,
}: TooltipRenderProps) {
  const isMobile = useIsMobileDemo()

  if (isMobile) {
    return <div {...tooltipProps} className="hidden" />
  }

  return (
    <div {...tooltipProps} className="max-w-[32rem] rounded-xl border border-cyan-500/40 bg-page/95 p-4 text-ink shadow-2xl shadow-cyan-950/40 backdrop-blur">
      <div className="mb-3">
        {step.content}
      </div>

      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-card">
        <div
          className="h-full rounded-full bg-cyan-300 transition-all"
          style={{ width: `${Math.round(((index + 1) / size) * 100)}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          {...closeProps}
          className="min-h-11 rounded-lg px-3 text-sm font-semibold text-ink-muted transition hover:bg-card hover:text-ink"
        >
          Close
        </button>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button
              {...backProps}
              className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold text-cyan-100 transition hover:border-cyan-500/60"
            >
              Back
            </button>
          )}
          <button
            {...primaryProps}
            className="min-h-11 rounded-lg bg-cyan-300 px-5 text-sm font-bold text-cyan-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-200"
          >
            {isLastStep ? 'Explore' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MobileDemoSheet({
  onClose,
  onNext,
  onPrev,
  step,
  stepIndex,
  totalSteps,
}: {
  onClose: () => void
  onNext: () => void
  onPrev: () => void
  step: DemoScriptStep
  stepIndex: number
  totalSteps: number
}) {
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100)
  const isLast = stepIndex === totalSteps - 1

  return (
    <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[92] rounded-xl border border-cyan-500/50 bg-page p-4 text-ink shadow-2xl shadow-cyan-950/40">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
        Scene {step.scene + 1} · {stepIndex + 1}/{totalSteps}
      </div>
      <p className="text-[15px] font-medium leading-6 text-ink">
        {step.narration}
      </p>

      <div className="my-4 h-1.5 overflow-hidden rounded-full bg-card">
        <div
          className="h-full rounded-full bg-cyan-300 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg px-3 text-sm font-semibold text-ink-muted"
        >
          Close
        </button>
        <div className="flex items-center gap-2">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={onPrev}
              className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold text-cyan-100"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            className="min-h-11 rounded-lg bg-cyan-300 px-5 text-sm font-bold text-cyan-950 shadow-lg shadow-cyan-500/20"
          >
            {isLast ? 'Explore' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MobileFocusRing({ rect }: { rect: DOMRect }) {
  const padding = 8
  const left = Math.max(8, rect.left - padding)
  const top = Math.max(90, rect.top - padding)
  const right = Math.min(window.innerWidth - 8, rect.right + padding)
  const bottom = Math.min(window.innerHeight - 12, rect.bottom + padding)

  return (
    <div
      className="pointer-events-none fixed z-[91] rounded-xl border-[3px] border-cyan-200 shadow-[0_0_0_6px_rgba(34,211,238,.24),0_0_36px_rgba(34,211,238,.7)] transition-all duration-300"
      style={{
        left,
        top,
        width: Math.max(44, right - left),
        height: Math.max(44, bottom - top),
      }}
    >
      <span className="absolute -top-7 left-0 rounded-full border border-cyan-300/60 bg-page px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200 shadow-lg">
        Look here
      </span>
    </div>
  )
}

export default function MayaDemoGuide() {
  const location = useLocation()
  const navigate = useNavigate()
  const [run, setRun] = useState(() => localStorage.getItem('mayaDemoGuide') === 'open')
  const [stepIndex, setStepIndex] = useState(0)
  const [muted, setMuted] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [mobileTargetRect, setMobileTargetRect] = useState<DOMRect | null>(null)
  const isMobile = useIsMobileDemo()
  const abortRef = useRef<AbortController | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const completedActionsRef = useRef<Set<string>>(new Set())
  const focusedTargetRef = useRef<HTMLElement | null>(null)
  const persona = (localStorage.getItem('demoPersona') ?? 'maya') as DemoPersonaId
  const personaMeta = demoPersonaById(persona)
  const script = scripts[personaMeta.id]
  const step = script[stepIndex]

  const isPersonaDemo = useMemo(() => Boolean(localStorage.getItem('demoPersona')), [location.pathname])

  const joyrideSteps = useMemo<Step[]>(() => script.map((item) => ({
    target: targetSelector(item.target),
    content: <DemoCaption step={item} />,
    placement: isMobile ? 'center' : (item.placement ?? 'auto'),
    disableBeacon: true,
    spotlightPadding: isMobile ? 10 : 8,
  })), [isMobile, script])

  useEffect(() => {
    if (!isPersonaDemo) return
    setStepIndex(0)
    completedActionsRef.current.clear()
    setRun(localStorage.getItem('mayaDemoGuide') === 'open')
  }, [isPersonaDemo, personaMeta.id])

  useEffect(() => {
    if (!run || !step) return
    setIsReady(false)
    setMobileTargetRect(null)
    abortRef.current?.abort()
    audioRef.current?.pause()

    const controller = new AbortController()
    abortRef.current = controller

    const prepareStep = async () => {
      focusedTargetRef.current?.removeAttribute('data-demo-active-target')
      focusedTargetRef.current = null

      if (location.pathname !== step.route) {
        navigate(step.route)
        await delay(450, controller.signal)
      }

      if (step.action === 'open-menu') {
        window.__healthyFlowDemo?.openAccountMenu?.()
        await delay(450, controller.signal)
      } else {
        window.__healthyFlowDemo?.closeAccountMenu?.()
      }

      const target = resolveTarget(step.target)
      if (target) {
        target.setAttribute('data-demo-active-target', 'true')
        focusedTargetRef.current = target
        scrollTargetIntoDemoView(target, isMobile)
      }
      await delay(isMobile ? 720 : 260, controller.signal)
      if (controller.signal.aborted) return
      if (target && isMobile) setMobileTargetRect(target.getBoundingClientRect())
      setIsReady(true)

      if (!muted) playStepAudio(step, controller.signal, audioRef)

      if (completedActionsRef.current.has(step.id)) return
      completedActionsRef.current.add(step.id)

      if (step.action === 'type') {
        const text = String(step.payload?.text ?? '')
        let current = ''
        for (const char of text) {
          if (controller.signal.aborted) return
          current += char
          window.__healthyFlowDemo?.setTalkDraft?.(current)
          await delay(42 + Math.round(Math.random() * 28), controller.signal)
        }
      }

      if (step.action === 'submit-talk') {
        await delay(450, controller.signal)
        await window.__healthyFlowDemo?.submitTalk?.()
      }

      if (step.action === 'drag') {
        const dropTarget = resolveTarget(String(step.payload?.dropTarget ?? ''))
        if (dropTarget) scrollTargetIntoDemoView(dropTarget, isMobile)
        await delay(700, controller.signal)
        await window.__healthyFlowDemo?.moveRolloverTaskToToday?.(String(step.payload?.startTime ?? '09:00'))
      }
    }

    prepareStep()
    return () => {
      focusedTargetRef.current?.removeAttribute('data-demo-active-target')
      focusedTargetRef.current = null
      setMobileTargetRect(null)
      controller.abort()
    }
  }, [isMobile, location.pathname, muted, navigate, run, step])

  useEffect(() => {
    if (!isMobile || !isReady || !step) return
    const updateRect = () => {
      const target = resolveTarget(step.target)
      if (target) setMobileTargetRect(target.getBoundingClientRect())
    }
    window.addEventListener('resize', updateRect)
    window.addEventListener('orientationchange', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('orientationchange', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [isMobile, isReady, step])

  if (!isPersonaDemo || !run || !step) return null

  const close = () => {
    localStorage.setItem('mayaDemoGuide', 'closed')
    focusedTargetRef.current?.removeAttribute('data-demo-active-target')
    focusedTargetRef.current = null
    setMobileTargetRect(null)
    abortRef.current?.abort()
    audioRef.current?.pause()
    setRun(false)
  }

  const goPrev = () => {
    setStepIndex((current) => Math.max(0, current - 1))
  }

  const goNext = () => {
    if (stepIndex === script.length - 1) {
      close()
      return
    }
    setStepIndex((current) => Math.min(script.length - 1, current + 1))
  }

  const onJoyrideEvent = (data: EventData) => {
    const { action, index, status, type } = data

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED || action === ACTIONS.CLOSE) {
      close()
      return
    }

    if (type === EVENTS.TARGET_NOT_FOUND) {
      setStepIndex(Math.min(index + 1, script.length - 1))
      return
    }

    if (isMobile) return

    if (type === EVENTS.STEP_AFTER) {
      const nextIndex = action === ACTIONS.PREV ? index - 1 : index + 1
      setStepIndex(Math.max(0, Math.min(nextIndex, script.length - 1)))
    }
  }

  return (
    <>
      <Joyride
        onEvent={onJoyrideEvent}
        continuous
        locale={{
          back: 'Back',
          close: 'Close',
          last: 'Explore',
          next: 'Next',
          nextWithProgress: 'Next',
          skip: 'Close',
        }}
        options={{
          arrowColor: '#111827',
          backgroundColor: '#111827',
          blockTargetInteraction: true,
          buttons: stepIndex === 0 ? ['close', 'primary'] : ['back', 'close', 'primary'],
          overlayClickAction: false,
          overlayColor: isMobile ? 'rgba(0, 0, 0, 0.14)' : 'rgba(0, 0, 0, 0.5)',
          primaryColor: '#22d3ee',
          scrollOffset: isMobile ? 180 : 96,
          showProgress: true,
          skipBeacon: true,
          skipScroll: true,
          spotlightPadding: 8,
          spotlightRadius: isMobile ? 12 : 10,
          targetWaitTimeout: 1500,
          textColor: '#f3f4f6',
          zIndex: 90,
        }}
        run={run && isReady}
        scrollToFirstStep={!isMobile}
        stepIndex={stepIndex}
        steps={joyrideSteps}
        tooltipComponent={MayaTooltip}
        floatingOptions={{ hideArrow: isMobile }}
        styles={{
          tooltip: {
            border: '1px solid rgba(34, 211, 238, 0.4)',
            borderRadius: 10,
            boxShadow: '0 20px 50px rgba(8, 47, 73, 0.5)',
            maxWidth: 520,
            padding: 16,
          },
          tooltipContent: {
            padding: '0 0 12px',
          },
          buttonPrimary: {
            borderRadius: 8,
            color: '#06202a',
            fontWeight: 700,
          },
          buttonBack: {
            color: '#bae6fd',
            marginRight: 8,
          },
          buttonSkip: {
            color: '#94a3b8',
          },
        }}
      />

      {!isMobile && (
        <button
          type="button"
          onClick={() => setMuted((value) => !value)}
          className="fixed right-3 top-3 z-[91] rounded-lg border border-cyan-500/35 bg-page/95 px-3 py-2 text-xs font-semibold text-cyan-100 shadow-lg shadow-cyan-950/30"
        >
          {muted ? 'Audio off' : 'Audio on'}
        </button>
      )}

      {isMobile && run && isReady && (
        <>
          {mobileTargetRect && <MobileFocusRing rect={mobileTargetRect} />}
          <MobileDemoSheet
            onClose={close}
            onNext={goNext}
            onPrev={goPrev}
            step={step}
            stepIndex={stepIndex}
            totalSteps={script.length}
          />
        </>
      )}
    </>
  )
}
