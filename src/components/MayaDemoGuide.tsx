import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react'

type DemoStep = {
  route: string
  target: string
  eyebrow: string
  title: string
  subtitle: string
}

const steps: DemoStep[] = [
  {
    route: '/',
    target: '[data-demo="main-content"]',
    eyebrow: 'Scene 1',
    title: "Maya's day starts messy",
    subtitle: 'The seeded workspace opens on Today with scheduled work, an Anytime backlog, habits, and one rolled-forward task from yesterday.',
  },
  {
    route: '/',
    target: '[data-demo="nav-today"]',
    eyebrow: 'Scene 2',
    title: 'Today is the command center',
    subtitle: 'Maya can keep timed work in Scheduled while low-pressure personal tasks stay in Anytime until she is ready to place them.',
  },
  {
    route: '/talk',
    target: '[data-demo="nav-talk"]',
    eyebrow: 'Scene 3',
    title: 'Talk helps with the messy middle',
    subtitle: 'Instead of maintaining a perfect system, Maya can ask what to do next, turn rough notes into items, or rebalance the day.',
  },
  {
    route: '/week',
    target: '[data-demo="nav-week-view"]',
    eyebrow: 'Scene 4',
    title: 'The week shows momentum',
    subtitle: 'HealthyFlow keeps the daily plan connected to weekly progress, so Maya can see what moved and what still needs attention.',
  },
  {
    route: '/',
    target: '[data-demo="main-content"]',
    eyebrow: 'Scene 5',
    title: 'Now take control',
    subtitle: "This is the real app, not a recording. You can close the guide, edit items, drag the day around, and explore Maya's workspace.",
  },
]

function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.95
  utterance.pitch = 1
  window.speechSynthesis.speak(utterance)
}

export default function MayaDemoGuide() {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(() => localStorage.getItem('mayaDemoGuide') === 'open')
  const [stepIndex, setStepIndex] = useState(0)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const step = steps[stepIndex]

  const isMayaDemo = useMemo(() => localStorage.getItem('demoPersona') === 'maya', [location.pathname])

  useEffect(() => {
    if (!isMayaDemo) return
    const shouldOpen = localStorage.getItem('mayaDemoGuide') === 'open'
    setOpen(shouldOpen)
  }, [isMayaDemo, location.pathname])

  useEffect(() => {
    if (!open || !step || location.pathname === step.route) return
    navigate(step.route)
  }, [location.pathname, navigate, open, step])

  useEffect(() => {
    if (!open || !step) return
    const updateRect = () => {
      const el = document.querySelector(step.target)
      setTargetRect(el?.getBoundingClientRect() ?? null)
    }
    const frame = window.requestAnimationFrame(updateRect)
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [location.pathname, open, step])

  useEffect(() => {
    if (!open || !voiceEnabled) return
    speak(`${step.title}. ${step.subtitle}`)
    return () => window.speechSynthesis?.cancel()
  }, [open, step, voiceEnabled])

  if (!isMayaDemo || !open) return null

  const close = () => {
    localStorage.setItem('mayaDemoGuide', 'closed')
    window.speechSynthesis?.cancel()
    setOpen(false)
  }

  const prev = () => setStepIndex((current) => Math.max(current - 1, 0))
  const next = () => {
    if (stepIndex === steps.length - 1) {
      close()
      return
    }
    setStepIndex((current) => current + 1)
  }

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
      {targetRect && (
        <div
          className="absolute rounded-2xl border-2 border-cyan-300 shadow-[0_0_0_9999px_rgba(0,0,0,.38),0_0_36px_rgba(34,211,238,.45)] transition-all duration-300"
          style={{
            left: Math.max(targetRect.left - 8, 8),
            top: Math.max(targetRect.top - 8, 8),
            width: Math.min(targetRect.width + 16, window.innerWidth - 16),
            height: Math.min(targetRect.height + 16, window.innerHeight - 16),
          }}
        />
      )}

      <div className="absolute inset-x-4 bottom-4 pointer-events-auto sm:bottom-6">
        <div className="mx-auto max-w-2xl rounded-2xl border border-cyan-500/30 bg-page/95 p-4 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">{step.eyebrow}</p>
              <h2 className="mt-1 text-xl font-bold text-ink sm:text-2xl">{step.title}</h2>
            </div>
            <button
              onClick={close}
              className="rounded-lg p-2 text-ink-muted transition hover:bg-card/70 hover:text-ink"
              aria-label="Close demo guide"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="text-sm leading-6 text-ink-soft sm:text-base">{step.subtitle}</p>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {steps.map((item, index) => (
                <button
                  key={item.title}
                  onClick={() => setStepIndex(index)}
                  className={`h-2.5 rounded-full transition-all ${index === stepIndex ? 'w-8 bg-cyan-300' : 'w-2.5 bg-line-strong'}`}
                  aria-label={`Go to ${item.eyebrow}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setVoiceEnabled((value) => !value)}
                className="inline-flex items-center gap-2 rounded-lg border border-line/70 px-3 py-2 text-sm text-ink-muted transition hover:border-cyan-500/40 hover:text-cyan-200"
              >
                {voiceEnabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                Voice
              </button>
              <button
                onClick={prev}
                disabled={stepIndex === 0}
                className="rounded-lg border border-line/70 p-2 text-ink-muted transition hover:border-cyan-500/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous demo step"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={next}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20"
              >
                {stepIndex === steps.length - 1 ? 'Explore' : 'Next'}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
