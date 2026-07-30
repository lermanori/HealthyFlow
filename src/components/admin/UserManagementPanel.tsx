import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FlaskConical,
  History,
  Loader2,
  Search,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  type AdminUserDeletionPreview,
  type ManagedUser,
  tokenManagerService,
} from '../../services/api'

type TestFilter = 'all' | 'test' | 'live'
type AccessFilter = 'all' | 'active' | 'disabled'
type UserAction = 'mark_test' | 'mark_live' | 'disable' | 'enable'

const USER_QUERY_KEY = ['admin', 'managed-users'] as const
const AUDIT_QUERY_KEY = ['admin', 'managed-users', 'audit'] as const

const protectionLabels: Record<NonNullable<ManagedUser['protection']>, string> = {
  current_admin: 'Your administrator account',
  administrator: 'Administrator',
  demo_account: 'Demo account',
  test_fixture: 'Automated test fixture',
}

const blockerLabels: Record<AdminUserDeletionPreview['users'][number]['blockers'][number], string> = {
  current_admin: 'current administrator',
  administrator: 'administrator account',
  demo_account: 'demo account',
  test_fixture: 'automated test fixture',
  not_test: 'not marked as test',
  active_subscription: 'active subscription',
}

function formatDate(value: string | null) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function requestMessage(error: unknown, fallback: string) {
  return axios.isAxiosError<{ error?: string }>(error)
    ? error.response?.data?.error ?? fallback
    : fallback
}

function DeletionDialog({
  preview,
  pending,
  confirmation,
  setConfirmation,
  close,
  confirm,
}: {
  preview: AdminUserDeletionPreview
  pending: boolean
  confirmation: string
  setConfirmation: (value: string) => void
  close: () => void
  confirm: () => void
}) {
  return createPortal((
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="delete-test-users-title">
      <button
        type="button"
        aria-label="Close deletion preview"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={close}
        disabled={pending}
      />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-red-500/25 bg-page p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-red-300">
              <AlertTriangle className="h-5 w-5" />
              <h2 id="delete-test-users-title" className="text-lg font-semibold">Permanent deletion preview</h2>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Review every selected account and the data that will be permanently removed.
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={close} disabled={pending} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-card disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {preview.users.map(user => (
            <div key={user.id} className="rounded-control border border-line bg-sunken/35 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">{user.name}</p>
                  <p className="text-xs text-ink-muted">{user.email}</p>
                </div>
                {user.blockers.length === 0 ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">Eligible test user</span>
                ) : (
                  <span className="rounded-full bg-red-500/15 px-2 py-1 text-xs text-red-300">
                    Blocked: {user.blockers.map(blocker => blockerLabels[blocker]).join(', ')}
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-7">
                {([
                  ['Items', user.counts.items],
                  ['Health', user.counts.health],
                  ['Calendar', user.counts.calendar],
                  ['Assistant', user.counts.assistant],
                  ['Billing', user.counts.billing],
                  ['Account', user.counts.account],
                  ['Waitlist', user.counts.waitlist],
                ] as const).map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-page/70 px-2 py-2">
                    <p className="text-ink-muted">{label}</p>
                    <p className="mt-1 font-semibold text-ink">{value}</p>
                  </div>
                ))}
              </div>
              {user.releasesPublicSignupSeat && (
                <p className="mt-3 text-xs font-medium text-emerald-300">
                  1 public signup seat will be returned.
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-control border border-line bg-card/45 p-4">
          <p className="text-sm font-medium text-ink">
            {preview.users.length} {preview.users.length === 1 ? 'account' : 'accounts'} · {preview.totalRecords} related records
          </p>
          {preview.canDelete && preview.confirmationPhrase ? (
            <>
              <label htmlFor="delete-users-confirmation" className="mt-4 block text-sm text-ink-soft">
                Type <span className="font-mono font-semibold text-red-300">{preview.confirmationPhrase}</span>
              </label>
              <input
                id="delete-users-confirmation"
                className="input-field mt-2 font-mono"
                autoComplete="off"
                value={confirmation}
                onChange={event => setConfirmation(event.target.value)}
                disabled={pending}
              />
            </>
          ) : (
            <p className="mt-2 text-sm text-red-300">
              Deletion is blocked. Mark accounts explicitly as test, remove active subscriptions, and exclude protected accounts.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={close} disabled={pending}>Cancel</button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-red-600 px-4 py-2 font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!preview.canDelete || !preview.confirmationPhrase || confirmation !== preview.confirmationPhrase || pending}
            onClick={confirm}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Permanently delete
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}

export default function UserManagementPanel() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [testFilter, setTestFilter] = useState<TestFilter>('all')
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<AdminUserDeletionPreview | null>(null)
  const [confirmation, setConfirmation] = useState('')

  const usersQuery = useQuery({
    queryKey: USER_QUERY_KEY,
    queryFn: tokenManagerService.getManagedUsers,
  })
  const auditQuery = useQuery({
    queryKey: AUDIT_QUERY_KEY,
    queryFn: tokenManagerService.getManagedUserAudit,
  })

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data])
  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return users.filter(user => {
      const matchesQuery = !normalized ||
        user.name.toLowerCase().includes(normalized) ||
        user.email.toLowerCase().includes(normalized)
      const matchesTest =
        testFilter === 'all' ||
        (testFilter === 'test' ? user.isTest : !user.isTest)
      const matchesAccess =
        accessFilter === 'all' ||
        (accessFilter === 'disabled' ? Boolean(user.disabledAt) : !user.disabledAt)
      return matchesQuery && matchesTest && matchesAccess
    })
  }, [accessFilter, query, testFilter, users])

  const selectableVisibleIds = filteredUsers
    .filter(user => !user.protection)
    .map(user => user.id)
  const allVisibleSelected =
    selectableVisibleIds.length > 0 && selectableVisibleIds.every(id => selected.has(id))

  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: USER_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: AUDIT_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ['token-manager-overview'] }),
    queryClient.invalidateQueries({ queryKey: ['admin', 'waitlist'] }),
  ])

  const actionMutation = useMutation({
    mutationFn: ({ action, userIds }: { action: UserAction; userIds: string[] }) =>
      tokenManagerService.updateManagedUsers(userIds, action),
    onSuccess: async (result) => {
      toast.success(`${result.updatedUserIds.length} ${result.updatedUserIds.length === 1 ? 'user' : 'users'} updated`)
      setSelected(new Set())
      await invalidate()
    },
    onError: error => toast.error(requestMessage(error, 'Could not update users')),
  })

  const previewMutation = useMutation({
    mutationFn: (userIds: string[]) => tokenManagerService.previewManagedUserDeletion(userIds),
    onSuccess: result => {
      setConfirmation('')
      setPreview(result)
    },
    onError: error => toast.error(requestMessage(error, 'Could not preview deletion')),
  })

  const deletionMutation = useMutation({
    mutationFn: () => tokenManagerService.deleteManagedUsers(
      preview?.users.map(user => user.id) ?? [],
      confirmation,
    ),
    onSuccess: async result => {
      const seatsReleased = result.deleted.reduce(
        (sum, user) => sum + user.publicSignupSeatsReleased,
        0,
      )
      if (result.failures.length > 0) {
        toast.error(`${result.deleted.length} deleted; ${result.failures.length} failed`)
      } else {
        toast.success(
          `${result.deleted.length} test ${result.deleted.length === 1 ? 'user' : 'users'} deleted` +
          (seatsReleased > 0 ? ` · ${seatsReleased} signup ${seatsReleased === 1 ? 'seat' : 'seats'} freed` : ''),
        )
      }
      const warningCount = result.deleted.reduce((sum, user) => sum + user.warnings.length, 0)
      if (warningCount > 0) toast.error(`${warningCount} linked authentication cleanup warning${warningCount === 1 ? '' : 's'}`)
      setPreview(null)
      setConfirmation('')
      setSelected(new Set())
      await invalidate()
    },
    onError: error => toast.error(requestMessage(error, 'Could not delete users')),
  })

  const selectedIds = Array.from(selected)
  const apply = (action: UserAction) => {
    if (selectedIds.length > 0) actionMutation.mutate({ action, userIds: selectedIds })
  }
  const toggleSelected = (id: string) => {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAllVisible = () => {
    setSelected(current => {
      const next = new Set(current)
      if (allVisibleSelected) selectableVisibleIds.forEach(id => next.delete(id))
      else selectableVisibleIds.forEach(id => next.add(id))
      return next
    })
  }

  const counts = {
    total: users.length,
    test: users.filter(user => user.isTest).length,
    disabled: users.filter(user => user.disabledAt).length,
  }

  return (
    <>
      <section className="card" aria-labelledby="user-management-title">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-accent" />
              <h2 id="user-management-title" className="text-lg font-semibold text-ink">User Management</h2>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-ink-muted">
              Test status is always explicit. Disabling preserves data; permanent deletion is limited to reviewed test accounts.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-control border border-line bg-sunken/35 px-3 py-2">
              <p className="text-ink-muted">Total</p>
              <p className="mt-1 text-lg font-semibold text-ink">{counts.total}</p>
            </div>
            <div className="rounded-control border border-line bg-sunken/35 px-3 py-2">
              <p className="text-ink-muted">Test</p>
              <p className="mt-1 text-lg font-semibold text-amber-300">{counts.test}</p>
            </div>
            <div className="rounded-control border border-line bg-sunken/35 px-3 py-2">
              <p className="text-ink-muted">Disabled</p>
              <p className="mt-1 text-lg font-semibold text-red-300">{counts.disabled}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_180px]">
          <label className="relative block">
            <span className="sr-only">Search users</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              className="input-field pl-10"
              placeholder="Search name or email"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </label>
          <select className="input-field" value={testFilter} onChange={event => setTestFilter(event.target.value as TestFilter)} aria-label="Filter test status">
            <option value="all">All account types</option>
            <option value="test">Test users</option>
            <option value="live">Live users</option>
          </select>
          <select className="input-field" value={accessFilter} onChange={event => setAccessFilter(event.target.value as AccessFilter)} aria-label="Filter access status">
            <option value="all">All access states</option>
            <option value="active">Active access</option>
            <option value="disabled">Disabled access</option>
          </select>
        </div>

        {selected.size > 0 && (
          <div className="mt-4 rounded-control border border-accent/25 bg-accent/5 p-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <p className="text-sm font-medium text-ink">{selected.size} selected</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary inline-flex items-center gap-2 text-sm" onClick={() => apply('mark_test')} disabled={actionMutation.isPending}>
                  <FlaskConical className="h-4 w-4" /> Mark test
                </button>
                <button type="button" className="btn-secondary inline-flex items-center gap-2 text-sm" onClick={() => apply('mark_live')} disabled={actionMutation.isPending}>
                  <UserRoundCheck className="h-4 w-4" /> Mark live
                </button>
                <button type="button" className="btn-secondary inline-flex items-center gap-2 text-sm" onClick={() => apply('disable')} disabled={actionMutation.isPending}>
                  <Ban className="h-4 w-4" /> Disable
                </button>
                <button type="button" className="btn-secondary inline-flex items-center gap-2 text-sm" onClick={() => apply('enable')} disabled={actionMutation.isPending}>
                  <CheckCircle2 className="h-4 w-4" /> Enable
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center gap-2 rounded-control border border-red-500/35 px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                  onClick={() => previewMutation.mutate(selectedIds)}
                  disabled={previewMutation.isPending || selectedIds.length > 20}
                  title={selectedIds.length > 20 ? 'Preview up to 20 users at a time' : undefined}
                >
                  {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Preview deletion
                </button>
              </div>
            </div>
          </div>
        )}

        {usersQuery.isLoading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
          </div>
        ) : usersQuery.isError ? (
          <p className="mt-6 text-sm text-red-300">Could not load users.</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-[960px] w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-muted">
                  <th className="w-12 py-3 pr-3">
                    <input type="checkbox" aria-label="Select visible users" checked={allVisibleSelected} onChange={toggleAllVisible} />
                  </th>
                  <th className="py-3 pr-4 font-medium">User</th>
                  <th className="py-3 pr-4 font-medium">Type</th>
                  <th className="py-3 pr-4 font-medium">Access</th>
                  <th className="py-3 pr-4 font-medium">Authentication</th>
                  <th className="py-3 pr-4 font-medium">Last login</th>
                  <th className="py-3 font-medium">Credits</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id} className="border-b border-card/80">
                    <td className="py-3 pr-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${user.email}`}
                        checked={selected.has(user.id)}
                        onChange={() => toggleSelected(user.id)}
                        disabled={Boolean(user.protection)}
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-ink">{user.name}</p>
                      <p className="text-xs text-ink-muted">{user.email}</p>
                      {user.protection && (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs text-cyan-300">
                          <ShieldCheck className="h-3.5 w-3.5" /> {protectionLabels[user.protection]}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${user.isTest ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                        {user.isTest ? 'Test' : 'Live'}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${user.disabledAt ? 'bg-red-500/15 text-red-300' : 'bg-cyan-500/15 text-cyan-300'}`}>
                        {user.disabledAt ? 'Disabled' : 'Active'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 capitalize text-ink-soft">{user.signupMethod}</td>
                    <td className="py-3 pr-4">
                      <p className="text-ink-soft">{formatDate(user.lastLoginAt)}</p>
                      <p className="mt-1 text-xs text-ink-muted">Joined {formatDate(user.createdAt)}</p>
                    </td>
                    <td className="py-3">
                      <p className="font-medium text-ink">{user.balance}</p>
                      {user.subscriptionActive && <p className="text-xs text-emerald-300">Active subscription</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <p className="py-8 text-center text-sm text-ink-muted">No users match these filters.</p>
            )}
          </div>
        )}

        <div className="mt-6 border-t border-line pt-5">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-ink-muted" />
            <h3 className="text-sm font-semibold text-ink">Recent administrative changes</h3>
          </div>
          {auditQuery.isLoading ? (
            <p className="mt-3 text-sm text-ink-muted">Loading audit history…</p>
          ) : auditQuery.isError ? (
            <p className="mt-3 text-sm text-red-300">Could not load audit history.</p>
          ) : (auditQuery.data?.length ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">No user-management changes recorded yet.</p>
          ) : (
            <div className="mt-3 grid gap-2">
              {auditQuery.data?.slice(0, 8).map(entry => (
                <div key={entry.id} className="flex flex-col gap-1 rounded-lg bg-sunken/35 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-ink-soft">
                    <span className="font-medium text-ink">{entry.actorEmail}</span>
                    {' · '}{entry.action.replace(/_/g, ' ')}
                    {' · '}{entry.targetEmail}
                  </p>
                  <time className="text-ink-muted">{formatDate(entry.createdAt)}</time>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {preview && (
        <DeletionDialog
          preview={preview}
          pending={deletionMutation.isPending}
          confirmation={confirmation}
          setConfirmation={setConfirmation}
          close={() => {
            if (deletionMutation.isPending) return
            setPreview(null)
            setConfirmation('')
          }}
          confirm={() => deletionMutation.mutate()}
        />
      )}
    </>
  )
}
