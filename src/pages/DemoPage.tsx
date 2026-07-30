import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  Mail,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import {
  beginDemoAcquisition,
  demoPersonaById,
  demoPersonas,
  demoSignupSearch,
  parseDemoPersonaId,
  readDemoAcquisition,
  type DemoAcquisition,
  type DemoPersonaId,
} from '../demoPersonas'
import { analytics } from '../lib/analytics'
import { waitlistService, type SignupStatus } from '../services/api'

function DemoBrand({ action, actionLabel }: { action: () => void; actionLabel: string }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line/70 px-5 py-5 sm:px-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-action">
          <Brain className="h-6 w-6 text-on-action" />
        </div>
        <div>
          <p className="text-lg font-bold text-ink">HealthyFlow</p>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">Value preview</p>
        </div>
      </div>
      <button
        type="button"
        onClick={action}
        className="min-h-11 rounded-control border border-line px-4 text-sm font-semibold text-ink-muted transition-colors hover:border-accent/50 hover:text-ink"
      >
        {actionLabel}
      </button>
    </header>
  )
}

function demoPickerSearch(acquisition: DemoAcquisition) {
  const params = new URLSearchParams({ source: acquisition.entrySource })
  if (acquisition.utmSource) params.set('utm_source', acquisition.utmSource)
  if (acquisition.utmMedium) params.set('utm_medium', acquisition.utmMedium)
  if (acquisition.utmCampaign) params.set('utm_campaign', acquisition.utmCampaign)
  return params.toString()
}

function DemoValueProof({
  acquisition,
  onExit,
  persona,
}: {
  acquisition: DemoAcquisition
  onExit: () => void
  persona: DemoPersonaId
}) {
  const navigate = useNavigate()
  const {
    hasDemoReturnSession,
    isDemoSession,
    startDemoSession,
    user,
  } = useAuth()
  const meta = demoPersonaById(persona)
  const Icon = meta.icon
  const viewed = useRef(false)
  const [openingWorkspace, setOpeningWorkspace] = useState(false)
  const hasWorkspaceToReturn = hasDemoReturnSession || Boolean(user && !isDemoSession)

  useEffect(() => {
    if (viewed.current) return
    viewed.current = true
    analytics.capture('demo_value_proof_viewed', {
      persona,
      entry_source: acquisition.entrySource,
    })
  }, [acquisition.entrySource, persona])

  const continueToOutcome = () => {
    analytics.capture('demo_value_proof_completed', {
      persona,
      destination: 'outcome',
    })
    navigate(`/demo?persona=${persona}&stage=finish&reason=finished`)
  }

  const exploreWorkspace = async () => {
    setOpeningWorkspace(true)
    analytics.capture('demo_value_proof_completed', {
      persona,
      destination: 'workspace',
    })
    try {
      // Always refresh the selected persona. Reusing an existing demo session can
      // otherwise show stale or different persona data after a date change.
      await startDemoSession(persona)
      navigate(`/?demo=${persona}`, { replace: true })
    } catch {
      // startDemoSession surfaces the API error.
    } finally {
      setOpeningWorkspace(false)
    }
  }

  return (
    <div className="min-h-screen bg-page text-ink">
      <DemoBrand
        action={onExit}
        actionLabel={hasWorkspaceToReturn ? 'Return to workspace' : 'Leave preview'}
      />

      <main className="mx-auto max-w-3xl px-5 pb-16 pt-7 sm:px-8 sm:pb-20 sm:pt-10">
        <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold uppercase tracking-[0.1em] sm:text-xs">
          <div className="rounded-full border border-state-success/35 bg-state-success/10 px-2 py-2 text-state-success">
            1 · Picked
          </div>
          <div className="rounded-full border border-accent/50 bg-accent/10 px-2 py-2 text-accent">
            2 · See value
          </div>
          <div className="rounded-full border border-line px-2 py-2 text-ink-muted">
            3 · Make yours
          </div>
        </div>

        <section className="mt-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Icon className="h-6 w-6" />
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-accent">
            {meta.name} · {meta.role}
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-5xl">
            {meta.valueHeadline}
          </h1>
          <p className="mt-4 text-base leading-7 text-ink-muted sm:text-lg">
            {meta.valueCopy}
          </p>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-line bg-card shadow-section">
          <div className="border-b border-line px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">What changed</p>
          </div>
          <div className="divide-y divide-line">
            {meta.transformation.map(([before, after], index) => (
              <div key={before} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 px-5 py-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-sm font-black text-accent">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm text-ink-muted line-through">{before}</p>
                  <div className="mt-1 flex items-start gap-2">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <p className="font-semibold text-ink">{after}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-accent/30 bg-accent/[0.06] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">
            The proof in {meta.name}&apos;s day
          </p>
          <div className="mt-4 space-y-3">
            {meta.proof.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-page/70 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">{label}</p>
                <p className="mt-1 font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-line bg-sunken/35 p-5">
          <p className="text-sm font-bold text-accent">That&apos;s the whole preview.</p>
          <h2 className="mt-2 text-2xl font-bold">The value is clear before asking you to explore.</h2>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            The real workspace is optional. Continue to make this outcome yours, or open {meta.name}&apos;s workspace if you want to inspect it.
          </p>
          <button
            type="button"
            onClick={continueToOutcome}
            className="btn-primary mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 px-5"
          >
            Continue to {meta.name}&apos;s outcome
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={openingWorkspace}
            onClick={() => void exploreWorkspace()}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-control px-4 text-sm font-semibold text-ink-muted hover:bg-raised hover:text-ink disabled:opacity-60"
          >
            {openingWorkspace ? 'Opening workspace…' : `Explore ${meta.name}'s workspace instead`}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/demo?${demoPickerSearch(acquisition)}`)}
            className="mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-control px-4 text-sm font-semibold text-ink-muted hover:text-ink"
          >
            Choose a different story
          </button>
        </section>
      </main>
    </div>
  )
}

function DemoOutcome({
  acquisition,
  persona,
}: {
  acquisition: DemoAcquisition
  persona: DemoPersonaId
}) {
  const navigate = useNavigate()
  const {
    hasDemoReturnSession,
    isDemoSession,
    leaveDemoSession,
    startDemoSession,
    user,
  } = useAuth()
  const meta = demoPersonaById(persona)
  const [signupStatus, setSignupStatus] = useState<SignupStatus | null>(null)
  const [statusError, setStatusError] = useState(false)
  const [email, setEmail] = useState('')
  const [waitlistError, setWaitlistError] = useState('')
  const [waitlistJoined, setWaitlistJoined] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [openingDemo, setOpeningDemo] = useState(false)
  const hasWorkspaceToReturn = hasDemoReturnSession || Boolean(user && !isDemoSession)

  const loadSignupStatus = () => {
    setStatusError(false)
    setSignupStatus(null)
    waitlistService.signupStatus()
      .then(setSignupStatus)
      .catch(() => setStatusError(true))
  }

  useEffect(() => {
    if (!hasWorkspaceToReturn) loadSignupStatus()
  }, [hasWorkspaceToReturn])

  const returnToWorkspace = async () => {
    analytics.capture('demo_acquisition_clicked', {
      persona,
      destination: 'return',
      access_mode: hasDemoReturnSession ? 'restored_session' : 'existing_session',
    })
    if (hasDemoReturnSession) await leaveDemoSession()
    navigate('/', { replace: true })
  }

  const openSignup = async () => {
    analytics.capture('demo_acquisition_clicked', {
      persona,
      destination: 'signup',
      access_mode: 'open',
    })
    await leaveDemoSession()
    navigate(`/login?${demoSignupSearch(acquisition)}`, { replace: true })
  }

  const submitWaitlist = async (event: React.FormEvent) => {
    event.preventDefault()
    setWaitlistError('')
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setWaitlistError('Enter your email address.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setWaitlistError('Enter a valid email address.')
      return
    }

    setSubmitting(true)
    analytics.capture('demo_acquisition_clicked', {
      persona,
      destination: 'waitlist',
      access_mode: 'waitlist',
    })
    try {
      await waitlistService.join({
        email: normalizedEmail,
        source: `demo-${persona}`,
        utmSource: acquisition.utmSource,
        utmMedium: acquisition.utmMedium,
        utmCampaign: acquisition.utmCampaign,
      })
      analytics.capture('waitlist_submitted', { source: 'demo', persona })
      setWaitlistJoined(true)
    } catch {
      setWaitlistError('Something went wrong — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const keepExploring = async () => {
    setOpeningDemo(true)
    try {
      await startDemoSession(persona)
      navigate(`/?demo=${persona}`, { replace: true })
    } catch {
      // startDemoSession already surfaces the API error.
    } finally {
      setOpeningDemo(false)
    }
  }

  const tryAnother = () => {
    navigate(`/demo?${demoPickerSearch(acquisition)}`, { replace: true })
  }

  return (
    <div className="min-h-screen bg-page text-ink">
      <DemoBrand
        action={hasWorkspaceToReturn ? returnToWorkspace : () => void keepExploring()}
        actionLabel={hasWorkspaceToReturn ? 'Return to workspace' : 'Keep exploring'}
      />

      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-section">
          <div className="p-6 sm:p-9">
            <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
              <meta.icon className="h-7 w-7" />
            </div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-accent">{meta.name}&apos;s outcome</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-ink sm:text-5xl">
              {meta.outcome}.
            </h1>

            <div className="mt-8 space-y-4">
              {meta.transformation.map(([before, after]) => (
                <div key={before} className="grid items-center gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:text-base">
                  <span className="text-ink-muted line-through">{before}</span>
                  <ArrowRight className="h-5 w-5 text-accent" aria-hidden="true" />
                  <span className="font-medium text-ink">{after}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-line bg-sunken/35 p-6 sm:p-9">
            {hasWorkspaceToReturn ? (
              <>
                <p className="text-sm font-bold text-accent">Your workspace is waiting</p>
                <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">Return with your real session unchanged.</h2>
                <p className="mt-3 max-w-2xl text-ink-muted">
                  The demo stayed isolated. Your settings, Items, Habits, and Health records were not touched.
                </p>
                <button
                  type="button"
                  onClick={() => void returnToWorkspace()}
                  className="btn-primary mt-6 inline-flex min-h-12 items-center justify-center gap-2 px-6"
                >
                  Return to my workspace
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-accent">Now make it yours</p>
                <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">Your workspace starts clean.</h2>
                <p className="mt-3 max-w-2xl text-ink-muted">
                  We carry the reason you chose this demo into your first prompt—never {meta.name}&apos;s Items or records.
                </p>

                {signupStatus?.mode === 'open' && (
                  <div className="mt-6 rounded-section border border-accent/35 bg-accent/[.07] p-5">
                    <p className="font-semibold text-ink">Public signup is open</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      Start with “{meta.activationPrompt}”
                    </p>
                    <button
                      type="button"
                      onClick={() => void openSignup()}
                      className="btn-primary mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 px-6 sm:w-auto"
                    >
                      {meta.outcome}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}

                {signupStatus?.mode === 'waitlist' && (
                  <div className="mt-6 rounded-section border border-accent/35 bg-accent/[.07] p-5">
                    {waitlistJoined ? (
                      <div role="status" className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-state-success" />
                        <div>
                          <p className="font-semibold text-ink">You&apos;re on the list.</p>
                          <p className="mt-1 text-sm text-ink-muted">We&apos;ll email you when a spot opens.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="font-semibold text-ink">HealthyFlow is invite-only right now</p>
                        <p className="mt-1 text-sm text-ink-muted">Join for early access to build your own version of this day.</p>
                        <form onSubmit={submitWaitlist} noValidate className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <label htmlFor="demo-waitlist-email" className="sr-only">Email address</label>
                          <div className="relative min-w-0 flex-1">
                            <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                            <input
                              id="demo-waitlist-email"
                              type="email"
                              value={email}
                              onChange={(event) => setEmail(event.target.value)}
                              placeholder="you@example.com"
                              autoComplete="email"
                              className="input-field min-h-12 pl-12"
                            />
                          </div>
                          <button type="submit" disabled={submitting} className="btn-primary min-h-12 px-6">
                            {submitting ? 'Joining…' : 'Join the waitlist'}
                          </button>
                        </form>
                        {waitlistError && <p role="alert" className="mt-3 text-sm text-state-danger">{waitlistError}</p>}
                      </>
                    )}
                  </div>
                )}

                {!signupStatus && !statusError && (
                  <div className="mt-6 flex items-center gap-3 rounded-section border border-line bg-raised/50 p-5 text-sm text-ink-muted" role="status">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
                    Checking signup availability…
                  </div>
                )}

                {statusError && (
                  <div className="mt-6 rounded-section border border-state-warning/40 bg-state-warning/10 p-5">
                    <p className="text-sm text-ink">We couldn&apos;t check signup availability.</p>
                    <button type="button" onClick={loadSignupStatus} className="mt-3 text-sm font-semibold text-accent">
                      Try again
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="mt-7 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row">
              <button
                type="button"
                disabled={openingDemo}
                onClick={() => void keepExploring()}
                className="btn-secondary inline-flex min-h-11 items-center justify-center gap-2 px-4"
              >
                {openingDemo ? 'Opening…' : 'Keep exploring the real demo'}
              </button>
              <button
                type="button"
                onClick={tryAnother}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold text-ink-muted hover:bg-raised hover:text-ink"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Try another day
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default function DemoPage() {
  const { hasDemoReturnSession, isDemoSession, leaveDemoSession, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const requestedPersona = parseDemoPersonaId(params.get('persona'))
  const proving = params.get('stage') === 'proof'
  const finishing = params.get('stage') === 'finish'
  const [selectedPersona, setSelectedPersona] = useState<DemoPersonaId>(requestedPersona)
  const pickerViewed = useRef(false)
  const selected = demoPersonaById(selectedPersona)
  const existingAcquisition = readDemoAcquisition()
  const entrySource = params.get('source') ?? existingAcquisition?.entrySource ?? 'direct'
  const acquisition = proving || finishing
    ? beginDemoAcquisition(requestedPersona, params)
    : null

  useEffect(() => {
    if (proving || finishing || pickerViewed.current) return
    pickerViewed.current = true
    analytics.capture('demo_picker_viewed', { entry_source: entrySource })
  }, [entrySource, finishing, proving])

  const startPersona = (persona: DemoPersonaId) => {
    beginDemoAcquisition(persona, params)
    navigate(`/demo?persona=${persona}&stage=proof`)
  }

  const leavePicker = async () => {
    if (isDemoSession) {
      const restored = await leaveDemoSession()
      navigate(restored ? '/' : '/login', { replace: true })
      return
    }
    navigate(user ? '/' : '/login')
  }

  if (finishing && acquisition) {
    return <DemoOutcome acquisition={acquisition} persona={requestedPersona} />
  }

  if (proving && acquisition) {
    return (
      <DemoValueProof
        acquisition={acquisition}
        onExit={() => void leavePicker()}
        persona={requestedPersona}
      />
    )
  }

  return (
    <div className="min-h-screen overflow-hidden bg-page text-ink">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-10rem] top-[-8rem] h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute bottom-[-10rem] right-[-8rem] h-[28rem] w-[28rem] rounded-full bg-action/10 blur-3xl" />
      </div>

      <div className="relative mx-auto min-h-screen max-w-6xl">
        <DemoBrand
          action={() => void leavePicker()}
          actionLabel={hasDemoReturnSession || (user && !isDemoSession) ? 'Return to workspace' : 'Sign in'}
        />

        <main className="px-5 py-10 sm:px-8 sm:py-14">
          <div className="mx-auto max-w-3xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-sm font-semibold text-accent"
            >
              <Sparkles className="h-4 w-4" />
              Try a day like yours
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 }}
              className="text-4xl font-bold leading-tight text-ink sm:text-5xl"
            >
              Which kind of day sounds familiar?
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-ink-muted"
            >
              Choose the problem, not a product tour. Each story shows one believable change in about 30 seconds.
            </motion.p>
          </div>

          <section className="mt-10 grid gap-5 lg:grid-cols-[1.08fr_.92fr]">
            <div className="grid gap-3">
              {demoPersonas.map((persona) => {
                const Icon = persona.icon
                const isSelected = selectedPersona === persona.id
                return (
                  <button
                    key={persona.id}
                    type="button"
                    onMouseEnter={() => setSelectedPersona(persona.id)}
                    onFocus={() => setSelectedPersona(persona.id)}
                    onClick={() => startPersona(persona.id)}
                    className={`group min-h-[9rem] rounded-section border p-5 text-left transition ${
                      isSelected
                        ? 'border-accent/70 bg-accent/10 shadow-section'
                        : 'border-line bg-card/60 hover:border-accent/45 hover:bg-card'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">
                        <Icon className="h-6 w-6" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-3">
                          <span>
                            <span className="block text-xl font-bold text-ink">{persona.problem}</span>
                            <span className="mt-1 block text-sm text-ink-muted">{persona.copy}</span>
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            {persona.duration}
                          </span>
                        </span>
                        <span className="mt-4 flex items-center justify-between gap-3 text-sm font-semibold text-accent">
                          <span>See {persona.name}&apos;s change</span>
                          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            <motion.aside
              key={selected.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-fit rounded-2xl border border-line bg-card/75 p-5 shadow-section lg:sticky lg:top-6"
            >
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">What you&apos;ll see</p>
              <h2 className="mt-2 text-2xl font-bold text-ink">{selected.copy}</h2>
              <p className="mt-2 text-sm text-ink-muted">
                A short proof of how HealthyFlow changes this kind of day. The real workspace stays optional.
              </p>
              <div className="mt-5 space-y-3">
                {selected.preview.slice(0, 4).map(([time, title]) => (
                  <div key={title} className="flex items-center gap-3 rounded-control border border-line/70 bg-sunken/35 p-3">
                    <span className="w-14 shrink-0 text-xs font-semibold text-accent">{time}</span>
                    <span className="min-w-0 flex-1 text-sm text-ink-soft">{title}</span>
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-state-success" />
                  </div>
                ))}
              </div>
            </motion.aside>
          </section>
        </main>
      </div>
    </div>
  )
}
