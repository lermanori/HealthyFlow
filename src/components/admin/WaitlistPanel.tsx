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
  const [totalSlotsDraft, setTotalSlotsDraft] = useState<number | null>(null)
  const [claimedSlotsDraft, setClaimedSlotsDraft] = useState<number | null>(null)
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
    mutationFn: ({ total, claimed }: { total: number; claimed: number }) =>
      waitlistService.adminSetSlots(total, claimed),
    onSuccess: () => {
      setTotalSlotsDraft(null)
      setClaimedSlotsDraft(null)
      toast.success('Signup seats updated')
      invalidate()
    },
    onError: () => toast.error('Could not update signup seats'),
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
  const totalDraft = totalSlotsDraft ?? open
  const claimedDraft = claimedSlotsDraft ?? claimed
  const invalidSeatDraft =
    !Number.isInteger(totalDraft) ||
    !Number.isInteger(claimedDraft) ||
    totalDraft < 0 ||
    claimedDraft < 0 ||
    claimedDraft > totalDraft
  const entries = data?.entries ?? []

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-ink">Waitlist</h2>

      <div className="mt-4 rounded-control border border-line bg-sunken/35 p-4">
        <p className="text-sm font-medium text-ink">Public registration seats</p>
        <p className="mt-1 text-sm text-ink-muted">
          {claimed} of {open} claimed · {remaining} available
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label htmlFor="claimed-public-slots" className="text-sm text-ink-soft">
            Claimed seats
            <input
              id="claimed-public-slots"
              type="number"
              min={0}
              max={totalDraft}
              className="input-field mt-1 block w-32"
              value={claimedDraft}
              onChange={(e) => setClaimedSlotsDraft(Number(e.target.value))}
            />
          </label>
          <label htmlFor="total-public-slots" className="text-sm text-ink-soft">
            Total seats
            <input
              id="total-public-slots"
              type="number"
              min={0}
              className="input-field mt-1 block w-32"
              value={totalDraft}
              onChange={(e) => setTotalSlotsDraft(Number(e.target.value))}
            />
          </label>
          <button
            className="btn-primary"
            onClick={() => saveSlots.mutate({ total: totalDraft, claimed: claimedDraft })}
            disabled={saveSlots.isPending || invalidSeatDraft}
          >
            Save
          </button>
        </div>
        {claimedDraft > totalDraft && (
          <p className="mt-2 text-sm text-red-400">Claimed seats cannot exceed total seats.</p>
        )}
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
