import { ArrowLeft, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function SupportPage() {
  return (
    <div className="native-legal-page min-h-screen bg-page px-4 py-10 text-ink-soft sm:px-6 lg:px-8">
      <main className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link
            to="/"
            aria-label="Back to HealthyFlow"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            HealthyFlow
          </Link>
          <div className="flex items-center gap-4 text-sm text-ink-muted">
            <Link to="/privacy" className="transition-colors hover:text-ink-soft">Privacy</Link>
            <Link to="/terms" className="transition-colors hover:text-ink-soft">Terms</Link>
          </div>
        </div>

        <article className="rounded-2xl border border-line/50 bg-card/60 p-6 shadow-xl shadow-accent/5 sm:p-8">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-accent">HealthyFlow Support</p>
          <h1 className="mb-4 text-3xl font-bold text-ink sm:text-4xl">Support</h1>
          <p className="text-base leading-7 text-ink-soft">If you need help, contact us:</p>

          <a
            href="mailto:lermanori@gmail.com"
            className="mt-6 flex min-h-14 items-center gap-3 rounded-xl border border-line bg-raised/60 p-4 text-ink transition-colors hover:border-accent/50 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Mail className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <span>
              <span className="block text-sm text-ink-muted">Email</span>
              <span className="font-medium">lermanori@gmail.com</span>
            </span>
          </a>
        </article>
      </main>
    </div>
  )
}
