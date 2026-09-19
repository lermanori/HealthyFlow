import { useQuery } from '@tanstack/react-query'
import { Loader2, ShieldAlert } from 'lucide-react'
import { adminService, type AdminGuards } from '../../services/api'

const RUNBOOK = 'https://github.com/lermanori/HealthyFlow/blob/main/docs/runbooks/cost-guards.md'

const usd = (value: number) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value)

function refused(guards: AdminGuards, ...codes: string[]) {
  if (guards.refusalsToday.state !== 'ok') return 'Refusals unavailable'
  const byCode = guards.refusalsToday.byCode
  const total = codes.reduce((sum, code) => sum + (byCode[code] ?? 0), 0)
  return `${total} refused today`
}

function Row({ name, limit, state, warn }: { name: string; limit: string; state?: React.ReactNode; warn?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-line/60 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-4">
      <p className="text-sm text-ink">{name}</p>
      <p className="text-sm text-ink-soft">{limit}</p>
      <div className={`text-xs ${warn ? 'text-state-warning' : 'text-ink-muted'}`}>{state}</div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-ink-soft">{title}</h3>
      <div>{children}</div>
    </div>
  )
}

function Guards({ guards }: { guards: AdminGuards }) {
  const { limits } = guards
  const ceiling = limits.globalDailyCeilingUsd
  const spent = guards.spentToday.state === 'ok' ? guards.spentToday.usd : null
  const entry = limits.entry
  const perWindow = (limit: { max: number; windowMinutes: number }) => `${limit.max} per ${limit.windowMinutes} min`

  return (
    <>
      <Group title="Every AI action, checked in order before anything is spent">
        <Row name="Request size" limit={`${limits.requestChars.toLocaleString()} characters`} state={refused(guards, 'prompt_too_large')} />
        <Row name="Images per request" limit={String(limits.imagesPerRequest)} state={refused(guards, 'too_many_images')} />
        <Row name="Model allowlist" limit={`${limits.pricedModels.length} priced models`} state={limits.pricedModels.join(', ')} />
        <Row
          name="Global spending ceiling"
          limit={`${usd(ceiling)} per UTC day`}
          warn={spent !== null && spent >= ceiling * 0.8}
          state={spent === null ? 'Today’s spend unavailable' : (
            <div className="space-y-1">
              <p>{usd(spent)} of {usd(ceiling)} spent today · {refused(guards, 'global_ceiling')}</p>
              <div className="h-1.5 w-full rounded-full bg-line/60" role="meter" aria-label="Share of the daily ceiling spent" aria-valuemin={0} aria-valuemax={ceiling} aria-valuenow={spent}>
                <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.min(100, (spent / ceiling) * 100)}%` }} />
              </div>
            </div>
          )}
        />
        <Row
          name="Per-account daily cap"
          limit={`${limits.accountDailyActions} actions a day`}
          warn={guards.nearCap.state === 'ok' && guards.nearCap.accounts.length > 0}
          state={guards.nearCap.state !== 'ok' ? 'Accounts near the cap unavailable' : (
            <>
              <p>{refused(guards, 'account_daily_cap')}</p>
              {guards.nearCap.accounts.length === 0
                ? <p>No account at {limits.nearCapActions}+ today</p>
                : guards.nearCap.accounts.map(account => (
                  <p key={account.userId}>{account.email ?? `Guest ${account.userId.slice(0, 8)}`} · {account.actions}</p>
                ))}
            </>
          )}
        />
        <Row
          name="Free allowance"
          limit={`Guest ${limits.guestActions} once · account ${limits.monthlyActions} a month`}
          state={guards.guestsWithoutGrantToday.state !== 'ok'
            ? 'Network grants unavailable'
            : `${guards.guestsWithoutGrantToday.count} Guests today without the network grant (${limits.guestNetworkWindowHours}h window) · ${refused(guards, 'account_required', 'email_unverified')}`}
        />
        <Row
          name="Balance, taken atomically"
          limit={`text ${limits.actionPrice.text} · photo ${limits.actionPrice.photo} · premium ${limits.actionPrice.premium}`}
          state={refused(guards, 'insufficient_credits')}
        />
        <Row name="Talk tool loop" limit={`${limits.toolLoopModelCalls} model calls per action`} />
        <Row name="Billing reads" limit="Refuse when a grant or balance read fails" state={refused(guards, 'billing_unavailable')} />
      </Group>

      <Group title="Entry, per network address">
        <Row name="Start as Guest" limit={perWindow(entry.guestStart)} />
        <Row name="Create account" limit={perWindow(entry.signup)} />
        <Row name="Google / Apple sign-in" limit={perWindow(entry.providerSignIn)} />
        <Row name="Password reset request" limit={perWindow(entry.recoveryRequest)} />
        <Row name="Password reset use" limit={perWindow(entry.recoveryRedeem)} />
        <Row name="Delete account" limit={perWindow(entry.accountDelete)} />
        <Row name="Disabled accounts" limit="Refused on every request" />
      </Group>

      <Group title="At OpenAI, set by hand">
        {['Monthly hard limit', 'Soft limit and usage alerts', 'Project-scoped API key'].map(name => (
          <Row key={name} name={name} limit="Not visible to the app" state={<a className="text-accent underline" href={RUNBOOK} target="_blank" rel="noreferrer">Check the OpenAI console · runbook</a>} />
        ))}
      </Group>
    </>
  )
}

export default function GuardsPanel() {
  const guardsQuery = useQuery({ queryKey: ['admin', 'guards'], queryFn: adminService.getGuards })

  return (
    <section className="card" aria-labelledby="guards-title">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 text-accent" />
        <h2 id="guards-title" className="text-lg font-semibold text-ink">Guards</h2>
      </div>
      <p className="mt-1 text-xs text-ink-muted">Limits come from the server&apos;s own settings. “Today” is the UTC day.</p>

      {guardsQuery.isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading guards…
        </div>
      ) : guardsQuery.isError || !guardsQuery.data ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <p className="text-state-danger">Could not load the guards.</p>
          <button type="button" aria-label="Retry loading the guards" onClick={() => void guardsQuery.refetch()} className="btn-secondary text-sm">
            Retry
          </button>
        </div>
      ) : (
        <Guards guards={guardsQuery.data} />
      )}
    </section>
  )
}
