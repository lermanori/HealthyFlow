import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Mail, RotateCcw, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminService } from '../services/api'
import UserManagementPanel from '../components/admin/UserManagementPanel'
import SpendPanel from '../components/admin/SpendPanel'
import LedgerPanel from '../components/admin/LedgerPanel'

type ContactStatusFilter = 'pending' | 'handled' | 'all'

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function AdminPage() {
  const queryClient = useQueryClient()
  const [contactStatus, setContactStatus] = useState<ContactStatusFilter>('pending')
  // The inbox points People at a sender by id, so a Founders Club request —
  // a Guest's included — can be acted on (#302).
  const [peopleSearch, setPeopleSearch] = useState('')
  const [ledgerPerson, setLedgerPerson] = useState('')
  const showInPeople = (userId: string) => {
    setPeopleSearch(userId)
    document.getElementById('people')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }


  const contactMessagesQuery = useQuery({
    queryKey: ['admin', 'contact-messages', contactStatus],
    queryFn: () => adminService.getContactMessages(contactStatus),
  })
  // Its own read, so the badge counts pending messages whichever filter is open.
  const pendingMessagesQuery = useQuery({
    queryKey: ['admin', 'contact-messages', 'pending'],
    queryFn: () => adminService.getContactMessages('pending'),
  })

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
                    <p className="font-mono text-xs text-ink-muted">id {message.userId.slice(0, 8)}</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-ink-soft">{message.message}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => showInPeople(message.userId)}
                      className="btn-secondary text-sm"
                    >
                      Show in People
                    </button>
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

      <UserManagementPanel search={peopleSearch} onSearchChange={setPeopleSearch} />

      <SpendPanel />

      <LedgerPanel person={ledgerPerson} onPersonChange={setLedgerPerson} />
    </div>
  )
}
