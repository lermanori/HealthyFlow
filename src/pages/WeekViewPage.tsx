import { useQuery } from '@tanstack/react-query'
import { format, startOfWeek, addDays, isSameDay } from 'date-fns'
import { Calendar, TrendingUp, Brain, Sparkles, BarChart3, Target } from 'lucide-react'
import { taskService, summaryService } from '../services/api'
import HabitTrackerBar from '../components/HabitTrackerBar'
import WeeklyProgressChart from '../components/WeeklyProgressChart'
import LoadingSpinner from '../components/LoadingSpinner'
import { getWeekDates } from '../utils/dateHelpers'
import { motion } from 'framer-motion'

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
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center space-x-3"
      >
        <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center animate-float">
          <Calendar className="w-4 h-4 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-100 neon-text">Week Overview</h1>
        <Sparkles className="w-5 h-5 text-cyan-400 animate-neon-flicker" />
      </motion.div>

      {/* Weekly Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card holographic"
        >
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Completion Rate</p>
              <p className="text-2xl font-bold text-gray-100 neon-text">
                {weeklySummary ? Math.round(weeklySummary.completionRate) : 0}%
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card holographic"
        >
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Tasks Completed</p>
              <p className="text-2xl font-bold text-gray-100 neon-text">
                {weeklySummary?.completedTasks || 0}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card holographic"
        >
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Tasks</p>
              <p className="text-2xl font-bold text-gray-100 neon-text">
                {weeklySummary?.totalTasks || 0}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Progress Chart */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <WeeklyProgressChart data={weeklyProgressData} />
        </motion.div>

        {/* Week Calendar */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="card ai-glow"
        >
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-6 h-6 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-3 h-3 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-100">This Week</h2>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {weekDates.map((day) => {
              const isToday = isSameDay(day, today)
              const dayTasks = isToday ? todayTasks : [] // In a real app, you'd fetch tasks for each day
              const completedTasks = dayTasks.filter(task => task.completed).length

              return (
                <div
                  key={day.toISOString()}
                  className={`p-3 rounded-xl border-2 transition-all duration-300 ${
                    isToday
                      ? 'border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/20'
                      : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
                  }`}
                >
                  <div className="text-center">
                    <p className="text-xs font-medium text-gray-400">
                      {format(day, 'EEE')}
                    </p>
                    <p className={`text-lg font-bold ${isToday ? 'text-cyan-400 neon-text' : 'text-gray-200'}`}>
                      {format(day, 'd')}
                    </p>
                    {(dayTasks.length > 0 || !isToday) && (
                      <div className="mt-2">
                        <div className="text-xs text-gray-400">
                          {isToday ? `${completedTasks}/${dayTasks.length}` : `${Math.floor(Math.random() * 3) + 1}/${Math.floor(Math.random() * 2) + 3}`}
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-1 mt-1">
                          <div
                            className="bg-gradient-to-r from-cyan-500 to-blue-600 h-1 rounded-full transition-all"
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
        </motion.div>
      </div>

      {/* Category Breakdown */}
      {weeklySummary && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="card ai-glow"
        >
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-6 h-6 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
              <Brain className="w-3 h-3 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-100">Category Progress</h2>
            <Sparkles className="w-4 h-4 text-cyan-400 animate-neon-flicker" />
          </div>
          <div className="space-y-4">
            {Object.entries(weeklySummary.categories).map(([category, stats]) => (
              <HabitTrackerBar
                key={category}
                title={category.charAt(0).toUpperCase() + category.slice(1)}
                completed={stats.completed}
                total={stats.total}
                color={
                  category === 'health' ? 'bg-gradient-to-r from-green-500 to-emerald-600' :
                  category === 'work' ? 'bg-gradient-to-r from-blue-500 to-indigo-600' :
                  category === 'fitness' ? 'bg-gradient-to-r from-orange-500 to-red-600' :
                  'bg-gradient-to-r from-purple-500 to-pink-600'
                }
              />
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}