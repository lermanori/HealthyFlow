import { Plus } from 'lucide-react'
import type { WorkProject, WorkProjectSummary } from '../../services/api'

interface ProjectSwitcherProps {
  projects: WorkProjectSummary[]
  project: WorkProject | null
  onSelect: (projectId: string | null) => void
  onCreate: () => void
}

export default function ProjectSwitcher({ projects, project, onSelect, onCreate }: ProjectSwitcherProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex min-w-[280px] flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Work scope</span>
        <select
          aria-label="Work scope"
          value={project?.id ?? '__standalone'}
          onChange={event => onSelect(event.target.value === '__standalone' ? null : event.target.value)}
          className="input-field min-h-12 py-0 text-sm font-semibold"
        >
          <option value="__standalone">Standalone Work</option>
          {projects.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}{option.isArchived ? ' (Archived)' : ''} · {option.openTaskCount} open
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={onCreate} className="btn-secondary mt-5 inline-flex min-h-12 items-center gap-2 px-4 py-0 text-sm">
        <Plus className="h-4 w-4" aria-hidden="true" />
        New Project
      </button>
    </div>
  )
}
