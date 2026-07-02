import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Coins, Loader2, Mail, RotateCcw, Save, Settings, UserCog, Activity, BadgeDollarSign, Gift } from 'lucide-react'
import toast from 'react-hot-toast'
import { tokenManagerService, TokenManagerTotals } from '../services/api'

type RangeKey = 'today' | 'thisWeek' | 'thisMonth'
type ContactStatusFilter = 'pending' | 'handled' | 'all'

const rangeLabels: Record<RangeKey, string> = {
  today: 'Today',
  thisWeek: 'This week',
  thisMonth: 'This month',
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat().format(value ?? 0)
}

function formatUsd(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value ?? 0)
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function SummaryCards({ totals }: { totals: TokenManagerTotals }) {
  const cards = [
    ['Requests', totals.requestCount],
    ['OpenAI cost', totals.openAiCostUsd],
    ['Base app tokens', totals.baseTokens],
    ['Charged to user', totals.billedTokens],
  ] as const

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-gray-700/50 bg-gray-900/70 p-4">
          <p className="text-xs text-gray-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-cyan-300">
            {label === 'OpenAI cost' ? formatUsd(value) : formatNumber(value)}
          </p>
        </div>
      ))}
    </div>
  )
}

export default function TokenManagerPage() {
  const queryClient = useQueryClient()
  const [selectedRange, setSelectedRange] = useState<RangeKey>('today')
  const [balanceDrafts, setBalanceDrafts] = useState<Record<string, string>>({})
  const [topUpDrafts, setTopUpDrafts] = useState<Record<string, string>>({})
  const [markupPercent, setMarkupPercent] = useState('25')
  const [minMarkupTokens, setMinMarkupTokens] = useState('5')
  const [promoActive, setPromoActive] = useState(true)
  const [contactStatus, setContactStatus] = useState<ContactStatusFilter>('pending')

  const overviewQuery = useQuery({
    queryKey: ['token-manager-overview'],
    queryFn: tokenManagerService.getOverview,
  })

  const contactMessagesQuery = useQuery({
    queryKey: ['token-manager-contact-messages', contactStatus],
    queryFn: () => tokenManagerService.getContactMessages(contactStatus),
  })

  const overview = overviewQuery.data
  const contactMessages = contactMessagesQuery.data ?? []

  useEffect(() => {
    if (!overview) return
    setBalanceDrafts(Object.fromEntries(overview.users.map(user => [user.id, String(user.balance)])))
    setTopUpDrafts(Object.fromEntries(overview.users.map(user => [user.id, '1'])))
    setMarkupPercent(String(Math.round(overview.settings.markupRate * 10000) / 100))
    setMinMarkupTokens(String(overview.settings.minMarkupTokens))
    setPromoActive(overview.subscriptionPricing.promoActive)
  }, [overview])

  const setBalanceMutation = useMutation({
    mutationFn: ({ userId, balance }: { userId: string; balance: number }) =>
      tokenManagerService.setUserBalance(userId, balance),
    onSuccess: () => {
      toast.success('Balance updated')
      queryClient.invalidateQueries({ queryKey: ['token-manager-overview'] })
    },
    onError: () => toast.error('Failed to update balance'),
  })

  const settingsMutation = useMutation({
    mutationFn: () => tokenManagerService.updateSettings({
      markupRate: Number(markupPercent) / 100,
      minMarkupTokens: Number(minMarkupTokens),
    }),
    onSuccess: () => {
      toast.success('Billing settings updated')
      queryClient.invalidateQueries({ queryKey: ['token-manager-overview'] })
    },
    onError: () => toast.error('Failed to update billing settings'),
  })

  const subscriptionPricingMutation = useMutation({
    mutationFn: () => tokenManagerService.updateSubscriptionPricing({ promoActive }),
    onSuccess: () => {
      toast.success('Subscription pricing updated')
      queryClient.invalidateQueries({ queryKey: ['token-manager-overview'] })
    },
    onError: () => toast.error('Failed to update subscription pricing'),
  })

  const subscriptionMutation = useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) =>
      tokenManagerService.updateUserSubscription(userId, { active, grantMonthlyCredits: active }),
    onSuccess: () => {
      toast.success('Subscription updated')
      queryClient.invalidateQueries({ queryKey: ['token-manager-overview'] })
    },
    onError: () => toast.error('Failed to update subscription'),
  })

  const topUpMutation = useMutation({
    mutationFn: ({ userId, dollars }: { userId: string; dollars: number }) =>
      tokenManagerService.grantTopUp(userId, { dollars }),
    onSuccess: (result) => {
      toast.success(`Granted ${formatNumber(result.credits)} credits`)
      queryClient.invalidateQueries({ queryKey: ['token-manager-overview'] })
    },
    onError: () => toast.error('Failed to grant top-up'),
  })

  const contactMessageMutation = useMutation({
    mutationFn: ({ messageId, status }: { messageId: string; status: 'pending' | 'handled' }) =>
      tokenManagerService.updateContactMessageStatus(messageId, status),
    onSuccess: () => {
      toast.success('Message updated')
      queryClient.invalidateQueries({ queryKey: ['token-manager-contact-messages'] })
    },
    onError: () => toast.error('Failed to update message'),
  })

  const totals = useMemo(() => overview?.totals[selectedRange], [overview, selectedRange])

  const saveBalance = (userId: string) => {
    const balance = Number(balanceDrafts[userId])
    if (!Number.isInteger(balance) || balance < 0) {
      toast.error('Balance must be a non-negative whole number')
      return
    }
    setBalanceMutation.mutate({ userId, balance })
  }

  const saveSettings = () => {
    const percent = Number(markupPercent)
    const minMarkup = Number(minMarkupTokens)
    if (!Number.isFinite(percent) || percent < 0 || !Number.isInteger(minMarkup) || minMarkup < 0) {
      toast.error('Markup settings are invalid')
      return
    }
    settingsMutation.mutate()
  }

  const grantTopUp = (userId: string) => {
    const dollars = Number(topUpDrafts[userId])
    if (!Number.isFinite(dollars) || dollars <= 0) {
      toast.error('Top-up dollars must be positive')
      return
    }
    topUpMutation.mutate({ userId, dollars })
  }

  if (overviewQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    )
  }

  if (overviewQuery.isError || !overview || !totals) {
    return (
      <div className="card">
        <p className="text-sm text-red-300">Failed to load token manager.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-28 md:pb-0">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
          <Coins className="w-4 h-4 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-100 neon-text">Token Manager</h1>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-gray-100">Usage Totals</h2>
          </div>
          <div className="flex rounded-lg border border-gray-700/70 bg-gray-900/80 p-1">
            {(Object.keys(rangeLabels) as RangeKey[]).map(range => (
              <button
                key={range}
                onClick={() => setSelectedRange(range)}
                className={`px-3 py-2 text-sm rounded-md transition-colors ${
                  selectedRange === range
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {rangeLabels[range]}
              </button>
            ))}
          </div>
        </div>

        <SummaryCards totals={totals} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-gray-700/50 bg-gray-900/70 p-3">
            <span className="text-gray-400">Markup app tokens</span>
            <p className="text-lg font-semibold text-gray-100">{formatNumber(totals.markupTokens)}</p>
          </div>
          <div className="rounded-lg border border-gray-700/50 bg-gray-900/70 p-3">
            <span className="text-gray-400">OpenAI prompt tokens</span>
            <p className="text-lg font-semibold text-gray-100">{formatNumber(totals.promptTokens)}</p>
          </div>
          <div className="rounded-lg border border-gray-700/50 bg-gray-900/70 p-3">
            <span className="text-gray-400">OpenAI completion tokens</span>
            <p className="text-lg font-semibold text-gray-100">{formatNumber(totals.completionTokens)}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <Settings className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-gray-100">Billing Settings</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">App tokens per $1</label>
            <input className="input-field" value={overview.settings.appTokensPerUsd} readOnly />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">Markup percent</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input-field"
              value={markupPercent}
              onChange={(event) => setMarkupPercent(event.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">Minimum markup</label>
            <input
              type="number"
              min="0"
              step="1"
              className="input-field"
              value={minMarkupTokens}
              onChange={(event) => setMinMarkupTokens(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={saveSettings}
              disabled={settingsMutation.isPending}
              className="btn-primary w-full flex items-center justify-center space-x-2"
            >
              {settingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save</span>
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <BadgeDollarSign className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-gray-100">Subscription Pricing</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">Current phase</label>
            <button
              type="button"
              onClick={() => setPromoActive(!promoActive)}
              className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                promoActive
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-gray-700 bg-gray-950/30 text-gray-200'
              }`}
            >
              <span>{promoActive ? 'Promo: $1 / month' : 'Regular: $2 / month'}</span>
              <span className="text-xs text-gray-400">Toggle</span>
            </button>
          </div>
          <div className="rounded-lg border border-gray-700/70 bg-gray-950/30 p-3 text-sm">
            <p className="text-gray-400">Sell rate</p>
            <p className="mt-1 text-lg font-semibold text-gray-100">
              {formatNumber(overview.subscriptionPricing.sellCreditsPerUsd)} credits / $1
            </p>
            <p className="mt-1 text-xs text-gray-500">AI cost metering remains {overview.settings.appTokensPerUsd} tokens / $1.</p>
          </div>
          <button
            onClick={() => subscriptionPricingMutation.mutate()}
            disabled={subscriptionPricingMutation.isPending}
            className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-3"
          >
            {subscriptionPricingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Pricing
          </button>
        </div>
      </div>

      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <Mail className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-gray-100">Admin Inbox</h2>
            {contactMessages.some(message => message.status === 'pending') && (
              <span className="rounded-full bg-cyan-500/20 px-2 py-1 text-xs font-medium text-cyan-200">
                {contactMessages.filter(message => message.status === 'pending').length} pending
              </span>
            )}
          </div>
          <div className="flex rounded-lg border border-gray-700/70 bg-gray-900/80 p-1">
            {(['pending', 'handled', 'all'] as ContactStatusFilter[]).map(status => (
              <button
                key={status}
                onClick={() => setContactStatus(status)}
                className={`px-3 py-2 text-sm capitalize rounded-md transition-colors ${
                  contactStatus === status
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {contactMessagesQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading messages...
          </div>
        ) : contactMessages.length === 0 ? (
          <p className="text-sm text-gray-400">No {contactStatus === 'all' ? '' : contactStatus} in-app messages.</p>
        ) : (
          <div className="grid gap-3">
            {contactMessages.map(message => (
              <div key={message.id} className="rounded-lg border border-gray-700/70 bg-gray-950/30 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        message.kind === 'subscribe'
                          ? 'bg-emerald-500/15 text-emerald-200'
                          : 'bg-blue-500/15 text-blue-200'
                      }`}>
                        {message.kind === 'subscribe' ? 'Subscribe' : 'Buy more'}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        message.status === 'pending'
                          ? 'bg-amber-500/15 text-amber-200'
                          : 'bg-gray-700/70 text-gray-300'
                      }`}>
                        {message.status}
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(message.createdAt)}</span>
                    </div>
                    <p className="mt-2 font-medium text-gray-100">{message.userName ?? 'Unknown user'}</p>
                    <p className="text-xs text-gray-400">{message.userEmail ?? message.userId}</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-gray-300">{message.message}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {message.status === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => contactMessageMutation.mutate({ messageId: message.id, status: 'handled' })}
                        disabled={contactMessageMutation.isPending}
                        className="btn-secondary inline-flex items-center gap-2 text-sm"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Mark handled
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => contactMessageMutation.mutate({ messageId: message.id, status: 'pending' })}
                        disabled={contactMessageMutation.isPending}
                        className="btn-secondary inline-flex items-center gap-2 text-sm"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <UserCog className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-gray-100">Users</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left text-gray-400">
                <th className="py-3 pr-4 font-medium">User</th>
                <th className="py-3 pr-4 font-medium">Role</th>
                <th className="py-3 pr-4 font-medium">Balance</th>
                <th className="py-3 pr-4 font-medium">Subscription</th>
                <th className="py-3 pr-4 font-medium">Top-up</th>
                <th className="py-3 pr-4 font-medium">Updated</th>
                <th className="py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {overview.users.map(user => (
                <tr key={user.id} className="border-b border-gray-800/80">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-gray-100">{user.name}</p>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </td>
                  <td className="py-3 pr-4 text-gray-300">{user.role}</td>
                  <td className="py-3 pr-4">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="input-field w-32"
                      value={balanceDrafts[user.id] ?? '0'}
                      onChange={(event) => setBalanceDrafts(prev => ({ ...prev, [user.id]: event.target.value }))}
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400">
                        {user.subscription?.active ? `${user.subscription.pricePhase} · renews ${user.subscription.renewalDate ?? '-'}` : 'Inactive'}
                      </p>
                      <p className="text-xs text-gray-500">
                        Monthly {formatNumber(user.subscription_balance)} · Top-up {formatNumber(user.topup_balance)}
                      </p>
                      <button
                        onClick={() => subscriptionMutation.mutate({ userId: user.id, active: !user.subscription?.active })}
                        disabled={subscriptionMutation.isPending}
                        className="btn-secondary inline-flex items-center space-x-2 text-xs"
                      >
                        <Gift className="h-3.5 w-3.5" />
                        <span>{user.subscription?.active ? 'Deactivate' : 'Subscribe +500'}</span>
                      </button>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="input-field w-20"
                        value={topUpDrafts[user.id] ?? '1'}
                        onChange={(event) => setTopUpDrafts(prev => ({ ...prev, [user.id]: event.target.value }))}
                      />
                      <button
                        onClick={() => grantTopUp(user.id)}
                        disabled={topUpMutation.isPending}
                        className="btn-secondary text-sm"
                      >
                        Grant $
                      </button>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-gray-400">{formatDate(user.balance_updated_at)}</td>
                  <td className="py-3">
                    <button
                      onClick={() => saveBalance(user.id)}
                      disabled={setBalanceMutation.isPending}
                      className="btn-secondary text-sm flex items-center space-x-2"
                    >
                      <Save className="w-4 h-4" />
                      <span>Set</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <Activity className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-gray-100">Activity Log</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left text-gray-400">
                <th className="py-3 pr-4 font-medium">Time</th>
                <th className="py-3 pr-4 font-medium">User</th>
                <th className="py-3 pr-4 font-medium">Request</th>
                <th className="py-3 pr-4 font-medium">OpenAI cost</th>
                <th className="py-3 pr-4 font-medium">Raw tokens</th>
                <th className="py-3 pr-4 font-medium">Base</th>
                <th className="py-3 pr-4 font-medium">Markup</th>
                <th className="py-3 pr-4 font-medium">Charged</th>
                <th className="py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {overview.activity.map(row => (
                <tr key={row.id} className="border-b border-gray-800/80 text-gray-300">
                  <td className="py-3 pr-4 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                  <td className="py-3 pr-4">
                    <p className="text-gray-100">{row.userName ?? '-'}</p>
                    <p className="text-xs text-gray-400">{row.userEmail ?? row.userId}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <p>{row.endpoint ?? '-'}</p>
                    <p className="text-xs text-gray-400">{row.model ?? '-'}</p>
                  </td>
                  <td className="py-3 pr-4">{formatUsd(row.openAiCostUsd)}</td>
                  <td className="py-3 pr-4">{formatNumber(row.totalOpenAiTokens)}</td>
                  <td className="py-3 pr-4">{formatNumber(row.baseTokens)}</td>
                  <td className="py-3 pr-4">{formatNumber(row.markupTokens)}</td>
                  <td className="py-3 pr-4">{formatNumber(row.billedTokens)}</td>
                  <td className="py-3">{row.reason ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
