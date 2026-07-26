import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { waitlistService, type WaitlistEntry } from '../../services/api'

const WAITLIST_KEY = ['admin', 'waitlist'] as const

const STATUS_STYLES: Record<WaitlistEntry['status'], string> = {
  pending: 'text-ink-muted',
  invited: 'text-cyan-400',
  registered: 'text-emerald-400',
}

export default function WaitlistPanel() {
  const queryClient = useQueryClient()
  const [newEmail, setNewEmail] = useState('')
  const [slotsDraft, setSlotsDraft] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: [...WAITLIST_KEY, statusFilter],
    queryFn: () => waitlistService.adminEntries(statusFilter || undefined),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: WAITLIST_KEY })

  const addEntry = useMutation({
    mutationFn: () => waitlistService.adminAdd({ email: newEmail }),
    onSuccess: () => {
      setNewEmail('')
      toast.success('Added to the waitlist')
      invalidate()
    },
    onError: () => toast.error('Could not add that email'),
  })

  const invite = useMutation({
    mutationFn: (id: string) => waitlistService.adminInvite(id),
    onSuccess: (result) => {
      // The invite link points at the app, where LoginPage reads ?invite=.
      const url = `${window.location.origin}/app?invite=${result.invite.token}`
      navigator.clipboard.writeText(url).catch(() => undefined)
      toast.success('Invite link copied')
      invalidate()
    },
    onError: () => toast.error('Could not create the invite'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => waitlistService.adminRemove(id),
    onSuccess: invalidate,
    onError: () => toast.error('Could not remove that entry'),
  })

  const saveSlots = useMutation({
    mutationFn: () => waitlistService.adminSetSlots(slotsDraft ?? 0),
    onSuccess: () => {
      toast.success('Slots updated')
      invalidate()
    },
    onError: () => toast.error('Could not update slots'),
  })

  if (isLoading) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold text-ink">Waitlist</h2>
        <p className="mt-3 text-ink-muted">Loading waitlist…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold text-ink">Waitlist</h2>
        <p className="mt-3 text-red-400">Could not load the waitlist.</p>
      </div>
    )
  }

  const access = data?.access
  const open = access?.public_slots_open ?? 0
  const claimed = access?.public_slots_claimed ?? 0
  const remaining = Math.max(open - claimed, 0)
  const entries = data?.entries ?? []

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-ink">Waitlist</h2>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor="public-slots" className="text-sm text-ink-soft">
          Public slots open
        </label>
        <input
          id="public-slots"
          type="number"
          min={0}
          className="input-field w-24"
          value={slotsDraft ?? open}
          onChange={(e) => setSlotsDraft(Number(e.target.value))}
        />
        <button className="btn-primary" onClick={() => saveSlots.mutate()} disabled={saveSlots.isPending}>
          Save
        </button>
        <span className="text-sm text-ink-muted">
          {claimed} claimed · {remaining} remaining
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="email"
          className="input-field flex-1 min-w-[220px]"
          placeholder="Add someone you know"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />
        <button className="btn-ghost" onClick={() => addEntry.mutate()} disabled={!newEmail || addEntry.isPending}>
          Add
        </button>
        <select
          className="input-field w-40"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="invited">Invited</option>
          <option value="registered">Registered</option>
        </select>
      </div>

      {entries.length === 0 ? (
        <p className="mt-6 text-ink-muted">No one on the waitlist yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="py-2">Email</th>
                <th>Status</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-line">
                  <td className="py-2 text-ink">{entry.email}</td>
                  <td className={STATUS_STYLES[entry.status]}>{entry.status}</td>
                  <td className="text-ink-muted">{new Date(entry.created_at).toLocaleDateString()}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      className="btn-ghost mr-2"
                      onClick={() => invite.mutate(entry.id)}
                      disabled={entry.status === 'registered'}
                    >
                      {entry.status === 'invited' ? 'Re-invite' : 'Invite'}
                    </button>
                    <button className="btn-ghost" onClick={() => remove.mutate(entry.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
