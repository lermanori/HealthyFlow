import { useState } from 'react'
import { Check, Play } from 'lucide-react'
import { TARGET_RELATIONS, type TargetRelation, type TaskRecord, type UpdateTaskRecordInput } from '../../services/api'
import { RELATION_CLASS } from './workPresentation'

interface TaskRecordsCardProps {
  projectName: string
  tasks: TaskRecord[]
  isBusy: boolean
  onUpdateTask: (taskId: string, patch: UpdateTaskRecordInput) => void
  onRemoveTask: (taskId: string) => void
  onStartTask: (task: TaskRecord) => void
  onAddTask: () => void
}

export default function TaskRecordsCard({ projectName, tasks, isBusy, onUpdateTask, onRemoveTask, onStartTask, onAddTask }: TaskRecordsCardProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ title: '', relation: 'Direct progress' as TargetRelation })

  return (
    <section aria-label="Project Tasks" className="surface-section overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5 border-b border-line px-5 py-[18px]">
        <div><h2 className="text-[17px] font-semibold text-ink">Project Tasks</h2><p className="mt-1 text-[13px] text-ink-muted">Canonical Tasks assigned to {projectName}.</p></div>
        <span className="text-xs text-ink-muted">{tasks.length} {tasks.length === 1 ? 'Task' : 'Tasks'}</span>
      </div>
      {tasks.length === 0 && <p className="px-5 py-6 text-sm text-ink-muted">No Tasks assigned to this Project.</p>}
      {tasks.map(task => {
        const editing = editingId === task.id
        return (
          <div key={task.id} className="border-b border-line px-5 py-4">
            {editing ? (
              <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
                <input aria-label="Task title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className="input-field min-h-11 py-0" />
                <select aria-label="Relationship to target" value={draft.relation} onChange={e => setDraft({ ...draft, relation: e.target.value as TargetRelation })} className="input-field min-h-11 py-0">{TARGET_RELATIONS.map(relation => <option key={relation}>{relation}</option>)}</select>
                <div className="flex gap-2"><button type="button" disabled={isBusy || !draft.title.trim()} onClick={() => { onUpdateTask(task.id, { title: draft.title.trim(), relation: draft.relation }); setEditingId(null) }} className="btn-primary min-h-11 px-3 py-0 text-xs">Save</button><button type="button" onClick={() => setEditingId(null)} className="btn-secondary min-h-11 px-3 py-0 text-xs">Cancel</button></div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start gap-3">
                <button type="button" disabled={isBusy} onClick={() => onUpdateTask(task.id, { status: task.status === 'completed' ? 'open' : 'completed' })} aria-label={`${task.status === 'completed' ? 'Reopen' : 'Complete'} ${task.title}`} className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full border ${task.status === 'completed' ? 'border-action bg-action text-on-action' : 'border-line-strong'}`}>{task.status === 'completed' && <Check className="h-4 w-4" />}</button>
                <div className="min-w-[220px] flex-1">
                  <p className={`text-[15px] font-medium ${task.status === 'completed' ? 'text-ink-muted line-through' : 'text-ink'}`}>{task.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2"><span className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${task.relation ? RELATION_CLASS[task.relation] : 'border-line text-ink-muted'}`}>{task.relation ?? 'Relationship not recorded'}</span><span className="text-xs capitalize text-ink-muted">{task.status}</span></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {task.status === 'open' && <button type="button" disabled={isBusy} onClick={() => onStartTask(task)} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] border border-accent/40 bg-accent/10 px-3 text-[13px] font-semibold text-accent"><Play className="h-3.5 w-3.5 fill-current" />Plan block</button>}
                  {task.status === 'deferred' && <button type="button" disabled={isBusy} onClick={() => onUpdateTask(task.id, { status: 'open' })} className="btn-secondary min-h-10 px-3 py-0 text-xs">Reactivate</button>}
                  <button type="button" onClick={() => { setEditingId(task.id); setDraft({ title: task.title, relation: task.relation ?? 'Direct progress' }) }} className="btn-secondary min-h-10 px-3 py-0 text-xs">Edit</button>
                  {task.status !== 'deferred' && <button type="button" disabled={isBusy} onClick={() => onUpdateTask(task.id, { status: 'deferred' })} className="btn-secondary min-h-10 px-3 py-0 text-xs">Defer</button>}
                  <button type="button" disabled={isBusy} onClick={() => { if (window.confirm(`Delete Task “${task.title}”?`)) onRemoveTask(task.id) }} className="min-h-10 rounded-[var(--radius-control)] border border-state-danger/30 px-3 text-xs font-semibold text-state-danger">Delete</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <div className="p-4"><button type="button" onClick={onAddTask} className="min-h-11 w-full rounded-[var(--radius-control)] border border-dashed border-line-strong text-[13px] font-semibold text-ink-soft">Add a Task manually</button></div>
    </section>
  )
}
