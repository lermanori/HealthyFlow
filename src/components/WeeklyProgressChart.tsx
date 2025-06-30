import { motion } from 'framer-motion'
import { format, startOfWeek, addDays } from 'date-fns'

interface WeeklyProgressChartProps {
  data: Array<{
    date: Date
    completed: number
    total: number
  }>
}

export default function WeeklyProgressChart({ data }: WeeklyProgressChartProps) {
  const maxTotal = Math.max(...data.map(d => d.total), 1)

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Weekly Progress</h3>
      
      <div className="space-y-4">
        {data.map((day, index) => {
          const completionRate = day.total > 0 ? (day.completed / day.total) * 100 : 0
          const heightPercentage = day.total > 0 ? (day.total / maxTotal) * 100 : 0
          
          return (
            <div key={day.date.toISOString()} className="flex items-end space-x-3">
              <div className="w-12 text-xs text-gray-600 text-center">
                {format(day.date, 'EEE')}
              </div>
              
              <div className="flex-1 relative">
                <div className="flex items-end space-x-1">
                  {/* Total tasks bar */}
                  <div className="relative bg-gray-200 rounded-t w-8" style={{ height: `${Math.max(heightPercentage, 20)}px` }}>
                    {/* Completed tasks overlay */}
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${completionRate}%` }}
                      transition={{ delay: index * 0.1, duration: 0.5 }}
                      className="absolute bottom-0 left-0 right-0 bg-primary-500 rounded-t"
                    />
                  </div>
                  
                  <div className="text-xs text-gray-600">
                    {day.completed}/{day.total}
                  </div>
                </div>
              </div>
              
              <div className="w-12 text-xs text-gray-600 text-right">
                {Math.round(completionRate)}%
              </div>
            </div>
          )
        })}
      </div>
      
      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
        <span>This Week</span>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-gray-200 rounded"></div>
            <span>Total</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-primary-500 rounded"></div>
            <span>Completed</span>
          </div>
        </div>
      </div>
    </div>
  )
}