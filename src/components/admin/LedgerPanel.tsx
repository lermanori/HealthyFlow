import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Activity, Loader2, X } from 'lucide-react'
import { adminService, type LedgerFilter, type LedgerRow } from '../../services/api'

const FILTERS: Record<LedgerFilter, string> = {
  all: 'Everything',
  ai: 'AI calls',
  refund: 'Refunds',
  grant: 'Free grants',
  admin: 'Admin changes',
}

const when = (value: string) => new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
}).format(new Date(value))

const usd = (value: number) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
}).format(value)

const signed = (value: number) => (value > 0 ? `+${value}` : String(value))

/** What a row is, in plain words. */
function describe(row: LedgerRow) {
  switch (row.kind) {
    case 'ai':
      return `${row.endpoint ?? 'AI call'} · ${row.model ?? 'unknown model'}`
    case 'refund':
      return `Refunded failed ${row.endpoint ?? 'call'}`
    case 'grant':
      return row.reason === 'guest_initial_grant' ? 'Guest free actions' : 'Monthly free actions'
    case 'admin':
      return 'Balance set in Admin'
    case 'other':
      return row.reason ?? 'Ledger entry'
  }
}

function cost(row: LedgerRow) {
  if (row.costUsd != null) return usd(row.costUsd)
  return row.costUnknown ? 'Unknown' : '—'
}

export default function LedgerPanel({
  person,
  onPersonChange,
}: {
  // Controlled from outside so the rest of Admin can point the Ledger at someone.
  person: string
  onPersonChange: (userId: string) => void
}) {
  const [kind, setKind] = useState<LedgerFilter>('all')
  const ledger = useInfiniteQuery({
    queryKey: ['admin', 'ledger', kind, person],
    queryFn: ({ pageParam }) => adminService.getLedger({ kind, userId: person || undefined, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: page => page.nextOffset ?? undefined,
  })
  const rows = ledger.data?.pages.flatMap(page => page.rows) ?? []

  return (
    <section className="card" aria-labelledby="ledger-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-accent" />
          <h2 id="ledger-title" className="text-lg font-semibold text-ink">Ledger</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {person && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-1 font-mono text-xs text-accent">
              {person.slice(0, 8)}
              <button type="button" aria-label="Show everyone in the ledger" onClick={() => onPersonChange('')}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
          <select
            className="input-field w-44"
            aria-label="Filter ledger by kind"
            value={kind}
            onChange={event => setKind(event.target.value as LedgerFilter)}
          >
            {(Object.keys(FILTERS) as LedgerFilter[]).map(key => (
              <option key={key} value={key}>{FILTERS[key]}</option>
            ))}
          </select>
        </div>
      </div>

      {ledger.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the ledger…
        </div>
      ) : ledger.isError && rows.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <p className="text-state-danger">Could not load the ledger.</p>
          <button type="button" aria-label="Retry loading the ledger" onClick={() => void ledger.refetch()} className="btn-secondary text-sm">
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No ledger entries match.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-muted">
                  <th className="py-3 pr-4 font-medium">Time</th>
                  <th className="py-3 pr-4 font-medium">Person</th>
                  <th className="py-3 pr-4 font-medium">What</th>
                  <th className="py-3 pr-4 font-medium">Class</th>
                  <th className="py-3 pr-4 font-medium">Actions</th>
                  <th className="py-3 pr-4 font-medium">Balance after</th>
                  <th className="py-3 pr-4 font-medium">Cost</th>
                  <th className="py-3 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-card/80 text-ink-soft">
                    <td className="whitespace-nowrap py-3 pr-4">{when(row.createdAt)}</td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        className="text-left hover:text-ink"
                        aria-label={`Show only ${row.userEmail ?? `Guest ${row.userId.slice(0, 8)}`} in the ledger`}
                        onClick={() => onPersonChange(row.userId)}
                      >
                        <span className="block text-ink">{row.userEmail ?? row.userName ?? 'Unknown account'}</span>
                        <span className="block font-mono text-xs text-ink-muted">
                          {row.userEmail ? '' : 'Guest '}{row.userId.slice(0, 8)}
                        </span>
                      </button>
                    </td>
                    <td className="py-3 pr-4">{describe(row)}</td>
                    <td className="py-3 pr-4">{row.actionClass ?? '—'}</td>
                    <td className="py-3 pr-4">
                      <span className={row.creditsDelta < 0 ? 'text-state-danger' : row.creditsDelta > 0 ? 'text-state-success' : ''}>
                        {signed(row.creditsDelta)}
                      </span>
                      {row.legacyUnit && (
                        <span className="ml-2 rounded-full bg-state-warning/15 px-2 py-0.5 text-xs text-state-warning">old credit unit</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">{row.balanceAfter ?? '—'}</td>
                    <td className={`py-3 pr-4 ${row.costUnknown ? 'text-state-warning' : ''}`}>{cost(row)}</td>
                    <td className="py-3 text-xs text-ink-muted">{row.kind === 'admin' ? row.actorEmail ?? 'Unknown' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {ledger.hasNextPage && (
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => void ledger.fetchNextPage()}
                disabled={ledger.isFetchingNextPage}
              >
                {ledger.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            )}
            {ledger.isFetchNextPageError && <p className="text-sm text-state-danger">Could not load more entries.</p>}
          </div>
        </>
      )}
    </section>
  )
}
