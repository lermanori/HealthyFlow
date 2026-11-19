import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import type { ExternalCalendarEvent, HabitItem, Task } from '../services/api'
import { useModalFocus } from '../hooks/useModalFocus'
import { getCategoryPresentation } from '../categoryPresentation'
import { getModulePresentation, moduleHealthHref } from '../modulePresentation'
import { formatClockRange } from '../utils/dateHelpers'
import { calendarItemStatus } from '../utils/calendarItemStatus'

type Selection = { task: Task; event?: never } | { task?: never; event: ExternalCalendarEvent }

interface Props {
  selection: Selection
  dateKey: string
  eventTimeRange: (event: ExternalCalendarEvent) => string
  onClose: () => void
  onComplete: (id: string) => void
  onUncomplete: (id: string) => void
  onCalendarComplete: (id: string, completed: boolean) => void
  onHabitCheckIn: (habit: HabitItem) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs font-medium text-ink-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{children}</dd></div>
}

export default function TimelineDetailsSheet({ selection, dateKey, eventTimeRange, onClose, onComplete, onUncomplete, onCalendarComplete, onHabitCheckIn, onEdit, onDelete }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useModalFocus({ open: true, onClose, containerRef: panelRef, initialFocusRef: closeRef })
  const { task, event } = selection
  const title = task?.title ?? event!.title
  const calendarStatus = task ? calendarItemStatus(task) : null
  const module = task?.type === 'meal' ? getModulePresentation('calories') : task?.type === 'workout' ? getModulePresentation('workouts') : null
  // Close this modal before handing focus to the existing edit/check-in modal.
  const handOff = (action: () => void) => {
    onClose()
    window.requestAnimationFrame(action)
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="timeline-details-title">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} tabIndex={-1} className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-line bg-page shadow-2xl outline-none sm:max-h-[88dvh] sm:rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-4 pt-5">
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-accent">{event ? 'Calendar event' : task!.type === 'meal' ? 'Meal plan' : task!.type === 'workout' ? 'Workout plan' : task!.type} details</p><h2 id="timeline-details-title" className="mt-2 break-words text-xl font-semibold text-ink">{title}</h2></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close details" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-card"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <dl className="space-y-4">
            <Detail label="Date">{dateKey}</Detail>
            <Detail label="Time">{event ? eventTimeRange(event) : task!.startTime ? formatClockRange(task!.startTime, task!.duration) : task!.resolvedTime ? `Logged at ${task!.resolvedTime}` : 'Anytime'}{task && <span className="mt-1 block text-ink-muted">{task.duration && task.duration > 0 ? `${task.duration} min` : 'Duration not set'}</span>}</Detail>
            {task && <>
              <Detail label="Status">{task.type === 'habit' ? task.habitInfo?.outcome ?? (task.completed ? 'completed' : 'pending') : task.completed ? 'Completed' : 'Planned'}</Detail>
              <Detail label="Category">{getCategoryPresentation(task.category).label}</Detail>
              {task.project && <Detail label="Project">{task.project.name}</Detail>}
              {task.type === 'habit' && <>
                <Detail label="Repeat">{task.repeat === 'weekly' ? 'Weekly' : task.repeat === 'daily' ? 'Daily' : 'Habit occurrence'}</Detail>
                {task.habitInfo?.target && <Detail label="Progress">{task.habitInfo.progressTotal} / {task.habitInfo.target.value} {task.habitInfo.target.unit}</Detail>}
              </>}
              {task.type === 'grocery' && <>
                {task.groceryInfo?.quantity && <Detail label="Quantity">{task.groceryInfo.quantity}</Detail>}
                {task.groceryInfo?.store && <Detail label="Store">{task.groceryInfo.store}</Detail>}
                {task.groceryInfo?.notes && <Detail label="Notes">{task.groceryInfo.notes}</Detail>}
              </>}
              {task.type === 'meal' && <>
                {task.mealInfo?.mealType && <Detail label="Meal plan">{task.mealInfo.mealType}</Detail>}
                {task.mealInfo?.ingredients?.length ? <Detail label="Ingredients">{task.mealInfo.ingredients.map(ingredient => `${ingredient.name} ${ingredient.amount}`).join('\n')}</Detail> : null}
                {task.mealInfo?.instructions && <Detail label="Instructions">{task.mealInfo.instructions}</Detail>}
              </>}
              {task.type === 'workout' && task.workoutInfo?.notes && <Detail label="Notes">{task.workoutInfo.notes}</Detail>}
              {calendarStatus && <Detail label="Calendar">{calendarStatus.provider === 'device' ? 'Device Calendar' : 'Google Calendar'} · {calendarStatus.state}{'error' in calendarStatus && calendarStatus.error ? `\n${calendarStatus.error}` : ''}</Detail>}
            </>}
            {(task?.location || event?.location) && <Detail label="Location">{task?.location ?? event?.location}</Detail>}
            {event && <>
              <Detail label="Calendar">{event.provider === 'device' ? 'Device Calendar · Read-only in HealthyFlow' : 'Google Calendar'}</Detail>
              {event.status && <Detail label="Status">{event.status}</Detail>}
              {event.description && <Detail label="Notes">{event.description}</Detail>}
            </>}
          </dl>
          <div className="mt-6 space-y-2 border-t border-line pt-4">
            {task && <>
              <button type="button" className="btn-primary min-h-11 w-full px-4 py-3" onClick={() => task.type === 'habit' ? handOff(() => onHabitCheckIn(task)) : task.completed ? onUncomplete(task.id) : onComplete(task.id)}>{task.type === 'habit' ? 'Check in' : task.completed ? 'Mark incomplete' : 'Mark complete'}</button>
              {module && <Link to={moduleHealthHref(module, task.scheduledDate ?? dateKey)} onClick={onClose} className="btn-secondary flex min-h-11 items-center justify-center px-4 py-3">Open {task.type === 'meal' ? 'Nutrition' : 'Workouts'}</Link>}
              <div className="grid grid-cols-2 gap-2"><button type="button" className="btn-secondary min-h-11 px-4 py-3" onClick={() => handOff(() => onEdit(task))}>Edit</button><button type="button" className="min-h-11 rounded-xl border border-line px-4 py-3 text-state-danger hover:bg-card" onClick={() => handOff(() => onDelete(task))}>Delete</button></div>
            </>}
            {event?.provider !== 'device' && event && <button type="button" className="btn-primary min-h-11 w-full px-4 py-3" onClick={() => onCalendarComplete(event.id, !event.completed)}>{event.completed ? 'Mark incomplete' : 'Mark complete'}</button>}
            {event?.htmlLink && <a href={event.htmlLink} target="_blank" rel="noreferrer" className="btn-secondary flex min-h-11 items-center justify-center px-4 py-3">Open in Calendar</a>}
          </div>
        </div>
      </div>
    </div>, document.body,
  )
}
