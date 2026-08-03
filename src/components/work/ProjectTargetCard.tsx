import { useState } from 'react'
import type { ProjectDetailsInput, ProjectStatus, WorkProject } from '../../services/api'
import { NOT_RECORDED, PROJECT_STATUS_CLASS, orNotRecorded } from './workPresentation'

interface ProjectTargetCardProps {
  project: WorkProject
  isBusy: boolean
  onUpdate: (input: ProjectDetailsInput) => void
  onArchive: (archived: boolean) => void
  onDelete: () => void
}

const STATUSES: ProjectStatus[] = ['Planned', 'Active', 'Paused', 'Done']

export default function ProjectTargetCard({ project, isBusy, onUpdate, onArchive, onDelete }: ProjectTargetCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => ({
    name: project.name,
    target: project.target ?? '',
    milestone: project.milestone ?? '',
    definitionOfDone: project.definitionOfDone ?? '',
    deadline: project.deadline ?? '',
    status: project.status,
  }))

  const beginEdit = () => {
    setDraft({
      name: project.name,
      target: project.target ?? '',
      milestone: project.milestone ?? '',
      definitionOfDone: project.definitionOfDone ?? '',
      deadline: project.deadline ?? '',
      status: project.status,
    })
    setEditing(true)
  }

  if (editing) {
    return (
      <section aria-label="Edit Project" className="surface-section p-5">
        <h2 className="text-lg font-semibold text-ink">Edit Project</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5"><span className="text-xs text-ink-soft">Name</span><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="input-field min-h-11 py-0" /></label>
          <label className="flex flex-col gap-1.5"><span className="text-xs text-ink-soft">Status</span><select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as ProjectStatus })} className="input-field min-h-11 py-0">{STATUSES.map(status => <option key={status}>{status}</option>)}</select></label>
          <label className="flex flex-col gap-1.5 md:col-span-2"><span className="text-xs text-ink-soft">Target</span><input value={draft.target} onChange={e => setDraft({ ...draft, target: e.target.value })} className="input-field min-h-11 py-0" /></label>
          <label className="flex flex-col gap-1.5"><span className="text-xs text-ink-soft">Current milestone</span><input value={draft.milestone} onChange={e => setDraft({ ...draft, milestone: e.target.value })} className="input-field min-h-11 py-0" /></label>
          <label className="flex flex-col gap-1.5"><span className="text-xs text-ink-soft">Deadline</span><input type="date" value={draft.deadline} onChange={e => setDraft({ ...draft, deadline: e.target.value })} className="input-field min-h-11 py-0" /></label>
          <label className="flex flex-col gap-1.5 md:col-span-2"><span className="text-xs text-ink-soft">Definition of done</span><input value={draft.definitionOfDone} onChange={e => setDraft({ ...draft, definitionOfDone: e.target.value })} className="input-field min-h-11 py-0" /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isBusy || !draft.name.trim()}
            onClick={() => {
              onUpdate({
                name: draft.name.trim(),
                target: draft.target.trim() || null,
                milestone: draft.milestone.trim() || null,
                definitionOfDone: draft.definitionOfDone.trim() || null,
                deadline: draft.deadline || null,
                status: draft.status,
              })
              setEditing(false)
            }}
            className="btn-primary min-h-11 px-4 py-0 text-sm"
          >Save Project</button>
          <button type="button" onClick={() => setEditing(false)} className="btn-secondary min-h-11 px-4 py-0 text-sm">Cancel</button>
        </div>
      </section>
    )
  }

  const facts = [
    { label: 'Current milestone', value: orNotRecorded(project.milestone) },
    { label: 'Definition of done', value: orNotRecorded(project.definitionOfDone) },
    { label: 'Next valuable step', value: orNotRecorded(project.context.nextStep) },
  ]

  return (
    <section aria-label="Project target" className="surface-section p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">{project.name}</p>
          <span className={`mt-2 inline-flex min-h-[26px] items-center rounded-full border px-2.5 text-xs font-semibold ${PROJECT_STATUS_CLASS[project.status]}`}>{project.status}</span>
          {project.isArchived && <span className="ml-2 text-xs font-semibold text-state-warning">Archived</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={beginEdit} className="btn-secondary min-h-10 px-3.5 py-0 text-[13px]">Edit Project</button>
          <button type="button" disabled={isBusy} onClick={() => onArchive(!project.isArchived)} className="btn-secondary min-h-10 px-3.5 py-0 text-[13px]">{project.isArchived ? 'Restore' : 'Archive'}</button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              if (window.confirm(`Delete ${project.name}? Its Tasks and Work history will be preserved as unassigned or standalone records.`)) onDelete()
            }}
            className="min-h-10 rounded-[var(--radius-control)] border border-state-danger/40 px-3.5 text-[13px] font-semibold text-state-danger"
          >Delete</button>
        </div>
      </div>
      <p className={`mt-4 max-w-[34ch] text-[30px] font-semibold leading-[1.2] -tracking-[0.025em] ${project.target ? 'text-ink' : 'text-ink-muted'}`}>{project.target || 'No target recorded yet'}</p>
      {project.deadline && <p className="mt-2 text-sm text-state-warning">Deadline · {project.deadline}</p>}
      <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-line bg-line [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {facts.map(fact => <div key={fact.label} className="bg-page px-[18px] py-4"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{fact.label}</p><p className={`mt-2 text-[15px] ${fact.value === NOT_RECORDED ? 'text-ink-muted' : 'text-ink'}`}>{fact.value}</p></div>)}
      </div>
    </section>
  )
}
