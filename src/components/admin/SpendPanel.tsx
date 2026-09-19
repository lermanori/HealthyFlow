import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Loader2 } from 'lucide-react'
import { adminService, type SpendSummary } from '../../services/api'

type Period = 'today' | 'thisWeek' | 'thisMonth'

const PERIODS: Record<Period, string> = {
  today: 'Today',
  thisWeek: 'This week',
  thisMonth: 'This month',
}

const usd = (value: number) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
}).format(value)

const count = (value: number) => new Intl.NumberFormat().format(value)
const signed = (value: number) => (value > 0 ? `+${count(value)}` : count(value))

function Card({ label, value, detail, warn }: { label: string; value: string; detail: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-line/50 bg-page/70 p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold text-accent">{value}</p>
      <p className={`mt-1 text-xs ${warn ? 'text-state-warning' : 'text-ink-muted'}`}>{detail}</p>
    </div>
  )
}

function Summary({ summary, period }: { summary: SpendSummary; period: Period }) {
  const { text, photo, premium } = summary.actions
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          label="Recorded OpenAI cost"
          value={usd(summary.costUsd)}
          detail={summary.uncostedCalls > 0
            ? `${count(summary.uncostedCalls)} of ${count(summary.requests)} AI calls have an unknown cost`
            : `${count(summary.requests)} AI calls`}
          warn={summary.uncostedCalls > 0}
        />
        <Card
          label="Actions charged"
          value={count(text.credits + photo.credits + premium.credits)}
          detail={`text ${count(text.count)} · photo ${count(photo.count)} · premium ${count(premium.count)}`}
        />
        <Card label="Refunded attempts" value={count(summary.refundedAttempts)} detail="Failed actions given back" />
        <Card
          label="Free actions granted"
          value={count(summary.freeGranted.guest + summary.freeGranted.monthly)}
          detail={`Guest ${count(summary.freeGranted.guest)} · monthly ${count(summary.freeGranted.monthly)}`}
        />
        <Card
          label="Admin balance changes"
          value={count(summary.adminChanges.count)}
          detail={`Net ${signed(summary.adminChanges.net)} actions — not spending`}
        />
      </div>
      {period === 'thisMonth' && (
        <p className="text-sm text-ink-muted">
          Recorded this month: <span className="font-medium text-ink">{usd(summary.costUsd)}</span>. Compare it with
          OpenAI&apos;s usage page for the same UTC month; a gap means spend the ledger did not see.
        </p>
      )}
      {summary.legacyUnitRows > 0 && (
        <p className="text-sm text-ink-muted">
          {count(summary.legacyUnitRows)} AI calls here predate actions (ADR-0016) and are left out of the action counts.
        </p>
      )}
    </div>
  )
}

export default function SpendPanel() {
  const [period, setPeriod] = useState<Period>('today')
  const [includeTest, setIncludeTest] = useState(false)
  const spendQuery = useQuery({
    queryKey: ['admin', 'spend', includeTest],
    queryFn: () => adminService.getSpend(includeTest),
  })

  return (
    <section className="card space-y-4" aria-labelledby="spend-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-accent" />
            <h2 id="spend-title" className="text-lg font-semibold text-ink">Spend</h2>
          </div>
          <p className="mt-1 text-xs text-ink-muted">Periods are UTC. Cost is what the ledger recorded, not recomputed.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={includeTest} onChange={event => setIncludeTest(event.target.checked)} />
            Include test accounts
          </label>
          <div className="flex rounded-lg border border-line/70 bg-page/80 p-1">
            {(Object.keys(PERIODS) as Period[]).map(key => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                aria-pressed={period === key}
                className={`rounded-md px-3 py-2 text-sm transition-colors ${
                  period === key ? 'bg-accent/20 text-accent' : 'text-ink-muted hover:text-ink-soft'
                }`}
              >
                {PERIODS[key]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {spendQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading spend…
        </div>
      ) : spendQuery.isError || !spendQuery.data ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <p className="text-state-danger">Could not load spend.</p>
          <button type="button" aria-label="Retry loading spend" onClick={() => void spendQuery.refetch()} className="btn-secondary text-sm">
            Retry
          </button>
        </div>
      ) : (
        <Summary summary={spendQuery.data[period]} period={period} />
      )}
    </section>
  )
}
