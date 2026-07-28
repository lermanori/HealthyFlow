import { Activity, Award, Dumbbell, HeartPulse } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import { useSettings } from '../hooks/useSettings'
import { enabledModulePresentations, moduleHealthHref } from '../modulePresentation'

interface HealthNavigationProps {
  date?: string
}

const todayStr = () => format(new Date(), 'yyyy-MM-dd')
const iconByName = {
  activity: Activity,
  dumbbell: Dumbbell,
  award: Award,
}

export default function HealthNavigation({ date }: HealthNavigationProps) {
  const location = useLocation()
  const { modules } = useSettings()
  const searchDate = new URLSearchParams(location.search).get('date')
  const selectedDate = date
    ?? (searchDate && /^\d{4}-\d{2}-\d{2}$/.test(searchDate) ? searchDate : todayStr())
  const encodedDate = encodeURIComponent(selectedDate)
  const items = [
    { name: 'Overview', href: `/health?date=${encodedDate}`, path: '/health', icon: HeartPulse },
    ...enabledModulePresentations(modules)
      .sort((a, b) => a.healthNavigation.order - b.healthNavigation.order)
      .map((presentation) => ({
        name: presentation.label,
        href: moduleHealthHref(presentation, selectedDate),
        path: presentation.route.path,
        icon: iconByName[presentation.healthNavigation.icon],
      })),
  ]

  return (
    <nav
      className={`grid gap-1.5 rounded-section border border-line bg-card p-1.5 ${
        items.length === 1
          ? 'grid-cols-1'
          : items.length === 2
            ? 'grid-cols-2'
            : items.length === 3
              ? 'grid-cols-2 sm:grid-cols-3'
              : 'grid-cols-2 sm:grid-cols-4'
      }`}
      aria-label="Health"
    >
      {items.map((item) => {
        const isActive = location.pathname === item.path
        return (
          <Link
            key={item.name}
            to={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-control border px-2 text-sm font-semibold transition-colors sm:px-3 ${
              isActive
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-transparent text-ink-muted hover:bg-raised hover:text-ink'
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.name}</span>
          </Link>
        )
      })}
    </nav>
  )
}
