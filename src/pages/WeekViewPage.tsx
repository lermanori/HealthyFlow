import { useQuery } from '@tanstack/react-query'
import { format, startOfWeek, addDays, isSameDay } from 'date-fns'
import { Calendar, TrendingUp } from 'lucide-react'
import { taskService, summaryService } from '../services/api'
import HabitTrackerBar from '../components/HabitTrackerBar'
import WeeklyProgressChart from '../components/WeeklyProgressChart'
import LoadingSpinner from '../components/LoadingSpinner'
import { getWeekDates } from '../utils/dateHelpers'

export default function WeekViewPage() {
  const today = new Date()
  const weekDates = getWeekDates(today)

  const { data: weeklySummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['week-summary'],
    queryFn: summaryService.getWeeklySummary,
  })

  const { data: todayTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', format(today, 'yyyy-MM-dd')],
    queryFn: () => taskService.getTasks(format(today, 'yyyy-MM-dd')),
  })

  // Generate mock data for weekly progress chart
  const weeklyProgressData = weekDates.map(date => {
    const isToday = isSameDay(date, today)
    const tasks = isToday ? todayTasks : []
    return {
      date,
      completed: tasks.filter(t => t.completed).length,
      total: tasks.length || (Math.floor(Math.random() * 5) + 2) // Mock data for other days
    }
  })

  if (summaryLoading || tasksLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <Calendar className="w-6 h-6 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Week Overview</h1>
      </div>

      {/* Weekly Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Completion Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {weeklySummary ? Math.round(weeklySummary.completionRate) : 0}%
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-success-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Tasks Completed</p>
              <p className="text-2xl font-bold text-gray-900">
                {weeklySummary?.completedTasks || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Tasks</p>
              <p className="text-2xl font-bold text-gray-900">
                {weeklySummary?.totalTasks || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Progress Chart */}
        <WeeklyProgressChart data={weeklyProgressData} />

        {/* Week Calendar */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">This Week</h2>
          <div className="grid grid-cols-7 gap-2">
            {weekDates.map((day) => {
              const isToday = isSameDay(day, today)
              const dayTasks = isToday ? todayTasks : [] // In a real app, you'd fetch tasks for each day
              const completedTasks = dayTasks.filter(task => task.completed).length

              return (
                <div
                  key={day.toISOString()}
                  className={`p-3 rounded-lg border-2 transition-colors ${
                    isToday
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-center">
                    <p className="text-xs font-medium text-gray-600">
                      {format(day, 'EEE')}
                    </p>
                    <p className={`text-lg font-bold ${isToday ? 'text-primary-600' : 'text-gray-900'}`}>
                      {format(day, 'd')}
                    </p>
                    {(dayTasks.length > 0 || !isToday) && (
                      <div className="mt-2">
                        <div className="text-xs text-gray-600">
                          {isToday ? `${completedTasks}/${dayTasks.length}` : `${Math.floor(Math.random() * 3) + 1}/${Math.floor(Math.random() * 2) + 3}`}
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                          <div
                            className="bg-primary-500 h-1 rounded-full transition-all"
                            style={{
                              width: isToday 
                                ? `${dayTasks.length > 0 ? (completedTasks / dayTasks.length) * 100 : 0}%`
                                : `${Math.random() * 100}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      {weeklySummary && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Category Progress</h2>
          <div className="space-y-4">
            {Object.entries(weeklySummary.categories).map(([category, stats]) => (
              <HabitTrackerBar
                key={category}
                title={category.charAt(0).toUpperCase() + category.slice(1)}
                completed={stats.completed}
                total={stats.total}
                color={
                  category === 'health' ? 'bg-green-500' :
                  category === 'work' ? 'bg-blue-500' :
                  category === 'fitness' ? 'bg-orange-500' :
                  'bg-purple-500'
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}