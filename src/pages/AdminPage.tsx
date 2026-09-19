import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Mail, RotateCcw, ShieldCheck, Activity } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminService, type UsageTotals } from '../services/api'
import UserManagementPanel from '../components/admin/UserManagementPanel'

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

function SummaryCards({ totals }: { totals: UsageTotals }) {
  const cards = [
    ['Requests', totals.requestCount],
    ['OpenAI cost', totals.openAiCostUsd],
  ] as const

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-line/50 bg-page/70 p-4">
          <p className="text-xs text-ink-muted">{label}</p>
          <p className="mt-2 text-2xl font-bold text-accent">
            {label === 'OpenAI cost' ? formatUsd(value) : formatNumber(value)}
          </p>
        </div>
      ))}
    </div>
  )
}

export default function AdminPage() {
  const queryClient = useQueryClient()
  const [selectedRange, setSelectedRange] = useState<RangeKey>('today')
  const [contactStatus, setContactStatus] = useState<ContactStatusFilter>('pending')

  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: adminService.getOverview,
  })

  const contactMessagesQuery = useQuery({
    queryKey: ['admin', 'contact-messages', contactStatus],
    queryFn: () => adminService.getContactMessages(contactStatus),
  })
  // Its own read, so the badge counts pending messages whichever filter is open.
  const pendingMessagesQuery = useQuery({
    queryKey: ['admin', 'contact-messages', 'pending'],
    queryFn: () => adminService.getContactMessages('pending'),
  })

  const overview = overviewQuery.data
  const contactMessages = contactMessagesQuery.data ?? []
  const pendingCount = pendingMessagesQuery.data?.length

  const contactMessageMutation = useMutation({
    mutationFn: ({ messageId, status }: { messageId: string; status: 'pending' | 'handled' }) =>
      adminService.updateContactMessageStatus(messageId, status),
    onSuccess: () => {
      toast.success('Message updated')
      queryClient.invalidateQueries({ queryKey: ['admin', 'contact-messages'] })
    },
    onError: () => toast.error('Failed to update message'),
  })

  const totals = useMemo(() => overview?.totals[selectedRange], [overview, selectedRange])

  return (
    <div className="space-y-6 pb-28 md:pb-0">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-action rounded-lg flex items-center justify-center">
          <ShieldCheck className="w-4 h-4 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-ink neon-text">Admin</h1>
      </div>

      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <Mail className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-ink">Admin Inbox</h2>
            {pendingMessagesQuery.isError ? (
              <span className="rounded-full bg-state-danger/15 px-2 py-1 text-xs font-medium text-state-danger">
                Pending count unavailable
              </span>
            ) : pendingCount ? (
              <span className="rounded-full bg-accent/20 px-2 py-1 text-xs font-medium text-accent">
                {pendingCount} pending
              </span>
            ) : null}
          </div>
          <div className="flex rounded-lg border border-line/70 bg-page/80 p-1">
            {(['pending', 'handled', 'all'] as ContactStatusFilter[]).map(status => (
              <button
                key={status}
                onClick={() => setContactStatus(status)}
                className={`px-3 py-2 text-sm capitalize rounded-md transition-colors ${
                  contactStatus === status
                    ? 'bg-accent/20 text-accent'
                    : 'text-ink-muted hover:text-ink-soft'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {contactMessagesQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading messages...
          </div>
        ) : contactMessagesQuery.isError ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <p className="text-state-danger">Could not load messages.</p>
            <button type="button" aria-label="Retry loading messages" onClick={() => void contactMessagesQuery.refetch()} className="btn-secondary text-sm">
              Retry
            </button>
          </div>
        ) : contactMessages.length === 0 ? (
          <p className="text-sm text-ink-muted">No {contactStatus === 'all' ? '' : contactStatus} in-app messages.</p>
        ) : (
          <div className="grid gap-3">
            {contactMessages.map(message => (
              <div key={message.id} className="rounded-lg border border-line/70 bg-sunken/30 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        message.kind === 'feedback'
                          ? 'bg-state-success/15 text-state-success'
                          : 'bg-state-info/15 text-state-info'
                      }`}>
                        {message.kind === 'feedback' ? 'Feedback' : 'More actions'}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        message.status === 'pending'
                          ? 'bg-state-warning/15 text-state-warning'
                          : 'bg-raised/70 text-ink-soft'
                      }`}>
                        {message.status}
                      </span>
                      <span className="text-xs text-ink-muted">{formatDate(message.createdAt)}</span>
                    </div>
                    <p className="mt-2 font-medium text-ink">{message.userName ?? 'Unknown user'}</p>
                    <p className="text-xs text-ink-muted">
                      {message.replyTo ?? message.userEmail ?? message.userId}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-ink-soft">{message.message}</p>
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

      <UserManagementPanel />

      {overviewQuery.isLoading ? (
        <div className="card flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading usage and balances…
        </div>
      ) : overviewQuery.isError || !overview || !totals ? (
        <div className="card flex flex-wrap items-center gap-3 text-sm">
          <p className="text-state-danger">Could not load usage and balances.</p>
          <button type="button" aria-label="Retry loading usage and balances" onClick={() => void overviewQuery.refetch()} className="btn-secondary text-sm">
            Retry
          </button>
        </div>
      ) : (
        <>
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <Activity className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold text-ink">Spend</h2>
            </div>
            <div className="flex rounded-lg border border-line/70 bg-page/80 p-1">
              {(Object.keys(rangeLabels) as RangeKey[]).map(range => (
                <button
                  key={range}
                  onClick={() => setSelectedRange(range)}
                  className={`px-3 py-2 text-sm rounded-md transition-colors ${
                    selectedRange === range
                      ? 'bg-accent/20 text-accent'
                      : 'text-ink-muted hover:text-ink-soft'
                  }`}
                >
                  {rangeLabels[range]}
                </button>
              ))}
            </div>
          </div>

          <SummaryCards totals={totals} />
        </div>

        <div className="card">
          <div className="flex items-center space-x-3 mb-4">
            <Activity className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-ink">Ledger</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-muted">
                  <th className="py-3 pr-4 font-medium">Time</th>
                  <th className="py-3 pr-4 font-medium">User</th>
                  <th className="py-3 pr-4 font-medium">Request</th>
                  <th className="py-3 pr-4 font-medium">OpenAI cost</th>
                  <th className="py-3 pr-4 font-medium">Model tokens</th>
                  <th className="py-3 pr-4 font-medium">Actions</th>
                  <th className="py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {overview.activity.map(row => (
                  <tr key={row.id} className="border-b border-card/80 text-ink-soft">
                    <td className="py-3 pr-4 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                    <td className="py-3 pr-4">
                      <p className="text-ink">{row.userName ?? '-'}</p>
                      <p className="text-xs text-ink-muted">{row.userEmail ?? row.userId}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p>{row.endpoint ?? '-'}</p>
                      <p className="text-xs text-ink-muted">{row.model ?? '-'}</p>
                    </td>
                    <td className="py-3 pr-4">{formatUsd(row.openAiCostUsd)}</td>
                    <td className="py-3 pr-4">{formatNumber(row.totalOpenAiTokens)}</td>
                    <td className="py-3 pr-4">{row.creditsDelta > 0 ? `+${formatNumber(row.creditsDelta)}` : formatNumber(row.creditsDelta)}</td>
                    <td className="py-3">{row.reason ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
    </div>
  )
}
