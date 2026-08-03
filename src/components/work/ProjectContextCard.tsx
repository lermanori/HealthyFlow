import { useState } from 'react'
import type { ProjectContext, WorkProject } from '../../services/api'

interface ProjectContextCardProps {
  project: WorkProject
  isBusy: boolean
  onSaveContext: (context: Partial<ProjectContext>) => void
}

// The list fields, in the order they are read. Each is one line per entry, both
// when shown and when edited.
const LIST_FIELDS = [
  { key: 'constraints', label: 'Constraints' },
  { key: 'nonGoals', label: 'Non-goals' },
  { key: 'decisions', label: 'Important decisions' },
  { key: 'links', label: 'Relevant links' },
] as const satisfies ReadonlyArray<{ key: keyof ProjectContext; label: string }>

const toLines = (values: string[]) => values.join('\n')
const fromLines = (value: string) =>
  value.split('\n').map(line => line.trim()).filter(Boolean)

/**
 * The Project's bounded context: what the user has recorded so that they — and
 * the user can judge whether a Task still serves the target. It is edited by
 * hand; nothing here is generated.
 */
export default function ProjectContextCard({
  project,
  isBusy,
  onSaveContext,
}: ProjectContextCardProps) {
  const { context } = project
  const [isExpanded, setIsExpanded] = useState(false)
  const [draft, setDraft] = useState<ProjectContext | null>(null)

  const startEditing = () => {
    setDraft({ ...context })
    setIsExpanded(true)
  }

  const save = () => {
    if (!draft) return
    onSaveContext(draft)
    setDraft(null)
  }

  if (draft) {
    return (
      <section aria-label="Edit Project context" className="surface-section flex flex-col gap-3.5 p-5">
        <h2 className="text-[17px] font-semibold text-ink">Edit Project context</h2>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-soft">Summary</span>
          <textarea
            rows={4}
            value={draft.summary}
            onChange={event => setDraft({ ...draft, summary: event.target.value })}
            className="input-field resize-y text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-soft">Next valuable step</span>
          <input
            value={draft.nextStep}
            onChange={event => setDraft({ ...draft, nextStep: event.target.value })}
            className="input-field min-h-11 py-0 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-soft">Blockers · one per line</span>
          <textarea
            rows={2}
            value={toLines(draft.blockers)}
            onChange={event => setDraft({ ...draft, blockers: fromLines(event.target.value) })}
            className="input-field resize-y text-sm"
          />
        </label>

        {LIST_FIELDS.map(field => (
          <label key={field.key} className="flex flex-col gap-1.5">
            <span className="text-xs text-ink-soft">{field.label} · one per line</span>
            <textarea
              rows={2}
              value={toLines(draft[field.key])}
              onChange={event => setDraft({ ...draft, [field.key]: fromLines(event.target.value) })}
              className="input-field resize-y text-sm"
            />
          </label>
        ))}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={save} disabled={isBusy} className="btn-primary min-h-11 px-4 py-0 text-[13px]">
            Save context
          </button>
          <button type="button" onClick={() => setDraft(null)} className="btn-secondary min-h-11 px-4 py-0 text-[13px]">
            Cancel
          </button>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Project context" className="surface-section p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <h2 className="text-[17px] font-semibold text-ink">Project context</h2>
        <span className="text-xs text-ink-muted">Durable memory · edited by hand</span>
      </div>

      <p className={`mt-3.5 text-sm leading-relaxed [text-wrap:pretty] ${context.summary ? 'text-ink-soft' : 'text-ink-muted'}`}>
        {context.summary || 'No context recorded yet.'}
      </p>

      <div className="mt-4 rounded-xl border border-state-warning/30 bg-sunken p-3.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-state-warning">Blockers</p>
        {context.blockers.length === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">No blocker recorded.</p>
        ) : (
          context.blockers.map(blocker => (
            <p key={blocker} className="mt-2 text-sm leading-relaxed text-ink">{blocker}</p>
          ))
        )}
      </div>

      {isExpanded && (
        <div className="mt-4 flex flex-col gap-4">
          {LIST_FIELDS.map(field => (
            <div key={field.key}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{field.label}</p>
              {context[field.key].length === 0 ? (
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">Nothing recorded.</p>
              ) : (
                context[field.key].map(entry => (
                  <p key={entry} className="mt-1.5 text-sm leading-relaxed text-ink-soft">{entry}</p>
                ))
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-line bg-sunken p-3.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Next valuable step</p>
        <p className={`mt-2 text-sm leading-relaxed ${context.nextStep ? 'text-ink' : 'text-ink-muted'}`}>
          {context.nextStep || 'Not recorded yet.'}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setIsExpanded(expanded => !expanded)}
          aria-expanded={isExpanded}
          className="btn-secondary min-h-11 px-3.5 py-0 text-[13px]"
        >
          {isExpanded ? 'Hide full context' : 'Show constraints, non-goals, decisions, links'}
        </button>
        <button
          type="button"
          onClick={startEditing}
          className="min-h-11 rounded-[var(--radius-control)] border border-line-strong px-3.5 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
        >
          Edit
        </button>
      </div>
    </section>
  )
}
