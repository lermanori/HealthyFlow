import { Activity, Award, Dumbbell, HeartPulse } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import { useSettings } from '../hooks/useSettings'

interface HealthNavigationProps {
  date?: string
}

const todayStr = () => format(new Date(), 'yyyy-MM-dd')

export default function HealthNavigation({ date }: HealthNavigationProps) {
  const location = useLocation()
  const { modules } = useSettings()
  const searchDate = new URLSearchParams(location.search).get('date')
  const selectedDate = date
    ?? (searchDate && /^\d{4}-\d{2}-\d{2}$/.test(searchDate) ? searchDate : todayStr())
  const encodedDate = encodeURIComponent(selectedDate)
  const items = [
    { name: 'Overview', href: `/health?date=${encodedDate}`, path: '/health', icon: HeartPulse },
    ...(modules.calories === 'enabled'
      ? [{ name: 'Nutrition', href: `/calories?date=${encodedDate}`, path: '/calories', icon: Activity }]
      : []),
    ...(modules.workouts === 'enabled'
      ? [{ name: 'Workouts', href: `/workouts?date=${encodedDate}&mode=session`, path: '/workouts', icon: Dumbbell }]
      : []),
    ...(modules.achievements === 'enabled'
      ? [{ name: 'Progress', href: '/achievements', path: '/achievements', icon: Award }]
      : []),
  ]

  return (
    <nav
      className={`grid gap-1.5 rounded-2xl border border-line/80 bg-card/60 p-1.5 ${
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
            className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold transition sm:px-3 ${
              isActive
                ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                : 'text-ink-muted hover:bg-raised/60 hover:text-ink'
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
