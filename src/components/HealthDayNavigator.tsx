import { addDays, format, parseISO } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatRelativeDate } from '../utils/dateHelpers'

interface HealthDayNavigatorProps {
  date: string
  onChange: (date: string) => void
  label: string
}

const todayKey = () => format(new Date(), 'yyyy-MM-dd')

export default function HealthDayNavigator({ date, onChange, label }: HealthDayNavigatorProps) {
  const selectedDate = parseISO(date)
  const today = todayKey()
  const isToday = date === today
  const relativeLabel = formatRelativeDate(selectedDate)
  const fullLabel = format(selectedDate, 'EEEE, MMMM d, yyyy')

  const shift = (amount: number) => {
    onChange(format(addDays(selectedDate, amount), 'yyyy-MM-dd'))
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={`${label} date navigation`}>
      <div className="flex min-h-11 items-center rounded-xl border border-line bg-sunken/35 p-1">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => shift(-1)}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted transition hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-[9rem] px-2 text-center" aria-live="polite">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">{relativeLabel}</p>
          <p className="mt-0.5 text-sm font-medium text-ink">{fullLabel}</p>
        </div>
        <button
          type="button"
          aria-label="Next day"
          onClick={() => shift(1)}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted transition hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => onChange(today)}
        disabled={isToday}
        className="min-h-11 rounded-xl border border-line bg-card px-4 text-sm font-medium text-ink-soft transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-default disabled:opacity-50"
      >
        Today
      </button>

      <label className="relative flex min-h-11 items-center rounded-xl border border-line bg-card pl-10 pr-3 text-sm text-ink-soft transition focus-within:border-cyan-400/50">
        <CalendarDays className="pointer-events-none absolute left-3 h-4 w-4 text-ink-muted" />
        <span className="sr-only">Jump to date</span>
        <input
          type="date"
          aria-label={`Jump to ${label.toLowerCase()} date`}
          value={date}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-11 min-w-[8.75rem] bg-transparent text-sm text-ink outline-none"
        />
      </label>
    </div>
  )
}
