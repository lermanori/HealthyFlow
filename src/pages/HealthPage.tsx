import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Activity, Award, Dumbbell, HeartPulse, Scale, Utensils } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import HealthDayNavigator from '../components/HealthDayNavigator'
import HealthNavigation from '../components/HealthNavigation'
import { useCalorieEntries } from '../hooks/useCalorieEntries'
import { useSettings } from '../hooks/useSettings'
import { useWeightTracking } from '../hooks/useWeightTracking'
import { achievementService, workoutsService } from '../services/api'
import { getModulePresentation, moduleHealthHref } from '../modulePresentation'

const todayStr = () => format(new Date(), 'yyyy-MM-dd')
const formatKg = (value: number) => `${Math.round(value * 10) / 10} kg`

export default function HealthPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedDate = searchParams.get('date')
  const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : todayStr()
  const setDate = (nextDate: string) => {
    const nextParams = new URLSearchParams(searchParams)
    if (nextDate === todayStr()) nextParams.delete('date')
    else nextParams.set('date', nextDate)
    setSearchParams(nextParams)
  }
  const { modules } = useSettings()
  const nutritionPresentation = getModulePresentation('calories')
  const workoutPresentation = getModulePresentation('workouts')
  const progressPresentation = getModulePresentation('achievements')
  const caloriesEnabled = modules.calories === 'enabled'
  const workoutsEnabled = modules.workouts === 'enabled'
  const achievementsEnabled = modules.achievements === 'enabled'
  const { entries, totals, isLoading: areCaloriesLoading } = useCalorieEntries(date, caloriesEnabled)
  const { entry: weightEntry, trend: weightTrend, isLoading: isWeightLoading } = useWeightTracking(date, caloriesEnabled)
  const { data: workoutSessions = [], isLoading: areWorkoutsLoading } = useQuery({
    queryKey: ['workouts', date],
    queryFn: () => workoutsService.list(date),
    enabled: workoutsEnabled,
  })
  const { data: achievements = [], isLoading: areAchievementsLoading } = useQuery({
    queryKey: ['achievements', 'health-overview'],
    queryFn: () => achievementService.list({ entryLimit: 1 }),
    enabled: achievementsEnabled,
  })
  const nutritionHref = moduleHealthHref(nutritionPresentation, date)
  const workoutsHref = moduleHealthHref(workoutPresentation, date)

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-28 md:pb-0">
      <HealthNavigation date={date} />

      <header className="flex flex-col gap-4 border-b border-line/70 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-action">
            <HeartPulse className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Health</h1>
            <p className="mt-1 max-w-xl text-sm text-ink-muted">
              One daily view across nutrition, weight, workouts, and personal progress.
            </p>
          </div>
        </div>
        <HealthDayNavigator date={date} onChange={setDate} label="Health overview" />
      </header>

      <section
        className="overflow-hidden rounded-section border border-line bg-card shadow-section"
        data-demo-id="health-daily-overview"
        aria-labelledby="health-overview-heading"
      >
        <div className="border-b border-line/70 p-4 lg:p-5">
          <h2 id="health-overview-heading" className="text-lg font-semibold text-ink">Daily overview</h2>
          <p className="mt-1 text-sm text-ink-muted">
            A neutral summary of what is recorded. Missing data is never treated as failure.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-5">
          {caloriesEnabled && (
            <>
              <Link to={nutritionHref} className="group border-b border-line/70 p-4 transition hover:bg-accent/5 sm:border-r xl:border-b-0">
                <div className="flex items-center gap-2">
                  <Utensils className="h-4 w-4 text-state-warning" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{nutritionPresentation.label}</p>
                </div>
                <p className="mt-3 text-xl font-semibold text-ink">
                  {areCaloriesLoading ? 'Loading…' : `${totals.calories.toLocaleString()} kcal`}
                </p>
                <p className="mt-1 text-xs text-ink-muted group-hover:text-accent">
                  {entries.length} Calorie entr{entries.length === 1 ? 'y' : 'ies'}
                </p>
              </Link>
              <Link to={nutritionHref} className="group border-b border-line/70 p-4 transition hover:bg-accent/5 xl:border-b-0 xl:border-r">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-accent" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Macros</p>
                </div>
                <p className="mt-3 text-xl font-semibold text-ink">
                  {areCaloriesLoading ? 'Loading…' : `${totals.protein}g protein`}
                </p>
                <p className="mt-1 text-xs text-ink-muted group-hover:text-accent">
                  {totals.carbs}g carbs · {totals.fat}g fat
                </p>
              </Link>
              <Link to={nutritionHref} className="group border-b border-line/70 p-4 transition hover:bg-accent/5 sm:border-r xl:border-b-0">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-state-success" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Weight</p>
                </div>
                <p className="mt-3 text-xl font-semibold text-ink">
                  {isWeightLoading ? 'Loading…' : weightEntry ? formatKg(weightEntry.weightKg) : 'Not recorded'}
                </p>
                <p className="mt-1 text-xs text-ink-muted group-hover:text-accent">
                  {weightTrend.deltaKg == null
                    ? 'No previous entry yet'
                    : `${weightTrend.deltaKg > 0 ? '+' : ''}${Math.round(weightTrend.deltaKg * 10) / 10} kg since last entry`}
                </p>
              </Link>
            </>
          )}
          {workoutsEnabled && (
            <Link to={workoutsHref} className="group border-b border-line/70 p-4 transition hover:bg-accent/5 xl:border-b-0 xl:border-r">
              <div className="flex items-center gap-2">
                <Dumbbell className="h-4 w-4 text-category-fitness" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{workoutPresentation.label}</p>
              </div>
              <p className="mt-3 text-xl font-semibold text-ink">
                {areWorkoutsLoading ? 'Loading…' : `${workoutSessions.length} logged`}
              </p>
              <p className="mt-1 text-xs text-ink-muted group-hover:text-accent">Open session tracking</p>
            </Link>
          )}
          {achievementsEnabled && (
            <Link to={moduleHealthHref(progressPresentation)} className="group p-4 transition hover:bg-accent/5">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-state-warning" />
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{progressPresentation.label}</p>
              </div>
              <p className="mt-3 text-xl font-semibold text-ink">
                {areAchievementsLoading ? 'Loading…' : `${achievements.length} tracked`}
              </p>
              <p className="mt-1 text-xs text-ink-muted group-hover:text-accent">
                {achievements.filter((achievement) => achievement.latest).length} with a recorded result
              </p>
            </Link>
          )}
        </div>
      </section>
    </div>
  )
}
