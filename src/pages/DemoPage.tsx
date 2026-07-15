import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Brain, CalendarClock, CheckCircle2, Clock, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { demoPersonaById, demoPersonas, type DemoPersonaId } from '../demoPersonas'

export default function DemoPage() {
  const { startDemoSession } = useAuth()
  const navigate = useNavigate()
  const [loadingPersona, setLoadingPersona] = useState<DemoPersonaId | null>(null)
  const [selectedPersona, setSelectedPersona] = useState<DemoPersonaId>('maya')
  const selected = demoPersonaById(selectedPersona)

  const startPersona = async (persona: DemoPersonaId) => {
    setLoadingPersona(persona)
    try {
      await startDemoSession(persona)
      navigate(`/?demo=${persona}`, { replace: true })
    } finally {
      setLoadingPersona(null)
    }
  }

  return (
    <div className="min-h-screen overflow-hidden bg-page text-ink">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute left-[-10rem] top-[-8rem] h-96 w-96 rounded-full bg-cyan-500/12 blur-3xl" />
        <div className="absolute bottom-[-10rem] right-[-8rem] h-[28rem] w-[28rem] rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600">
              <Brain className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-lg font-bold text-ink">HealthyFlow</p>
              <p className="text-xs text-cyan-300">Choose a story</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="rounded-lg border border-line/70 px-4 py-2 text-sm text-ink-muted transition hover:border-cyan-500/40 hover:text-cyan-200"
          >
            Sign in
          </button>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-sm text-cyan-200"
            >
              <Sparkles className="h-4 w-4" />
              Persona demo picker
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="max-w-3xl text-4xl font-bold leading-tight text-ink sm:text-5xl lg:text-6xl"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Pick a relatable day and watch HealthyFlow handle it.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-5 max-w-2xl text-lg leading-8 text-ink-muted"
            >
              Choose a guided workspace seeded around a real day. Each story walks through existing HealthyFlow surfaces with stable demo data.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mt-8 grid gap-3 sm:grid-cols-2"
            >
              {demoPersonas.map((persona) => {
                const Icon = persona.icon
                const isSelected = selectedPersona === persona.id
                const isLoading = loadingPersona === persona.id
                return (
                  <button
                    key={persona.id}
                    onMouseEnter={() => setSelectedPersona(persona.id)}
                    onFocus={() => setSelectedPersona(persona.id)}
                    onClick={() => startPersona(persona.id)}
                    disabled={loadingPersona !== null}
                    className={`group min-h-[8.5rem] rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                      isSelected
                        ? 'border-cyan-400/60 bg-cyan-500/15 shadow-lg shadow-cyan-950/20'
                        : 'border-line/70 bg-card/45 hover:border-cyan-500/40 hover:bg-card/70'
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-200">
                          <Icon className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="font-semibold text-ink">{persona.name}</p>
                          <p className="text-xs text-ink-muted">{persona.role}</p>
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 shrink-0 text-cyan-300 transition group-hover:translate-x-0.5" />
                    </div>
                    <p className="text-sm leading-6 text-ink-soft">{persona.copy}</p>
                    {isLoading && <p className="mt-2 text-xs font-semibold text-cyan-300">Loading...</p>}
                  </button>
                )
              })}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.12 }}
            className="rounded-2xl border border-line/70 bg-card/70 p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur"
          >
            <div className="rounded-xl border border-line/70 bg-sunken/50 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-ink-muted">Selected persona</p>
                  <h2 className="text-2xl font-bold text-ink">{selected.fullName}</h2>
                </div>
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200">
                  {selected.role.replace('The ', '')}
                </span>
              </div>
              <div className="space-y-3">
                {selected.preview.map(([time, title]) => (
                  <div key={title} className="flex items-center gap-3 rounded-lg border border-line/60 bg-page/45 p-3">
                    <span className="w-16 shrink-0 text-xs font-semibold text-cyan-300">{time}</span>
                    <span className="min-w-0 flex-1 text-sm text-ink-soft">{title}</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line/70 bg-sunken/35 p-4">
                <Clock className="mb-3 h-5 w-5 text-cyan-300" />
                <p className="text-sm font-semibold text-ink">Guided narration</p>
                <p className="mt-1 text-sm text-ink-muted">Subtitles and browser voiceover walk through the real app.</p>
              </div>
              <div className="rounded-xl border border-line/70 bg-sunken/35 p-4">
                <CalendarClock className="mb-3 h-5 w-5 text-cyan-300" />
                <p className="text-sm font-semibold text-ink">Always current</p>
                <p className="mt-1 text-sm text-ink-muted">Maya's workspace is seeded relative to today's date.</p>
              </div>
            </div>
          </motion.div>
        </section>
      </main>
    </div>
  )
}
